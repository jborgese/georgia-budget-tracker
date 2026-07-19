from __future__ import annotations

import pandas as pd
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
    expected = {("state", "STATE OF GEORGIA", 2023, "expenditure"): 500.0}
    validate(frame, expected)


def test_reconciliation_breach_fails(normalized_frame):
    frame = normalized_frame()
    expected = {("state", "STATE OF GEORGIA", 2023, "expenditure"): 900.0}
    with pytest.raises(pandera.errors.SchemaError, match="reconcile"):
        validate(frame, expected)


def city_row(entity, **overrides):
    return {"entity": entity, "entity_type": "city", "fips": contract.STATE_FIPS,
            "fiscal_year": 2023, "category": "taxes",
            "subcategory": "PART I TAX REVENUES", "measure": "flow",
            "amount": 40.0, **overrides}


def consolidated_rows():
    return [{"entity": government, "entity_type": "consolidated",
             "fips": contract.CONSOLIDATED_COUNTY_FIPS[government],
             "fiscal_year": 2023, "category": "taxes",
             "subcategory": "PART I TAX REVENUES", "measure": "flow",
             "amount": 70.0}
            for government in contract.CONSOLIDATED_GOVERNMENTS]


def with_rows(frame, rows):
    return pd.concat([frame, pd.DataFrame.from_records(
        rows, columns=contract.NORMALIZED_COLUMNS)], ignore_index=True)


def test_city_and_consolidated_rows_validate(normalized_frame):
    frame = with_rows(normalized_frame(),
                      [city_row("ATLANTA"), *consolidated_rows()])
    validate(frame)


def test_partial_consolidated_coverage_fails(normalized_frame):
    frame = with_rows(normalized_frame(), consolidated_rows()[:3])
    with pytest.raises(pandera.errors.SchemaError, match="all_consolidated"):
        validate(frame)


def test_consolidated_fips_must_match_underlying_county(normalized_frame):
    rows = consolidated_rows()
    rows[0]["fips"] = contract.STATE_FIPS
    with pytest.raises(pandera.errors.SchemaError, match="fips"):
        validate(with_rows(normalized_frame(), rows))


def test_negative_city_tax_fails(normalized_frame):
    frame = with_rows(normalized_frame(), [city_row("ATLANTA", amount=-2.0)])
    with pytest.raises(pandera.errors.SchemaError, match="negative"):
        validate(frame)


def test_city_county_name_collision_reconciles_separately(normalized_frame):
    frame = with_rows(normalized_frame(), [city_row("DECATUR")])
    expected = {("city", "DECATUR", 2023, "revenue"): 40.0,
                ("county", "DECATUR", 2023, "revenue"): 100.0}
    validate(frame, expected)


def test_consolidated_roster_matches_known_missing_counties():
    assert (set(contract.CONSOLIDATED_GOVERNMENTS.values())
            == set(contract.KNOWN_MISSING_COUNTIES))


def debt_row(category, measure, amount):
    return {"entity": "APPLING", "entity_type": "county", "fips": "13001",
            "fiscal_year": 2023, "category": category,
            "subcategory": "GO Bond Debt Ending Amount Outstanding",
            "measure": measure, "amount": amount}


def test_debt_stock_row_validates(normalized_frame):
    frame = with_rows(normalized_frame(),
                      [debt_row("debt_outstanding", "stock", 400.0)])
    validate(frame)


def test_stock_measure_outside_debt_outstanding_fails(normalized_frame):
    frame = with_rows(normalized_frame(),
                      [debt_row("debt_retired", "stock", 100.0)])
    with pytest.raises(pandera.errors.SchemaError, match="measure"):
        validate(frame)


def test_flow_measure_on_debt_outstanding_fails(normalized_frame):
    frame = with_rows(normalized_frame(),
                      [debt_row("debt_outstanding", "flow", 400.0)])
    with pytest.raises(pandera.errors.SchemaError, match="measure"):
        validate(frame)


def test_negative_debt_kept_as_filed(normalized_frame):
    frame = with_rows(normalized_frame(),
                      [debt_row("debt_outstanding", "stock", -400.0)])
    validate(frame)


def test_side_maps_debt_categories():
    assert contract.side("debt_outstanding") == "debt"
    assert contract.side("debt_service") == "expenditure"
    assert contract.DEBT_CATEGORIES.isdisjoint(
        contract.REVENUE_CATEGORIES | contract.EXPENDITURE_CATEGORIES)


def test_side_classifies_disjoint_vocabulary():
    assert contract.side("taxes") == "revenue"
    assert contract.side("enterprise_operations") == "expenditure"
    assert contract.REVENUE_CATEGORIES.isdisjoint(contract.EXPENDITURE_CATEGORIES)


def test_roster_has_all_159_counties():
    assert len(contract.COUNTY_FIPS) == 159
    assert all(fips.startswith("13") and len(fips) == 5
               for fips in contract.COUNTY_FIPS.values())
