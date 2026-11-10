"""Collect everything the film shows from the real recordings into one JSON file.

Run: .venv\\Scripts\\python video\\prep_data.py
"""
import array
import json
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PUB = ROOT / "remotion" / "public"
OUT = ROOT / "remotion" / "src" / "film.json"


def peaks(path: Path, bins: int = 140) -> list[float]:
    with wave.open(str(path)) as w:
        data = array.array("h", w.readframes(w.getnframes()))
    step = max(1, len(data) // bins)
    vals = [max(abs(x) for x in data[i:i + step]) for i in range(0, step * bins, step)]
    top = max(vals) or 1
    return [round(v / top, 3) for v in vals]


def scene(name: str) -> dict:
    s = json.loads((PUB / "rec" / name / "session.json").read_text(encoding="utf-8"))
    marks = {}
    for m in s["marks"]:
        key = m["kind"] + (f":{m['data']}" if m["kind"].startswith("caller") else "")
        marks.setdefault(key, []).append(m["t"])
    turns = []
    for a in s["asks"]:
        b = a["body"]
        turns.append({
            "t": a["t"], "status": b["status"], "heard": b["heard"], "timings": b.get("timings"),
            "search": b.get("search"), "reply_text": b["reply"]["text"], "reply_lang": b["reply"]["language"],
            "reply_audio": "rec/" + name + "/" + b["reply"]["audio_url"].split("/")[-1] if b["reply"]["audio_url"] else None,
            "results": [{k: r[k] for k in ("rank", "name", "distance_km", "lat", "lng", "units", "blood_group",
                                            "match", "stale", "area")} for r in b.get("results", [])],
        })
    return {"duration": s["duration"], "marks": marks, "turns": turns, "video": f"rec/{name}/screen.mp4"}


def main() -> None:
    audio = json.loads((ROOT / "remotion" / "src" / "audio.json").read_text(encoding="utf-8"))
    film = {
        "audio": audio,
        "waves": {k: peaks(PUB / "audio" / f"{k}.wav") for k in ("hi_1", "hi_2", "kn_1", "ta_1")},
        "scenes": {n: scene(n) for n in ("hindi", "kannada", "tamil")},
    }
    OUT.write_text(json.dumps(film, ensure_ascii=False, indent=1), encoding="utf-8")
    h = film["scenes"]["hindi"]
    print("hindi marks:", {k: v for k, v in h["marks"].items()})
    print("hindi turns:", [(t["status"], t["timings"]) for t in h["turns"]])


if __name__ == "__main__":
    main()
