"""Settings loaded from environment / .env. Secrets never leave the server."""
from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", env_file_encoding="utf-8", extra="ignore")

    gnani_api_key: str = ""
    gnani_base_url: str = "https://api.vachana.ai"
    gnani_stt_model: str = "prisma-v3.0"
    gnani_tts_model: str = "timbre-v2.5"

    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "qwen/qwen3.8-27b"
    groq_fallback_model: str = "openai/gpt-oss-20b"

    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_from: str = "whatsapp:+14155238886"

    public_base_url: str = "http://127.0.0.1:8000"
    secret_key: str = ""
    fernet_key: str = ""
    admin_token: str = ""
    demo_mode: bool = False
    whatsapp_enabled: bool = False  # WhatsApp (Twilio) channel is off for the free demo build
    require_login: bool = False

    db_path: Path = ROOT / "data" / "jeevandhara.db"
    media_dir: Path = ROOT / "media"
    tmp_dir: Path = ROOT / "tmp"
    tts_cache_dir: Path = ROOT / "data" / "tts_cache"  # fixed prompts are synthesised once, then reused
    warm_voice: bool = True  # pre-make the follow-up questions at startup so they play instantly

    max_upload_bytes: int = 2 * 1024 * 1024
    max_audio_seconds: float = 30.0
    # A stressed person retries and asks follow-ups, and a hospital or a reverse proxy can put many
    # people behind one address, so these are generous. The daily cap protects the API credits.
    user_requests_per_hour: int = 60
    ip_requests_per_hour: int = 300
    global_requests_per_day: int = 1500
    media_ttl_seconds: int = 600

    @property
    def has_gnani(self) -> bool:
        return bool(self.gnani_api_key)

    @property
    def has_groq(self) -> bool:
        return bool(self.groq_api_key)

    @property
    def has_twilio(self) -> bool:
        return bool(self.twilio_account_sid and self.twilio_auth_token)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if not s.secret_key:
        # Ephemeral key: sessions/OTPs reset on restart. Set SECRET_KEY in .env for stability.
        s.secret_key = secrets.token_urlsafe(48)
    for d in (s.media_dir, s.tmp_dir, s.db_path.parent, s.tts_cache_dir):
        d.mkdir(parents=True, exist_ok=True)
    return s
