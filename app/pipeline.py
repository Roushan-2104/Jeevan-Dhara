"""The request pipeline: merge what we know, clarify what's missing, search, reply (text + voice)."""
from __future__ import annotations

import asyncio
import json
import logging
import time
import secrets
from datetime import datetime, timedelta

from . import audio, db, gnani, llm, replies
from .config import get_settings
from .search import EXTENDED_KM, IST, RADII_KM, abo_letter, donors_nearby, lookup_place, radius_search, rh_sign

log = logging.getLogger("jeevandhara.pipeline")

EMERGENCY = {"ambulance": "108", "helpline": "104"}
REPLY_LANGS = set(gnani.VOICES)
_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_request_id() -> str:
    return "JD-" + "".join(secrets.choice(_ID_ALPHABET) for _ in range(4))


def load_state(request_id: str | None, owner: str) -> dict | None:
    if not request_id:
        return None
    row = db.query_one("SELECT state_json FROM requests WHERE id = ? AND owner = ?", (request_id, owner))
    return json.loads(row["state_json"]) if row else None


def latest_open_request(owner: str, minutes: int = 15) -> str | None:
    cutoff = (datetime.now(IST) - timedelta(minutes=minutes)).isoformat()
    row = db.query_one("SELECT id FROM requests WHERE owner = ? AND updated_at >= ? ORDER BY updated_at DESC LIMIT 1",
                       (owner, cutoff))
    return row["id"] if row else None


def _save(state: dict, owner: str, channel: str, status: str, found_km: float | None) -> None:
    now = datetime.now(IST).isoformat()
    db.execute(
        """INSERT INTO requests(id, owner, channel, state_json, status, found_within_km, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json, status=excluded.status,
               found_within_km=excluded.found_within_km, updated_at=excluded.updated_at""",
        (state["request_id"], owner, channel, json.dumps(state, ensure_ascii=False), status, found_km, now, now),
    )


def reply_language(detected: str | None, hinglish: bool, ui_lang: str | None = None) -> str:
    if detected == "en-IN" and hinglish:
        return "hi-en"
    if detected in REPLY_LANGS:
        return detected
    return ui_lang if ui_lang in REPLY_LANGS else "en-IN"


# Voice replies being made in the background, by media file name. The answer (text, cards, map) goes out
# as soon as the search is done; GET /media/<name> waits here until the voice is ready.
PENDING_VOICE: dict[str, asyncio.Task] = {}
FIXED_KINDS = {"clarify_group", "clarify_location", "clarify_both", "clarify_letter", "donor_hint"}


async def _make_voice(text: str, lang: str, fmt: str, name: str, cache: bool) -> None:
    t0 = time.perf_counter()
    wav = await gnani.synthesize(text, lang, cache=cache)
    t1 = time.perf_counter()
    await asyncio.to_thread(audio.save_reply_audio, wav, fmt, name)
    log.info("voice ready: tts %d ms, encode %d ms, %d chars, %s", (t1 - t0) * 1000,
             (time.perf_counter() - t1) * 1000, len(text), lang)


def _voice_done(name: str):
    def done(task: asyncio.Task) -> None:
        PENDING_VOICE.pop(name, None)
        if not task.cancelled() and task.exception():
            log.warning("TTS unavailable: %s", task.exception())
    return done


async def _voice(text: str, lang: str, fmt: str, *, wait: bool = False, cache: bool = False) -> str | None:
    """Start making the voice reply and return its URL at once. wait=True (WhatsApp) returns only when the
    file exists, because it is sent as a link straight away."""
    if not get_settings().has_gnani:
        return None
    name = audio.new_media_name(fmt)
    task = asyncio.create_task(_make_voice(text, lang, fmt, name, cache))
    if wait:
        try:
            await task
        except Exception as e:  # noqa: BLE001 - voice is optional; the text answer still goes out
            log.warning("TTS unavailable: %s", e)
            return None
        return "/media/" + name
    PENDING_VOICE[name] = task
    task.add_done_callback(_voice_done(name))
    return "/media/" + name


async def warm_voice() -> None:
    """Make the fixed follow-up questions once (disk-cached), so the first person to hear them waits 0 s."""
    for lang in ("hi-IN", "hi-en", "en-IN"):
        for kind, facts in (("clarify_group", {}), ("clarify_location", {}), ("clarify_both", {}),
                            ("clarify_letter", {"sign": "-"}), ("clarify_letter", {"sign": "+"})):
            try:
                await gnani.synthesize(replies.build(kind, lang, facts), lang, cache=True)
            except Exception as e:  # noqa: BLE001
                log.warning("voice warm-up stopped: %s", e)
                return


def _heard(state: dict, lang: str, units: int) -> dict:
    return {
        "transcript": state.get("transcript"), "language": lang, "blood_group": state.get("blood_group"),
        "component": state.get("component"), "units": units, "place": state.get("place"),
        "location_source": state.get("location_source", "none"), "low_confidence": state.get("low_confidence", []),
    }


async def run(owner: str, channel: str, updates: dict, request_id: str | None = None,
              extend: bool = False, audio_fmt: str = "mp3", timings: dict | None = None) -> dict:
    """updates may hold: transcript, language, blood_group, component, units, place, lat, lng, accuracy,
    location_source, low_confidence, ui_lang."""
    state = load_state(request_id, owner) or {"request_id": new_request_id(), "component": None, "units": None}
    # Keep the conversation's language when a short reply ("Oh negative") is detected as English.
    words = len((updates.get("transcript") or "").split())
    if updates.get("language") == "en-IN" and state.get("language") not in (None, "en-IN") and words <= 4:
        updates = {**updates, "language": state["language"]}
    if updates.get("place") and updates.get("lat") is None:
        # A newly spoken/typed place replaces the previous position.
        for k in ("lat", "lng", "accuracy"):
            state.pop(k, None)
    for k, v in updates.items():
        if v is not None and v != "":
            state[k] = v
    if updates.get("lat") is not None:
        state["location_source"] = updates.get("location_source") or "gps"
    tm = timings if timings is not None else {}
    lang = state.get("language") or state.get("ui_lang") or "en-IN"
    component = state.get("component") or "prbc"
    units = int(state.get("units") or 1)

    resp: dict = {
        "request_id": state["request_id"], "status": "clarify", "clarify": None, "search": None, "results": [],
        "donors": None, "reply": None, "emergency": EMERGENCY, "demo_data": True,
    }

    # Resolve location: GPS / pin first, else the spoken or typed place.
    if state.get("lat") is None and state.get("place"):
        p = lookup_place(state["place"])
        if p:
            state.update(lat=p.lat, lng=p.lng, place=p.name, location_source="spoken")
        else:
            state.pop("place", None)
    if state.get("lat") is not None and not state.get("place"):
        state["place"] = "your location"

    # Partial blood group: keep a heard Rh sign; complete it from a lone letter on the next turn.
    if not state.get("blood_group"):
        heard_now = updates.get("transcript") or ""
        sign = rh_sign(heard_now) or state.get("rh")
        letter = abo_letter(heard_now) if state.get("rh") else None
        if sign and letter:
            state["blood_group"] = letter + sign
            state.pop("rh", None)
        elif sign:
            state["rh"] = sign

    need_group, need_place = not state.get("blood_group"), state.get("lat") is None
    if need_group and state.get("rh"):
        text, text_lang = await replies.localized("clarify_letter", lang, {"sign": state["rh"]})
        resp.update(status="clarify", clarify={"field": "blood_group", "question": text})
        resp["heard"] = _heard(state, lang, units)
        resp["reply"] = {"text": text, "language": text_lang,
                         "audio_url": await _voice(text, text_lang, audio_fmt, wait=channel != "web", cache=True)}
        resp["timings"] = tm
        _save(state, owner, channel, "clarify", None)
        return resp
    missing = "both" if need_group and need_place else "blood_group" if need_group else "location" if need_place else None

    if missing:
        kind = {"both": "clarify_both", "blood_group": "clarify_group", "location": "clarify_location"}[missing]
        text, text_lang = await replies.localized(kind, lang, {})
        resp["clarify"] = {"field": missing, "question": text}
        status, found = "clarify", None
    else:
        radii = EXTENDED_KM if extend else RADII_KM
        t_search = time.perf_counter()
        res = radius_search(state["lat"], state["lng"], state["blood_group"], component, units, radii=radii)
        tm["search_ms"] = round((time.perf_counter() - t_search) * 1000, 1)
        within = res.found_within_km or res.max_km
        donor_ids = donors_nearby(state["lat"], state["lng"], state["blood_group"], component, within)
        resp["search"] = {"center": {"lat": state["lat"], "lng": state["lng"]},
                          "approximate": state.get("location_source") == "spoken",
                          "searched_km": res.searched_km, "found_within_km": res.found_within_km,
                          "max_km": res.max_km, "can_extend": not extend}
        resp["results"] = [h.as_dict(i + 1) for i, h in enumerate(res.hits)]
        resp["donors"] = {"count": len(donor_ids), "within_km": within} if donor_ids else None
        facts = {"group": state["blood_group"], "units": units, "place": state["place"], "channel": channel,
                 "donors": len(donor_ids), "max_km": res.max_km}
        # Only claim "none within X km" for a ring that really had nothing.
        empty_km = None
        for r in res.searched_km[:-1]:
            if not any(h.distance_km <= r for h in res.hits):
                empty_km = r
        resp["search"]["empty_within_km"] = empty_km
        if res.hits:
            facts.update(count=len(res.hits), found_km=res.found_within_km, top=resp["results"][0],
                         prev_km=empty_km)
            status, kind = "results", "results"
        else:
            status, kind = "no_results", "no_results"
        text, text_lang = await replies.localized(kind, lang, facts)
        found = res.found_within_km

    resp["status"] = status
    resp["heard"] = _heard(state, lang, units)
    resp["reply"] = {"text": text, "language": text_lang,
                     "audio_url": await _voice(text, text_lang, audio_fmt, wait=channel != "web",
                                               cache=kind in FIXED_KINDS)}
    resp["timings"] = tm
    _save(state, owner, channel, status, found)
    return resp


async def from_voice(owner: str, channel: str, raw_audio: bytes, extra: dict, request_id: str | None,
                     audio_fmt: str = "mp3") -> dict:
    """Voice note -> STT -> extraction -> run()."""
    tm: dict = {}
    t0 = time.perf_counter()
    wav = await asyncio.to_thread(audio.prepare_for_stt, raw_audio)
    tm["audio_prep_ms"] = round((time.perf_counter() - t0) * 1000)
    t1 = time.perf_counter()
    transcript, detected = await gnani.transcribe(wav)
    tm["stt_ms"] = round((time.perf_counter() - t1) * 1000)
    if not transcript:
        raise audio.AudioError("I couldn't hear that clearly. Please try again, closer to the phone.")
    t2 = time.perf_counter()
    ex = await llm.extract(transcript)
    tm["understand_ms"] = round((time.perf_counter() - t2) * 1000)
    lang = reply_language(detected, ex.is_hinglish, extra.get("ui_lang"))
    extra = {k: v for k, v in extra.items() if v is not None}
    # A place the person actually names (e.g. the hospital) beats the phone's GPS position.
    spoken = lookup_place(ex.location_text) if ex.location_text else None
    if spoken:
        for k in ("lat", "lng", "accuracy", "location_source"):
            extra.pop(k, None)
        extra["place"] = spoken.name
    if ex.intent == "register_donor":
        return await donor_hint(owner, channel, transcript, lang, request_id, audio_fmt)
    updates = {"transcript": transcript, "language": lang, "blood_group": ex.blood_group,
               "component": ex.component, "units": ex.units, **extra}
    resp = await run(owner, channel, updates, request_id=request_id, audio_fmt=audio_fmt, timings=tm)
    resp["timings"]["total_ms"] = round((time.perf_counter() - t0) * 1000)
    resp["intent"] = ex.intent
    return resp


async def donor_hint(owner: str, channel: str, transcript: str, lang: str, request_id: str | None,
                     audio_fmt: str) -> dict:
    """The person wants to donate, not find blood: point them to donor registration."""
    text, text_lang = await replies.localized("donor_hint", lang, {})
    return {"request_id": request_id or new_request_id(), "status": "donate", "intent": "register_donor",
            "clarify": None, "search": None, "results": [], "donors": None, "emergency": EMERGENCY,
            "demo_data": True,
            "heard": {"transcript": transcript, "language": lang, "blood_group": None, "component": None,
                      "units": None, "place": None, "location_source": "none", "low_confidence": []},
            "reply": {"text": text, "language": text_lang,
                      "audio_url": await _voice(text, text_lang, audio_fmt, wait=channel != "web", cache=True)}}
