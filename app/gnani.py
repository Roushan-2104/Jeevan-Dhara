"""Gnani Vachana API: Prisma speech-to-text and Timbre text-to-speech."""
from __future__ import annotations

import hashlib
import logging

import httpx

from .config import get_settings

log = logging.getLogger("jeevandhara.gnani")

# Timbre v2.5 voice per reply language.
VOICES = {
    "hi-IN": "Nalini", "hi-en": "Poorvi", "en-IN": "Kaveri", "kn-IN": "Saanvi", "ta-IN": "Asmita",
    "te-IN": "Suhana", "ml-IN": "Reshma", "mr-IN": "Zahira", "bn-IN": "Kirra", "gu-IN": "Falak", "pa-IN": "Mehuli",
}
STT_LANGS = {"bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "pa-IN", "ta-IN", "te-IN"}


class GnaniError(Exception):
    pass


async def transcribe(wav: bytes, language_hint: str | None = None) -> tuple[str, str]:
    """Return (transcript, detected_language_code)."""
    s = get_settings()
    if not s.has_gnani:
        raise GnaniError("GNANI_API_KEY is not set")
    lang = language_hint if language_hint in STT_LANGS else "indic-auto"
    data = {"model": s.gnani_stt_model, "language_code": lang}
    files = {"audio_file": ("voice.wav", wav, "audio/wav")}
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.post(f"{s.gnani_base_url}/stt/v3", headers={"X-API-Key-ID": s.gnani_api_key},
                              data=data, files=files)
    if r.status_code != 200:
        log.warning("STT failed: %s %s", r.status_code, r.text[:300])
        raise GnaniError(f"STT HTTP {r.status_code}")
    body = r.json()
    if not body.get("success", True):
        raise GnaniError("STT returned success=false")
    transcript = (body.get("transcript") or "").strip()
    detected = body.get("detected_language_code") or (lang if lang != "indic-auto" else "hi-IN")
    return transcript, detected


async def synthesize(text: str, language: str, cache: bool = False) -> bytes:
    """Return WAV bytes for text in the given reply language. Identical text is synthesised only once
    when cache=True (fixed follow-up questions repeat word for word), saving seconds and credits."""
    s = get_settings()
    if not s.has_gnani:
        raise GnaniError("GNANI_API_KEY is not set")
    lang = language if language in VOICES else "en-IN"
    key = hashlib.sha256(f"{s.gnani_tts_model}|{VOICES[lang]}|{lang}|{text}".encode()).hexdigest()
    cached = s.tts_cache_dir / f"{key}.wav"
    if cache and cached.is_file():
        return cached.read_bytes()
    payload = {
        "text": text,
        "voice": VOICES[lang],
        "model": s.gnani_tts_model,
        "language": lang,
        "speed": 1.0,
        "audio_config": {"sample_rate": 24000, "num_channels": 1, "sample_width": 2,
                         "encoding": "linear_pcm", "container": "wav"},
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{s.gnani_base_url}/api/v1/tts/inference",
                              headers={"X-API-Key-ID": s.gnani_api_key}, json=payload)
    if r.status_code != 200 or not r.content:
        log.warning("TTS failed: %s %s", r.status_code, r.text[:300] if r.content else "")
        raise GnaniError(f"TTS HTTP {r.status_code}")
    if cache:
        try:
            cached.write_bytes(r.content)
        except OSError:  # a cache miss next time is fine
            pass
    return r.content
