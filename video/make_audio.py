"""Generate the film's narration and caller lines with Gnani Timbre v2.5.

Run from the project root:  .venv\\Scripts\\python video\\make_audio.py
Writes WAVs to video/remotion/public/audio and their durations to video/remotion/src/audio.json.
"""
import asyncio
import json
import subprocess
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.config import get_settings  # noqa: E402

OUT = ROOT / "video" / "remotion" / "public" / "audio"
META = ROOT / "video" / "remotion" / "src" / "audio.json"


async def tts(client: httpx.AsyncClient, text: str, lang: str, voice: str, speed: float = 1.0) -> bytes:
    s = get_settings()
    r = await client.post(f"{s.gnani_base_url}/api/v1/tts/inference", headers={"X-API-Key-ID": s.gnani_api_key}, json={
        "text": text, "voice": voice, "model": s.gnani_tts_model, "language": lang, "speed": speed,
        "audio_config": {"sample_rate": 44100, "num_channels": 1, "sample_width": 2, "encoding": "linear_pcm", "container": "wav"},
    })
    r.raise_for_status()
    return r.content


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return round(float(out.strip()), 3)


async def main() -> None:
    script = json.loads((ROOT / "video" / "script.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {}
    nar = script["narrator"]
    jobs = [(n["id"], n["text"], nar["language"], nar["voice"], 1.0) for n in script["narration"]]
    jobs += [(c["id"], c["text"], c["language"], c["voice"], 1.0) for c in script["callers"]]
    only = set(sys.argv[1:])
    if only:  # regenerate just these ids, keep the rest
        jobs = [j for j in jobs if j[0] in only]
        if META.exists():
            meta = json.loads(META.read_text(encoding="utf-8"))
    async with httpx.AsyncClient(timeout=60) as client:
        for jid, text, lang, voice, speed in jobs:
            wav = await tts(client, text, lang, voice, speed)
            raw = OUT / f"{jid}.raw.wav"
            raw.write_bytes(wav)
            final = OUT / f"{jid}.wav"
            # Trim leading/trailing silence so timing is exact; normalise loudness for speech.
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af",
                            "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                            "silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=7",
                            "-ar", "44100", "-ac", "1", str(final)], check=True)
            raw.unlink()
            meta[jid] = {"file": f"audio/{jid}.wav", "seconds": duration(final), "text": text}
            print(f"{jid}: {meta[jid]['seconds']}s")
    META.parent.mkdir(parents=True, exist_ok=True)
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
