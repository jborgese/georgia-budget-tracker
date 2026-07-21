from __future__ import annotations

import json
from pathlib import Path

PARAMETERS_FILE = (Path(__file__).resolve().parents[1]
                   / "tax_parameters.json")

# Quintile mean pre-tax incomes, CES 2024, verified against the FRED CXU
# series recorded in the file (CXUINCBEFTXLB0102M..0106M).
VERIFIED_QUINTILE_INCOMES = [16658, 42925, 74474, 121548, 264510]


def load():
    return json.loads(PARAMETERS_FILE.read_text())


def test_income_tax_rate_is_the_2026_flat_rate():
    income_tax = load()["income_tax"]
    assert income_tax["tax_year"] == 2026
    assert abs(income_tax["rate"] - 0.0499) < 1e-9
    assert 0 < income_tax["rate"] < 0.1


def test_standard_deduction_joint_doubles_single():
    deduction = load()["income_tax"]["standard_deduction"]
    assert deduction["single"] > 0
    assert deduction["married_filing_jointly"] == 2 * deduction["single"]


def test_income_tax_discloses_omissions_and_provenance():
    income_tax = load()["income_tax"]
    assert len(income_tax["omissions"]) >= 4
    assert income_tax["provenance"]
    assert all(url.startswith("https://")
               for url in income_tax["provenance"])


def test_quintile_incomes_match_verified_fred_values():
    quintiles = load()["consumption_model"]["quintiles"]
    incomes = [q["income_pretax"] for q in quintiles]
    assert incomes == VERIFIED_QUINTILE_INCOMES
    assert incomes == sorted(incomes)
    assert len(set(incomes)) == 5


def test_consumption_shares_sane_and_decreasing():
    quintiles = load()["consumption_model"]["quintiles"]
    for key in ("taxable_nonfood_share", "food_at_home_share"):
        shares = [q[key] for q in quintiles]
        assert all(0 < share < 2 for share in shares), key
        assert shares == sorted(shares, reverse=True), (
            f"{key} must decrease with income")
        assert len(set(shares)) == 5, key


def test_consumption_model_records_series_and_caveats():
    model = load()["consumption_model"]
    assert len(model["fred_series"]["income_before_taxes"]) == 5
    assert len(model["fred_series"]["food_at_home"]) == 5
    assert model["excluded_categories"]
    assert model["caveats"]


def test_file_round_trips_at_indent_1():
    raw = PARAMETERS_FILE.read_text()
    assert raw == json.dumps(json.loads(raw), indent=1,
                             ensure_ascii=False) + "\n"
