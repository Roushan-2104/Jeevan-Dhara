"""Jeevan Dhara API: web endpoints, WhatsApp webhook, media, security middleware."""
from __future__ import annotations

import asyncio
import json
import logging
import re
import secrets
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import audio, db, gnani, llm, pipeline, replies, security, seed, whatsapp
from .config import ROOT, get_settings
from .search import GROUPS, IST, donors_nearby, haversine_km, lookup_place, normalize_group

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("jeevandhara")

LANGUAGES = [
    {"code": "hi-IN", "name": "हिन्दी", "ui": "hi"}, {"code": "hi-en", "name": "Hinglish", "ui": "en"},
    {"code": "en-IN", "name": "English", "ui": "en"}, {"code": "kn-IN", "name": "ಕನ್ನಡ", "ui": "en"},
    {"code": "ta-IN", "name": "தமிழ்", "ui": "en"}, {"code": "te-IN", "name": "తెలుగు", "ui": "en"},
    {"code": "ml-IN", "name": "മലയാളം", "ui": "en"}, {"code": "mr-IN", "name": "मराठी", "ui": "en"},
    {"code": "bn-IN", "name": "বাংলা", "ui": "en"}, {"code": "gu-IN", "name": "ગુજરાતી", "ui": "en"},
    {"code": "pa-IN", "name": "ਪੰਜਾਬੀ", "ui": "en"},
]
LANG_CODES = {lang["code"] for lang in LANGUAGES}
SCRIPT_LANG = [(r"[ಀ-೿]", "kn-IN"), (r"[஀-௿]", "ta-IN"), (r"[ఀ-౿]", "te-IN"),
               (r"[ഀ-ൿ]", "ml-IN"), (r"[ঀ-৿]", "bn-IN"), (r"[઀-૿]", "gu-IN"),
               (r"[਀-੿]", "pa-IN"), (r"[ऀ-ॿ]", "hi-IN")]


def lang_code(v: str | None) -> str | None:
    if not v:
        return None
    v = {"hi": "hi-IN", "en": "en-IN"}.get(v, v)
    return v if v in LANG_CODES else None


def script_language(text: str, hinglish: bool) -> str:
    for pat, code in SCRIPT_LANG:
        if re.search(pat, text):
            return code
    return "hi-en" if hinglish else "en-IN"


# ---------------------------------------------------------------- lifecycle
async def _cleanup_loop() -> None:
    s = get_settings()
    while True:
        try:
            now = time.time()
            for d, ttl in ((s.media_dir, s.media_ttl_seconds), (s.tmp_dir, 600)):
                for f in d.iterdir():
                    if f.is_file() and now - f.stat().st_mtime > ttl:
                        f.unlink(missing_ok=True)
            day_ago = (datetime.now(IST) - timedelta(hours=24)).isoformat()
            week_ago = (datetime.now(IST) - timedelta(days=7)).isoformat()
            db.execute("DELETE FROM requests WHERE created_at < ?", (day_ago,))
            db.execute("DELETE FROM donor_pings WHERE sent_at < ?", (week_ago,))
            db.execute("DELETE FROM otp WHERE expires_at < ?", (now,))
        except Exception:  # noqa: BLE001
            log.exception("cleanup failed")
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(_: FastAPI):
    s = get_settings()
    seed.seed(force=True)  # synthetic data only; re-seeding keeps "updated N hours ago" relative to now
    log.info("Jeevan Dhara ready. Gnani=%s Groq=%s Twilio=%s demo_mode=%s",
             s.has_gnani, s.has_groq, s.has_twilio, s.demo_mode)
    task = asyncio.create_task(_cleanup_loop())
    warm = asyncio.create_task(pipeline.warm_voice()) if s.has_gnani and s.warm_voice else None
    yield
    task.cancel()
    if warm:
        warm.cancel()


app = FastAPI(title="Jeevan Dhara", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

CSP = ("default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; "
       "style-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
       "font-src 'self' https://fonts.gstatic.com; "
       "img-src 'self' data: https://*.tile.openstreetmap.org https://cdnjs.cloudflare.com; "
       "media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")


@app.middleware("http")
async def session_and_headers(request: Request, call_next):
    sess = security.read_session(request.cookies.get(security.SESSION_COOKIE))
    request.state.new_session = sess is None
    request.state.session = sess or {"anon": secrets.token_urlsafe(12)}
    try:
        response = await call_next(request)
    except Exception:  # noqa: BLE001
        log.exception("unhandled error")
        response = JSONResponse({"detail": "Something went wrong. Please try again, or call 104."}, status_code=500)
    if request.url.path.startswith("/api/") and (request.state.new_session or getattr(request.state, "touch", False)):
        response.set_cookie(security.SESSION_COOKIE, security.sign_session(request.state.session),
                            max_age=security.SESSION_MAX_AGE, httponly=True, samesite="strict",
                            secure=get_settings().public_base_url.startswith("https"))
    h = response.headers
    h["Content-Security-Policy"] = CSP
    h["X-Content-Type-Options"] = "nosniff"
    h["Referrer-Policy"] = "no-referrer"
    h["Permissions-Policy"] = "microphone=(self), geolocation=(self), camera=()"
    h["X-Frame-Options"] = "DENY"
    if get_settings().public_base_url.startswith("https"):
        h["Strict-Transport-Security"] = "max-age=31536000"
    return response


def owner_of(request: Request) -> str:
    s = request.state.session
    return f"u:{s['uid']}" if s.get("uid") else f"a:{s['anon']}"


def require_user(request: Request) -> int:
    uid = request.state.session.get("uid")
    if not uid:
        raise HTTPException(401, "Please sign in with your phone number first.")
    return int(uid)


def rate_limit(request: Request, owner: str) -> None:
    s = get_settings()
    ip = request.client.host if request.client else "unknown"
    ok = (security.limiter.allow(f"ip:{ip}", s.ip_requests_per_hour, 3600)
          and security.limiter.allow(f"owner:{owner}", s.user_requests_per_hour, 3600)
          and security.limiter.allow("global", s.global_requests_per_day, 86400))
    if not ok:
        raise HTTPException(429, "You've made many requests. Please wait a few minutes, or call 104.")


def check_access(request: Request) -> str:
    if get_settings().require_login:
        require_user(request)
    owner = owner_of(request)
    rate_limit(request, owner)
    return owner


# ---------------------------------------------------------------- read-only
@app.get("/api/health")
async def health():
    return {"ok": True}


@app.get("/api/config")
async def config():
    return {"demo_mode": get_settings().demo_mode, "languages": LANGUAGES, "blood_groups": list(GROUPS),
            "emergency": pipeline.EMERGENCY, "voice_enabled": get_settings().has_gnani}


@app.get("/api/me")
async def me(request: Request):
    uid = request.state.session.get("uid")
    if not uid:
        return {"authenticated": False, "phone_masked": None, "is_donor": False}
    request.state.touch = True
    is_donor = db.query_one("SELECT 1 FROM donors WHERE user_id = ? AND opted_out = 0", (uid,)) is not None
    return {"authenticated": True, "phone_masked": request.state.session.get("masked"), "is_donor": is_donor}


# ---------------------------------------------------------------- search
@app.post("/api/ask")
async def ask(request: Request, audio_file: UploadFile = File(..., alias="audio"),
              lat: float | None = Form(None), lng: float | None = Form(None), accuracy: float | None = Form(None),
              place: str | None = Form(None), request_id: str | None = Form(None), ui_lang: str | None = Form(None)):
    owner = check_access(request)
    raw = await audio_file.read(get_settings().max_upload_bytes + 1)
    extra = {"lat": lat, "lng": lng, "accuracy": accuracy, "ui_lang": lang_code(ui_lang),
             "location_source": "gps" if lat is not None else None}
    if place and lat is None:
        extra["place"] = place[:80]
    try:
        return await pipeline.from_voice(owner, "web", raw, extra, request_id, audio_fmt="mp3")
    except audio.AudioError as e:
        raise HTTPException(400, str(e)) from e
    except gnani.GnaniError as e:
        log.warning("voice unavailable: %s", e)
        raise HTTPException(503, "Voice is not available right now. Please use the form and tap Search.") from e


class SearchIn(BaseModel):
    blood_group: str | None = None
    component: Literal["whole_blood", "prbc", "platelets", "plasma"] | None = None
    units: int | None = Field(None, ge=1, le=10)
    lat: float | None = Field(None, ge=-90, le=90)
    lng: float | None = Field(None, ge=-180, le=180)
    accuracy: float | None = Field(None, ge=0, le=100000)
    place: str | None = Field(None, max_length=80)
    request_id: str | None = Field(None, max_length=12)
    lang: str | None = None
    text: str | None = Field(None, max_length=400)


@app.post("/api/search")
async def search_form(body: SearchIn, request: Request):
    owner = check_access(request)
    lang = lang_code(body.lang) or "en-IN"
    updates = {"blood_group": normalize_group(body.blood_group), "component": body.component, "units": body.units,
               "lat": body.lat, "lng": body.lng, "accuracy": body.accuracy, "language": lang, "ui_lang": lang,
               "place": body.place.strip() if body.place and body.lat is None else None}
    if body.text:  # typed free text goes through the same extractor as speech
        ex = await llm.extract(body.text)
        updates.update(transcript=body.text, blood_group=updates["blood_group"] or ex.blood_group,
                       component=updates["component"] or ex.component, units=updates["units"] or ex.units,
                       language=lang_code(body.lang) or script_language(body.text, ex.is_hinglish))
        spoken = lookup_place(ex.location_text) if ex.location_text else None
        if spoken:  # a named place beats the device GPS
            updates.update(place=spoken.name, lat=None, lng=None, accuracy=None)
        if ex.intent == "register_donor":
            return await pipeline.donor_hint(owner, "web", body.text, updates["language"], body.request_id, "mp3")
    return await pipeline.run(owner, "web", updates, request_id=body.request_id)


@app.post("/api/search/{request_id}/extend")
async def extend(request_id: str, request: Request):
    owner = check_access(request)
    if not pipeline.load_state(request_id, owner):
        raise HTTPException(404, "Request not found.")
    return await pipeline.run(owner, "web", {}, request_id=request_id, extend=True)


@app.get("/api/requests")
async def my_requests(request: Request):
    rows = db.query("SELECT id, state_json, status, found_within_km, created_at FROM requests "
                    "WHERE owner = ? ORDER BY created_at DESC LIMIT 20", (owner_of(request),))
    out = []
    for r in rows:
        st = json.loads(r["state_json"])
        out.append({"request_id": r["id"], "blood_group": st.get("blood_group"), "units": st.get("units") or 1,
                    "place": st.get("place"), "found_within_km": r["found_within_km"], "status": r["status"],
                    "created_at": r["created_at"]})
    return {"requests": out}


async def _ask_donors(owner: str, request_id: str) -> dict:
    st = pipeline.load_state(request_id, owner)
    if not st or st.get("lat") is None or not st.get("blood_group"):
        raise HTTPException(404, "Request not found.")
    row = db.query_one("SELECT found_within_km FROM requests WHERE id = ?", (request_id,))
    within = (row and row["found_within_km"]) or 20
    ids = donors_nearby(st["lat"], st["lng"], st["blood_group"], st.get("component") or "prbc", within)
    today = datetime.now(IST).date().isoformat()
    pinged = demo = 0
    for uid in ids:
        d = db.query_one("SELECT d.synthetic, d.lat_r, d.lng_r, u.phone_enc FROM donors d JOIN users u ON u.id = d.user_id "
                         "WHERE d.user_id = ?", (uid,))
        if d["synthetic"] or not d["phone_enc"] or owner == f"u:{uid}":
            demo += 1
            continue
        sent_today = db.query_one("SELECT COUNT(*) AS n FROM donor_pings WHERE donor_user_id = ? AND sent_at >= ?",
                                  (uid, today))["n"]
        if sent_today >= 2 or db.query_one("SELECT 1 FROM donor_pings WHERE donor_user_id=? AND request_id=?",
                                           (uid, request_id)):
            continue
        km = haversine_km(st["lat"], st["lng"], d["lat_r"], d["lng_r"])
        msg = (f"Jeevan Dhara: someone about {km:.0f} km from you needs {st['blood_group'].replace('-', '−')} blood "
               f"(request {request_id}). Can you help today? Reply YES {request_id} or NO. "
               "Your number is shared only if you say YES. Reply STOP to stop requests.")
        if await whatsapp.send("whatsapp:+91" + security.decrypt(d["phone_enc"]), body=msg):
            db.execute("INSERT INTO donor_pings(request_id, donor_user_id, status, sent_at) VALUES (?,?, 'sent', ?)",
                       (request_id, uid, datetime.now(IST).isoformat()))
            pinged += 1
    security.audit(owner, "ask_donors", f"{request_id} pinged={pinged} demo={demo}")
    if pinged:
        message = f"We asked {pinged} nearby donor(s). We'll tell you as soon as someone agrees."
    elif demo:
        message = f"{demo} demo donor(s) match nearby. In this demo they are not contacted."
    else:
        message = "No registered donors are available nearby right now. Please call 104 for help."
    return {"pinged": pinged, "demo_donors": demo, "message": message}


@app.post("/api/requests/{request_id}/ask-donors")
async def ask_donors(request_id: str, request: Request):
    owner = check_access(request)
    return await _ask_donors(owner, request_id)


# ---------------------------------------------------------------- auth (OTP)
class OtpSendIn(BaseModel):
    phone: str = Field(..., max_length=20)


class OtpVerifyIn(BaseModel):
    phone: str = Field(..., max_length=20)
    code: str = Field(..., min_length=6, max_length=6)


@app.post("/api/auth/otp/send")
async def otp_send(body: OtpSendIn, request: Request):
    phone = security.normalize_indian_mobile(body.phone)
    if not phone:
        raise HTTPException(400, "Please enter a valid 10-digit Indian mobile number.")
    ip = request.client.host if request.client else "unknown"
    if not (security.limiter.allow(f"otp:{phone}", 3, 3600) and security.limiter.allow(f"otpip:{ip}", 10, 3600)):
        raise HTTPException(429, "Too many codes requested. Please try again in an hour.")
    s = get_settings()
    if not (s.has_twilio or s.demo_mode):
        raise HTTPException(503, "Sign-in by code is not set up on this server.")
    code = f"{secrets.randbelow(10**6):06d}"
    ph = security.phone_hash(phone)
    db.execute("INSERT INTO otp(phone_hash, code_hmac, expires_at, attempts) VALUES (?,?,?,0) "
               "ON CONFLICT(phone_hash) DO UPDATE SET code_hmac=excluded.code_hmac, expires_at=excluded.expires_at, attempts=0",
               (ph, security.hmac_hex("otp", ph + code), time.time() + 300))
    sent = await whatsapp.send(f"whatsapp:+91{phone}", body=f"Your Jeevan Dhara code is {code}. It expires in 5 minutes.")
    if s.demo_mode:
        log.warning("DEMO_MODE OTP for %s: %s", security.mask_phone(phone), code)
    elif not sent:
        raise HTTPException(503, "We couldn't send the code. Please try again.")
    return {"sent": True}


@app.post("/api/auth/otp/verify")
async def otp_verify(body: OtpVerifyIn, request: Request):
    phone = security.normalize_indian_mobile(body.phone)
    if not phone or not body.code.isdigit():
        raise HTTPException(400, "Invalid phone or code.")
    ph = security.phone_hash(phone)
    row = db.query_one("SELECT code_hmac, expires_at, attempts FROM otp WHERE phone_hash = ?", (ph,))
    if not row or row["expires_at"] < time.time():
        raise HTTPException(400, "This code has expired. Please request a new one.")
    if row["attempts"] >= 3:
        raise HTTPException(429, "Too many attempts. Please request a new code.")
    if not secrets.compare_digest(row["code_hmac"], security.hmac_hex("otp", ph + body.code)):
        db.execute("UPDATE otp SET attempts = attempts + 1 WHERE phone_hash = ?", (ph,))
        raise HTTPException(400, "That code is not right. Please check and try again.")
    db.execute("DELETE FROM otp WHERE phone_hash = ?", (ph,))
    uid = _upsert_user(phone)
    old_owner = owner_of(request)
    request.state.session = {"uid": uid, "masked": security.mask_phone(phone)}
    request.state.touch = True
    db.execute("UPDATE requests SET owner = ? WHERE owner = ?", (f"u:{uid}", old_owner))
    security.audit(f"u:{uid}", "login")
    return {"ok": True}


def _upsert_user(phone: str) -> int:
    ph = security.phone_hash(phone)
    row = db.query_one("SELECT id FROM users WHERE phone_hash = ?", (ph,))
    now = datetime.now(IST).isoformat()
    if row:
        db.execute("UPDATE users SET verified_at = ? WHERE id = ?", (now, row["id"]))
        return row["id"]
    return db.execute("INSERT INTO users(phone_hash, phone_enc, verified_at, created_at) VALUES (?,?,?,?)",
                      (ph, security.encrypt(phone), now, now))


@app.post("/api/auth/logout")
async def logout(request: Request):
    request.state.session = {"anon": secrets.token_urlsafe(12)}
    request.state.touch = True
    return {"ok": True}


# ---------------------------------------------------------------- donors
class DonorIn(BaseModel):
    blood_group: str
    lat: float | None = Field(None, ge=-90, le=90)
    lng: float | None = Field(None, ge=-180, le=180)
    place: str | None = Field(None, max_length=80)
    languages: list[str] = Field(default_factory=list, max_length=11)
    last_donation: date | None = None
    sex: Literal["male", "female"] | None = None
    age_ok: bool
    weight_ok: bool
    consent: bool


def _donor_out(uid: int) -> dict:
    d = db.query_one("SELECT * FROM donors WHERE user_id = ? AND opted_out = 0", (uid,))
    if not d:
        raise HTTPException(404, "Not registered as a donor.")
    today = datetime.now(IST).date().isoformat()
    resting = bool(d["eligible_from"] and d["eligible_from"] > today)
    return {"status": "resting" if resting else "available" if d["available"] else "paused",
            "eligible_from": d["eligible_from"] if resting else None, "blood_group": d["blood_group"],
            "available": bool(d["available"]), "place": d["place"]}


@app.post("/api/donors")
async def register_donor(body: DonorIn, request: Request):
    uid = require_user(request)
    group = normalize_group(body.blood_group)
    if not group:
        raise HTTPException(400, "Please choose your blood group.")
    if not body.consent:
        raise HTTPException(400, "Please agree to be contacted before registering.")
    if not (body.age_ok and body.weight_ok):
        raise HTTPException(400, "Donors must be 18 to 65 years old and weigh at least 45 kg.")
    lat, lng, place = body.lat, body.lng, body.place
    if lat is None or lng is None:
        p = lookup_place(body.place)
        if not p:
            raise HTTPException(400, "We couldn't find that area. Please use your location or try a nearby area.")
        lat, lng, place = p.lat, p.lng, p.name
    eligible_from = None
    if body.last_donation:
        gap = 90 if body.sex == "male" else 120  # NBTC whole-blood interval; unknown sex -> conservative
        eligible_from = (body.last_donation + timedelta(days=gap)).isoformat()
    langs = ",".join(c for c in (lang_code(x) for x in body.languages) if c)
    now = datetime.now(IST).isoformat()
    db.execute(
        """INSERT INTO donors(user_id, blood_group, lat_r, lng_r, place, languages, sex, available, last_donation,
                              eligible_from, opted_out, synthetic, created_at)
           VALUES (?,?,?,?,?,?,?,1,?,?,0,0,?)
           ON CONFLICT(user_id) DO UPDATE SET blood_group=excluded.blood_group, lat_r=excluded.lat_r,
             lng_r=excluded.lng_r, place=excluded.place, languages=excluded.languages, sex=excluded.sex,
             last_donation=excluded.last_donation, eligible_from=excluded.eligible_from, opted_out=0""",
        (uid, group, round(lat, 3), round(lng, 3), (place or "")[:80], langs, body.sex,
         body.last_donation.isoformat() if body.last_donation else None, eligible_from, now),
    )
    security.audit(f"u:{uid}", "donor_register", f"consent=yes group={group}")
    return _donor_out(uid)


@app.get("/api/donors/me")
async def donor_me(request: Request):
    return _donor_out(require_user(request))


class DonorPatch(BaseModel):
    available: bool


@app.patch("/api/donors/me")
async def donor_patch(body: DonorPatch, request: Request):
    uid = require_user(request)
    _donor_out(uid)
    db.execute("UPDATE donors SET available = ? WHERE user_id = ?", (1 if body.available else 0, uid))
    security.audit(f"u:{uid}", "donor_availability", str(body.available))
    return _donor_out(uid)


@app.delete("/api/donors/me")
async def donor_delete(request: Request):
    uid = require_user(request)
    db.execute("DELETE FROM donors WHERE user_id = ?", (uid,))
    security.audit(f"u:{uid}", "donor_delete")
    return {"ok": True}


# ---------------------------------------------------------------- media
_MEDIA_RE = re.compile(r"^[0-9a-f]{32}\.(mp3|ogg)$")


@app.get("/media/{name}")
async def media(name: str):
    s = get_settings()
    if not _MEDIA_RE.fullmatch(name):
        raise HTTPException(404)
    pending = pipeline.PENDING_VOICE.get(name)
    if pending:  # the answer went out first; the voice is still being made
        try:
            await asyncio.wait_for(asyncio.shield(pending), timeout=30)
        except Exception:  # noqa: BLE001 - TTS failed or timed out: no voice, the text is on screen
            raise HTTPException(404) from None
    path = s.media_dir / name
    if not path.is_file() or time.time() - path.stat().st_mtime > s.media_ttl_seconds:
        raise HTTPException(404)
    return FileResponse(path, media_type="audio/mpeg" if name.endswith(".mp3") else "audio/ogg",
                        headers={"Cache-Control": "no-store"})


# ---------------------------------------------------------------- WhatsApp
@app.post("/webhooks/twilio")
async def twilio_webhook(request: Request, background: BackgroundTasks):
    s = get_settings()
    if not s.whatsapp_enabled:
        return Response(status_code=404)
    form = await request.form()
    params = {k: str(v) for k, v in form.items()}
    url = s.public_base_url.rstrip("/") + "/webhooks/twilio"
    if not security.twilio_signature_valid(url, params, request.headers.get("X-Twilio-Signature")):
        log.warning("rejected webhook with bad Twilio signature")
        return Response(status_code=403)
    background.add_task(_handle_whatsapp, params)
    return Response("<Response/>", media_type="application/xml")


async def _handle_whatsapp(p: dict[str, str]) -> None:
    s = get_settings()
    sender = p.get("From", "")
    digits = re.sub(r"\D", "", sender)
    phone10 = security.normalize_indian_mobile(digits)
    ph = security.phone_hash(phone10 or digits)
    owner = f"wa:{ph}"
    body = (p.get("Body") or "").strip()
    cmd = body.upper()
    first_contact = db.query_one("SELECT 1 FROM requests WHERE owner = ? LIMIT 1", (owner,)) is None
    rid = pipeline.latest_open_request(owner)
    try:
        if cmd in ("STOP", "DELETE"):
            user = db.query_one("SELECT id FROM users WHERE phone_hash = ?", (security.phone_hash(phone10 or ""),))
            if user:
                if cmd == "STOP":
                    db.execute("UPDATE donors SET opted_out = 1 WHERE user_id = ?", (user["id"],))
                else:
                    db.execute("DELETE FROM donors WHERE user_id = ?", (user["id"],))
            if cmd == "DELETE":
                db.execute("DELETE FROM requests WHERE owner = ?", (owner,))
            security.audit(owner, cmd.lower())
            await whatsapp.send(sender, body="Done. You will not get donor requests from Jeevan Dhara."
                                if cmd == "STOP" else "Done. Your Jeevan Dhara data has been deleted.")
            return
        if re.fullmatch(r"(YES|NO)( JD-[A-Z0-9]{4})?", cmd):
            await _donor_answer(sender, phone10, cmd)
            return
        if cmd in ("DONORS", "MORE") and rid:
            if cmd == "DONORS":
                out = await _ask_donors(owner, rid)
                await whatsapp.send(sender, body=out["message"])
                return
            resp = await pipeline.run(owner, "whatsapp", {}, request_id=rid, extend=True, audio_fmt="ogg")
        elif int(p.get("NumMedia", "0") or 0) > 0 and p.get("MediaContentType0", "").startswith("audio/"):
            raw = await whatsapp.fetch_media(p.get("MediaUrl0", ""), s.max_upload_bytes)
            resp = await pipeline.from_voice(owner, "whatsapp", raw, {}, rid, audio_fmt="ogg")
        elif p.get("Latitude") and p.get("Longitude"):
            resp = await pipeline.run(owner, "whatsapp", {"lat": float(p["Latitude"]), "lng": float(p["Longitude"]),
                                                          "location_source": "pin"}, request_id=rid, audio_fmt="ogg")
        elif body:
            ex = await llm.extract(body)
            lang = script_language(body, ex.is_hinglish)
            updates = {"transcript": body, "language": lang, "blood_group": ex.blood_group,
                       "component": ex.component, "units": ex.units, "place": ex.location_text}
            resp = await pipeline.run(owner, "whatsapp", updates, request_id=rid, audio_fmt="ogg")
        else:
            return
        # Remember where to reach this seeker if a donor agrees (encrypted).
        _remember_reply_to(resp["request_id"], owner, sender)
        if resp["reply"].get("audio_url"):
            await whatsapp.send(sender, media_url=s.public_base_url.rstrip("/") + resp["reply"]["audio_url"])
        text = resp["clarify"]["question"] if resp["status"] == "clarify" else replies.whatsapp_card(resp)
        if first_contact:
            text = ("Jeevan Dhara keeps your request for 24 hours only, to help you find blood. "
                    "This is a demo with synthetic data.\n\n" + text)
        await whatsapp.send(sender, body=text)
    except (audio.AudioError, ValueError) as e:
        await whatsapp.send(sender, body=str(e) if isinstance(e, audio.AudioError) else
                            "Sorry, I couldn't read that voice note. Please try again.")
    except gnani.GnaniError:
        await whatsapp.send(sender, body="Voice is not available right now. Please type: blood group, units, area.")
    except Exception:  # noqa: BLE001
        log.exception("whatsapp handling failed")
        await whatsapp.send(sender, body="Something went wrong. Please try again. In an emergency call 108.")


def _remember_reply_to(request_id: str, owner: str, sender: str) -> None:
    st = pipeline.load_state(request_id, owner)
    if st is not None and "reply_to_enc" not in st:
        st["reply_to_enc"] = security.encrypt(sender)
        db.execute("UPDATE requests SET state_json = ? WHERE id = ?", (json.dumps(st, ensure_ascii=False), request_id))


async def _donor_answer(sender: str, phone10: str | None, cmd: str) -> None:
    user = db.query_one("SELECT id FROM users WHERE phone_hash = ?", (security.phone_hash(phone10 or ""),))
    if not user:
        await whatsapp.send(sender, body="We couldn't find a donor request for this number.")
        return
    m = re.search(r"JD-[A-Z0-9]{4}", cmd)
    sql = "SELECT id, request_id FROM donor_pings WHERE donor_user_id = ? AND status = 'sent'"
    args: tuple = (user["id"],)
    if m:
        sql += " AND request_id = ?"
        args += (m.group(0),)
    ping = db.query_one(sql + " ORDER BY sent_at DESC LIMIT 1", args)
    if not ping:
        await whatsapp.send(sender, body="This request is no longer open. Thank you for being a donor.")
        return
    yes = cmd.startswith("YES")
    db.execute("UPDATE donor_pings SET status = ?, answered_at = ? WHERE id = ?",
               ("yes" if yes else "no", datetime.now(IST).isoformat(), ping["id"]))
    security.audit(f"u:{user['id']}", "donor_answer", f"{ping['request_id']} {'yes' if yes else 'no'}")
    if not yes:
        await whatsapp.send(sender, body="No problem. Thank you for being a donor.")
        return
    req = db.query_one("SELECT state_json FROM requests WHERE id = ?", (ping["request_id"],))
    st = json.loads(req["state_json"]) if req else {}
    if st.get("reply_to_enc"):
        await whatsapp.send(security.decrypt(st["reply_to_enc"]),
                            body=f"A donor agreed to help with request {ping['request_id']}. "
                                 f"Their number: +91 {phone10}. Please call them and share the hospital details.")
        await whatsapp.send(sender, body="Thank you! We've shared your number with the family. They will call you.")
    else:
        db.execute("UPDATE requests SET status = 'donor_agreed' WHERE id = ?", (ping["request_id"],))
        await whatsapp.send(sender, body="Thank you! The family has been told a donor agreed.")


# ---------------------------------------------------------------- web app
WEB_DIR: Path = ROOT / "web"
if WEB_DIR.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
