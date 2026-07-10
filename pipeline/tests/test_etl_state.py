from __future__ import annotations

import pytest

import etl_state


def word(text, x0, x1, top, fontname="Arial"):
    return {"text": text, "x0": x0, "x1": x1, "top": top, "fontname": fontname}


def test_parse_amount_handles_currency_commas_and_negatives():
    assert etl_state.parse_amount("$1,234,567") == 1234567
    assert etl_state.parse_amount("(2,500)") == -2500
    assert etl_state.parse_amount("-") is None
    assert etl_state.parse_amount("") is None


def test_cluster_rows_groups_by_vertical_tolerance():
    words = [word("a", 10, 20, 100.0), word("b", 30, 40, 101.5),
             word("c", 10, 20, 110.0)]
    rows = etl_state.cluster_rows(words)
    assert [[w["text"] for w in row] for row in rows] == [["a", "b"], ["c"]]


def test_assign_amounts_maps_sparse_rows_by_right_edge():
    columns = [(2022, 272.0), (2023, 347.0), (2024, 422.0)]
    amounts = [word("378,280", 264, 290, 50.0), word("230,360", 414, 440, 50.0)]
    assert etl_state.assign_amounts(amounts, columns) == {2022: 378280, 2024: 230360}


def test_column_basis_marks_amended_budget_years():
    columns = [(2023, 100.0), (2024, 200.0), (2025, 300.0), (2026, 400.0)]
    rows = [
        [word("FY", 80, 95, 10.0), word("2023", 96, 100, 10.0)],
        [word("Expenditures", 60, 100, 20.0), word("Expenditures", 160, 200, 20.0),
         word("Budget", 270, 300, 20.0), word("Budget", 370, 400, 20.0)],
        [word("Amended", 270, 300, 5.0)],
    ]
    basis = etl_state.column_basis(rows, columns, "budget")
    assert basis == {2023: "actual", 2024: "actual",
                     2025: "amended_budget", 2026: "budget"}


def test_year_columns_requires_header():
    with pytest.raises(SystemExit):
        etl_state.year_columns([[word("no", 0, 10, 0.0)]])


def test_openga_records_aggregates_organizations():
    csv_text = (
        '"Organization","Vendor Name","Total Payments","Total Payment Amount"\n'
        '"AGENCY A","VENDOR 1","2","100.10"\n'
        '"AGENCY A","VENDOR 2","1","0.90"\n'
        '"AGENCY B","VENDOR 1","1","50.00"\n'
    )
    records = etl_state.openga_records(
        "payments", etl_state.OPENGA_APPS["payments"], 2025, csv_text)
    by_org = {r["classification"]: r["amount"] for r in records}
    assert by_org == {"AGENCY A": 101.0, "AGENCY B": 50.0}
    assert all(r["basis"] == "actual" and r["category"] == "expenditure"
               for r in records)


def test_openga_records_professional_services_detail():
    csv_text = (
        '"Organization","Vendor Name","Amount","Description"\n'
        '"AGENCY A","VENDOR 1","10.00","LEGAL"\n'
        '"AGENCY A","VENDOR 2","5.00","LEGAL"\n'
        '"AGENCY A","VENDOR 3","1.25","AUDIT"\n'
    )
    records = etl_state.openga_records(
        "professional_services",
        etl_state.OPENGA_APPS["professional_services"], 2024, csv_text)
    org_rows = [r for r in records if r["depth"] == 0]
    detail = {r["path"]: r["amount"] for r in records if r["depth"] == 1}
    assert [(r["classification"], r["amount"]) for r in org_rows] == [("AGENCY A", 16.25)]
    assert detail == {"AGENCY A > LEGAL": 15.0, "AGENCY A > AUDIT": 1.25}
