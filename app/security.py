"""Hashing, encryption, signing, rate limiting, Twilio signature validation, audit log."""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import threading
import time
from collections import defaultdict, deque
from datetime import datetime

from cryptography.fernet import Fernet
from itsdangerous import BadSignature, URLSafeTimedSerializer

from . import db
from .config import get_settings
from .search import IST


def _key(purpose: str) -> bytes:
    return hmac.new(get_settings().secret_key.encode(), purpose.encode(), hashlib.sha256).digest()


def hmac_hex(purpose: str, value: str) -> str:
    return hmac.new(_key(purpose), value.encode(), hashlib.sha256).hexdigest()


def phone_hash(phone: str) -> str:
    return hmac_hex("phone", phone)


def _fernet() -> Fernet:
    s = get_settings()
    key = s.fernet_key.encode() if s.fernet_key else base64.urlsafe_b64encode(_key("fernet"))
    return Fernet(key)


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


def normalize_indian_mobile(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if re.fullmatch(r"[6-9]\d{9}", digits):
        return digits
    return None


def mask_phone(ten_digits: str) -> str:
    return f"+91 •••••• {ten_digits[-4:]}"


# ---- sessions (signed cookie) ----
SESSION_COOKIE = "jd_session"
SESSION_MAX_AGE = 30 * 60


def _signer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().secret_key, salt="jd-session")


def sign_session(data: dict) -> str:
    return _signer().dumps(data)


def read_session(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        return _signer().loads(token, max_age=SESSION_MAX_AGE)
    except BadSignature:
        return None


# ---- rate limiting (in-memory sliding window; fine for one process) ----
class RateLimiter:
    SWEEP_EVERY = 500      # calls between clean-ups
    FORGET_AFTER_S = 86400  # the longest window in use

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._calls = 0

    def allow(self, key: str, limit: int, window_s: int) -> bool:
        now = time.monotonic()
        with self._lock:
            self._calls += 1
            if self._calls % self.SWEEP_EVERY == 0:
                self._sweep(now)
            q = self._hits[key]
            while q and now - q[0] > window_s:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True

    def _sweep(self, now: float) -> None:
        """Drop keys with no recent hit, so one-time visitors do not pile up in memory."""
        for k in [k for k, q in self._hits.items() if not q or now - q[-1] > self.FORGET_AFTER_S]:
            del self._hits[k]


limiter = RateLimiter()


# ---- Twilio webhook signature ----
def twilio_signature_valid(url: str, params: dict[str, str], signature: str | None) -> bool:
    token = get_settings().twilio_auth_token
    if not token or not signature:
        return False
    payload = url + "".join(k + params[k] for k in sorted(params))
    digest = hmac.new(token.encode(), payload.encode(), hashlib.sha1).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, signature)


# ---- audit ----
def audit(actor: str, action: str, detail: str = "") -> None:
    db.execute("INSERT INTO audit_log(ts, actor, action, detail) VALUES (?,?,?,?)",
               (datetime.now(IST).isoformat(), actor[:80], action, detail[:500]))
