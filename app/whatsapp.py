"""Twilio WhatsApp: send messages, fetch voice-note media safely."""
from __future__ import annotations

import logging
from urllib.parse import urlparse

import httpx

from .config import get_settings

log = logging.getLogger("jeevandhara.whatsapp")

# Only these hosts may be fetched for inbound media (prevents SSRF via MediaUrl).
MEDIA_HOSTS = ("api.twilio.com",)
MEDIA_REDIRECT_SUFFIXES = (".twilio.com", ".twiliocdn.com", ".amazonaws.com")


async def send(to_whatsapp: str, body: str | None = None, media_url: str | None = None) -> bool:
    s = get_settings()
    if not s.has_twilio:
        log.info("Twilio not configured; would send to %s: %s", to_whatsapp[-4:], (body or media_url or "")[:80])
        return False
    data = {"From": s.twilio_whatsapp_from, "To": to_whatsapp}
    if body:
        data["Body"] = body[:1500]
    if media_url:
        data["MediaUrl"] = media_url
    url = f"https://api.twilio.com/2010-04-01/Accounts/{s.twilio_account_sid}/Messages.json"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, data=data, auth=(s.twilio_account_sid, s.twilio_auth_token))
    if r.status_code >= 300:
        log.warning("Twilio send failed: %s %s", r.status_code, r.text[:200])
        return False
    return True


async def fetch_media(media_url: str, max_bytes: int) -> bytes:
    s = get_settings()
    u = urlparse(media_url)
    if u.scheme != "https" or u.hostname not in MEDIA_HOSTS:
        raise ValueError("media URL not from Twilio")
    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        r = await client.get(media_url, auth=(s.twilio_account_sid, s.twilio_auth_token))
        hops = 0
        while r.is_redirect and hops < 3:
            nxt = urlparse(r.headers.get("location", ""))
            if nxt.scheme != "https" or not (nxt.hostname or "").endswith(MEDIA_REDIRECT_SUFFIXES):
                raise ValueError("unexpected media redirect")
            r = await client.get(nxt.geturl())
            hops += 1
        r.raise_for_status()
        if len(r.content) > max_bytes:
            raise ValueError("media too large")
        return r.content
