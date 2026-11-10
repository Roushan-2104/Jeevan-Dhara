"""Synthetic demo data, shaped like eRaktKosh records.

Every bank, number and donor here is invented. Phone numbers start with +91 00000,
which no Indian mobile or landline number can, so none of them can reach a real person.
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from . import db

IST = timezone(timedelta(hours=5, minutes=30))
GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
COMPONENTS = ["whole_blood", "prbc", "platelets", "plasma"]

# (name, alt names, city, state, lat, lng)
PLACES: list[tuple[str, str, str, str, float, float]] = [
    # Bengaluru
    ("Bengaluru", "Bangalore|बेंगलुरु|बैंगलोर|ಬೆಂಗಳೂರು|பெங்களூரு|బెంగళూరు", "Bengaluru", "Karnataka", 12.9716, 77.5946),
    ("Jayanagar", "जयनगर|ಜಯನಗರ|ஜெயநகர்|Jaynagar", "Bengaluru", "Karnataka", 12.9250, 77.5930),
    ("Koramangala", "कोरमंगला|ಕೋರಮಂಗಲ", "Bengaluru", "Karnataka", 12.9350, 77.6240),
    ("Indiranagar", "इंदिरानगर|ಇಂದಿರಾನಗರ", "Bengaluru", "Karnataka", 12.9780, 77.6410),
    ("Whitefield", "व्हाइटफील्ड|ವೈಟ್‌ಫೀಲ್ಡ್", "Bengaluru", "Karnataka", 12.9700, 77.7500),
    ("Malleshwaram", "मल्लेश्वरम|ಮಲ್ಲೇಶ್ವರಂ", "Bengaluru", "Karnataka", 13.0030, 77.5700),
    ("Basavanagudi", "बसवनगुडी|ಬಸವನಗುಡಿ", "Bengaluru", "Karnataka", 12.9420, 77.5750),
    ("Electronic City", "इलेक्ट्रॉनिक सिटी|ಎಲೆಕ್ಟ್ರಾನಿಕ್ ಸಿಟಿ", "Bengaluru", "Karnataka", 12.8450, 77.6600),
    ("Hebbal", "हेब्बाल|ಹೆಬ್ಬಾಳ", "Bengaluru", "Karnataka", 13.0350, 77.5970),
    ("Yelahanka", "येलहंका|ಯಲಹಂಕ", "Bengaluru", "Karnataka", 13.1000, 77.5960),
    ("Rajajinagar", "राजाजीनगर|ರಾಜಾಜಿನಗರ", "Bengaluru", "Karnataka", 12.9910, 77.5550),
    ("BTM Layout", "बीटीएम लेआउट|ಬಿಟಿಎಂ ಲೇಔಟ್|BTM", "Bengaluru", "Karnataka", 12.9170, 77.6100),
    ("Marathahalli", "मराठाहल्ली|ಮಾರತಹಳ್ಳಿ", "Bengaluru", "Karnataka", 12.9590, 77.7010),
    ("Banashankari", "बनशंकरी|ಬನಶಂಕರಿ", "Bengaluru", "Karnataka", 12.9250, 77.5460),
    ("MG Road", "एमजी रोड|ಎಂಜಿ ರಸ್ತೆ|Mahatma Gandhi Road", "Bengaluru", "Karnataka", 12.9750, 77.6060),
    ("Mysuru", "Mysore|मैसूर|ಮೈಸೂರು", "Mysuru", "Karnataka", 12.2960, 76.6390),
    # Delhi NCR
    ("Delhi", "New Delhi|दिल्ली|नई दिल्ली|Dilli", "Delhi", "Delhi", 28.6139, 77.2090),
    ("Connaught Place", "कनॉट प्लेस|CP", "Delhi", "Delhi", 28.6320, 77.2190),
    ("Karol Bagh", "करोल बाग", "Delhi", "Delhi", 28.6510, 77.1900),
    ("Lajpat Nagar", "लाजपत नगर", "Delhi", "Delhi", 28.5670, 77.2430),
    ("Dwarka", "द्वारका", "Delhi", "Delhi", 28.5920, 77.0460),
    ("Rohini", "रोहिणी", "Delhi", "Delhi", 28.7360, 77.1130),
    ("Saket", "साकेत", "Delhi", "Delhi", 28.5240, 77.2060),
    ("Mayur Vihar", "मयूर विहार", "Delhi", "Delhi", 28.6090, 77.2940),
    ("Ansari Nagar", "अंसारी नगर|AIIMS|एम्स", "Delhi", "Delhi", 28.5670, 77.2100),
    ("Janakpuri", "जनकपुरी", "Delhi", "Delhi", 28.6210, 77.0870),
    ("Noida", "नोएडा", "Noida", "Uttar Pradesh", 28.5700, 77.3260),
    ("Gurugram", "Gurgaon|गुरुग्राम|गुड़गांव", "Gurugram", "Haryana", 28.4590, 77.0270),
    # Mumbai
    ("Mumbai", "Bombay|मुंबई|मुम्बई", "Mumbai", "Maharashtra", 19.0760, 72.8777),
    ("Andheri", "अंधेरी", "Mumbai", "Maharashtra", 19.1190, 72.8470),
    ("Bandra", "बांद्रा|वांद्रे", "Mumbai", "Maharashtra", 19.0600, 72.8360),
    ("Dadar", "दादर", "Mumbai", "Maharashtra", 19.0180, 72.8440),
    ("Borivali", "बोरीवली", "Mumbai", "Maharashtra", 19.2290, 72.8570),
    ("Thane", "ठाणे", "Thane", "Maharashtra", 19.2180, 72.9780),
    ("Kurla", "कुर्ला", "Mumbai", "Maharashtra", 19.0720, 72.8820),
    ("Powai", "पवई", "Mumbai", "Maharashtra", 19.1180, 72.9060),
    ("Chembur", "चेंबूर", "Mumbai", "Maharashtra", 19.0620, 72.9000),
    ("Vashi", "वाशी|Navi Mumbai|नवी मुंबई", "Navi Mumbai", "Maharashtra", 19.0770, 72.9990),
    # Chennai
    ("Chennai", "Madras|சென்னை|चेन्नई", "Chennai", "Tamil Nadu", 13.0827, 80.2707),
    ("T. Nagar", "T Nagar|Thyagaraya Nagar|தி. நகர்|தியாகராய நகர்", "Chennai", "Tamil Nadu", 13.0410, 80.2340),
    ("Adyar", "அடையாறு", "Chennai", "Tamil Nadu", 13.0060, 80.2570),
    ("Anna Nagar", "அண்ணா நகர்", "Chennai", "Tamil Nadu", 13.0850, 80.2100),
    ("Velachery", "வேளச்சேரி", "Chennai", "Tamil Nadu", 12.9760, 80.2210),
    ("Tambaram", "தாம்பரம்", "Chennai", "Tamil Nadu", 12.9250, 80.1270),
    ("Mylapore", "மயிலாப்பூர்", "Chennai", "Tamil Nadu", 13.0340, 80.2700),
    ("Egmore", "எழும்பூர்", "Chennai", "Tamil Nadu", 13.0730, 80.2610),
    # Hyderabad
    ("Hyderabad", "హైదరాబాద్|हैदराबाद", "Hyderabad", "Telangana", 17.3850, 78.4867),
    ("Banjara Hills", "బంజారా హిల్స్", "Hyderabad", "Telangana", 17.4160, 78.4380),
    ("Secunderabad", "సికింద్రాబాద్|सिकंदराबाद", "Hyderabad", "Telangana", 17.4390, 78.4980),
    ("Kukatpally", "కూకట్‌పల్లి", "Hyderabad", "Telangana", 17.4940, 78.3990),
    ("Gachibowli", "గచ్చిబౌలి", "Hyderabad", "Telangana", 17.4400, 78.3480),
    ("Ameerpet", "అమీర్‌పేట్", "Hyderabad", "Telangana", 17.4370, 78.4480),
    ("Dilsukhnagar", "దిల్‌సుఖ్‌నగర్", "Hyderabad", "Telangana", 17.3690, 78.5260),
    # Kolkata
    ("Kolkata", "Calcutta|কলকাতা|कोलकाता", "Kolkata", "West Bengal", 22.5726, 88.3639),
    ("Park Street", "পার্ক স্ট্রিট", "Kolkata", "West Bengal", 22.5530, 88.3520),
    ("Salt Lake", "সল্টলেক|Bidhannagar", "Kolkata", "West Bengal", 22.5800, 88.4150),
    ("Howrah", "হাওড়া|हावड़ा", "Howrah", "West Bengal", 22.5950, 88.2640),
    ("Behala", "বেহালা", "Kolkata", "West Bengal", 22.4980, 88.3100),
    ("Dum Dum", "দমদম", "Kolkata", "West Bengal", 22.6220, 88.4230),
    # Others
    ("Ahmedabad", "અમદાવાદ|अहमदाबाद", "Ahmedabad", "Gujarat", 23.0225, 72.5714),
    ("Navrangpura", "નવરંગપુરા", "Ahmedabad", "Gujarat", 23.0370, 72.5600),
    ("Maninagar", "મણિનગર", "Ahmedabad", "Gujarat", 22.9960, 72.6030),
    ("Pune", "पुणे", "Pune", "Maharashtra", 18.5204, 73.8567),
    ("Kothrud", "कोथरूड", "Pune", "Maharashtra", 18.5070, 73.8070),
    ("Hadapsar", "हडपसर", "Pune", "Maharashtra", 18.5080, 73.9260),
    ("Lucknow", "लखनऊ", "Lucknow", "Uttar Pradesh", 26.8467, 80.9462),
    ("Gomti Nagar", "गोमती नगर", "Lucknow", "Uttar Pradesh", 26.8560, 80.9910),
    ("Kochi", "Cochin|Ernakulam|കൊച്ചി|എറണാകുളം", "Kochi", "Kerala", 9.9816, 76.2999),
    ("Kakkanad", "കാക്കനാട്", "Kochi", "Kerala", 10.0150, 76.3410),
    ("Patna", "पटना", "Patna", "Bihar", 25.5941, 85.1376),
    ("Kankarbagh", "कंकड़बाग", "Patna", "Bihar", 25.5950, 85.1550),
    ("Chandigarh", "ਚੰਡੀਗੜ੍ਹ|चंडीगढ़", "Chandigarh", "Chandigarh", 30.7410, 76.7830),
    ("Ludhiana", "ਲੁਧਿਆਣਾ|लुधियाना", "Ludhiana", "Punjab", 30.9010, 75.8570),
    ("Amritsar", "ਅੰਮ੍ਰਿਤਸਰ|अमृतसर", "Amritsar", "Punjab", 31.6340, 74.8720),
]

NAME_STEMS = ["Sanjeevani", "Jeevan Jyoti", "Amrit", "Prana", "Rakt Seva", "Sahyog", "Arogya", "Raksha",
              "Sankalp", "Navjeevan", "Shraddha", "Seva Sadan", "Dhanvantari", "Sushruta", "Karuna", "Udaan"]
NAME_KINDS = ["Blood Centre", "Blood Bank", "Charitable Blood Bank", "Community Blood Centre"]
TYPES = ["Government", "Charitable", "Private", "Hospital-based"]

# Hand-built demo scenario around Jayanagar, Bengaluru:
# no O− within 5 km, three banks with O− between 5 and 10 km (one stale).
BENGALURU_BANKS = [
    # name, type, area, lat, lng, {group: units} overrides for red cells, hours_old
    ("Jayanagar Community Blood Centre", "Charitable", "Jayanagar 4th Block", 12.9262, 77.5848, {"O-": 0, "O+": 9, "B+": 6}, 2),
    ("Basavanagudi Rakt Seva Blood Bank", "Government", "Basavanagudi", 12.9431, 77.5742, {"O-": 0, "A+": 5}, 3),
    ("BTM Sahyog Blood Centre", "Private", "BTM Layout 2nd Stage", 12.9160, 77.6118, {"O-": 0, "AB+": 3}, 1),
    ("Koramangala Arogya Blood Bank", "Hospital-based", "Koramangala 5th Block", 12.9346, 77.6235, {"O-": 0, "B-": 1}, 4),
    ("Banashankari Karuna Blood Centre", "Charitable", "Banashankari 2nd Stage", 12.9255, 77.5462, {"O-": 0}, 5),
    ("Sanjeevani Blood Centre", "Charitable", "MG Road", 12.9752, 77.6065, {"O-": 4, "A-": 2}, 2),
    ("Indiranagar Prana Blood Bank", "Private", "Indiranagar 100 Ft Road", 12.9785, 77.6408, {"O-": 2}, 1),
    ("Rajajinagar Dhanvantari Blood Bank", "Government", "Rajajinagar 1st Block", 12.9908, 77.5552, {"O-": 2}, 30),
    ("Malleshwaram Seva Sadan Blood Centre", "Hospital-based", "Malleshwaram 8th Cross", 13.0032, 77.5703, {"O-": 1}, 6),
    ("Whitefield Udaan Blood Bank", "Private", "Whitefield Main Road", 12.9698, 77.7499, {"O-": 3}, 2),
    ("Electronic City Navjeevan Blood Centre", "Private", "Electronic City Phase 1", 12.8452, 77.6602, {"O-": 1}, 8),
    ("Hebbal Amrit Blood Bank", "Charitable", "Hebbal", 13.0352, 77.5968, {"O-": 2}, 3),
    ("Yelahanka Raksha Blood Centre", "Government", "Yelahanka New Town", 13.1003, 77.5958, {"O-": 0}, 4),
    ("Marathahalli Sankalp Blood Bank", "Private", "Marathahalli", 12.9591, 77.7012, {"O-": 1}, 2),
]


def _phone(n: int) -> str:
    return f"+91 00000 0{n:04d}"


def _units(rng: random.Random, group: str, component: str) -> int:
    if component == "platelets":
        return rng.choice([0, 0, 1, 2, 3, 4])
    if component == "plasma":
        return rng.choice([0, 2, 4, 6, 8])
    if group.endswith("-"):
        return rng.choice([0, 0, 0, 1, 2, 3])
    return rng.choice([0, 2, 3, 5, 7, 9, 12])


def seed(force: bool = False) -> None:
    conn = db.connect()
    if not force and db.query_one("SELECT 1 FROM blood_banks LIMIT 1"):
        return
    rng = random.Random(20261110)
    now = datetime.now(IST).replace(second=0, microsecond=0)
    with db.tx() as c:
        for t in ("stock", "blood_banks", "gazetteer"):
            c.execute(f"DELETE FROM {t}")  # noqa: S608 - fixed table names
        c.execute("DELETE FROM donors WHERE synthetic = 1")
        c.execute("DELETE FROM users WHERE phone_hash LIKE 'synthetic:%'")

        for name, alts, city, state, lat, lng in PLACES:
            c.execute("INSERT INTO gazetteer(name, alt_names, city, state, lat, lng) VALUES (?,?,?,?,?,?)",
                      (name, alts, city, state, lat, lng))

        phone_n = 1001
        bank_rows: list[tuple] = []
        for name, typ, area, lat, lng, overrides, hours_old in BENGALURU_BANKS:
            bank_rows.append((name, typ, area, "Bengaluru", "Karnataka", lat, lng, overrides, hours_old))
        for pname, _alts, city, state, plat, plng in PLACES:
            if city == "Bengaluru":
                continue
            for _ in range(rng.choice([1, 2, 2])):
                stem = rng.choice(NAME_STEMS)
                kind = rng.choice(NAME_KINDS)
                lat = plat + rng.uniform(-0.012, 0.012)
                lng = plng + rng.uniform(-0.012, 0.012)
                hours_old = rng.choice([1, 2, 3, 5, 8, 12, 20, 30, 40])
                bank_rows.append((f"{pname} {stem} {kind}", rng.choice(TYPES), pname, city, state, lat, lng, {}, hours_old))

        for name, typ, area, city, state, lat, lng, overrides, hours_old in bank_rows:
            updated = (now - timedelta(hours=hours_old)).isoformat()
            hours = "Open 24 h" if typ in ("Government", "Hospital-based") or rng.random() < 0.4 else "8 am – 8 pm"
            bank_id = c.execute(
                "INSERT INTO blood_banks(name, type, area, city, state, lat, lng, phone_synthetic, hours, last_updated)"
                " VALUES (?,?,?,?,?,?,?,?,?,?)",
                (name, typ, area, city, state, round(lat, 5), round(lng, 5), _phone(phone_n), hours, updated),
            ).lastrowid
            phone_n += 1
            for g in GROUPS:
                for comp in COMPONENTS:
                    units = _units(rng, g, comp)
                    if comp in ("whole_blood", "prbc") and g in overrides:
                        units = overrides[g]
                    c.execute("INSERT INTO stock(bank_id, blood_group, component, units, updated_at) VALUES (?,?,?,?,?)",
                              (bank_id, g, comp, units, updated))

        # Synthetic donors: no phone numbers at all, so they can never be contacted for real.
        for i in range(260):
            _pname, _a, city, _s, plat, plng = rng.choice(PLACES)
            group = rng.choices(GROUPS, weights=[22, 2, 32, 2, 7, 1, 30, 4])[0]
            uid = c.execute("INSERT INTO users(phone_hash, phone_enc, created_at) VALUES (?, '', ?)",
                            (f"synthetic:{i}", now.isoformat())).lastrowid
            c.execute(
                "INSERT INTO donors(user_id, blood_group, lat_r, lng_r, place, languages, available, synthetic, created_at)"
                " VALUES (?,?,?,?,?,?,?,1,?)",
                (uid, group, round(plat + rng.uniform(-0.05, 0.05), 3), round(plng + rng.uniform(-0.05, 0.05), 3),
                 city, "hi-IN", 1 if rng.random() < 0.8 else 0, now.isoformat()),
            )
    del conn
    from . import search  # local import: search is not needed to load this module
    search.forget_places()


if __name__ == "__main__":
    seed(force=True)
    n = db.query_one("SELECT COUNT(*) AS n FROM blood_banks")["n"]
    d = db.query_one("SELECT COUNT(*) AS n FROM donors")["n"]
    print(f"Seeded {n} synthetic blood banks and {d} synthetic donors into {db.connect()}")
