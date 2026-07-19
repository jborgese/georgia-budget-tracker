from __future__ import annotations

import openpyxl
import pandas as pd
import pytest

import etl_digest


def test_canonical_county_variants():
    assert etl_digest.canonical_county("APPLING") == "APPLING"
    assert etl_digest.canonical_county("CLINCH COUNTY") == "CLINCH"
    assert etl_digest.canonical_county("JONES SO") == "JONES"
    assert etl_digest.canonical_county("BENHIL SO") == "BEN HILL"
    assert etl_digest.canonical_county("CHARLT") == "CHARLTON"
    assert etl_digest.canonical_county("MCINTO") == "MCINTOSH"
    with pytest.raises(SystemExit, match="roster"):
        etl_digest.canonical_county("ZZZ")


def test_number_preserves_null_and_precision():
    assert etl_digest.number(None) is None
    assert etl_digest.number(0) == 0
    assert etl_digest.number(12.2029999) == 12.203
    assert etl_digest.number(1299602748.0) == 1299602748


def digest_workbook(tmp_path, rows):
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.append(list(etl_digest.DIGEST_COLUMNS))
    for row in rows:
        sheet.append(row)
    path = tmp_path / "digest.xlsx"
    book.save(path)
    return path


def digest_row(county, district, code, millage_mo, tax_year=2024):
    return [county, district, code, tax_year, 100, 1000, 1100,
            millage_mo, 0, 5000, 0]


def full_roster_rows(tax_year=2024):
    return [digest_row(county, f"{county} COUNTY", 0, None, tax_year)
            for county in sorted(etl_digest.COUNTY_ROSTER)]


def test_parse_year_preserves_null_millage(tmp_path):
    rows = full_roster_rows() + [
        digest_row("APPLING", "SCHOOL", 2, 12.203),
        digest_row("APPLING", "COUNTY FIRE DIST", 20, None),
    ]
    path = digest_workbook(tmp_path, rows)
    frame = etl_digest.parse_year(path, 2024)
    fire = frame[(frame.county == "APPLING")
                 & (frame.district == "COUNTY FIRE DIST")]
    assert etl_digest.number(fire.millage_mo.iloc[0]) is None
    school = frame[(frame.county == "APPLING") & (frame.district == "SCHOOL")]
    assert school.millage_mo.iloc[0] == 12.203


def test_parse_year_rejects_wrong_year_and_duplicates(tmp_path):
    path = digest_workbook(tmp_path, full_roster_rows(tax_year=2023))
    with pytest.raises(SystemExit, match="tax years"):
        etl_digest.parse_year(path, 2024)
    rows = full_roster_rows() + [
        digest_row("APPLING", "SCHOOL", 2, 12.0),
        digest_row("APPLING SO", "SCHOOL", 2, 12.0),
    ]
    path = digest_workbook(tmp_path, rows)
    with pytest.raises(SystemExit, match="duplicate"):
        etl_digest.parse_year(path, 2024)


def test_county_entry_splits_aggregate_from_districts():
    frame = pd.DataFrame.from_records([
        {"county": "APPLING", "district": "APPLING COUNTY", "district_code": 0,
         "tax_year": 2024, "parcels": 12426, "assessed_mo": 1299602748,
         "assessed_bond": 1364092898, "millage_mo": None, "millage_bond": None,
         "tax_mo": None, "tax_bond": None},
        {"county": "APPLING", "district": "SCHOOL", "district_code": 2,
         "tax_year": 2024, "parcels": None, "assessed_mo": None,
         "assessed_bond": None, "millage_mo": 12.203, "millage_bond": 0,
         "tax_mo": 12104267.26, "tax_bond": 0},
    ])
    entry = etl_digest.county_entry(frame)
    assert entry["county_total"]["2024"]["assessed_mo"] == 1299602748
    assert len(entry["districts"]) == 1
    school = entry["districts"][0]
    assert school["district"] == "SCHOOL"
    assert school["years"]["2024"]["millage_mo"] == 12.203