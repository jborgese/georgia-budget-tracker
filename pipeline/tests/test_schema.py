from __future__ import annotations

import pandera.errors
import pytest

import schema as contract


def validate(frame, expected_totals=None):
    return contract.build_schema(expected_totals).validate(frame)


def test_valid_frame_passes(normalized_frame):
    validate(normalized_frame())


def test_unflagged_missing_county_fails(normalized_frame):
    frame = normalized_frame()
    frame = frame[frame.entity != "APPLING"]
    with pytest.raises(pandera.errors.SchemaError, match="all_counties"):
        validate(frame)


def test_flagged_missing_counties_are_allowed(normalized_frame):
    present = set(normalized_frame().entity)
    assert set(contract.KNOWN_MISSING_COUNTIES).isdisjoint(present)


def test_wrong_fips_fails(normalized_frame):
    with pytest.raises(pandera.errors.SchemaError):
        validate(normalized_frame(fips="13999"))


def test_unknown_category_fails(normalized_frame):
    with pytest.raises(pandera.errors.SchemaError):
        validate(normalized_frame(category="miscellaneous"))


def test_negative_state_amount_fails(normalized_frame):
    with pytest.raises(pandera.errors.SchemaError, match="negative"):
        validate(normalized_frame(amount=-1.0))


def test_negative_state_adjustment_is_allowed(normalized_frame):
    frame = normalized_frame(
        amount=-1.0,
        subcategory="Total (reconciliation adjustment)")
    validate(frame)


def test_negative_county_tax_fails(normalized_frame):
    frame = normalized_frame()
    frame.loc[frame.entity == "APPLING", "amount"] = -5.0
    with pytest.raises(pandera.errors.SchemaError, match="negative"):
        validate(frame)


def test_negative_county_charges_allowed(normalized_frame):
    frame = normalized_frame()
    mask = frame.entity == "CHATHAM"
    frame.loc[mask, ["category", "subcategory", "amount"]] = [
        "charges_and_fees", "PART 3 SERVICE CHARGES AND OTHER REVENUES", -55.0]
    validate(frame)


def test_reconciliation_within_tolerance_passes(normalized_frame):
    frame = normalized_frame()
    expected = {("STATE OF GEORGIA", 2023, "expenditure"): 500.0}
    validate(frame, expected)


def test_reconciliation_breach_fails(normalized_frame):
    frame = normalized_frame()
    expected = {("STATE OF GEORGIA", 2023, "expenditure"): 900.0}
    with pytest.raises(pandera.errors.SchemaError, match="reconcile"):
        validate(frame, expected)


def test_side_classifies_disjoint_vocabulary():
    assert contract.side("taxes") == "revenue"
    assert contract.side("enterprise_operations") == "expenditure"
    assert contract.REVENUE_CATEGORIES.isdisjoint(contract.EXPENDITURE_CATEGORIES)


def test_roster_has_all_159_counties():
    assert len(contract.COUNTY_FIPS) == 159
    assert all(fips.startswith("13") and len(fips) == 5
               for fips in contract.COUNTY_FIPS.values())
