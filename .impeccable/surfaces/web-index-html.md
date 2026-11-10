---
version: 1
slug: "web-index-html"
primary_target: "web/index.html"
related_targets: []
---

# Surface: Jeevan Dhara web app (Find blood · Donate · My requests)

Mode: Operate. Audience: patient attendants (primary) and voluntary donors, on low-end Android, in 10 Indian languages plus Hinglish. Task: speak a blood need, see the nearest banks with stock, call. Constraints: plain HTML/CSS/JS, synthetic data labelled "Demo data", 108/104 always visible.

## Direction contract

THESIS: The category standard for a blood finder, built at the craft of Practo, Google Maps, PhonePe and Swiggy. It refuses metaphor and theme: the screen is a search, a map and a ranked list, and the voice button is the fastest way to fill the search.

OWN-WORLD: White ground, cool ink #1F2933, muted #6B7785, hairline #E4E7EB. Blood red #D32F2F owns the header and primary actions only; blue #1976D2 marks "you are here"; amber marks stale stock. Noto Sans per script, tabular numerals. Soft 10 px cards, light elevation.

STORY: The attendant sees what was heard (group, units, place), sees how far the search had to go, sees the nearest banks with stock and freshness, and calls one.

FIRST VIEWPORT: Red header (name, language). Search card: group, units, location fields, full-width red "Speak or search". Map ≈190 px with pins. Ranked list: name, distance, units, Call.

FORM: Canon (the standing exit, chosen over two dealt hands). seed:83afc1e55f5493e6

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Ring-ladder visual (5/10/15/20 km) inside the canon: proposed as map circles plus a one-line status above the list.
