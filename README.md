# Jeevan Dhara (जीवन धारा)

Ask for blood by voice, in your own language, and hear back the nearest blood banks that have it.
Works in the browser as a tap-and-talk voice bot (a WhatsApp channel is built in, off by default). Built on **Gnani Prisma v3.0** (speech-to-text) and **Gnani Timbre v2.5**
(text-to-speech), with Groq-hosted Qwen for understanding. All data is synthetic demo data.

Docs: [Architecture](docs/ARCHITECTURE.md) · [PRD](docs/PRD.md) · [Security](docs/SECURITY.md) ·
[Design](docs/DESIGN.md) · [Project memory](docs/MEMORY.md)

## Run it with Docker (any OS)

Needs only Docker. ffmpeg and Python are inside the image.

```bash
cp .env.example .env        # then add GNANI_API_KEY and GROQ_API_KEY (keys stay in .env only)
docker compose up --build -d
```

Open http://localhost:8000. Stop it with `docker compose down`. Useful checks:

```bash
docker compose ps                                              # shows "healthy" when ready
docker compose exec jeevan-dhara python -m app.check_keys      # checks keys without printing them
docker compose logs -f jeevan-dhara
```

The keys are read from `.env` when the container starts; they are never copied into the image
(`.dockerignore` blocks it). The container runs as a non-root user on a read-only filesystem; only
`/srv/data` (database and voice cache, a named volume) is kept between restarts. The port is bound to
`127.0.0.1`, so the app is reachable from this machine only. Browsers allow the microphone on
`http://localhost`; on any other address you need HTTPS in front of it.

## Run it without Docker (Windows)

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
# .env: copy .env.example, then add GNANI_API_KEY and GROQ_API_KEY (keys stay in .env only)
.venv\Scripts\python -m app.check_keys        # checks keys without printing them
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

Open http://127.0.0.1:8000, tap the mic and speak, e.g. "O negative, do unit, Jayanagar mein".
Without keys the app still runs (typed requests work; voice is disabled). Requires `ffmpeg` on PATH.
Donor registration and request history are at `/app.html`.

## WhatsApp (optional, off by default)

The WhatsApp channel is built but disabled (`WHATSAPP_ENABLED=false`) so the demo needs nothing paid or public.
To turn it on: set `WHATSAPP_ENABLED=true` and the Twilio keys in `.env`, then:

1. Twilio console → Messaging → Try it out → WhatsApp sandbox. Join from your phone with the code shown.
2. Start a tunnel: `cloudflared tunnel --url http://127.0.0.1:8000` and put the https URL in `.env` as `PUBLIC_BASE_URL`.
3. Sandbox settings → "When a message comes in": `<PUBLIC_BASE_URL>/webhooks/twilio` (POST). Restart the server.
4. Send a voice note: "O negative chahiye, do unit, Jayanagar mein." Commands: `MORE` (search 30/50 km), `DONORS`,
   `YES JD-XXXX` / `NO` (donor replies), `STOP`, `DELETE`.

## Tests

```powershell
.venv\Scripts\python -m pytest -q
```

## Demo scenario

The synthetic data has no O− within 5 km of Jayanagar, Bengaluru, and three banks with O− within 10 km
(one with stale stock), so the widening search is visible. Phone numbers start with `+91 00000`
and cannot reach anyone.
