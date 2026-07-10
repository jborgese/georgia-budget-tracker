"""Data contract for the normalized cross-level finance table.

The normalized table unifies the RLGF county transform and the OPB state
transform into one analytic long format:

    entity, entity_type (state|county), fips, fiscal_year, category,
    subcategory, amount

``category`` values come from the shared vocabulary in
pipeline/crosswalk.json; ``subcategory`` preserves the source classification.
Synthetic rows keep the table reconciled to the source's own printed totals:
"(unallocated)" rows carry a parent line's amount not covered by its children,
and "(reconciliation adjustment)" rows carry the gap between a statement's
grand total and the sum of its lines. Those synthetic rows are the only place
negative amounts are tolerated beyond what the source itself reports.

Contract rules enforced by :func:`build_schema`:
- every Georgia county (Census roster, pipeline/ga_counties.json) is present
  or explicitly listed in ``KNOWN_MISSING_COUNTIES``;
- per entity/fiscal-year/side, normalized amounts reconcile to the source's
  printed totals within tolerance;
- no impossible negatives: state amounts and county tax revenues must be
  non-negative except in synthetic reconciliation rows.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pandera.pandas as pa

PIPELINE_DIR = Path(__file__).resolve().parent
COUNTY_FIPS: dict[str, str] = json.loads(
    (PIPELINE_DIR / "ga_counties.json").read_text())
CROSSWALK: dict = json.loads((PIPELINE_DIR / "crosswalk.json").read_text())
REVENUE_CATEGORIES = set(CROSSWALK["categories"]["revenue"])
EXPENDITURE_CATEGORIES = set(CROSSWALK["categories"]["expenditure"])
ALL_CATEGORIES = REVENUE_CATEGORIES | EXPENDITURE_CATEGORIES
STATE_ENTITY = "STATE OF GEORGIA"
STATE_FIPS = "13"
NORMALIZED_COLUMNS = ["entity", "entity_type", "fips", "fiscal_year",
                      "category", "subcategory", "amount"]
DEFAULT_RELATIVE_TOLERANCE = 0.01
DEFAULT_ABSOLUTE_TOLERANCE = 5.0
SYNTHETIC_MARKERS = ("(unallocated)", "(reconciliation adjustment)")

KNOWN_MISSING_COUNTIES = {
    "BIBB": "Macon-Bibb consolidated government; separate TED government type",
    "CHATTAHOOCHEE": "Cusseta-Chattahoochee consolidated government; separate TED government type",
    "CLARKE": "Athens-Clarke unified government; separate TED government type",
    "ECHOLS": "Statenville-Echols consolidated government; separate TED government type",
    "MUSCOGEE": "Columbus-Muscogee consolidated government; separate TED government type",
    "QUITMAN": "Georgetown-Quitman unified government; separate TED government type",
    "RICHMOND": "Augusta-Richmond consolidated government; separate TED government type",
    "WEBSTER": "Webster County unified government; separate TED government type",
}


def side(category: str) -> str:
    return "revenue" if category in REVENUE_CATEGORIES else "expenditure"


def is_synthetic(subcategory: pd.Series) -> pd.Series:
    return subcategory.str.endswith(SYNTHETIC_MARKERS)


def counties_covered(frame: pd.DataFrame) -> bool:
    present = set(frame.loc[frame.entity_type == "county", "entity"])
    unaccounted = set(COUNTY_FIPS) - present - set(KNOWN_MISSING_COUNTIES)
    return not unaccounted


def fips_consistent(frame: pd.DataFrame) -> pd.Series:
    expected = frame.entity.map(COUNTY_FIPS).where(
        frame.entity_type == "county", STATE_FIPS)
    return frame.fips == expected


def no_impossible_negatives(frame: pd.DataFrame) -> pd.Series:
    negative = frame.amount < 0
    synthetic = is_synthetic(frame.subcategory)
    state_violation = negative & (frame.entity_type == "state") & ~synthetic
    county_tax_violation = (negative & (frame.entity_type == "county")
                            & (frame.category == "taxes") & ~synthetic)
    return ~(state_violation | county_tax_violation)


def reconciles(frame: pd.DataFrame, expected_totals: dict[tuple, float],
               relative_tolerance: float, absolute_tolerance: float) -> bool:
    sides = frame.category.map(side)
    sums = frame.groupby([frame.entity, frame.fiscal_year, sides],
                         sort=False).amount.sum()
    for key, expected in expected_totals.items():
        actual = sums.get(key, 0.0)
        allowed = max(absolute_tolerance, relative_tolerance * abs(expected))
        if abs(actual - expected) > allowed:
            return False
    return True


def reconciliation_report(frame: pd.DataFrame,
                          expected_totals: dict[tuple, float]) -> dict:
    sides = frame.category.map(side)
    sums = frame.groupby([frame.entity, frame.fiscal_year, sides],
                         sort=False).amount.sum()
    deviations = [abs(sums.get(key, 0.0) - expected)
                  for key, expected in expected_totals.items()]
    relative = [dev / abs(expected) if expected else 0.0
                for dev, (_, expected) in zip(deviations,
                                              expected_totals.items())]
    synthetic = frame[is_synthetic(frame.subcategory)]
    return {
        "totals_checked": len(expected_totals),
        "max_absolute_deviation": round(max(deviations), 2) if deviations else 0.0,
        "max_relative_deviation": round(max(relative), 8) if relative else 0.0,
        "synthetic_rows": int(len(synthetic)),
        "synthetic_amount_absolute_sum": round(float(synthetic.amount.abs().sum()), 2),
    }


def build_schema(expected_totals: dict[tuple, float] | None = None,
                 relative_tolerance: float = DEFAULT_RELATIVE_TOLERANCE,
                 absolute_tolerance: float = DEFAULT_ABSOLUTE_TOLERANCE,
                 ) -> pa.DataFrameSchema:
    checks = [
        pa.Check(counties_covered, name="all_counties_present_or_flagged",
                 error="counties missing without a KNOWN_MISSING_COUNTIES entry"),
        pa.Check(fips_consistent, name="fips_matches_roster",
                 error="fips does not match the Census roster for the entity"),
        pa.Check(no_impossible_negatives, name="no_impossible_negatives",
                 error="negative amount where the contract forbids it"),
    ]
    if expected_totals is not None:
        checks.append(pa.Check(
            lambda df: reconciles(df, expected_totals,
                                  relative_tolerance, absolute_tolerance),
            name="category_totals_reconcile",
            error="normalized totals do not reconcile with source totals"))
    return pa.DataFrameSchema(
        columns={
            "entity": pa.Column(str, pa.Check.str_length(min_value=1)),
            "entity_type": pa.Column(str, pa.Check.isin(["state", "county"])),
            "fips": pa.Column(str, pa.Check.str_matches(r"^13(\d{3})?$")),
            "fiscal_year": pa.Column(int, pa.Check.in_range(1990, 2100)),
            "category": pa.Column(str, pa.Check.isin(sorted(ALL_CATEGORIES))),
            "subcategory": pa.Column(str, pa.Check.str_length(min_value=1)),
            "amount": pa.Column(float, pa.Check(lambda s: s.notna() & (s.abs() < 1e12),
                                                element_wise=False,
                                                name="amount_finite")),
        },
        checks=checks,
        ordered=True,
        strict=True,
    )
