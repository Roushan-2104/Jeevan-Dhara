# Jeevan Dhara — 60-second demo plan

Everything here is free: the app runs on your laptop (http://localhost:8000), and you record with tools
already on Windows. No WhatsApp, Twilio or tunnel needed.

## Before you record (5 minutes)

1. Start the server: `.venv\Scripts\python -m uvicorn app.main:app --port 8000`
   (it re-seeds demo data on start, so stock times look fresh).
2. Open **Chrome** at http://localhost:8000. Allow the microphone and location when asked.
3. Do one practice run of each line below. Tap **New** (top right) between scenes.
4. Quiet room, phone on silent, close other tabs. Zoom the browser to 110–125% so text reads on video,
   or use Chrome DevTools device mode (iPhone/Pixel) for a phone-shaped frame.
5. Turn your volume up: the bot's spoken replies must be audible in the recording.

## Free recording options

- **Xbox Game Bar** (built in): `Win + Alt + R` starts/stops recording the Chrome window with audio.
  Turn on "Record mic" in Game Bar → Capture settings so your voice is included.
- **Clipchamp** (built into Windows 11, free): trim, add the title/end cards and captions.
- **OBS Studio** (free) if Game Bar won't capture system audio + mic together.

## Shot list (≈60 s)

| Time | On screen | You say | Shows |
|---|---|---|---|
| 0–5 s | Title card: "Need blood fast? Just say it." | — | the problem |
| 5–22 s | Tap mic once | **“मुझे खून चाहिए, जल्दी।”** → bot asks group + place by voice and **listens again on its own** → **“ओ नेगेटिव, दो यूनिट, जयनगर बेंगलुरु।”** | auto-detected Hindi, hands-free follow-up, rings widen 5 → 10 km, stale-data warning |
| 22–33 s | Tap **New**, tap mic | **“ನನಗೆ ಬಿ ಪಾಸಿಟಿವ್ ರಕ್ತ ಬೇಕು, ಕೋರಮಂಗಲ ಬೆಂಗಳೂರು.”** | Kannada in, Kannada voice out, UI never asked for a language |
| 33–45 s | Tap **New**, tap mic | **“Bhai urgent hai, AB positive chahiye, teen unit, Andheri Mumbai mein.”** | code-mixed Hinglish, different city |
| 45–53 s | Tap **New**, tap mic | **“Negative chahiye, Jayanagar mein.”** → bot asks “A, B, AB या O negative?” | safety: it never guesses a blood group |
| 53–60 s | End card | — | "Built on Gnani Prisma v3.0 (speech-to-text) + Timbre v2.5 (text-to-speech) · 10 Indian languages + Hinglish · demo data is synthetic" |

Measured on 9 Nov (results-first build): results appear about 2.5–5.5 s after the caller stops talking
(1.3 s of that is end-of-speech detection; Gnani STT varied 0.5–4.5 s), and the voice starts about 2 s after the
results. If you cut waiting time in the edit, keep the "⏩ processing time trimmed" label so the demo stays honest.

If time allows, swap the Kannada scene for Tamil (**“எனக்கு ஏ பாசிட்டிவ் ரத்தம் வேண்டும், டி நகர் சென்னை.”**)
or Telugu (**“నాకు ఓ పాజిటివ్ రక్తం కావాలి, బంజారా హిల్స్ హైదరాబాద్.”**). All four were tested end to end.

## Post text (LinkedIn / X) — edit to your voice

> When a doctor says "arrange blood", families spend hours calling blood banks one by one.
>
> I built **Jeevan Dhara (जीवन धारा)**: you just *say* what you need, in your own language, and it tells you,
> by voice, the nearest blood banks that have it. No forms, no typing, no language menu.
>
> 🎙️ Speech-to-text: @Gnani AI **Prisma v3.0** (auto language detection, Hinglish too)
> 🔊 Replies: Gnani **Timbre v2.5** voices in 10 Indian languages
> 📍 Searches 5 → 10 → 15 → 20 km and says honestly how far it had to go
> 🩸 Blood compatibility and safety rules are in code; it never guesses a blood group
>
> Demo uses synthetic data. Built for the Great Indian AI Internship Challenge.
>
> #GreatIndianAIInternshipChallenge #GnaniAI

On LinkedIn, type `@Gnani` and pick the company from the list so the tag is real.
Post on both LinkedIn and X if you can; engagement on the nominated posts counts for shortlisting.

## Submission form answers (draft)

- **Project title:** Jeevan Dhara — voice-first blood finder for India
- **Problem:** Families of patients waste critical hours finding blood; existing portals are form-heavy, English-first, and hard to use on cheap phones under stress.
- **Intended users:** patients' attendants (primary); voluntary blood donors (secondary).
- **Gnani models/APIs used:** Prisma v3.0 speech-to-text (REST, `indic-auto` language detection); Timbre v2.5 text-to-speech (REST, per-language voices incl. Hinglish).
- **Other tech:** FastAPI, SQLite (synthetic eRaktKosh-style data), Groq-hosted Qwen for structured extraction and translation (numbers validated), plain HTML/CSS/JS.
- **Contribution:** (yours: design, build, testing, demo)
