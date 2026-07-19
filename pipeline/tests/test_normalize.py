from __future__ import annotations

import pandas as pd
import pytest

import normalize
import schema as contract


def county_source_row(county, fiscal_year, section, classification, depth,
                      path, amount):
    return {"county": county, "fiscal_year": fiscal_year, "category": "x",
            "section": section, "classification": classification,
            "depth": depth, "line": 0, "path": path, "amount": amount}


@pytest.fixture
def county_frame():
    rows = [
        county_source_row("APPLING", 2023, "revenues", "TOTAL REVENUES", 0,
                          "TOTAL REVENUES", 1000),
        county_source_row("APPLING", 2023, "revenues", "GENERAL REVENUES", 1,
                          "TOTAL REVENUES > GENERAL REVENUES", 900),
        county_source_row("APPLING", 2023, "revenues", "PART I TAX REVENUES", 2,
                          "TOTAL REVENUES > GENERAL REVENUES > PART I TAX REVENUES",
                          600),
        county_source_row("APPLING", 2023, "revenues",
                          "PART 2 INTERGOVERNMENTAL REVENUES", 2,
                          "TOTAL REVENUES > GENERAL REVENUES > "
                          "PART 2 INTERGOVERNMENTAL REVENUES", 250),
        county_source_row("APPLING", 2023, "revenues", "ENTERPRISE FUND REVENUES", 1,
                          "TOTAL REVENUES > ENTERPRISE FUND REVENUES", 100),
    ]
    return pd.DataFrame.from_records(rows)


def test_normalize_county_emits_leaves_residuals_and_expected(county_frame):
    records, expected = normalize.normalize_rlgf(county_frame, "county")
    frame = pd.DataFrame.from_records(records)
    assert expected == {("county", "APPLING", 2023, "revenue"): 1000.0}
    by_subcategory = dict(zip(frame.subcategory, frame.amount))
    assert by_subcategory["PART I TAX REVENUES"] == 600
    assert by_subcategory["PART 2 INTERGOVERNMENTAL REVENUES"] == 250
    assert by_subcategory["GENERAL REVENUES (unallocated)"] == 50
    assert by_subcategory["ENTERPRISE FUND REVENUES"] == 100
    assert frame.amount.sum() == 1000


def entity_source_row(entity, fiscal_year, section, classification, depth,
                      path, amount):
    return {"entity": entity, "fiscal_year": fiscal_year, "category": "x",
            "section": section, "classification": classification,
            "depth": depth, "line": 0, "path": path, "amount": amount}


def test_normalize_city_uses_state_fips_and_typed_keys():
    frame = pd.DataFrame.from_records([
        entity_source_row("DECATUR", 2023, "revenues", "GENERAL REVENUES", 1,
                          "TOTAL REVENUES > GENERAL REVENUES", 300),
    ])
    records, expected = normalize.normalize_rlgf(frame, "city")
    assert expected == {("city", "DECATUR", 2023, "revenue"): 300.0}
    assert all(record["entity_type"] == "city" for record in records)
    assert all(record["fips"] == contract.STATE_FIPS for record in records)


def test_normalize_consolidated_maps_county_fips():
    frame = pd.DataFrame.from_records([
        entity_source_row("MACON-BIBB", 2023, "operating",
                          "Section A General Government", 1,
                          "TOTAL OPERATING > Section A General Government", 90),
    ])
    records, expected = normalize.normalize_rlgf(frame, "consolidated")
    assert expected == {("consolidated", "MACON-BIBB", 2023, "expenditure"): 90.0}
    assert records[0]["fips"] == contract.COUNTY_FIPS["BIBB"]
    assert records[0]["category"] == "general_government"


def test_normalized_county_rows_validate(county_frame):
    records, expected = normalize.normalize_rlgf(county_frame, "county")
    all_counties = [
        {"entity": name, "entity_type": "county",
         "fips": contract.COUNTY_FIPS[name], "fiscal_year": 2023,
         "category": "taxes", "subcategory": "seed", "amount": 1.0}
        for name in contract.COUNTY_FIPS
        if name not in contract.KNOWN_MISSING_COUNTIES and name != "APPLING"]
    frame = normalize.assemble(records + all_counties)
    contract.build_schema().validate(frame)


def test_normalize_state_adds_adjustment_for_orphan_lines():
    rows = [
        {"entity": "STATE OF GEORGIA", "fiscal_year": 2024, "category": "revenue",
         "section": "state_general_fund_receipts", "classification": "Income Tax",
         "depth": 3, "line": 0, "amount": 700.0, "basis": "reported",
         "source": normalize.OPB_SOURCE,
         "path": "State General Fund Receipts > Net Taxes > Income Tax"},
        {"entity": "STATE OF GEORGIA", "fiscal_year": 2024, "category": "revenue",
         "section": "total_state_treasury_receipts",
         "classification": "Total State Treasury Receipts", "depth": 0, "line": 0,
         "amount": 690.0, "basis": "reported", "source": normalize.OPB_SOURCE,
         "path": "Total State Treasury Receipts"},
    ]
    records, expected = normalize.normalize_state(pd.DataFrame.from_records(rows))
    frame = pd.DataFrame.from_records(records)
    assert expected == {("state", "STATE OF GEORGIA", 2024, "revenue"): 690.0}
    adjustment = frame[frame.subcategory.str.contains("reconciliation adjustment")]
    assert adjustment.amount.tolist() == [-10.0]
    assert frame.amount.sum() == 690.0


def test_crosswalk_category_prefix_and_error():
    mapping = contract.CROSSWALK["rlgf"]["capital"]
    assert normalize.crosswalk_category(
        mapping, "Section E Health and Welfare _ Intangibles") == "health_and_welfare"
    with pytest.raises(SystemExit, match="crosswalk"):
        normalize.crosswalk_category(mapping, "Section Z Unknown")


def test_assemble_orders_columns_per_contract():
    record = {"entity": "STATE OF GEORGIA", "entity_type": "state",
              "fips": "13", "fiscal_year": 2024, "category": "taxes",
              "subcategory": "Income Tax", "amount": 1.0}
    frame = normalize.assemble([record])
    assert list(frame.columns) == contract.NORMALIZED_COLUMNS
