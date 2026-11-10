"""Check that the API keys in .env work, without printing them.

Run:  .venv\\Scripts\\python -m app.check_keys
"""
import asyncio

from . import audio, gnani, llm
from .config import get_settings


async def main() -> None:
    s = get_settings()
    print(f"Gnani key set: {s.has_gnani} | Groq key set: {s.has_groq} | Twilio set: {s.has_twilio}")

    if s.has_groq:
        try:
            ex = await llm.extract("Mujhe O negative blood chahiye, do unit, Jayanagar Bangalore mein")
            print(f"[ok] Groq extraction -> group={ex.blood_group} units={ex.units} place={ex.location_text}")
            t = await llm.translate("O negative, 2 units, near Jayanagar. The nearest is 5.7 km away.", "kn-IN")
            print(f"[{'ok' if t else '!!'}] Groq translation (Kannada) -> {t}")
        except Exception as e:  # noqa: BLE001
            print(f"[!!] Groq failed: {type(e).__name__}: {e}")

    if s.has_gnani:
        try:
            wav = await gnani.synthesize("मुझे ओ नेगेटिव खून चाहिए, दो यूनिट, जयनगर में।", "hi-IN")
            print(f"[ok] Gnani TTS -> {len(wav)} bytes of audio")
            name = audio.save_reply_audio(wav, "mp3")
            print(f"[ok] ffmpeg mp3 conversion -> media/{name}")
            text, lang = await gnani.transcribe(audio.prepare_for_stt(wav))
            print(f"[ok] Gnani STT -> ({lang}) {text}")
        except Exception as e:  # noqa: BLE001
            print(f"[!!] Gnani failed: {type(e).__name__}: {e}")


if __name__ == "__main__":
    asyncio.run(main())
