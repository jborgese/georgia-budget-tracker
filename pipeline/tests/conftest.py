from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import schema as contract  # noqa: E402


@pytest.fixture
def county_sheet():
    header = ("Classification", "2016", "2017")
    rows = [
        ("Revenues", None, None),
        ("TOTAL REVENUES", 1000, 1100),
        ("     GENERAL REVENUES", 900, 990),
        ("          PART I TAX REVENUES", 600, 660),
        ("               Real Property Taxes, Current Year", 600, 660),
        ("          PART 2 INTERGOVERNMENTAL REVENUES", 300, 330),
        ("     ENTERPRISE FUND REVENUES", 100, 110),
        ("Debt", None, None),
        ("PART XI DEBT OUTSTANDING, ISSUED, RETIRED DURING FISCAL YEAR", None, None),
        ("     Section B GO Bond Debt", None, None),
        ("          GO Bond Debt Beginning Amount Outstanding", 500, 400),
        ("          GO Bond Debt Amount Retired", 100, 100),
        ("          GO Bond Debt Ending Amount Outstanding", 400, 300),
        ("Operating Expenditures", None, None),
        ("TOTAL CURRENT OPERATING EXPENDITURES", 800, None),
        ("     PART V GENERAL GOVERNMENT EXPENDITURES", 800, 0),
        ("Cash And Investments", None, None),
        ("PART XII CASH AND INVESTMENT ASSETS", None, None),
        ("     General Fund Cash", 9999, 9999),
    ]
    return header, rows


@pytest.fixture
def normalized_frame():
    def build(**overrides):
        counties = [name for name in contract.COUNTY_FIPS
                    if name not in contract.KNOWN_MISSING_COUNTIES]
        records = [{
            "entity": county,
            "entity_type": "county",
            "fips": contract.COUNTY_FIPS[county],
            "fiscal_year": 2023,
            "category": "taxes",
            "subcategory": "PART I TAX REVENUES",
            "measure": "flow",
            "amount": 100.0,
        } for county in counties]
        records.append({
            "entity": contract.STATE_ENTITY,
            "entity_type": "state",
            "fips": contract.STATE_FIPS,
            "fiscal_year": 2023,
            "category": "education",
            "subcategory": "Department of Education",
            "measure": "flow",
            "amount": 500.0,
        })
        frame = pd.DataFrame.from_records(
            records, columns=contract.NORMALIZED_COLUMNS)
        for column, value in overrides.items():
            frame.loc[frame.index[-1], column] = value
        return frame

    return build
