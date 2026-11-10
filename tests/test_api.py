import base64
import hashlib
import hmac
import logging

import pytest
from fastapi.testclient import TestClient

from app import llm, security
from app.config import get_settings
from app.main import app

JAYANAGAR = {"lat": 12.925, "lng": 77.593}


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_config_and_headers(client):
    r = client.get("/api/config")
    assert r.status_code == 200
    assert len(r.json()["languages"]) == 11
    csp = r.headers["content-security-policy"]
    assert "default-src 'self'" in csp and "frame-ancestors 'none'" in csp
    assert r.headers["x-content-type-options"] == "nosniff"
    assert "jd_session" in r.cookies


def test_form_search_widens_ring(client):
    r = client.post("/api/search", json={"blood_group": "O-", "units": 2, **JAYANAGAR, "lang": "hi-IN"})
    body = r.json()
    assert r.status_code == 200, body
    assert body["status"] == "results"
    assert body["search"]["searched_km"][:2] == [5, 10] and body["search"]["found_within_km"] == 10
    assert len(body["results"]) >= 3 and body["results"][0]["rank"] == 1
    assert all(x["phone"].startswith("+91 00000") for x in body["results"])
    assert "108" in body["reply"]["text"] and "किलोमीटर" in body["reply"]["text"]
    assert body["demo_data"] is True and body["emergency"]["ambulance"] == "108"


def test_never_claims_empty_ring_that_had_results(client):
    r = client.post("/api/search", json={"blood_group": "AB+", "units": 3, "place": "Andheri", "lang": "en-IN"}).json()
    empty = r["search"]["empty_within_km"]
    if empty:
        assert all(x["distance_km"] > empty for x in r["results"])
    # The spoken answer leads with the nearest bank; rings are shown on screen, never claimed in speech.
    assert "None within" not in r["reply"]["text"]
    assert r["results"][0]["name"] in r["reply"]["text"]


def test_clarify_then_complete(client):
    r = client.post("/api/search", json={"text": "mujhe khoon chahiye Jayanagar mein", "lang": "hi-en"}).json()
    assert r["status"] == "clarify" and r["clarify"]["field"] == "blood_group"
    rid = r["request_id"]
    r2 = client.post("/api/search", json={"blood_group": "B+", "request_id": rid, "lang": "hi-en"}).json()
    assert r2["request_id"] == rid and r2["status"] == "results"
    assert r2["heard"]["place"] == "Jayanagar, Bengaluru"


def test_partial_group_letter_follow_up(client):
    # STT sometimes drops the short "O" and only "negative" survives.
    r = client.post("/api/search", json={"text": "नेगेटिव दो यूनिट जयनगर में"}).json()
    assert r["status"] == "clarify" and "नेगेटिव" in r["clarify"]["question"]
    r2 = client.post("/api/search", json={"text": "ओ", "request_id": r["request_id"]}).json()
    assert r2["heard"]["blood_group"] == "O-" and r2["status"] == "results"


def test_nothing_said_asks_for_both(client):
    r = client.post("/api/search", json={"text": "mujhe khoon chahiye"}).json()
    assert r["status"] == "clarify" and r["clarify"]["field"] == "both"


def test_named_place_beats_gps(client):
    r = client.post("/api/search", json={"text": "B+ in Andheri Mumbai", "lat": 12.925, "lng": 77.593}).json()
    assert r["heard"]["place"] == "Andheri, Mumbai" and r["results"][0]["city"] == "Mumbai"


def test_donor_intent_points_to_registration(client):
    r = client.post("/api/search", json={"text": "I want to donate blood, I am O positive"}).json()
    assert r["status"] == "donate"


def test_clarify_location(client):
    r = client.post("/api/search", json={"blood_group": "A+", "lang": "en-IN"}).json()
    assert r["status"] == "clarify" and r["clarify"]["field"] == "location"


def test_free_text_in_kannada_script(client):
    r = client.post("/api/search", json={"text": "ಜಯನಗರ ಹತ್ತಿರ ಒ ನೆಗೆಟಿವ್ ಬೇಕು, O- 2 units"}).json()
    assert r["heard"]["language"] == "kn-IN" and r["heard"]["blood_group"] == "O-"


def test_extend_and_ownership(client):
    rid = client.post("/api/search", json={"blood_group": "AB-", "component": "platelets", **JAYANAGAR}).json()["request_id"]
    r = client.post(f"/api/search/{rid}/extend").json()
    assert r["search"]["searched_km"][0] == 30 and r["search"]["can_extend"] is False
    with TestClient(app) as other:  # a different session cannot touch this request
        assert other.post(f"/api/search/{rid}/extend").status_code == 404


def test_ask_donors_demo(client):
    rid = client.post("/api/search", json={"blood_group": "O+", **JAYANAGAR}).json()["request_id"]
    r = client.post(f"/api/requests/{rid}/ask-donors").json()
    assert r["pinged"] == 0 and r["demo_donors"] > 0


def test_my_requests_lists_own_only(client):
    client.post("/api/search", json={"blood_group": "A-", **JAYANAGAR})
    assert len(client.get("/api/requests").json()["requests"]) >= 1
    with TestClient(app) as other:
        assert other.get("/api/requests").json()["requests"] == []


def test_whatsapp_off_by_default(client):
    assert client.post("/webhooks/twilio", data={"Body": "hi"}).status_code == 404


def test_twilio_webhook_rejects_bad_signature(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "whatsapp_enabled", True)
    r = client.post("/webhooks/twilio", data={"From": "whatsapp:+919876543210", "Body": "O- Jayanagar"},
                    headers={"X-Twilio-Signature": "forged"})
    assert r.status_code == 403


def test_twilio_signature_algorithm():
    url, params = "https://example.test/webhooks/twilio", {"Body": "hi", "From": "whatsapp:+1"}
    token = get_settings().twilio_auth_token
    sig = base64.b64encode(hmac.new(token.encode(), (url + "Bodyhi" + "Fromwhatsapp:+1").encode(),
                                    hashlib.sha1).digest()).decode()
    assert security.twilio_signature_valid(url, params, sig)
    assert not security.twilio_signature_valid(url, {**params, "Body": "tampered"}, sig)


@pytest.mark.parametrize("name", ["../../.env", "abc.mp3", "0" * 32 + ".wav", "..%2F.env"])
def test_media_rejects_bad_names(client, name):
    assert client.get(f"/media/{name}").status_code == 404


def test_upload_rejects_non_audio(client):
    r = client.post("/api/ask", files={"audio": ("x.webm", b"<script>alert(1)</script>", "audio/webm")})
    assert r.status_code == 400


def test_donor_needs_login(client):
    r = client.post("/api/donors", json={"blood_group": "O+", "place": "Jayanagar", "age_ok": True,
                                         "weight_ok": True, "consent": True})
    assert r.status_code == 401


def test_otp_login_and_donor_flow(client, caplog, monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_mode", True)
    caplog.set_level(logging.WARNING)
    assert client.post("/api/auth/otp/send", json={"phone": "98765 43210"}).json() == {"sent": True}
    code = next(r.getMessage()[-6:] for r in caplog.records if "DEMO_MODE OTP" in r.getMessage())
    assert client.post("/api/auth/otp/verify", json={"phone": "9876543210", "code": "000000" if code != "000000" else "111111"}).status_code == 400
    assert client.post("/api/auth/otp/verify", json={"phone": "9876543210", "code": code}).json() == {"ok": True}
    me = client.get("/api/me").json()
    assert me["authenticated"] and me["phone_masked"].endswith("3210")
    d = client.post("/api/donors", json={"blood_group": "O+", "place": "Koramangala", "age_ok": True, "weight_ok": True,
                                         "consent": True, "sex": "female", "last_donation": "2026-10-01"}).json()
    assert d["status"] == "resting" and d["eligible_from"] == "2027-01-29"
    assert client.patch("/api/donors/me", json={"available": False}).json()["available"] is False
    # stored phone is encrypted, never plain
    from app import db
    row = db.query_one("SELECT phone_enc FROM users WHERE phone_hash = ?", (security.phone_hash("9876543210"),))
    assert "9876543210" not in row["phone_enc"] and security.decrypt(row["phone_enc"]) == "9876543210"


def test_donor_rejects_ineligible(client, caplog, monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_mode", True)
    caplog.set_level(logging.WARNING)
    client.post("/api/auth/otp/send", json={"phone": "9123456780"})
    code = next(r.getMessage()[-6:] for r in caplog.records if "DEMO_MODE OTP" in r.getMessage())
    client.post("/api/auth/otp/verify", json={"phone": "9123456780", "code": code})
    r = client.post("/api/donors", json={"blood_group": "O+", "place": "Jayanagar", "age_ok": True,
                                         "weight_ok": False, "consent": True})
    assert r.status_code == 400


def test_rate_limit(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "user_requests_per_hour", 2)
    security.limiter._hits.clear()
    codes = [client.post("/api/search", json={"blood_group": "O+", **JAYANAGAR}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    security.limiter._hits.clear()


def test_translation_validator():
    src = "O negative, 2 units, near Jayanagar. I found 3 blood banks within 10 km. The nearest is 5.7 km away."
    assert llm.numbers_preserved(src, "ओ नेगेटिव, 2 यूनिट। 10 किलोमीटर में 3 ब्लड बैंक। सबसे पास 5.7 किलोमीटर।")
    assert llm.numbers_preserved(src, "ओ नेगेटिव, २ यूनिट। १० किलोमीटर में ३ ब्लड बैंक। ५.७ किलोमीटर।")
    assert not llm.numbers_preserved(src, "ओ नेगेटिव, 2 यूनिट। 10 किलोमीटर में 3 ब्लड बैंक। फ़ोन 98765 43210")
    assert not llm.numbers_preserved(src, "बहुत सारे ब्लड बैंक मिले")


def test_rule_based_extraction():
    ex = llm.rule_based_extract("Mujhe O negative chahiye, do unit, Jayanagar mein")
    assert ex.blood_group == "O-" and ex.units == 2 and ex.location_text == "Jayanagar, Bengaluru" and ex.is_hinglish


def test_answer_returns_before_voice_is_ready(client, monkeypatch):
    """Results go out at once; the voice file is made in the background and /media waits for it."""
    import asyncio
    import io
    import time
    import wave

    from app import gnani

    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(24000)
        w.writeframes(b"\x00\x00" * 2400)

    async def slow_tts(text, lang, cache=False):
        await asyncio.sleep(1.0)
        return buf.getvalue()

    monkeypatch.setattr(get_settings(), "gnani_api_key", "test")
    monkeypatch.setattr(gnani, "synthesize", slow_tts)
    t0 = time.perf_counter()
    r = client.post("/api/search", json={"blood_group": "O-", "units": 2, **JAYANAGAR, "lang": "en-IN"}).json()
    assert time.perf_counter() - t0 < 0.9, "the answer must not wait for the voice"
    url = r["reply"]["audio_url"]
    assert r["status"] == "results" and url.startswith("/media/")
    a = client.get(url)
    assert a.status_code == 200 and a.headers["content-type"] == "audio/mpeg" and len(a.content) > 100


def test_limits_leave_room_for_a_real_emergency():
    # Checked on a fresh Settings so a local .env override cannot hide a bad default.
    from app.config import Settings

    fields = Settings.model_fields
    assert fields["user_requests_per_hour"].default >= 60
    assert fields["ip_requests_per_hour"].default >= fields["user_requests_per_hour"].default
    assert fields["global_requests_per_day"].default >= fields["ip_requests_per_hour"].default


def test_limiter_forgets_idle_visitors():
    lim = security.RateLimiter()
    lim.SWEEP_EVERY = 3
    lim.FORGET_AFTER_S = 0  # anything older than "now" counts as idle
    assert lim.allow("ip:old", 5, 3600)
    assert "ip:old" in lim._hits
    import time

    time.sleep(0.01)
    lim.allow("ip:a", 5, 3600)
    lim.allow("ip:b", 5, 3600)  # third call runs the clean-up
    assert "ip:old" not in lim._hits
    assert "ip:b" in lim._hits


def test_limiter_still_blocks_after_cleanup():
    lim = security.RateLimiter()
    lim.SWEEP_EVERY = 2
    assert [lim.allow("k", 2, 3600) for _ in range(4)] == [True, True, False, False]


@pytest.mark.parametrize("path,kind", [
    ("/sw.js", "javascript"),
    ("/manifest.webmanifest", "json"),
    ("/voice-i18n.js", "javascript"),
])
def test_offline_shell_files_are_served(client, path, kind):
    r = client.get(path)
    assert r.status_code == 200
    assert kind in r.headers["content-type"]


def test_service_worker_never_touches_answers():
    from pathlib import Path

    sw = (Path(__file__).resolve().parent.parent / "web" / "sw.js").read_text(encoding="utf-8")
    assert "(api|media|webhooks)" in sw  # live answers and voice are always fetched fresh
    for name in ("/voice.js", "/voice-i18n.js", "/voice.css"):
        assert name in sw


def test_offline_call_buttons_in_page(client):
    html = client.get("/").text
    assert 'id="offline"' in html and 'href="tel:108"' in html and 'href="tel:104"' in html


@pytest.mark.parametrize("path", ["/", "/voice.js", "/voice.css", "/sw.js"])
def test_page_files_are_always_rechecked(client, path):
    # Without this a browser can keep an old page next to a new script after an update.
    assert client.get(path).headers["cache-control"] == "no-cache"
