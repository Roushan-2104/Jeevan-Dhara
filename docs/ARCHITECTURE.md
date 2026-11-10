# Jeevan Dhara — Architecture

> जीवन धारा, "stream of life". Ask for blood by voice, in your own language, and get the nearest
> blood banks that have it, plus willing donors nearby, back as a voice reply.

Related docs: [PRD](PRD.md) · [Security](SECURITY.md) · [Design](DESIGN.md) · [Project memory](MEMORY.md) · [Product context](../PRODUCT.md)

Challenge: Gnani "Great Indian AI Internship Challenge". **Deadline: 10 Nov 2026, 11:59 PM IST.**
Challenge rule: **synthetic data only** (no real phone numbers, Aadhaar, PAN or recorded calls).

---

## 1. System context

```
            ┌──────────────┐       ┌───────────────────┐
 Seeker ───▶│  Web app     │       │ WhatsApp (Twilio) │◀─── Seeker / Donor
 Donor  ───▶│ (HTML/CSS/JS)│       │  Sandbox number   │
            └──────┬───────┘       └─────────┬─────────┘
                   │ HTTPS                   │ HTTPS webhook (signed)
                   ▼                         ▼
            ┌─────────────────────────────────────────┐
            │        Jeevan Dhara API (FastAPI)       │
            │  auth · pipeline · search · donors · media │
            └───┬──────────┬───────────┬──────────┬───┘
                │          │           │          │
        Gnani Prisma   Groq LLM    SQLite DB   Gnani Timbre
        (STT v3.0)   (Qwen, JSON)  (synthetic) (TTS v2.5)
```

## 2. Components

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Plain HTML/CSS/JS, no build step, served by FastAPI | One page app with three views: Find blood, Donate, My requests. Works on low-end Android |
| Backend | Python 3.11, FastAPI, Uvicorn | One service: web API, WhatsApp webhook, media serving |
| STT | Gnani **Prisma v3.0**, `POST https://api.vachana.ai/stt/v3` | `language_code=indic-auto`; returns `detected_language_code`; max 30 s per clip |
| TTS | Gnani **Timbre v2.5**, `POST https://api.vachana.ai/api/v1/tts/inference` | Voice picked per language (table below) |
| NLU | **Groq**, OpenAI-compatible `https://api.groq.com/openai/v1` | `qwen/qwen3.8-27b` (preview, may be withdrawn) → fallback `openai/gpt-oss-20b` (production). Extraction and phrasing only |
| Data | SQLite, seeded synthetic dataset | ≈60 blood banks across 6 cities, stock per group/component, ≈200 synthetic donors, place gazetteer |
| Audio | ffmpeg (subprocess, no shell) | In: WebM/OGG/MP3 → 16 kHz mono WAV. Out: WAV → OGG/Opus for WhatsApp, MP3 for web |
| WhatsApp | Twilio WhatsApp Sandbox | Voice notes, location pins and text on one webhook |
| Tunnel | cloudflared or ngrok | HTTPS public URL for Twilio and phone testing (GPS needs HTTPS) |

### Language → TTS voice

| Language | STT code | TTS `language` | Voice |
|---|---|---|---|
| Hindi | hi-IN | hi-IN | Nalini |
| Hinglish (code-mixed) | en-IN (Latin output) | hi-en | Poorvi |
| English | en-IN | en-IN | Kaveri |
| Kannada | kn-IN | kn-IN | Saanvi |
| Tamil | ta-IN | ta-IN | Asmita |
| Telugu | te-IN | te-IN | Suhana |
| Malayalam | ml-IN | ml-IN | Reshma |
| Marathi | mr-IN | mr-IN | Zahira |
| Bengali | bn-IN | bn-IN | Kirra |
| Gujarati | gu-IN | gu-IN | Falak |
| Punjabi | pa-IN | pa-IN | Mehuli |

Hinglish detection: if STT returns `en-IN` and the LLM flags Hindi words in Latin script, reply with `hi-en` / Poorvi.

---

## 3. The voice pipeline (seeker)

```
 0. Gate       auth (OTP session / Twilio signature) → rate limit → size & duration check
 1. Normalize  ffmpeg → 16 kHz mono WAV (≤30 s)
 2. STT        Prisma v3 indic-auto → transcript, lang
 3. Extract    Groq → strict JSON → Pydantic validation
 4. Merge      merge with conversation state (15-min TTL) — fills fields from earlier turns
 5. Clarify    missing blood_group or location? → ask one follow-up question (voice), stop
 6. Locate     GPS > WhatsApp pin > spoken place (gazetteer) > ask
 7. Search     radius ladder + compatibility (pure code)
 8. Donors     if banks < goal → find matching donors in the same ring (masked)
 9. Compose    facts built by code → LLM phrases in user's language → validator → template fallback
10. TTS        Timbre v2.5 → WAV → OGG/Opus (WA) or MP3 (web)
11. Deliver    web: JSON + audio URL | WA: voice note + text card
12. Log        request row (hashed phone, rounded location), metrics
```

### Extraction schema (what the LLM may return)

```json
{
  "intent": "find_blood | register_donor | update_availability | help | other",
  "blood_group": "A+|A-|B+|B-|AB+|AB-|O+|O-|null",
  "component": "whole_blood|prbc|platelets|plasma|null",
  "units": 1,
  "location_text": "Jayanagar Bengaluru",
  "urgency": "now|today|later|null",
  "language": "hi-IN",
  "is_hinglish": false
}
```

Anything outside this schema is rejected. Blood groups are normalised by code too ("O negative", "ओ नेगेटिव", "o -ve", "ஓ நெகட்டிவ்" → `O-`).

---

## 4. Location and the radius ladder

**Location sources, in priority order**

1. Browser GPS (`navigator.geolocation`, needs HTTPS; keep `accuracy` in metres)
2. WhatsApp location pin (Twilio sends `Latitude`, `Longitude`)
3. Spoken place → gazetteer fuzzy match (rapidfuzz) → centroid, marked *approximate*
4. None → ask: "Please share your location pin or say your area name."

**Radius ladder**

```
RADII_KM  = [5, 10, 15, 20]      # automatic
EXTENDED  = [30, 50]             # only after the user says yes
GOAL      = 3 banks with units >= requested (exact or compatible)

for r in RADII_KM:
    rows = SELECT ... WHERE lat BETWEEN lat0 - r/111 AND lat0 + r/111
                      AND lng BETWEEN lng0 - r/(111·cos lat0) AND lng0 + r/(111·cos lat0)
    rows = [b for b in rows if haversine(b) <= r and has_stock(b)]
    if len(rows) >= GOAL: break
reply names the ring: "None within 5 km. Found 3 within 10 km."
if still < GOAL at 20 km → donors in range + offer extended search + 108/104
```

**Ranking:** exact group before compatible → distance → units in stock → freshness of `last_updated`.

**Red cell compatibility (code, never the LLM)**

| Patient | Can receive |
|---|---|
| O− | O− |
| O+ | O+, O− |
| A− | A−, O− |
| A+ | A+, A−, O+, O− |
| B− | B−, O− |
| B+ | B+, B−, O+, O− |
| AB− | AB−, A−, B−, O− |
| AB+ | all groups |

Platelets and plasma: exact match only. Compatible results carry "doctor must confirm".

---

## 5. Donor flow

**Registration** (web form or WhatsApp voice: "I want to donate, I am B positive, I live in Whitefield")

- Fields: blood group, area (GPS or spoken), languages, availability toggle, last donation date.
- Phone verified by OTP (web) or WhatsApp identity.
- Eligibility check in code: last donation ≥ 90 days ago (men) / ≥ 120 days (women), self-declared age 18–65 and weight ≥ 45 kg (India's NBTC donor-selection norms; verify the current guideline before relying on it). Not eligible → stored as "resting until <date>".

**Matching** (when banks fall short)

1. Find available, eligible donors with a compatible group inside the ring that was searched.
2. **Donor numbers are never shown to the seeker.** The system sends the donor a WhatsApp message with the request (group, hospital area, request ID) and two replies: *Yes, I can help* / *Not now*.
3. On *Yes*, the seeker gets a relay: "A donor 3 km away agreed. Reply to connect." Contact is shared only after both sides agree. Demo: Twilio sandbox numbers only.
4. Each donor gets at most 2 requests per day; "Stop" opts out permanently.

---

## 6. Data model (SQLite)

```
blood_banks(id, name, type, address, district, state, lat, lng, phone_synthetic, hours, last_updated)
stock(bank_id, blood_group, component, units, updated_at)              -- WB, PRBC, PLT, FFP
gazetteer(name, alt_names, district, state, lat, lng)                  -- spoken-place lookup
users(id, phone_hash, phone_enc, role, verified_at, lang_pref, created_at)   -- role: seeker|donor
donors(user_id, blood_group, lat_r, lng_r, available, last_donation, eligible_from, max_daily, opted_out)
otp(phone_hash, code_hmac, expires_at, attempts, sends_last_hour)
requests(id, user_id, blood_group, component, units, lat_r, lng_r, radius_found_km, status, created_at)
donor_pings(id, request_id, donor_id, status, sent_at, answered_at)    -- status: sent|yes|no|expired
audit_log(ts, actor_hash, action, detail)
```

`phone_enc` is encrypted (Fernet) and used only to send messages; `phone_hash` (HMAC) is used for lookups.
Synthetic bank phone numbers use an obviously fake pattern (`+91 00000 0XXXX`).

## 7. API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/otp/send` | rate-limited | send OTP to phone (via WhatsApp sandbox) |
| POST | `/auth/otp/verify` | — | verify, set session cookie |
| POST | `/ask` | session | multipart `audio`, optional `lat`, `lng`, `accuracy` → results + reply audio |
| POST | `/ask/text` | session | same pipeline from typed text (fallback, tests) |
| POST | `/ask/{id}/extend` | session | continue to 30 / 50 km |
| GET | `/requests` | session | my requests and their status |
| POST | `/donors` | session | register / update donor profile |
| PATCH | `/donors/me` | session | availability toggle, last donation |
| POST | `/webhooks/twilio` | Twilio signature | voice notes, location pins, text, donor replies |
| GET | `/media/{uuid}.{ogg,mp3}` | unguessable, 10-min TTL | reply audio |
| GET | `/health` | — | liveness |

## 8. Project layout

```
Gnani/
├─ PRODUCT.md                 product context (impeccable)
├─ docs/                      ARCHITECTURE · PRD · SECURITY · DESIGN · MEMORY
├─ app/
│  ├─ main.py                 FastAPI app, routes, middleware
│  ├─ config.py               env settings (pydantic-settings)
│  ├─ auth.py                 OTP, sessions, Twilio signature
│  ├─ pipeline.py             orchestrates steps 0–12
│  ├─ clients/gnani.py        STT + TTS
│  ├─ clients/groq.py         extraction + phrasing, fallback model
│  ├─ search.py               radius ladder, compatibility, ranking
│  ├─ donors.py               registration, eligibility, matching, relay
│  ├─ audio.py                ffmpeg helpers
│  ├─ db.py, models.py        SQLite + schemas
│  └─ i18n/                   reply templates per language (fallback)
├─ web/                       index.html, app.css, app.js
├─ data/seed.py               synthetic dataset generator
├─ tests/                     search, compatibility, extraction validator
├─ .env.example
└─ requirements.txt
```

## 9. Configuration

```
GNANI_API_KEY=            GNANI_STT_MODEL=prisma-v3.0     GNANI_TTS_MODEL=timbre-v2.5
GROQ_API_KEY=             GROQ_MODEL=qwen/qwen3.8-27b    GROQ_FALLBACK_MODEL=openai/gpt-oss-20b
TWILIO_ACCOUNT_SID=       TWILIO_AUTH_TOKEN=             TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
PUBLIC_BASE_URL=          SECRET_KEY=                    FERNET_KEY=
DEMO_MODE=false
```

## 10. Latency budget (target: reply audio in < 6 s)

| Step | Target |
|---|---|
| Upload + ffmpeg | 0.5 s |
| Prisma STT | 0.7 s |
| Groq extraction | 0.5 s |
| Search (SQLite) | < 0.05 s |
| Groq phrasing | 0.6 s |
| Timbre TTS | 1.0 s |
| Delivery | 0.5–2 s (WhatsApp) |

The web view shows results as soon as search finishes, before the voice reply is ready.

## 11. Failure handling

| Failure | Behaviour |
|---|---|
| STT fails or empty transcript | "I couldn't hear that clearly — please try again closer to the phone" (pre-recorded per language) |
| Groq primary model errors | retry once on fallback model; then regex extractor for group + gazetteer for place |
| TTS fails | send the text card only |
| No GPS permission | ask for area name; show the gazetteer match for confirmation |
| Nothing within 20 km | donors + extended-search offer + 108 / 104 |
