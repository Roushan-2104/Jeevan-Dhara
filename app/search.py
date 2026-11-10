"""Radius-ladder search, blood compatibility and place lookup. Pure, deterministic code."""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from rapidfuzz import fuzz, process

from . import db

IST = timezone(timedelta(hours=5, minutes=30))
GROUPS = ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")
RADII_KM = (5, 10, 15, 20)
EXTENDED_KM = (30, 50)
GOAL = 3
STALE_AFTER = timedelta(hours=24)

# Red cells: patient group -> donor groups it can safely receive (exact first).
RED_CELL_COMPATIBLE: dict[str, tuple[str, ...]] = {
    "O-": ("O-",),
    "O+": ("O+", "O-"),
    "A-": ("A-", "O-"),
    "A+": ("A+", "A-", "O+", "O-"),
    "B-": ("B-", "O-"),
    "B+": ("B+", "B-", "O+", "O-"),
    "AB-": ("AB-", "A-", "B-", "O-"),
    "AB+": ("AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"),
}
RED_CELL_COMPONENTS = ("whole_blood", "prbc")


def compatible_groups(group: str, component: str) -> tuple[str, ...]:
    if group not in RED_CELL_COMPATIBLE:
        raise ValueError(f"unknown blood group {group!r}")
    if component in RED_CELL_COMPONENTS:
        return RED_CELL_COMPATIBLE[group]
    return (group,)  # platelets / plasma: exact match only


_GROUP_PATTERNS = [
    (r"\bab\s*(?:\+|pos(?:itive)?|\+ve|positive)", "AB+"),
    (r"\bab\s*(?:-|−|neg(?:ative)?|-ve)", "AB-"),
    (r"\b([abo])\s*(?:\+|pos(?:itive)?|\+ve)", "{}+"),
    (r"\b([abo])\s*(?:-|−|neg(?:ative)?|-ve)", "{}-"),
]
_NATIVE = {
    # common spoken forms in Indic scripts -> Latin
    "ओ": "o", "ए": "a", "बी": "b", "एबी": "ab", "पॉजिटिव": "positive", "पोजिटिव": "positive", "पॉज़िटिव": "positive",
    "नेगेटिव": "negative", "निगेटिव": "negative", "ಓ": "o", "ಎ": "a", "ಬಿ": "b", "ಎಬಿ": "ab", "ಪಾಸಿಟಿವ್": "positive",
    "ನೆಗೆಟಿವ್": "negative", "ஓ": "o", "ஏ": "a", "பி": "b", "ஏபி": "ab", "பாசிட்டிவ்": "positive", "நெகட்டிவ்": "negative",
    "ఓ": "o", "ఎ": "a", "బి": "b", "ఏబీ": "ab", "పాజిటివ్": "positive", "నెగెటివ్": "negative",
}


def _spelled_letters(t: str) -> str:
    """STT often writes group letters as words: 'oh', 'bee', 'ay', 'ab' spoken as 'a b'."""
    t = re.sub(r"\b(oh|ow|ho)\b", "o", t, flags=re.I)
    t = re.sub(r"\b(bee|be|bi)\b", "b", t, flags=re.I)
    t = re.sub(r"\b(ay|ae|ey|ei)\b", "a", t, flags=re.I)
    return re.sub(r"\ba\s+b\b", "ab", t, flags=re.I)


def normalize_group(text: str | None) -> str | None:
    """Turn 'O negative', 'ओ नेगेटिव', 'o-ve', 'B+' into canonical 'O-', 'B+' etc."""
    if not text:
        return None
    t = text.strip().replace("−", "-").replace("–", "-")
    if t.upper() in GROUPS:
        return t.upper()
    t = _spelled_letters(t)
    for native, latin in sorted(_NATIVE.items(), key=lambda kv: -len(kv[0])):
        t = t.replace(native, f" {latin} ")
    t = re.sub(r"\s+", " ", t.lower())
    for pat, out in _GROUP_PATTERNS:
        m = re.search(pat, t)
        if m:
            return out.format(m.group(1).upper()) if "{}" in out else out
    return None


_SIGN_RE = [
    (r"negative|\bneg\b|-ve|नेगेटिव|निगेटिव|ನೆಗೆಟಿವ್|நெகட்டிவ்|నెగెటివ్|നെഗറ്റീവ്|নেগেটিভ|નેગેટિવ|ਨੈਗੇਟਿਵ", "-"),
    (r"positive|\bpos\b|\+ve|पॉजिटिव|पॉज़िटिव|पोजिटिव|ಪಾಸಿಟಿವ್|பாசிட்டிவ்|పాజిటివ్|പോസിറ്റീവ്|পজিটিভ|પોઝિટિવ|ਪਾਜ਼ਿਟਿਵ", "+"),
]
_LETTERS = {"ab": "AB", "एबी": "AB", "ಎಬಿ": "AB", "ஏபி": "AB", "ఏబీ": "AB", "a": "A", "ए": "A", "ಎ": "A", "ஏ": "A",
            "ఎ": "A", "b": "B", "बी": "B", "ಬಿ": "B", "பி": "B", "బి": "B", "o": "O", "ओ": "O", "ಓ": "O", "ஓ": "O",
            "ఓ": "O", "zero": "O", "ज़ीरो": "O", "जीरो": "O",
            # Malayalam, Bengali, Gujarati, Punjabi
            "എബി": "AB", "എ": "A", "ബി": "B", "ഒ": "O", "ഓ": "O", "এবি": "AB", "এ": "A", "বি": "B", "ও": "O",
            "એબી": "AB", "એ": "A", "બી": "B", "ઓ": "O", "ਏਬੀ": "AB", "ਏ": "A", "ਬੀ": "B", "ਓ": "O"}


def rh_sign(text: str | None) -> str | None:
    """'+'/'-' when only the Rh part was heard (e.g. STT dropped the short 'O')."""
    t = (text or "").lower()
    for pat, sign in _SIGN_RE:
        if re.search(pat, t):
            return sign
    return None


def abo_letter(text: str | None) -> str | None:
    """A lone group letter, used only to answer 'A, B, AB or O?'."""
    words = re.findall(r"[\wऀ-෿]+", _spelled_letters(text or "").lower())
    hits = {_LETTERS[w] for w in words if w in _LETTERS}
    return hits.pop() if len(hits) == 1 else None


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


@dataclass
class Place:
    name: str
    city: str
    lat: float
    lng: float
    score: float


def lookup_place(text: str | None) -> Place | None:
    """Fuzzy-match a spoken/typed place against the gazetteer (names + native-script alt names)."""
    if not text or not text.strip():
        return None
    rows = db.query("SELECT name, alt_names, city, lat, lng FROM gazetteer")
    choices: dict[str, int] = {}
    for i, r in enumerate(rows):
        for n in [r["name"], *[a for a in r["alt_names"].split("|") if a]]:
            choices[n.lower()] = i
    q = text.strip().lower()
    # Try the whole phrase, then each word / word pair, keep the most specific good match.
    words = re.findall(r"[\w.ऀ-෿‌‍]+", q)
    candidates = {q, *words, *(" ".join(words[i:i + 2]) for i in range(len(words) - 1))}
    best: tuple[float, int] | None = None
    for cand in candidates:
        if len(cand) < 3:
            continue
        hit = process.extractOne(cand, list(choices.keys()), scorer=fuzz.WRatio, score_cutoff=86)
        if hit:
            idx = choices[hit[0]]
            is_city = rows[idx]["name"] == rows[idx]["city"]
            score = hit[1] - (5 if is_city else 0)  # prefer locality over city
            if best is None or score > best[0]:
                best = (score, idx)
    if best is None:
        return None
    r = rows[best[1]]
    label = r["name"] if r["name"] == r["city"] else f"{r['name']}, {r['city']}"
    return Place(label, r["city"], r["lat"], r["lng"], best[0])


@dataclass
class BankHit:
    id: int
    name: str
    type: str
    area: str
    city: str
    lat: float
    lng: float
    distance_km: float
    blood_group: str
    component: str
    units: int
    match: str
    updated_at: str
    stale: bool
    phone: str
    hours: str

    def as_dict(self, rank: int) -> dict:
        d = self.__dict__.copy()
        d["rank"] = rank
        d["distance_km"] = round(self.distance_km, 1)
        return d


@dataclass
class SearchResult:
    hits: list[BankHit] = field(default_factory=list)
    searched_km: list[int] = field(default_factory=list)
    found_within_km: int | None = None
    max_km: int = RADII_KM[-1]


def _candidates(lat: float, lng: float, r_km: float, groups: tuple[str, ...], component: str, units: int) -> list[BankHit]:
    dlat = r_km / 111.0
    dlng = r_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
    placeholders = ",".join("?" * len(groups))
    rows = db.query(
        f"""SELECT b.*, s.blood_group, s.component, s.units, s.updated_at
            FROM blood_banks b JOIN stock s ON s.bank_id = b.id
            WHERE b.lat BETWEEN ? AND ? AND b.lng BETWEEN ? AND ?
              AND s.component = ? AND s.units >= ? AND s.blood_group IN ({placeholders})""",  # noqa: S608
        (lat - dlat, lat + dlat, lng - dlng, lng + dlng, component, max(units, 1), *groups),
    )
    now = datetime.now(IST)
    best: dict[int, BankHit] = {}
    for r in rows:
        dist = haversine_km(lat, lng, r["lat"], r["lng"])
        if dist > r_km:
            continue
        match = "exact" if r["blood_group"] == groups[0] else "compatible"
        updated = datetime.fromisoformat(r["updated_at"])
        hit = BankHit(r["id"], r["name"], r["type"], r["area"], r["city"], r["lat"], r["lng"], dist,
                      r["blood_group"], r["component"], r["units"], match, r["updated_at"],
                      now - updated > STALE_AFTER, r["phone_synthetic"], r["hours"])
        prev = best.get(hit.id)
        # One row per bank: prefer the exact group, then more units.
        def pref(h: BankHit) -> tuple[bool, int]:
            return (h.match != "exact", -h.units)
        if prev is None or pref(hit) < pref(prev):
            best[hit.id] = hit
    return list(best.values())


def _rank(hits: list[BankHit]) -> list[BankHit]:
    return sorted(hits, key=lambda h: (h.match != "exact", round(h.distance_km, 1), -h.units, h.stale))


def radius_search(lat: float, lng: float, group: str, component: str = "prbc", units: int = 1,
                  radii: tuple[int, ...] = RADII_KM, limit: int = 5) -> SearchResult:
    """Widen ring by ring until GOAL exact-group banks are found. If exact matches stay scarce,
    settle on the smallest ring that had GOAL banks counting compatible groups (else the widest ring
    with anything). Compatible groups always rank after exact ones."""
    groups = compatible_groups(group, component)
    res = SearchResult(max_km=radii[-1])
    by_ring: dict[int, list[BankHit]] = {}
    chosen: int | None = None
    for r in radii:
        by_ring[r] = _candidates(lat, lng, r, groups, component, units)
        if sum(h.match == "exact" for h in by_ring[r]) >= GOAL:
            chosen = r
            break
    if chosen is None:
        enough = [r for r in by_ring if len(by_ring[r]) >= GOAL]
        anything = [r for r in by_ring if by_ring[r]]
        chosen = enough[0] if enough else (anything[-1] if anything else None)
    if chosen is None:
        res.searched_km = list(by_ring)
        return res
    res.searched_km = [r for r in radii if r <= chosen]
    res.hits = _rank(by_ring[chosen])[:limit]
    res.found_within_km = chosen
    return res


def donors_nearby(lat: float, lng: float, group: str, component: str, within_km: float) -> list[int]:
    """User ids of available donors with a compatible group inside the ring. Never returns contact details."""
    groups = compatible_groups(group, component)
    placeholders = ",".join("?" * len(groups))
    rows = db.query(
        f"SELECT user_id, lat_r, lng_r, eligible_from FROM donors WHERE available = 1 AND opted_out = 0 "  # noqa: S608
        f"AND blood_group IN ({placeholders})",
        groups,
    )
    today = datetime.now(IST).date().isoformat()
    return [r["user_id"] for r in rows
            if haversine_km(lat, lng, r["lat_r"], r["lng_r"]) <= within_km
            and (not r["eligible_from"] or r["eligible_from"] <= today)]
