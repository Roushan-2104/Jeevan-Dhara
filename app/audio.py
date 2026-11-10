"""ffmpeg helpers. Always argument lists (no shell), server-generated paths, hard timeouts."""
from __future__ import annotations

import json
import shutil
import subprocess
import uuid
from pathlib import Path

from .config import get_settings


class AudioError(Exception):
    pass


FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"


def sniff(data: bytes) -> str | None:
    """Return a container name from magic bytes, or None if it is not audio we accept."""
    head = data[:16]
    if head.startswith(b"\x1aE\xdf\xa3"):
        return "webm"
    if head.startswith(b"OggS"):
        return "ogg"
    if head.startswith(b"RIFF") and data[8:12] == b"WAVE":
        return "wav"
    if head.startswith(b"ID3") or (len(head) > 1 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0):
        return "mp3_or_aac"
    if head.startswith(b"fLaC"):
        return "flac"
    if data[4:8] == b"ftyp":
        return "m4a"
    if head.startswith(b"#!AMR"):
        return "amr"
    return None


def _run(args: list[str], timeout: float = 15) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(args, capture_output=True, timeout=timeout, check=True)  # noqa: S603
    except subprocess.TimeoutExpired as e:
        raise AudioError("audio processing timed out") from e
    except subprocess.CalledProcessError as e:
        raise AudioError("could not read this audio") from e


def tmp_path(ext: str) -> Path:
    return get_settings().tmp_dir / f"{uuid.uuid4().hex}.{ext}"


def duration_seconds(path: Path) -> float:
    out = _run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)], timeout=10)
    try:
        return float(json.loads(out.stdout)["format"]["duration"])
    except (KeyError, ValueError, json.JSONDecodeError):
        # WebM from MediaRecorder often lacks a duration header; decode to measure.
        wav = tmp_path("wav")
        try:
            _run([FFMPEG, "-v", "error", "-y", "-i", str(path), "-ac", "1", "-ar", "16000", str(wav)])
            return (wav.stat().st_size - 44) / 32000.0
        finally:
            wav.unlink(missing_ok=True)


def prepare_for_stt(raw: bytes) -> bytes:
    """Validate and convert any accepted input to 16 kHz mono WAV, max 30 s."""
    s = get_settings()
    if len(raw) > s.max_upload_bytes:
        raise AudioError("The voice note is too large. Please keep it under 30 seconds.")
    kind = sniff(raw)
    if kind is None:
        raise AudioError("This file is not a supported audio format.")
    src, dst = tmp_path("bin"), tmp_path("wav")
    try:
        src.write_bytes(raw)
        if duration_seconds(src) > s.max_audio_seconds + 0.5:
            raise AudioError("Please keep your voice note under 30 seconds.")
        _run([FFMPEG, "-v", "error", "-y", "-i", str(src), "-t", str(int(s.max_audio_seconds)),
              "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", str(dst)])
        return dst.read_bytes()
    finally:
        src.unlink(missing_ok=True)
        dst.unlink(missing_ok=True)


def new_media_name(fmt: str) -> str:
    return f"{uuid.uuid4().hex}.{fmt}"


def save_reply_audio(wav: bytes, fmt: str, name: str | None = None) -> str:
    """Convert TTS WAV to mp3 (web) or ogg/opus (WhatsApp) under an unguessable name. Returns filename."""
    s = get_settings()
    src = tmp_path("wav")
    name = name or new_media_name(fmt)
    dst = s.media_dir / name
    codec = ["-c:a", "libmp3lame", "-b:a", "64k"] if fmt == "mp3" else ["-c:a", "libopus", "-b:a", "32k", "-ac", "1"]
    try:
        src.write_bytes(wav)
        _run([FFMPEG, "-v", "error", "-y", "-i", str(src), *codec, str(dst)])
    finally:
        src.unlink(missing_ok=True)
    return name
