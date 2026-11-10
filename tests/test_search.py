import pytest

from app import search

JAYANAGAR = (12.9250, 77.5930)


@pytest.mark.parametrize("patient,expected", [
    ("O-", {"O-"}),
    ("O+", {"O+", "O-"}),
    ("A-", {"A-", "O-"}),
    ("A+", {"A+", "A-", "O+", "O-"}),
    ("B-", {"B-", "O-"}),
    ("B+", {"B+", "B-", "O+", "O-"}),
    ("AB-", {"AB-", "A-", "B-", "O-"}),
    ("AB+", set(search.GROUPS)),
])
def test_red_cell_compatibility_table(patient, expected):
    assert set(search.compatible_groups(patient, "prbc")) == expected
    assert search.compatible_groups(patient, "prbc")[0] == patient  # exact group first


@pytest.mark.parametrize("component", ["platelets", "plasma"])
def test_platelets_and_plasma_exact_only(component):
    assert search.compatible_groups("A+", component) == ("A+",)


def test_no_group_ever_receives_incompatible():
    # ABO/Rh rule: donor antigens must be a subset of the patient's.
    def antigens(g):
        a = set(g[:-1].replace("O", ""))
        if g.endswith("+"):
            a.add("D")
        return a
    for patient, donors in search.RED_CELL_COMPATIBLE.items():
        for d in donors:
            assert antigens(d) <= antigens(patient), (patient, d)


@pytest.mark.parametrize("text,group", [
    ("O negative", "O-"), ("o -ve", "O-"), ("O−", "O-"), ("b positive", "B+"), ("AB+", "AB+"),
    ("ab negative", "AB-"), ("ओ नेगेटिव", "O-"), ("बी पॉजिटिव", "B+"), ("ಎಬಿ ಪಾಸಿಟಿವ್", "AB+"),
    ("ஓ நெகட்டிவ்", "O-"), ("A pos", "A+"), ("Oh negative", "O-"), ("a b positive", "AB+"), ("hello", None), (None, None),
])
def test_normalize_group(text, group):
    assert search.normalize_group(text) == group


@pytest.mark.parametrize("text,sign,letter", [
    ("Negative दो यूनिट", "-", None), ("ओ", None, "O"), ("बी पॉज़िटिव", "+", "B"), ("ഒ നെഗറ്റീവ്", "-", "O"),
    ("এবি পজিটিভ", "+", "AB"), ("a or b", None, None), ("Oh negative", "-", "O"), ("bee positive", "+", "B"),
])
def test_partial_group_parsing(text, sign, letter):
    assert search.rh_sign(text) == sign
    assert search.abo_letter(text) == letter


def test_radius_ladder_widens_for_jayanagar_o_negative():
    res = search.radius_search(*JAYANAGAR, "O-", "prbc", 2)
    assert res.searched_km[:2] == [5, 10]
    assert res.found_within_km == 10
    assert len(res.hits) >= 3
    assert all(h.blood_group == "O-" and h.units >= 2 for h in res.hits)
    assert all(h.distance_km <= 10 for h in res.hits)
    dists = [h.distance_km for h in res.hits]
    assert dists == sorted(dists)


def test_stale_flag_on_old_stock():
    res = search.radius_search(*JAYANAGAR, "O-", "prbc", 2)
    names = {h.name: h for h in res.hits}
    assert names["Rajajinagar Dhanvantari Blood Bank"].stale is True
    assert names["Sanjeevani Blood Centre"].stale is False


def test_compatible_results_ranked_after_exact():
    res = search.radius_search(*JAYANAGAR, "A+", "prbc", 1)
    matches = [h.match for h in res.hits]
    assert matches == sorted(matches, key=lambda m: m != "exact")


def test_prefers_widening_for_exact_matches():
    res = search.radius_search(12.935, 77.624, "B+", "prbc", 3)  # Koramangala
    exact = [h for h in res.hits if h.match == "exact"]
    if res.found_within_km != res.max_km:
        assert len(exact) >= search.GOAL
    assert [h.match for h in res.hits] == sorted([h.match for h in res.hits], key=lambda m: m != "exact")


def test_nothing_found_far_from_any_city():
    res = search.radius_search(21.0, 79.0, "O-", "prbc", 1)  # rural central India in the synthetic set
    assert res.hits == [] and res.found_within_km is None and res.searched_km == [5, 10, 15, 20]


@pytest.mark.parametrize("text,name", [
    ("Jayanagar", "Jayanagar, Bengaluru"), ("जयनगर में", "Jayanagar, Bengaluru"), ("near ಜಯನಗರ please", "Jayanagar, Bengaluru"),
    ("T Nagar Chennai", "T. Nagar, Chennai"), ("Bombay", "Mumbai"), ("koramangla", "Koramangala, Bengaluru"),
])
def test_lookup_place(text, name):
    p = search.lookup_place(text)
    assert p is not None and p.name == name


def test_lookup_place_unknown():
    assert search.lookup_place("xyzzy plugh") is None


def test_donors_nearby_returns_ids_only():
    ids = search.donors_nearby(*JAYANAGAR, "O+", "prbc", 20)
    assert ids and all(isinstance(i, int) for i in ids)


def test_translation_must_keep_blood_group_letter():
    from app.llm import groups_preserved
    src = "A positive found. Nearest: T. Nagar Blood Centre, 1.1 km away, 7 units."
    assert groups_preserved(src, "A positive கண்டறியப்பட்டது. 1.1 கி.மீ., 7 அலகுகள்.")
    assert not groups_preserved(src, "நேர்மறை கண்டறியப்பட்டது. 1.1 கி.மீ., 7 அலகுகள்.")


def test_place_list_is_built_once_and_can_be_dropped():
    first = search._place_index()
    assert search._place_index() is first
    search.forget_places()
    again = search._place_index()
    assert again is not first
    assert again[2] == first[2]
