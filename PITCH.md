# Jeevan Dhara (जीवन धारा): say what blood you need, hear where to get it

**Roushan Sharma** · Great Indian AI Internship Challenge, Gnani.ai · Live: https://jeevan-dhara-itjf.onrender.com

## The problem

When someone you love needs blood at 2 AM, you are standing in a hospital corridor with a phone in a shaking hand. Today's blood finders ask you to pick a state, a district and a blood group from dropdowns, then solve a captcha, in English. The people who need blood most urgently are often the ones least able to fill that form: older relatives, people who read only their mother tongue, people who are simply too frightened to type.

**Nobody should lose minutes to a form while a parent waits for blood.**

## What I built

Jeevan Dhara is a blood finder you talk to. You tap once and say what you need, the way you would say it to a person:

> "Mere papa ko O positive blood chahiye, do unit, Indiranagar ke paas."

A few seconds later it tells you, aloud and on screen, the nearest blood banks that have it, with one big button to call the closest one.

## How it works

1. **Listen.** Gnani Prisma v3.0 turns the speech into text and detects the language by itself.
2. **Understand.** A language model pulls out four facts: blood group, units, component and place. If one is missing, the app asks a single follow-up question, by voice.
3. **Search.** Plain code, not a model, finds matching stock nearby. It looks within 5 km first, then 10, 15 and 20.
4. **Answer.** Gnani Timbre v2.5 reads the result aloud in the language you spoke, and the whole screen switches to that language.

Measured on the hosted build: speech to text in 366 ms, understanding in 299 ms, the full answer in about 2.5 seconds.

## What makes it dependable

- **11 Indian languages**, including Hinglish, with no language menu.
- **Built for panic:** cancel with one tap, share the result with family in one tap, and 108 and 104 stay on screen even with no internet.
- **Honest answers:** the facts in every reply are built by code and checked before they are spoken, so the voice does not invent a blood bank.
- **Tested and hosted:** 89 automated tests, Docker, live on Render.

## What is next

Demo data is synthetic. The next step is real stock data through a partnership with blood banks or eRaktKosh, then the WhatsApp voice-note channel that is already built and switched off.

Code and setup: [README](README.md)
