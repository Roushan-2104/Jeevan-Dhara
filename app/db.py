"""SQLite storage. All queries are parameterised."""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from typing import Iterator

from .config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS blood_banks (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    area TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    phone_synthetic TEXT NOT NULL,
    hours TEXT NOT NULL,
    last_updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_banks_lat ON blood_banks(lat);
CREATE INDEX IF NOT EXISTS idx_banks_lng ON blood_banks(lng);

CREATE TABLE IF NOT EXISTS stock (
    bank_id INTEGER NOT NULL REFERENCES blood_banks(id),
    blood_group TEXT NOT NULL,
    component TEXT NOT NULL,
    units INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (bank_id, blood_group, component)
);

CREATE TABLE IF NOT EXISTS gazetteer (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    alt_names TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    phone_hash TEXT UNIQUE NOT NULL,
    phone_enc TEXT NOT NULL DEFAULT '',
    lang_pref TEXT,
    verified_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS donors (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    blood_group TEXT NOT NULL,
    lat_r REAL NOT NULL,
    lng_r REAL NOT NULL,
    place TEXT,
    languages TEXT NOT NULL DEFAULT '',
    sex TEXT,
    available INTEGER NOT NULL DEFAULT 1,
    last_donation TEXT,
    eligible_from TEXT,
    opted_out INTEGER NOT NULL DEFAULT 0,
    synthetic INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp (
    phone_hash TEXT PRIMARY KEY,
    code_hmac TEXT NOT NULL,
    expires_at REAL NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    channel TEXT NOT NULL,
    state_json TEXT NOT NULL,
    status TEXT NOT NULL,
    found_within_km REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_owner ON requests(owner);

CREATE TABLE IF NOT EXISTS donor_pings (
    id INTEGER PRIMARY KEY,
    request_id TEXT NOT NULL,
    donor_user_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    answered_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
);
"""

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None


def connect() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            path = get_settings().db_path
            _conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
            _conn.execute("PRAGMA foreign_keys=ON")
            _conn.executescript(SCHEMA)
        return _conn


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    conn = connect()
    with _lock:
        conn.execute("BEGIN")
        try:
            yield conn
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise


def query(sql: str, params: tuple | dict = ()) -> list[sqlite3.Row]:
    with _lock:
        return connect().execute(sql, params).fetchall()


def query_one(sql: str, params: tuple | dict = ()) -> sqlite3.Row | None:
    with _lock:
        return connect().execute(sql, params).fetchone()


def execute(sql: str, params: tuple | dict = ()) -> int:
    with _lock:
        cur = connect().execute(sql, params)
        return cur.lastrowid or cur.rowcount
