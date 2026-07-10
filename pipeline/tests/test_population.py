from __future__ import annotations

import etl_population
import normalize


CSV_TEXT = (
    "SUMLEV,STATE,COUNTY,STNAME,CTYNAME,POPESTIMATE2020,POPESTIMATE2021\n"
    "040,13,000,Georgia,Georgia,10711908,10788029\n"
    "050,13,001,Georgia,Appling County,18378,18425\n"
    "050,01,001,Alabama,Autauga County,58805,59095\n"
)


def test_georgia_populations_filters_state_and_sumlev():
    populations = etl_population.georgia_populations(CSV_TEXT)
    assert populations == {"13001": {"2020": 18378, "2021": 18425}}


def test_merge_vintages_prefers_newer():
    older = {"13001": {"2019": 18386, "2020": 18400}}
    newer = {"13001": {"2020": 18378, "2021": 18425}}
    merged = etl_population.merge_vintages(older, newer)
    assert merged == {"13001": {"2019": 18386, "2020": 18378, "2021": 18425}}


def test_county_metrics_document_explicit_missing_years():
    expected = {
        ("APPLING", 2022, "revenue"): 1000.0,
        ("APPLING", 2022, "expenditure"): 800.0,
        ("APPLING", 2023, "revenue"): 1100.0,
        ("BACON", 2022, "revenue"): 500.0,
    }
    populations = {"13001": {"2022": 100, "2023": 110}, "13005": {"2022": 50}}
    document = normalize.county_metrics_document(expected, populations)
    assert document["fiscal_years"] == [2022, 2023]
    assert len(document["counties"]) == 159

    appling = next(c for c in document["counties"] if c["county"] == "APPLING")
    assert appling["years"]["2022"] == {
        "revenue": 1000.0, "expenditure": 800.0, "population": 100,
        "revenue_per_capita": 10.0, "expenditure_per_capita": 8.0}
    assert appling["years"]["2023"]["expenditure"] is None

    bacon = next(c for c in document["counties"] if c["county"] == "BACON")
    assert bacon["years"]["2023"] is None

    clarke = next(c for c in document["counties"] if c["county"] == "CLARKE")
    assert clarke["included"] is False and clarke["years"] is None
    assert "consolidated" in clarke["note"] or "unified" in clarke["note"]


def test_all_zero_year_is_treated_as_missing():
    expected = {
        ("APPLING", 2022, "revenue"): 0.0,
        ("APPLING", 2022, "expenditure"): 0.0,
        ("APPLING", 2023, "revenue"): 1100.0,
    }
    document = normalize.county_metrics_document(expected, {"13001": {}})
    appling = next(c for c in document["counties"] if c["county"] == "APPLING")
    assert appling["years"]["2022"] is None
    assert appling["years"]["2023"]["revenue"] == 1100.0
