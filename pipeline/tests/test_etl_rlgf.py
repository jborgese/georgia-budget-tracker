from __future__ import annotations

import etl_rlgf


def records_for(county, sheet):
    header, rows = sheet
    return etl_rlgf.sheet_records(county, header, rows)


def test_only_target_sections_are_extracted(county_sheet):
    records = records_for("APPLING", county_sheet)
    sections = {record["section"] for record in records}
    assert sections == {"revenues", "operating", "debt"}
    assert not any("Cash" in record["classification"] for record in records)


def test_debt_section_extracted_with_category(county_sheet):
    records = records_for("APPLING", county_sheet)
    debt = [r for r in records if r["section"] == "debt"]
    assert all(r["category"] == "debt" for r in debt)
    ending = next(r for r in debt
                  if r["classification"] == "GO Bond Debt Ending Amount Outstanding"
                  and r["fiscal_year"] == 2016)
    assert ending["amount"] == 400
    assert ending["depth"] == 2


def test_hierarchy_depth_and_path(county_sheet):
    records = records_for("APPLING", county_sheet)
    leaf = next(r for r in records
                if r["classification"] == "Real Property Taxes, Current Year"
                and r["fiscal_year"] == 2016)
    assert leaf["depth"] == 3
    assert leaf["path"] == ("TOTAL REVENUES > GENERAL REVENUES > "
                            "PART I TAX REVENUES > "
                            "Real Property Taxes, Current Year")
    assert leaf["amount"] == 600


def test_zero_amounts_kept_and_missing_dropped(county_sheet):
    records = records_for("APPLING", county_sheet)
    part_v = [r for r in records
              if r["classification"] == "PART V GENERAL GOVERNMENT EXPENDITURES"]
    assert {r["fiscal_year"]: r["amount"] for r in part_v} == {2016: 800, 2017: 0}
    operating_total = [r for r in records
                       if r["classification"] == "TOTAL CURRENT OPERATING EXPENDITURES"]
    assert {r["fiscal_year"] for r in operating_total} == {2016}


def test_every_record_carries_county_and_category(county_sheet):
    records = records_for("BARTOW", county_sheet)
    assert records
    assert all(record["county"] == "BARTOW" for record in records)
    assert {record["category"] for record in records} == {"revenue", "expenditure",
                                                          "debt"}


def test_entity_column_is_parameterized(county_sheet):
    header, rows = county_sheet
    records = etl_rlgf.sheet_records("ATLANTA", header, rows,
                                     entity_column="entity")
    assert records
    assert all(record["entity"] == "ATLANTA" for record in records)
    assert all("county" not in record for record in records)


def test_entity_slug():
    assert etl_rlgf.entity_slug("BEN HILL") == "ben-hill"
    assert etl_rlgf.entity_slug("DEKALB") == "dekalb"
    assert etl_rlgf.entity_slug("MACON-BIBB") == "macon-bibb"
    assert etl_rlgf.entity_slug("McRAE-HELENA") == "mcrae-helena"


def test_canonical_entity_strips_consolidated_suffix():
    assert etl_rlgf.canonical_entity("Macon-Bibb County") == "MACON-BIBB"
    assert etl_rlgf.canonical_entity("ATHENS-CLARKE") == "ATHENS-CLARKE"
    assert etl_rlgf.canonical_entity(" STATESBORO ") == "STATESBORO"


def test_parse_args_selects_type_and_keeps_path_compatibility():
    county = etl_rlgf.GOVERNMENT_TYPES["county"]
    city = etl_rlgf.GOVERNMENT_TYPES["city"]
    assert etl_rlgf.parse_args([]) == (county, None)
    assert etl_rlgf.parse_args(["workbook.xlsx"]) == (county, "workbook.xlsx")
    assert etl_rlgf.parse_args(["city"]) == (city, None)
    assert etl_rlgf.parse_args(["city", "workbook.xlsx"]) == (city, "workbook.xlsx")
