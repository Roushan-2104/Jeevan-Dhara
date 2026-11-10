"""Compose the film's ambient bed: slow sustained chords, no beat, no effects. Generated, not downloaded.

Run: .venv\\Scripts\\python video\\make_music.py   -> video/remotion/public/music/bed.mp3 (60 s)
"""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "remotion" / "public" / "music"
TMP = ROOT / "music_tmp"

# D major, one chord per 7.5 s, played twice: Dmaj7 -> Bm7 -> Gmaj7 -> Asus2.
CHORDS = {
    "Dmaj7": [146.83, 185.00, 220.00, 277.18],
    "Bm7": [123.47, 146.83, 185.00, 220.00],
    "Gmaj7": [98.00, 123.47, 146.83, 185.00],
    "Asus2": [110.00, 123.47, 164.81, 220.00],
}
ORDER = ["Dmaj7", "Bm7", "Gmaj7", "Asus2"] * 2
SEG = 7.5
XFADE = 2.0


def chord_expr(freqs: list[float], right: bool) -> str:
    # Each note: a soft sine, a slightly detuned twin (slow chorus) and a faint octave. Right channel detunes the other way.
    d = 1.0035 if right else 0.9965
    parts = [f"0.07*sin(2*PI*{f}*t)+0.045*sin(2*PI*{f * d:.3f}*t)+0.012*sin(2*PI*{2 * f:.3f}*t)" for f in freqs]
    return "+".join(parts)


def run(args: list[str]) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def main() -> None:
    TMP.mkdir(exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    seg_len = SEG + XFADE
    files = []
    for i, name in enumerate(ORDER):
        f = TMP / f"c{i}.wav"
        expr = f"{chord_expr(CHORDS[name], False)}|{chord_expr(CHORDS[name], True)}"
        run(["-f", "lavfi", "-i", f"aevalsrc='{expr}':s=44100:d={seg_len}",
             "-af", f"afade=t=in:d={XFADE},afade=t=out:st={seg_len - XFADE}:d={XFADE}", str(f)])
        files.append(f)
    # Chain with crossfades so chords breathe into each other.
    inputs, chain, last = [], "", "[0:a]"
    for f in files:
        inputs += ["-i", str(f)]
    for i in range(1, len(files)):
        out = f"[x{i}]"
        chain += f"{last}[{i}:a]acrossfade=d={XFADE}:c1=qsin:c2=qsin{out};"
        last = out
    master = TMP / "pad.wav"
    run([*inputs, "-filter_complex", chain.rstrip(";"), "-map", last, str(master)])
    # Warmth and space: roll off highs, add a soft room, slow fade at both ends, set a quiet bed loudness.
    run(["-i", str(master), "-af",
         "lowpass=f=1400,highpass=f=60,aecho=0.8:0.6:90|170:0.25|0.18,"
         "atrim=0:60,afade=t=in:d=3,afade=t=out:st=55:d=5,loudnorm=I=-24:TP=-3:LRA=6",
         "-ar", "44100", "-b:a", "192k", str(OUT / "bed.mp3")])
    for f in TMP.iterdir():
        f.unlink()
    TMP.rmdir()
    print("wrote", OUT / "bed.mp3")


if __name__ == "__main__":
    main()
