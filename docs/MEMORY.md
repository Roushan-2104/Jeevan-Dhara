# Jeevan Dhara — Project Memory

The single place to look first. It records **what has been decided, why, and where things stand**, so anyone
(you, a teammate, or an AI assistant in a new session) can pick up the work without re-reading every chat.
Update it whenever a decision changes. Newest entries go at the top of each log.

Related: [Architecture](ARCHITECTURE.md) · [PRD](PRD.md) · [Security](SECURITY.md) · [Design](DESIGN.md) · [Product context](../PRODUCT.md)

---

## 1. Snapshot

| | |
|---|---|
| Product | **Jeevan Dhara** (जीवन धारा): voice-first blood finder (web voice bot; WhatsApp built but off) |
| Challenge | Gnani Great Indian AI Internship Challenge (gnani.ai/internship) |
| Hard deadline | **10 Nov 2026, 11:59 PM IST.** LinkedIn/X post must be live *before* submitting |
| Submission needs | demo video, written explanation, Gnani models used, one post link per platform |
| Required tags | @Gnani AI, #GreatIndianAIInternshipChallenge, #GnaniAI |
| Status | App built and working locally (9–10 Nov). Next: real-mic check, demo video (docs/DEMO.md), post, submit |

## 2. Decision log

| Date | Decision | Why |
|---|---|---|
| 9 Nov (pm) | **Results first, voice follows**: `/api/ask` returns as soon as the search is done; TTS runs in the background and `GET /media/<name>` waits for it. Spoken answer leads with the nearest bank (rings stay on screen). Big **Call nearest** button above the map. Fixed follow-up questions are synthesised once (`data/tts_cache/`) and warmed at startup | Honest assessment: 7–15 s of silence is the worst thing for a panicking user. Now ~1–2.5 s to results on a normal STT day, voice ~2 s later |
| 9 Nov (pm) | Translations must keep the blood group word for word (`llm.groups_preserved`), one retry, else English | Tamil translation turned "A positive" into "positive" |
| 9 Nov | Visual direction: **category standard** (clean blood-finder app: red header, search card, map, ranked list). Craft bar: Practo/Apollo 24\|7, Google Maps, PhonePe/GPay, Swiggy/Zomato | Chosen on the impeccable decision page after one re-roll; spec in DESIGN.md, contract in `.impeccable/surfaces/web-index-html.md` |
| 10 Nov | **WhatsApp dropped from the demo** (`WHATSAPP_ENABLED=false`; code kept, webhook returns 404). Demo is the web voice bot on localhost | User wants a free setup; WhatsApp needed a public tunnel + Twilio |
| 10 Nov | Main screen is a **voice bot**: tap once, auto end-of-speech, spoken follow-ups with auto-listen, no form and no language picker (UI follows detected language). Form page kept as `app.html` for Donate / My requests | User asked for "a normal voice bot, just click and talk" |
| 10 Nov | A named place beats GPS; GPS is used when no place is said | Attendants often name the hospital, not where they stand |
| 10 Nov | Blood group must be *heard*: LLM's group dropped unless its letter is in the transcript; Rh-only answers trigger "A, B, AB or O?" | Groq guessed O− from "negative"; STT often drops a short "O" |
| 9 Nov | Synthetic phone numbers start `+91 00000` | Indian mobiles start 6–9, so these can never ring a real person |
| 9 Nov | App name: **Jeevan Dhara** | User's choice ("stream of life") |
| 9 Nov | Users: seekers (attendants) **and donors** | User's choice; donors cover gaps when banks have no stock |
| 9 Nov | Languages: all Gnani supports (bn, en, gu, hi, kn, ml, mr, pa, ta, te + Hinglish) | User's choice; Prisma v3 `indic-auto` + Timbre v2.5 voices exist for all |
| 9 Nov | Frontend: plain HTML/CSS/JS, no build step | User's choice; low-end phones, overnight build |
| 9 Nov | Design process: impeccable skill (PRODUCT.md → direction round → build → DESIGN.md) | User's choice |
| 9 Nov | NLU: Groq, `qwen/qwen3.8-27b` primary, `openai/gpt-oss-20b` fallback | User chose Groq + Qwen; Qwen is *preview* on Groq, so a production fallback is required |
| 9 Nov | Search: radius ladder 5 → 10 → 15 → 20 km (30/50 on request) | User asked for widening rings; 15 used instead of 12 for even steps |
| 9 Nov | Location: GPS > WhatsApp pin > spoken place > ask | User asked for GPS |
| 9 Nov | Verification: WhatsApp identity, web OTP, Twilio signature, data freshness; slip/bank confirmation = roadmap | User asked for a verification system; scoped to what fits tonight |
| 9 Nov | Data: synthetic dataset modelled on eRaktKosh | eRaktKosh has no public API; challenge rule forbids real phone numbers |
| 9 Nov | Backend: Python FastAPI + SQLite; WhatsApp via Twilio sandbox | Fastest path; Meta Cloud API setup too slow for one night |
| 9 Nov | Compatibility and safety text are code, never LLM | Medical safety |
| 9 Nov | "Ercot" in the first brief = eRaktKosh | Speech-to-text slip |

## 3. Key facts (verified 9 Nov 2026)

**Gnani API** (docs.gnani.ai), base `https://api.vachana.ai`, header `X-API-Key-ID`
- STT REST `POST /stt/v3`, multipart `audio_file`, `model=prisma-v3.0`, `language_code=indic-auto`; WAV/MP3/OGG/FLAC/AAC/M4A; 8–44.1 kHz; **max 30 s**. Not WebM → convert.
- STT streaming `wss://api.vachana.ai/stt/v3/stream` (PCM 16-bit mono, 1024-byte frames, `{"type":"commit"}` to end).
- TTS REST `POST /api/v1/tts/inference`, JSON `{text, voice, model:"timbre-v2.5", language, speed, audio_config}` → `audio/wav`. SSE at `/api/v1/tts/sse`.
- Hinglish TTS: `language: "hi-en"`, voice Poorvi.
- 5,000 programme credits per participant; keys at app.gnani.ai/voice.
- Evon v3.3 LLM is **not** on the API (weights only).

**Groq**: OpenAI-compatible base `https://api.groq.com/openai/v1`. Qwen model id `qwen/qwen3.8-27b` (preview).

**Twilio sandbox**: from `whatsapp:+14155238886`; each test phone must send the join code first. Incoming voice note → `MediaUrl0`, `MediaContentType0`; location pin → `Latitude`, `Longitude`.

## 4. Conventions

- Keys only in `.env` (never in chat, git, logs, or the browser).
- Synthetic phone numbers: `+91 00000 0XXXX`. Every screen with data says "Demo data".
- Blood groups stored as `A+ A- B+ B- AB+ AB- O+ O-`; display with a true minus sign (O−).
- Distances in km, one decimal. Times in IST, 24-hour in data, spoken naturally.
- Python: type hints, Pydantic models at every boundary, parameterised SQL, `subprocess` without shell.
- Docs live in `docs/`; product context in `PRODUCT.md`; design system in `DESIGN.md` (written after build).

## 5. Resume here (10 Nov, submission day)

1. Start it: `docker compose up --build -d`; test the real mic in Chrome at http://localhost:8000.
2. Record the 60 s demo following [DEMO.md](DEMO.md) → post on LinkedIn/X (tags + hashtags) → submit before 11:59 PM IST.
3. (Later) Public hosting: `docker-compose.prod.yml` + `Caddyfile`, steps in the README.
4. (Later, optional) WhatsApp: set `WHATSAPP_ENABLED=true`, run a tunnel yourself, `python -m app.set_url <url>`, set the Twilio sandbox webhook.

## 6. Open questions

- [ ] Which GitHub repository to push to (nothing is pushed yet).
- [ ] A native speaker should read the screen text in each language (`web/voice-i18n.js`); it was not written by native speakers.
- [ ] Solo or team entry (affects award category)?

## 7. Build progress

| Step | State |
|---|---|
| Docs: PRODUCT, ARCHITECTURE, PRD, SECURITY, MEMORY | ✅ |
| Design direction + docs/DESIGN.md spec | ✅ |
| API keys tested (Gnani STT/TTS, Groq Qwen, Twilio set) | ✅ |
| Synthetic seed data + search + compatibility tests (58 tests) | ✅ |
| Voice pipeline (webm in → Hindi mp3 out, ~5.6 s) | ✅ |
| FastAPI `/ask` + security middleware | ✅ |
| Web UI (verified in browser: Hindi UI, search, map, voice reply) | ✅ |
| WhatsApp webhook (built; needs tunnel + sandbox to test live) | 🟡 |
| Donor registration + matching (P1, API-tested) | ✅ |
| Demo film rendered: `video/remotion/out/jeevan-dhara-demo.mp4` (60 s, 1080p; rebuild: `video/` README steps) | ✅ |
| Results-first latency + Call nearest + re-recorded film (76 tests) | ✅ |
| Docker image (non-root, read-only, keys from `.env` at run time) | ✅ |
| Higher request limits, cancel + 25 s timeout, screen text in 10 languages, Share with family, offline screen with 108/104, one shared connection to Gnani (89 tests) | ✅ |
| HTTPS hosting files (`docker-compose.prod.yml`, `Caddyfile`; compose files validated, not yet run on a server) | 🟡 |
| Real-phone test in a noisy room, 2–3 languages (owner: you) | ☐ |
| Post on LinkedIn/X, submit | ☐ |

## 8. Glossary

| Term | Meaning |
|---|---|
| Seeker | Person looking for blood (usually the patient's attendant) |
| Ring / radius ladder | The 5/10/15/20 km search steps |
| Compatible | A different blood group that can safely be given (red cells only) |
| PRBC / WB / PLT / FFP | Packed red cells / whole blood / platelets / fresh frozen plasma |
| eRaktKosh | Government of India's blood bank management portal |
| Prisma / Timbre | Gnani's speech-to-text / text-to-speech models |
| 108 / 104 | Ambulance / health helpline numbers in India |
