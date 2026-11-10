# Jeevan Dhara: FastAPI + ffmpeg in one small image.
FROM python:3.12-slim

# ffmpeg/ffprobe convert browser audio (WebM/Opus) to WAV for speech-to-text and WAV to MP3 for replies.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY web ./web

# Run as an unprivileged user. data/ (database + voice cache) is a volume; media/ and tmp/ are short-lived.
RUN useradd --create-home --uid 10001 jeevan \
    && mkdir -p data media tmp \
    && chown -R jeevan:jeevan /srv
USER jeevan

EXPOSE 8000
VOLUME ["/srv/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

# One worker on purpose: the rate limiter and the pending-voice table live in process memory.
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
