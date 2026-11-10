"""Reply text built by code from facts. English, Hindi and Hinglish are hand-written;
other languages are translated from English by the LLM and number-checked (see llm.translate)."""
from __future__ import annotations

from datetime import datetime

from . import llm

GROUP_EN = {"A+": "A positive", "A-": "A negative", "B+": "B positive", "B-": "B negative",
            "AB+": "AB positive", "AB-": "AB negative", "O+": "O positive", "O-": "O negative"}
_HI_LETTER = {"A": "ए", "B": "बी", "AB": "एबी", "O": "ओ"}


def group_hi(g: str) -> str:
    return f"{_HI_LETTER[g[:-1]]} {'पॉज़िटिव' if g.endswith('+') else 'नेगेटिव'}"


def _time(iso: str) -> str:
    t = datetime.fromisoformat(iso)
    return t.strftime("%I:%M %p").lstrip("0")


def _units(n: int, lang: str) -> str:
    if lang == "hi-IN":
        return f"{n} यूनिट"
    return f"{n} unit" + ("" if n == 1 else "s") if lang == "en-IN" else f"{n} unit"


def build(kind: str, lang: str, f: dict) -> str:
    """kind: results | no_results | clarify_group | clarify_location | donor_hint"""
    L = lang if lang in ("hi-IN", "hi-en") else "en-IN"
    if kind == "clarify_group":
        return {"en-IN": "Which blood group do you need? For example, O positive or B negative.",
                "hi-IN": "आपको कौन सा ब्लड ग्रुप चाहिए? जैसे ओ पॉज़िटिव या बी नेगेटिव।",
                "hi-en": "Aapko kaun sa blood group chahiye? Jaise O positive ya B negative."}[L]
    if kind == "clarify_location":
        return {"en-IN": "Where do you need it? Please say the area or hospital and the city.",
                "hi-IN": "खून कहाँ चाहिए? इलाका या अस्पताल और शहर का नाम बताइए।",
                "hi-en": "Blood kahan chahiye? Area ya hospital aur city ka naam bataiye."}[L]
    if kind == "clarify_both":
        return {"en-IN": "Please tell me which blood group you need, and where. For example: O positive, two units, near Jayanagar, Bengaluru.",
                "hi-IN": "बताइए, कौन सा ब्लड ग्रुप चाहिए और कहाँ? जैसे: ओ पॉज़िटिव, दो यूनिट, जयनगर, बेंगलुरु के पास।",
                "hi-en": "Bataiye, kaun sa blood group chahiye aur kahan? Jaise: O positive, do unit, Jayanagar, Bengaluru ke paas."}[L]
    if kind == "clarify_letter":
        if f["sign"] == "-":
            return {"en-IN": "Which one: A negative, B negative, AB negative, or O negative?",
                    "hi-IN": "कौन सा: ए नेगेटिव, बी नेगेटिव, एबी नेगेटिव, या ओ नेगेटिव?",
                    "hi-en": "Kaun sa: A negative, B negative, AB negative, ya O negative?"}[L]
        return {"en-IN": "Which one: A positive, B positive, AB positive, or O positive?",
                "hi-IN": "कौन सा: ए पॉज़िटिव, बी पॉज़िटिव, एबी पॉज़िटिव, या ओ पॉज़िटिव?",
                "hi-en": "Kaun sa: A positive, B positive, AB positive, ya O positive?"}[L]
    if kind == "donor_hint":
        return {"en-IN": "Thank you for wanting to donate blood. Please tap Become a donor on the screen to register. It takes one minute.",
                "hi-IN": "रक्तदान करने की इच्छा के लिए धन्यवाद। रजिस्टर करने के लिए स्क्रीन पर डोनर बनें दबाइए। इसमें एक मिनट लगेगा।",
                "hi-en": "Blood donate karne ke liye shukriya. Register karne ke liye screen par Donor banein dabaiye. Ek minute lagega."}[L]

    g, units, place = f["group"], f["units"], f["place"]
    if place == "your location":
        place = {"en-IN": "you", "hi-IN": "आप", "hi-en": "aap"}[L]
    head = {"en-IN": f"{GROUP_EN[g]}, {_units(units, 'en-IN')}, near {place}.",
            "hi-IN": f"{group_hi(g)}, {_units(units, 'hi-IN')}, {place} के पास।",
            "hi-en": f"{GROUP_EN[g]} blood, {units} unit, {place} ke paas."}[L]
    safety = {"en-IN": "Call before you go. In an emergency, call 108.",
              "hi-IN": "जाने से पहले फ़ोन कर लें। इमरजेंसी में 108 पर कॉल करें।",
              "hi-en": "Jaane se pehle call kar lijiye. Emergency mein 108 par call kijiye."}[L]

    if kind == "no_results":
        r = f["max_km"]
        body = {"en-IN": f"I could not find this blood in stock within {r} km.",
                "hi-IN": f"{r} किलोमीटर के अंदर यह ब्लड स्टॉक में नहीं मिला।",
                "hi-en": f"{r} km ke andar yeh blood stock mein nahi mila."}[L]
        if f.get("donors"):
            body += {"en-IN": f" {f['donors']} willing donors are nearby. Tap Ask nearby donors, or reply DONORS.",
                     "hi-IN": f" पास में {f['donors']} डोनर मदद के लिए तैयार हैं। डोनर से पूछने के लिए DONORS लिखें।",
                     "hi-en": f" Paas mein {f['donors']} donor help ke liye ready hain. Donor se poochne ke liye DONORS likhiye."}[L]
        return f"{head} {body} {safety}"

    # results: the answer first, in one breath. Rings, the full list and timings are on screen.
    top = f["top"]
    name, d, u = top["name"], f"{top['distance_km']:.1f}", top["units"]
    if top["match"] == "compatible":
        tg = top["blood_group"]
        nearest = {"en-IN": f"Nearest: {name}, {d} km away, {u} units of {GROUP_EN[tg]}. "
                            f"That is a compatible group; the doctor must confirm.",
                   "hi-IN": f"सबसे पास {name}, {d} किलोमीटर, {group_hi(tg)} {u} यूनिट। यह चल सकता है, पर डॉक्टर से पक्का करें।",
                   "hi-en": f"Sabse paas {name}, {d} km, {GROUP_EN[tg]} {u} unit. Yeh compatible group hai, doctor se confirm kijiye."}[L]
    else:
        nearest = {"en-IN": f"{GROUP_EN[g]} found. Nearest: {name}, {d} km away, {u} units.",
                   "hi-IN": f"{group_hi(g)} मिल गया। सबसे पास {name}, {d} किलोमीटर, {u} यूनिट।",
                   "hi-en": f"{GROUP_EN[g]} mil gaya. Sabse paas {name}, {d} km, {u} unit."}[L]
    stale = ""
    if top["stale"]:
        stale = {"en-IN": " This stock was last updated more than a day ago.",
                 "hi-IN": " यह जानकारी एक दिन से पुरानी है।", "hi-en": " Yeh jaankari ek din se purani hai."}[L]
    sent = ""
    if f.get("channel") == "whatsapp":
        sent = {"en-IN": " I have sent the list with phone numbers as a message.",
                "hi-IN": " पूरी लिस्ट मैसेज में भेज दी है।",
                "hi-en": " Poori list message mein bhej di hai."}[L]
    return f"{nearest}{stale}{sent} {safety}"


_FIXED: dict[tuple, tuple[str, str]] = {}  # translated follow-up questions, reused word for word


async def localized(kind: str, lang: str, facts: dict) -> tuple[str, str]:
    """Return (text, text_language). Falls back to English when translation is unavailable or rejected."""
    if lang in ("en-IN", "hi-IN", "hi-en"):
        return build(kind, lang, facts), lang
    key = (kind, lang, facts.get("sign")) if kind.startswith("clarify") or kind == "donor_hint" else None
    if key in _FIXED:
        return _FIXED[key]
    english = build(kind, "en-IN", facts)
    translated = await llm.translate(english, lang)
    out = (translated, lang) if translated else (english, "en-IN")
    if key and translated:
        _FIXED[key] = out  # same words every time, so the voice cache hits too
    return out


def whatsapp_card(resp: dict) -> str:
    """Plain-text results card for WhatsApp (sent after the voice note)."""
    heard, search = resp["heard"], resp.get("search") or {}
    g = heard.get("blood_group") or "?"
    lines = [f"🩸 {g.replace('-', '−')} · {heard.get('units') or 1} unit(s) · near {heard.get('place') or '—'}"]
    found = search.get("found_within_km")
    if resp["status"] == "results":
        if search.get("empty_within_km"):
            lines.append(f"None within {search['empty_within_km']} km. {len(resp['results'])} blood banks within {found} km:")
        else:
            lines.append(f"{len(resp['results'])} blood banks within {found} km:")
        lines.append("")
        for h in resp["results"][:3]:
            lines.append(f"{h['rank']}) {h['name']}, {h['distance_km']} km")
            tag = "" if h["match"] == "exact" else " (compatible, doctor must confirm)"
            upd = "⚠ updated over a day ago, call first" if h["stale"] else f"updated {_time(h['updated_at'])}"
            lines.append(f"   {h['blood_group'].replace('-', '−')} {h['units']} units{tag} · {upd}")
            lines.append(f"   📞 {h['phone']}")
            lines.append("")
    else:
        lines.append(f"Nothing in stock within {search.get('max_km', 20)} km.")
        lines.append("Reply MORE to search up to 50 km.")
    if (resp.get("donors") or {}).get("count"):
        lines.append(f"{resp['donors']['count']} willing donors nearby. Reply DONORS to ask them.")
    lines.append("Please call before you go. Emergency: 108 · Helpline: 104")
    lines.append(f"Request {resp['request_id']} · Demo data")
    return "\n".join(lines)
