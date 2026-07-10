from __future__ import annotations

import etl_rlgf


def records_for(county, sheet):
    header, rows = sheet
    return etl_rlgf.sheet_records(county, header, rows)


def test_only_target_sections_are_extracted(county_sheet):
    records = records_for("APPLING", county_sheet)
    sections = {record["section"] for record in records}
    assert sections == {"revenues", "operating"}
    assert not any("DEBT" in record["classification"] for record in records)


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
    assert {record["category"] for record in records} == {"revenue", "expenditure"}


def test_county_slug():
    assert etl_rlgf.county_slug("BEN HILL") == "ben-hill"
    assert etl_rlgf.county_slug("DEKALB") == "dekalb"
