from __future__ import annotations

import pytest

import etl_sales_rates as etl


def county_entry(county, code, total=7.0, letters="ELS"):
    return {"code": code, "name": county.title(), "total": total,
            "letters": letters}


def enriched_roster(overrides=None):
    """One consistent entry per roster county, plus every registered
    special jurisdiction, run through enrich()."""
    overrides = overrides or {}
    counties = sorted(etl.COUNTY_ROSTER)
    entries = [county_entry(county, f"{index + 1:03d}",
                            **overrides.get(county, {}))
               for index, county in enumerate(counties)]
    entries += [
        {"code": code, "name": special["name"].title(),
         "total": 8.0 if special.get("state_included", True) else 4.0,
         "letters": "ELST"}
        for code, special in etl.SPECIAL_JURISDICTIONS.items()
    ]
    return etl.enrich(entries, "test")


def test_tokenize_longest_match_and_case():
    assert etl.tokenize_types("ELST2") == ["E", "L", "S", "T2"]
    assert etl.tokenize_types("LSTf") == ["L", "S", "Tf"]
    assert etl.tokenize_types("TaM") == ["Ta", "M"]
    assert etl.tokenize_types("Mm") == ["M", "m"]
    assert etl.tokenize_types("E L S T") == ["E", "L", "S", "T"]
    assert etl.tokenize_types("") == []


def test_tokenize_rejects_unknown_letter():
    with pytest.raises(SystemExit, match="vocabulary"):
        etl.tokenize_types("ELX")


def test_decompose_standard_letters():
    pairs = etl.decompose(7.0, ["E", "L", "S"], "t")
    assert pairs == [("E", 20), ("L", 20), ("S", 20)]


def test_decompose_fixed_fractional():
    pairs = etl.decompose(7.75, ["E", "L", "M", "Tf"], "t")
    assert ("Tf", 15) in pairs
    assert sum(amount for _, amount in pairs) == 75


def test_decompose_solves_variable_fractional():
    pairs = etl.decompose(7.5, ["E", "L", "S", "O"], "t")
    assert ("O", 10) in pairs
    pairs = etl.decompose(8.0, ["E", "L", "S", "O"], "t")
    assert ("O", 20) in pairs


def test_decompose_rejects_mismatch():
    with pytest.raises(SystemExit, match="mismatch"):
        etl.decompose(8.0, ["E", "L", "S"], "t")
    with pytest.raises(SystemExit, match="no assignment"):
        etl.decompose(9.0, ["E", "L", "S", "O"], "t")


def test_decompose_fixed_half_penny_m():
    pairs = etl.decompose(8.9, ["M", "L", "E", "O", "m", "Ta"], "t")
    assert ("m", 10) in pairs
    assert ("O", 20) in pairs


def test_decompose_without_state_cents():
    pairs = etl.decompose(3.9, ["M", "E", "O", "m", "Ta"], "t",
                          state_twentieths=0)
    assert ("O", 20) in pairs
    assert sum(amount for _, amount in pairs) == 78


def test_decompose_rejects_ambiguous_split(monkeypatch):
    monkeypatch.setitem(etl.VARIABLE_FRACTIONAL, "X", (10, 20))
    with pytest.raises(SystemExit, match="ambiguous"):
        etl.decompose(7.5, ["E", "L", "O", "X"], "t")


def test_classify_groups_cents():
    pairs = etl.decompose(8.15, ["E", "L", "M", "Tf", "Ta"], "t")
    cents = etl.classify(pairs)
    assert cents == {"education": 1.0, "transit": 2.15, "local_shared": 1.0}


def test_classify_counts_local_marta_as_transit():
    pairs = etl.decompose(8.9, ["M", "L", "E", "O", "m", "Ta"], "t")
    cents = etl.classify(pairs)
    assert cents == {"education": 1.0, "transit": 1.9, "local_shared": 2.0}


def test_split_glued_tokens():
    assert etl.split_glued_tokens(
        ["T2P", "060AFulton", "(Atlanta)"]) == ["T2P", "060A", "Fulton",
                                                "(Atlanta)"]
    assert etl.split_glued_tokens(["Prk)8", "MLE"]) == ["Prk)", "8", "MLE"]
    assert etl.split_glued_tokens(["060A", "804", "8.9"]) == ["060A", "804",
                                                              "8.9"]


def test_group_lines_tolerates_baseline_offsets():
    words = [{"page": 0, "top": 100.0, "x0": 10, "text": "030"},
             {"page": 0, "top": 102.5, "x0": 40, "text": "9"},
             {"page": 0, "top": 100.5, "x0": 20, "text": "Clay"},
             {"page": 0, "top": 110.0, "x0": 10, "text": "031"},
             {"page": 1, "top": 110.0, "x0": 10, "text": "032"}]
    lines = etl.group_lines(words)
    assert [[w["text"] for w in line] for line in lines] == [
        ["030", "Clay", "9"], ["031"], ["032"]]


def test_canonical_county_name_variants():
    assert etl.canonical_county_name("Appling") == "APPLING"
    assert etl.canonical_county_name("Dekalb (Not Atlanta)") == "DEKALB"
    assert etl.canonical_county_name(
        "Clayton (Not College Park)") == "CLAYTON"
    assert etl.canonical_county_name("Fulton* (Not Atlanta, East Point,"
                                     " College Park or Hapeville)") == "FULTON"
    assert etl.canonical_county_name("Ben Hill") == "BEN HILL"
    assert etl.canonical_county_name("Muscogee County") == "MUSCOGEE"
    assert etl.canonical_county_name("Atlanta") is None


def test_parse_entry_variants():
    entry = etl.parse_entry(["001", "Appling", "8", "LST2"], "t")
    assert entry == {"code": "001", "name": "Appling", "total": 8.0,
                     "letters": "LST2"}
    entry = etl.parse_entry(
        ["060", "Fulton*", "(Not", "Atlanta)", "7.75%", "ELMTf"], "t")
    assert entry["name"] == "Fulton* (Not Atlanta)"
    assert entry["total"] == 7.75
    assert entry["letters"] == "ELMTf"
    entry = etl.parse_entry(["044A", "Atlanta", "(DeKalb)", "8.9", "E",
                             "L", "M", "S", "Ta", "O"], "t")
    assert entry["code"] == "044A"
    assert entry["letters"] == "ELMSTaO"


def test_parse_entry_rejects_garbage():
    with pytest.raises(SystemExit, match="unparseable"):
        etl.parse_entry(["Appling", "8", "LST2"], "t")
    with pytest.raises(SystemExit, match="no rate"):
        etl.parse_entry(["001", "Appling", "LST2"], "t")


def test_enrich_rejects_unknown_jurisdiction():
    with pytest.raises(SystemExit, match="SPECIAL_JURISDICTIONS"):
        etl.enrich([{"code": "900", "name": "Mystery City", "total": 8.0,
                     "letters": "ELST"}], "test")


def test_enrich_rejects_implausible_rate():
    with pytest.raises(SystemExit, match="plausible"):
        etl.enrich([county_entry("APPLING", "001", total=12.0)], "test")


def test_enrich_special_name_must_match_registered_county():
    with pytest.raises(SystemExit, match="does not appear"):
        etl.enrich([{"code": "800", "name": "Cobb (Hapeville)",
                     "total": 8.0, "letters": "ELST"}], "test")


def test_enrich_state_exclusion_for_central_yards():
    entries = etl.enrich([{"code": "803", "name": "Fulton (Cent. Yards)",
                           "total": 3.9, "letters": "MEOmTa"}], "test")
    assert entries[0]["state_cents"] == 0.0
    assert entries[0]["cents"] == {"education": 1.0, "transit": 1.9,
                                   "local_shared": 1.0}


def test_validate_accepts_full_roster():
    entries = enriched_roster()
    etl.validate(entries, "test")  # must not raise


def test_validate_rejects_missing_county():
    entries = [entry for entry in enriched_roster()
               if entry["county"] != "APPLING"
               or not entry["is_county_default"]]
    with pytest.raises(SystemExit, match="missing from the chart"):
        etl.validate(entries, "test")


def test_validate_rejects_duplicate_county():
    entries = enriched_roster()
    duplicate = dict(entries[0])
    duplicate = {**duplicate, "code": "998"}
    with pytest.raises(SystemExit, match="more than once"):
        etl.validate(entries + [duplicate], "test")


def test_validate_rejects_unparsed_special():
    entries = [entry for entry in enriched_roster()
               if entry["code"] != "803"]
    with pytest.raises(SystemExit, match="absent from"):
        etl.validate(entries, "test")


def test_build_resolution_maps_cities_to_counties():
    resolution = etl.build_resolution(enriched_roster())
    assert set(resolution) == {etl.county_slug(county)
                               for county in etl.COUNTY_ROSTER}
    fulton = resolution["fulton"]
    assert fulton["county"] == "FULTON"
    assert fulton["fips"] == "13121"
    assert fulton["cities"] == {"ATLANTA": "060A", "COLLEGE PARK": "801",
                                "EAST POINT": "802", "HAPEVILLE": "800"}
    assert resolution["clayton"]["cities"] == {"COLLEGE PARK": "804"}
    assert resolution["dekalb"]["cities"] == {"ATLANTA": "044A"}
    # Central Yards (803) never resolves to a residential city.
    assert "803" not in {code
                         for entry in resolution.values()
                         for code in entry["cities"].values()}


def test_edition_dates():
    assert etl.edition_dates("dor_sales_rates_2026q3") == ("2026-07-01",
                                                           "2026-09-30")
    with pytest.raises(SystemExit, match="YYYYqQ"):
        etl.edition_dates("dor_sales_rates_2026")
