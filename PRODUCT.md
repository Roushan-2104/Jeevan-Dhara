# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain HTML/CSS/JS (no build step), served by a Python FastAPI backend. WhatsApp channel via Twilio WhatsApp Sandbox. Chosen by the user for low-end phones and an overnight deadline.

## Users

- **Primary: the patient's attendant.** A relative or attendant at or near a hospital who has been told to arrange blood, often within hours. Stressed, on a low-end Android phone with patchy data, may not read English, may prefer speaking to typing.
- **Secondary: voluntary donors.** People willing to donate who register their blood group and area so seekers can be connected to them when no blood bank nearby has stock.

## Product Purpose

Jeevan Dhara lets someone ask for blood by voice, in their own language, and get back, in the same language, the nearest blood banks that have that blood group in stock, plus willing donors nearby when banks fall short. Success: a seeker goes from "I need O negative near Jayanagar" to a callable list of real options in under a minute, without typing or reading English.

## Positioning

Voice in, voice out, in any of 10 Indian languages plus Hinglish, on the channel people already use (WhatsApp) as well as the web. The search widens in rings (5 → 10 → 15 → 20 km) around the user's GPS position and says honestly how far it had to go. Blood compatibility and safety rules are decided in code, never by the language model.

## Operating Context

- Used in hospital corridors, waiting areas and on the move: noisy audio, one hand, bright or harsh light, interruptions.
- Location comes from browser GPS, a WhatsApp location pin, or a spoken place name.
- Blood bank stock data mirrors the structure of India's eRaktKosh portal; for the challenge it is a **synthetic dataset**.
- Built for the Gnani "Great Indian AI Internship Challenge"; deadline 10 Nov 2026, 11:59 PM IST; judged partly on a 60-second demo video.

## Capabilities and Constraints

- Speech-to-text: Gnani Prisma v3.0 (`indic-auto`), max 30 s per clip.
- Text-to-speech: Gnani Timbre v2.5, reply in the detected language.
- Languages: Bengali, English, Gujarati, Hindi, Kannada, Malayalam, Marathi, Punjabi, Tamil, Telugu, plus Hinglish (code-mixed).
- Understanding: Groq-hosted Qwen (`qwen/qwen3.8-27b`, preview) with `openai/gpt-oss-20b` fallback; extraction only.
- Verification: WhatsApp sender identity, web phone OTP, Twilio signature check; donor contact is never exposed directly.
- **Must use synthetic data**: no real phone numbers, Aadhaar, PAN or recorded calls (challenge rule).
- Undecided: whether blood banks get a stock-update screen (roadmap).

## Brand Commitments

- Name: **Jeevan Dhara** ("stream of life").
- Voice: calm, direct, respectful; speaks like a helpful hospital volunteer, never like an ad.
- Visual stance (chosen 9 Nov 2026): **the category standard, executed impeccably**: a clean, conventional blood-finder app, not a themed or metaphor-driven world. Craft bar: Practo / Apollo 24|7, Google Maps, PhonePe / Google Pay, Swiggy / Zomato.

## Evidence on Hand

None real. All blood bank, stock and donor records are synthetic and must be labelled as demo data. No testimonials, partner blood banks, usage numbers or certifications exist; none may be claimed.

## Product Principles

1. **Speak first, read second.** Every answer arrives as voice in the user's language; the screen backs it up.
2. **Nearest real option, honestly.** Show distance, stock and how fresh the data is; never overstate availability.
3. **Safety in code.** Compatibility, emergency numbers and disclaimers are deterministic, not generated.
4. **Protect people.** Donor and seeker phone numbers and locations are minimised, masked and short-lived.
5. **Works on the worst phone in the ward.** Low data, low memory, one hand, noisy room.

## Accessibility & Inclusion

- Voice-first for users with low literacy or who cannot read the UI language.
- Every Indian script the speech models support must render correctly (Devanagari, Bengali, Gujarati, Gurmukhi, Kannada, Malayalam, Tamil, Telugu, Latin).
- Large touch targets, high contrast for harsh light, WCAG 2.2 AA minimum.
