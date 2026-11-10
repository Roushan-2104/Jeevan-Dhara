# Jeevan Dhara — Product Requirements Document

| | |
|---|---|
| Product | Jeevan Dhara (जीवन धारा, "stream of life") |
| Version | v0.1 (challenge build) |
| Date | 9 Nov 2026 |
| Deadline | 10 Nov 2026, 11:59 PM IST (Gnani Great Indian AI Internship Challenge) |
| Related | [Architecture](ARCHITECTURE.md) · [Security](SECURITY.md) · [Design](DESIGN.md) · [Memory](MEMORY.md) |

---

## 1. Problem

When a patient needs blood, a doctor usually tells the family to "arrange it". An attendant, often a relative standing in a hospital corridor, then has to call blood banks one by one, ask on WhatsApp groups, or search a government portal that is form-heavy, in English, and hard to use on a cheap phone under stress. Many attendants are not comfortable typing or reading English. Time is lost exactly when it matters most.

## 2. Solution

A voice-first assistant, on the web and on WhatsApp. The attendant **speaks** what they need, in their own language ("Mujhe O negative chahiye, do unit, Jayanagar mein"). Jeevan Dhara:

1. understands the blood group, component, units and place;
2. finds the nearest blood banks with that group in stock, widening the search 5 → 10 → 15 → 20 km;
3. if banks fall short, reaches out to willing registered donors nearby without exposing their numbers;
4. **replies by voice in the same language**, plus a text card with names, distance, stock, and call/directions buttons.

## 3. Users

| User | Situation | Job to be done |
|---|---|---|
| **Seeker** (primary): patient's attendant | At or near a hospital, stressed, low-end Android, patchy data, may not read English | "Tell me where I can get this blood, fast, in my language." |
| **Donor** (secondary): voluntary donor | At home or work, willing to help people nearby | "Let me know when someone near me needs my blood group, without spamming me or exposing my number." |

Out of scope for v0.1: blood bank staff (stock updates), hospitals, admins.

## 4. Goals and success metrics

| Goal | Metric | Target (demo) |
|---|---|---|
| Fast answer | Time from end of voice note to reply audio | < 6 s (web), < 10 s (WhatsApp) |
| Understands people | Correct blood group + place extracted | ≥ 9 of 10 test clips across 5 languages |
| Right language | Reply in the language spoken | 10 of 10 test clips |
| Honest results | Results show distance, units and last-updated time | 100% |
| Safe | Compatibility errors | 0 (unit-tested table) |
| Challenge | 60-second demo video posted and submitted | Before 10 Nov, 11:59 PM IST |

## 5. Scope

### Must have (P0, tonight)

| ID | Requirement |
|---|---|
| F1 | Record a voice note on the web (hold to speak, max 30 s) and send it |
| F2 | ~~Receive voice notes on WhatsApp (Twilio sandbox)~~: built but switched off for the demo (needs a public tunnel and Twilio); moved to roadmap |
| F3 | Speech-to-text with automatic language detection (Gnani Prisma v3.0, 10 languages + Hinglish) |
| F4 | Extract blood group, component, units, place, urgency (Groq Qwen, strict schema) |
| F5 | Ask one follow-up question when blood group or location is missing |
| F6 | Location from browser GPS, WhatsApp location pin, or spoken place name |
| F7 | Radius ladder search 5 / 10 / 15 / 20 km with compatibility rules; say which ring found results |
| F8 | Results: top 3 banks with name, distance, units, last updated, call and directions |
| F9 | Voice reply in the detected language (Gnani Timbre v2.5) plus text card |
| F10 | Every spoken answer says "call before you go" and 108; 108 and 104 are always on screen |
| F11 | Synthetic dataset clearly labelled "Demo data" |
| F12 | Security baseline: keys in `.env`, Twilio signature check, rate limits, input limits (see [SECURITY.md](SECURITY.md)) |

### Should have (P1, if time allows)

| ID | Requirement |
|---|---|
| F13 | Web phone OTP login (WhatsApp users are already verified) |
| F14 | Donor registration by web form and by WhatsApp voice |
| F15 | Donor matching when banks fall short, with masked contact and double opt-in |
| F16 | Extended search 30 / 50 km after the user agrees |
| F17 | Map view of results (Leaflet + OpenStreetMap) |
| F18 | "My requests" history (24-hour retention) |
| F19 | Interface strings translated for the top 5 languages |

### Won't have (v0.1)

- Live eRaktKosh integration (roadmap; no public API)
- Blood bank staff dashboard, reservation or confirmation
- Hospital requisition-slip upload and verification
- Payments, ambulance booking, real phone numbers

## 6. User stories and acceptance criteria

**US1: Seeker asks by voice (web)**
*As an attendant, I hold the button and speak my need so I don't have to type.*
- Given GPS permission, when I say "B positive, 2 units" the app finds banks near my GPS position.
- Results appear on screen before or with the voice reply.
- The reply plays in the language I spoke.
- If I spoke for more than 30 s, I'm told to keep it short and try again.

**US2: Seeker asks on WhatsApp**
*As an attendant, I send a voice note to the Jeevan Dhara number.*
- I get back a voice note in my language and a text message with the top 3 banks.
- If I didn't say where I am, I'm asked to share a location pin or say my area.
- Sharing a location pin after that completes the search without repeating the blood group.

**US3: Search widens honestly**
- If nothing within 5 km, the system tries 10, 15, 20 km and tells me which ring it found results in.
- If nothing within 20 km, I'm offered donors nearby and a wider search, and I hear 108 / 104.

**US4: Compatible blood**
- If my exact group isn't available but a compatible one is, it's listed after exact matches and labelled "compatible, doctor must confirm".
- For platelets and plasma, only exact matches are shown.

**US5: Donor registers** (P1)
- I can say "I want to donate, I'm O positive, I live in Whitefield" and get registered after confirming my details.
- If my last donation was too recent, I'm told when I can donate again.

**US6: Donor is asked to help** (P1)
- I get a WhatsApp message with blood group, area and request ID, and reply *Yes* or *Not now*.
- My number is shared only if I say yes, and I never get more than 2 requests a day.
- Replying STOP removes me.

## 7. Conversation design

**Reply shape (spoken, ≤ 25 seconds)**
1. Confirmation: "O negative, 2 units, near Jayanagar."
2. Result: "None within 5 km. I found 3 blood banks within 10 km."
3. Top option: name, distance, units ("Sanjeevani Blood Centre, 2.4 km away, has 4 units.")
4. Next step: "I've sent the numbers as a message. Please call before you go."
5. Safety: "In an emergency, call 108."

**Rules**
- Numbers are spoken digit by digit; distances to one decimal place.
- Speak like a calm hospital volunteer: short sentences, no jargon, no exclamation marks.
- Never promise availability: "has 4 units as of 8:40 this morning".
- Follow-up questions ask for one thing at a time.

## 8. Demo script (60 seconds)

1. 0–8 s: the problem, one line on screen: "Arranging blood = 20 phone calls."
2. 8–25 s: WhatsApp voice note in Hinglish → voice reply + text card.
3. 25–40 s: web app, Kannada voice + GPS → radius rings widen to 10 km → results.
4. 40–50 s: noisy recording (hospital-corridor noise) still understood; Tamil reply.
5. 50–60 s: "Built on Gnani Prisma + Timbre" · 10 languages · synthetic demo data.

## 9. Dependencies and risks

| Risk | Impact | Mitigation |
|---|---|---|
| Gnani API key or credits not available | Blocks the demo | Get the key first; cache TTS of fixed prompts; rate-limit |
| Groq Qwen preview withdrawn | Extraction fails | Automatic fallback to `openai/gpt-oss-20b`; regex fallback |
| Twilio sandbox needs a join code per phone | Judges can't try it live | Show it in the video; web app as the open channel |
| Noisy audio misheard | Wrong blood group | Confirm the blood group back before searching when confidence is low |
| Medical safety | Harm | Compatibility in code, disclaimers, 108/104 always |
| Synthetic-data rule | Disqualification | Seeded fake data, fake number pattern, "Demo data" label |

## 10. Roadmap after the challenge

1. eRaktKosh live stock adapter (with permission from the portal team)
2. Blood bank staff: stock updates by voice, request confirmation and reservation
3. Requisition-slip verification for priority requests
4. Thalassemia patients' recurring-need reminders
5. Telephony (IVR) channel using Prisma streaming for feature-phone users
