from __future__ import annotations

import openpyxl
import pandas as pd
import pytest

import etl_schools


def test_display_name_expands_and_cases():
    assert (etl_schools.display_name("FULTON CO SCHOOL DIST")
            == "Fulton County School District")
    assert (etl_schools.display_name("MCDUFFIE COUNTY SCHOOL DISTRICT")
            == "McDuffie County School District")
    assert (etl_schools.display_name("DEKALB CO SCHOOL DIST")
            == "DeKalb County School District")
    assert (etl_schools.display_name("MARIETTA IND SCH DIST")
            == "Marietta Independent School District")


def test_district_slug():
    assert (etl_schools.district_slug("FULTON CO SCHOOL DIST")
            == "fulton-county-school-district")


def test_canonical_name_prefers_longest():
    names = pd.Series(["FULTON CO SCHOOL DIST",
                       "FULTON COUNTY SCHOOL DISTRICT"])
    assert etl_schools.canonical_name(names) == "FULTON COUNTY SCHOOL DISTRICT"


def test_per_pupil_guards_zero_enrollment():
    assert etl_schools.per_pupil(1000, 0) is None
    assert etl_schools.per_pupil(1000, 4) == 250.0


def workbook(tmp_path, header, rows):
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.append(header)
    for row in rows:
        sheet.append(row)
    path = tmp_path / "elsec.xlsx"
    book.save(path)
    return path


KEY_CODES = ("NAME", "CONUM", "NCESID", "V33")


def money_codes():
    return [codes[0] for codes in etl_schools.F33_FIELDS.values()
            if codes[0] not in KEY_CODES]


def f33_row(fipst, schlev, name, values):
    return [fipst, schlev, name, "13121", "1302280", 100, *values]


def f33_header(county_code="CONUM"):
    return ["FIPST", "SCHLEV", "NAME", county_code, "NCESID", "V33",
            *money_codes()]


def test_parse_year_filters_and_scales(tmp_path):
    money_columns = len(money_codes())
    path = workbook(tmp_path, f33_header(), [
        f33_row("13", "03", "FULTON CO SCHOOL DIST", [7] * money_columns),
        f33_row("13", "07", "STATE CHARTER FACILITY", [1] * money_columns),
        f33_row("01", "03", "AUTAUGA COUNTY", [1] * money_columns),
    ])
    frame = etl_schools.parse_year(path, 2024)
    assert len(frame) == 1
    row = frame.iloc[0]
    assert row["name"] == "FULTON CO SCHOOL DIST"
    assert row.county_fips == "13121"
    assert row.enrollment == 100
    assert row.revenue_total == 7000
    assert row.fiscal_year == 2024


def test_parse_year_accepts_census_state_code_vintage(tmp_path):
    money_columns = len(money_codes())
    header = ["STATE", *f33_header()[1:]]
    path = workbook(tmp_path, header, [
        f33_row(11, 3, "FULTON COUNTY SCHOOL DISTRICT", [7] * money_columns),
        f33_row(1, 3, "AUTAUGA COUNTY", [1] * money_columns),
    ])
    frame = etl_schools.parse_year(path, 2016)
    assert list(frame["name"]) == ["FULTON COUNTY SCHOOL DISTRICT"]


def test_parse_year_accepts_fips_county_column_vintage(tmp_path):
    money_columns = len(money_codes())
    header = ["STATE", *f33_header(county_code="FIPS")[1:]]
    path = workbook(tmp_path, header, [
        f33_row(11, 3, "FULTON CO SCH DIST", [7] * money_columns),
    ])
    frame = etl_schools.parse_year(path, 1995)
    assert frame.iloc[0].county_fips == "13121"


def test_parse_year_fails_loudly_on_missing_columns(tmp_path):
    path = workbook(tmp_path, ["FIPST", "SCHLEV", "NAME"], [])
    with pytest.raises(SystemExit, match="F-33 columns"):
        etl_schools.parse_year(path, 2024)


def test_combine_rejects_slug_collisions():
    def district(ncesid, name):
        return {"ncesid": ncesid, "name": name, "county_fips": "13121",
                "fiscal_year": 2024}

    frames = [pd.DataFrame.from_records([
        district("1", "FULTON CO SCHOOL DIST"),
        district("2", "FULTON COUNTY SCHOOL DISTRICT"),
    ])]
    with pytest.raises(SystemExit, match="collision"):
        etl_schools.combine(frames)