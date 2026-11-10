# Jeevan Dhara — Design Document

Related: [PRD](PRD.md) · [Architecture](ARCHITECTURE.md) · [Security](SECURITY.md) · [Memory](MEMORY.md) · [Product context](../PRODUCT.md)

**Process:** the impeccable design skill. Product context lives in `PRODUCT.md`. The direction was chosen on the
decision page on 9 Nov 2026, and the direction contract is in `.impeccable/surfaces/web-index-html.md`.
This document is the **design specification to build from**. Once the UI exists, the token-bearing system file
(root `DESIGN.md` + `.impeccable/design.json`) is generated from the built screens, as the skill requires.

---

## 1. Direction

**The category standard, executed impeccably.** Two rounds of themed directions were offered:
inland letter, blood-bag label, metro map, railway board, airport wayfinding. The user chose the clean,
conventional blood-finder app instead. So conventions are the commitment: no metaphor, no theme, no quirks.
The ambition is in the craft.

**Quality bar:** Practo / Apollo 24|7 (calm, trustworthy health UI) · Google Maps (map plus ranked nearby list) ·
PhonePe / Google Pay (cheap phones, many languages, big obvious actions) · Swiggy / Zomato (location-aware cards, fast scanning).

**Chosen sketch:** `.impeccable/mocks/decision/canon.html`. It sets the arrangement: red header → search card with Speak → map → ranked list.

### Design principles

1. **One obvious next action per screen.** On Find blood it is *Speak*; on results it is *Call*.
2. **What we heard, then what we found.** Always echo the understood request before the answers.
3. **Honest numbers.** Distance, units and "updated" time are on every result, in tabular numerals.
4. **Calm under stress.** No animation for show, no alarm colours unless something is actually wrong.
5. **Every script looks native.** Hindi, Tamil or Kannada text is never an afterthought set in a Latin font.

---

## 2. Foundations

### Colour

| Token | Value | Use | Contrast on white |
|---|---|---|---|
| `--bg` | `#F5F7FA` | App background | — |
| `--surface` | `#FFFFFF` | Cards, sheets, header text | — |
| `--ink` | `#1F2933` | Primary text | 14.5:1 |
| `--muted` | `#6B7785` | Secondary text, captions | 4.6:1 |
| `--line` | `#E4E7EB` | Hairlines, field borders | — |
| `--brand` | `#D32F2F` | Header, primary buttons, Call, map pins | 5.0:1 (white text on it 5.0:1) |
| `--brand-press` | `#B71C1C` | Pressed state of brand | — |
| `--brand-tint` | `#FDECEC` | Recording glow, selected chip | — |
| `--you` | `#1976D2` | "You are here" dot and accuracy circle only | 4.6:1 |
| `--stale` | `#8A5300` | "Updated yesterday" text + icon | 6.3:1 |
| `--stale-tint` | `#FFF4E0` | Stale badge background | — |
| `--ok` | `#1B7F3B` | "Donor agreed", success toasts | 5.2:1 |
| `--focus` | `#1976D2` | 3 px focus ring | — |

Rules: red is for **action and brand**, not for "no stock" (no stock = muted grey text). Errors use the red with an icon **and** a text label, never colour alone.
Dark mode: out of scope for v0.1. The app is used in bright corridors and daylight.

### Typography

Noto Sans covers every script the voice models support. Load only what the current language needs, using `unicode-range` subsets:

| Script | Languages | Face |
|---|---|---|
| Latin | English, Hinglish | Noto Sans |
| Devanagari | Hindi, Marathi | Noto Sans Devanagari |
| Bengali | Bengali | Noto Sans Bengali |
| Gujarati | Gujarati | Noto Sans Gujarati |
| Gurmukhi | Punjabi | Noto Sans Gurmukhi |
| Kannada | Kannada | Noto Sans Kannada |
| Malayalam | Malayalam | Noto Sans Malayalam |
| Tamil | Tamil | Noto Sans Tamil |
| Telugu | Telugu | Noto Sans Telugu |

Stack: `font-family: "Noto Sans", "Noto Sans <Script>", system-ui, sans-serif;`. Android already ships Noto for Indic scripts, so the system fallback is safe on slow networks.

| Style | Size / line height | Weight | Use |
|---|---|---|---|
| Title | 20 / 28 | 700 | Screen titles, header name |
| Heading | 17 / 24 | 700 | Card titles, "3 banks have O−" |
| Body | 16 / 24 | 400 | Default text (never below 16 for main content) |
| Body strong | 16 / 24 | 600 | Units in stock, values |
| Caption | 13 / 18 | 400 | Updated time, labels |
| Numeral | 20 / 24 | 700 | Distance on cards (`font-variant-numeric: tabular-nums`) |
| Group | 22 / 24 | 800 | Blood group chip (O−, AB+) |

Indic rules: line height **+0.1** for Indic scripts (matras and conjuncts need room); never uppercase or letter-space non-Latin text; never truncate mid-conjunct (truncate whole words with `text-overflow` on the container only).
Blood groups always use the true minus sign `−` (U+2212) and stay Latin in every language.

### Spacing, shape, elevation

- Spacing scale (4 px base): 4 · 8 · 12 · 16 · 24 · 32. Screen padding 12 px; card padding 12–16 px.
- Radii: 10 px cards and map; 8 px fields and buttons; 999 px chips.
- Elevation: one level only, `0 1px 3px rgba(16,24,40,.08)`; sheets add `0 -4px 16px rgba(16,24,40,.12)`.
- Touch targets ≥ 48 × 48 px; the Speak button is 64 px tall, full width.

### Motion

- 150 ms ease-out for presses and state changes; 250 ms for sheets.
- Only two "meaningful" animations: the **recording level ring** (mic loudness) and the **search ring expanding** on the map (5 → 10 km).
- `prefers-reduced-motion`: both become static states.

### Iconography

Material Symbols Rounded (outlined, 24 px) as an inline SVG sprite of about 15 icons: mic, call, directions, location, language, schedule, warning, check, close, person (donor), history, volunteer_activism, expand_more, my_location, stop.

---

## 3. App structure

```
Header: Jeevan Dhara  [हिन्दी ▾]
Tabs:   Find blood | Donate | My requests      (top tabs on web; bottom bar ≤ 480 px)
Footer bar (always): Demo data · Emergency 108 · Helpline 104
```

Language picker: bottom sheet listing each language **in its own script** (हिन्दी, ಕನ್ನಡ, தமிழ், తెలుగు, മലയാളം, मराठी, বাংলা, ગુજરાતી, ਪੰਜਾਬੀ, English, Hinglish). It changes the UI strings; the voice reply always follows the language spoken.

---

## 4. Screens and states

### 4.1 Find blood (home)

```
┌──────────────────────────────┐
│ Jeevan Dhara        हिन्दी ▾ │ red header
├──────────────────────────────┤
│ ┌ Search card ─────────────┐ │
│ │ Blood group   Units      │ │ select · stepper
│ │ [ O− ▾ ]      [ − 2 + ]  │ │
│ │ Location                 │ │
│ │ [◎ Jayanagar, Bengaluru] │ │ GPS chip, editable
│ │ [ 🎙  Hold to speak    ] │ │ full-width red, 64 px
│ │   or  Search  →          │ │ text button
│ └──────────────────────────┘ │
│ ┌ Map 190 px ──────────────┐ │
│ │  ◯ 10 km ring, pins, ●you│ │
│ └──────────────────────────┘ │
│ None within 5 km · 3 within 10│ ring status line
│ ┌ Bank card ───────────────┐ │
│ │ Sanjeevani Blood Centre  │ │
│ │ O− 4 units · 08:40  2.4km│ │
│ │ [ Call ]  [ Directions ] │ │
│ └──────────────────────────┘ │
│ Demo data · 108 · 104        │
└──────────────────────────────┘
```

Voice and form fill the **same** search: speaking fills the fields (shown as "What we heard"); the fields can be corrected and re-searched without speaking again.

| State | What the user sees |
|---|---|
| Idle, first visit | Search card with empty group, GPS permission prompt explained first: "To find the nearest blood bank, allow location." |
| Recording | Speak button turns into a pressed red bar with a live level ring and a timer "0:07 / 0:30"; slide left or tap ✕ to cancel |
| Processing | Button shows "Listening… → Understanding… → Searching…" (three real pipeline steps); skeleton cards below |
| Heard | A "What we heard" chip row fills the fields: **O−** · 2 units · Jayanagar. A low-confidence field is outlined amber: "Did you say O negative?" [Yes] [Change] |
| Clarify | One question card: "Which blood group?", with the 8 groups as big chips, plus the spoken question playing |
| Results | Ring status line + up to 3 bank cards; reply audio player pinned above the list (auto-plays after the user's hold gesture) |
| Compatible only | Section header "Compatible groups, doctor must confirm" with cards after the exact matches |
| Stale data | Amber badge "Updated yesterday, call first" on the card |
| Nothing within 20 km | Empty state: "No O− in stock within 20 km." Actions: [Search up to 50 km] [Ask nearby donors]. 108 / 104 shown large |
| Error (mic denied) | Inline banner: "Microphone is off. Allow it in settings, or type your request." Form stays usable |
| Error (network) | "No connection. Your request is saved and will send when you're back online." |
| Rate limited | "You've made many requests. Please wait 10 minutes, or call 104." |

### 4.2 Bank card

```
Sanjeevani Blood Centre                     2.4 km
O− · 4 units   ·   updated 08:40 today
Govt · Open 24 h · Jayanagar 9th Block
[ 📞 Call ]   [ ➜ Directions ]
```

- Fixed field order on every card: name, distance (right, tabular) → group + units → updated time → type/hours/area → actions.
- Call = `tel:` link (synthetic number). Directions = OpenStreetMap / Google Maps URL with the bank's coordinates.
- Tapping the card highlights its pin on the map, and tapping a pin scrolls to its card.

### 4.3 Map

- Leaflet + OpenStreetMap tiles (with attribution), lazy-loaded after first results so the home screen stays light.
- "You" = blue dot + accuracy circle. Banks = red pins numbered 1–3. Donors (aggregate only) = purple count bubble, never exact homes.
- Search rings drawn as thin dashed circles at 5 / 10 / 15 / 20 km; the ring where results were found is solid. The ring animates outward once when the search widens.

### 4.4 Donate

| Step | Content |
|---|---|
| 1 Intro | "Help someone near you. We only share your number if you agree, every time." [Register by voice] [Fill the form] |
| 2 Details | Blood group (chips), area (GPS or type), languages, last donation date (optional), age range and weight ≥ 45 kg confirmations |
| 3 Verify | Phone + OTP (or done if arriving from WhatsApp) |
| 4 Done | Status card: "Available · you'll get at most 2 requests a day" with an Availability switch, and "Not eligible until 12 Jan" when resting |

Donor request (WhatsApp and web notification): "Someone near Jayanagar (3 km) needs **O−**. Can you help today? [Yes, I can help] [Not now]".

### 4.5 My requests

List of the last 24 h: request ID, group, place, ring found, status (Searching / Results ready / Donor agreed / Closed), with "Search again". Empty state: "Your requests appear here for 24 hours."

### 4.6 Sign in (OTP)

Two fields, one at a time: phone (with +91 fixed), then a 6-box code with auto-advance and paste support; "Resend in 0:30"; error after 3 wrong tries: "Too many attempts. Try again in 15 minutes."

---

## 5. Voice interaction design

- **Hold to speak** is the default (WhatsApp habit); **tap to start / tap to stop** is available for users who can't hold (accessibility).
- Haptic tick on start and stop (`navigator.vibrate(20)` where supported).
- Max 30 s, shown as a timer; at 25 s the ring turns amber.
- The reply plays automatically after the user's gesture. A mini player (play/pause, 1× / 0.8× speed, replay) stays above results.
- The transcript is shown under "What we heard" in the user's script, so they can catch a mishearing.

## 6. WhatsApp message design

Voice note first, then one text message:

```
🩸 O− · 2 units · near Jayanagar
None within 5 km. 3 blood banks within 10 km:

1) Sanjeevani Blood Centre, 2.4 km
   O− 4 units · updated 08:40
   📞 +91 00000 01042

2) Kaveri Charitable Blood Bank, 3.9 km
   O− 2 units · updated 09:15
   📞 +91 00000 01077

3) Basavanagudi Community Blood Bank, 6.2 km
   O− 2 units · ⚠ updated yesterday, call first
   📞 +91 00000 01103

Please call before you go. Emergency: 108 · Helpline: 104
Reply DONORS to ask nearby donors · Demo data
```

The text message is in the user's language; numbers, groups and distances stay in Western digits for clarity.

## 7. Content and tone

- Short sentences; one instruction at a time; no exclamation marks; no medical jargon ("blood bank", not "BCTV").
- Say what happened, then what to do: "No O− within 5 km. We searched up to 10 km and found 3."
- Never guarantee: "had 4 units at 08:40".
- UI strings live in `web/i18n/<lang>.json`; English and Hindi are complete for v0.1, others fall back to English UI with voice in the native language.

## 8. Accessibility

- WCAG 2.2 AA: the contrast pairs above, 3 px focus ring, all controls keyboard-reachable.
- Every icon button has a text label (visible on cards, `aria-label` in the header).
- Live region (`aria-live="polite"`) announces "Listening", "Searching", "3 results".
- `lang` attribute set per string block so screen readers switch voice for Indic text.
- Works at 200% zoom and at 320 px width; no horizontal scroll.

## 9. Performance budget (low-end Android, 3G)

| Item | Budget |
|---|---|
| HTML + CSS + JS (first load, gzip) | ≤ 60 KB |
| Fonts on first load | Latin + current script subset only, ≤ 80 KB, `font-display: swap` |
| Map (Leaflet) | Lazy, ≈ 45 KB gz, only after results |
| Time to interactive (Moto E-class phone, 3G) | ≤ 3 s |
| Recording format | Opus in WebM at 24 kbps (≈ 90 KB for 30 s) |

## 10. Build checklist (design)

- [ ] Tokens as CSS custom properties exactly as in §2
- [ ] Find blood: all 12 states in §4.1
- [ ] Bank card fixed field order and map ↔ card linking
- [ ] Language sheet in native scripts; Hindi + English strings complete
- [ ] Reduced motion, focus ring, live regions
- [ ] Run the impeccable detector on `web/` after build, then the finish review
- [ ] Generate root `DESIGN.md` + `.impeccable/design.json` from the built UI
