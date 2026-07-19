"""Data contract for the normalized cross-level finance table.

The normalized table unifies the RLGF transforms (county, city, consolidated
city-county) and the OPB state transform into one analytic long format:

    entity, entity_type (state|county|city|consolidated), fips, fiscal_year,
    category, subcategory, amount

``category`` values come from the shared vocabulary in
pipeline/crosswalk.json; ``subcategory`` preserves the source classification.
Synthetic rows keep the table reconciled to the source's own printed totals:
"(unallocated)" rows carry a parent line's amount not covered by its children,
and "(reconciliation adjustment)" rows carry the gap between a statement's
grand total and the sum of its lines. Those synthetic rows are the only place
negative amounts are tolerated beyond what the source itself reports.

Entity names alone are ambiguous across levels (the city of DECATUR and
DECATUR county both exist), so reconciliation totals are keyed by
(entity_type, entity, fiscal_year, side).

``fips`` is the county FIPS for counties, the underlying county's FIPS for
consolidated governments (``CONSOLIDATED_COUNTY_FIPS``), and the bare state
prefix "13" for the state and — until the Census place roster lands with the
sub-county denominators work — for cities.

``measure`` distinguishes flows (annual amounts — every revenue and
expenditure row) from stocks (point-in-time balances — debt outstanding at
fiscal year end). RLGF Part XI's beginning-of-year balances are not emitted:
they duplicate the prior year's ending balance and would double-count any
sum over debt_outstanding rows; they feed :func:`debt_identity_report`
instead. Debt rows carry side "debt" and never mix into revenue/expenditure
reconciliation.

Contract rules enforced by :func:`build_schema`:
- every Georgia county (Census roster, pipeline/ga_counties.json) is present
  or explicitly listed in ``KNOWN_MISSING_COUNTIES``;
- when consolidated rows are present, all 8 consolidated governments are;
- per (entity_type, entity, fiscal-year, side), normalized amounts reconcile
  to the source's printed totals within tolerance;
- no impossible negatives: state amounts and local-government tax revenues
  must be non-negative except in synthetic reconciliation rows (debt rows
  are exempt — a few filings report negative balances, kept as filed and
  counted in :func:`debt_identity_report`);
- the stock measure appears exactly on debt_outstanding rows.
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
DEBT_CATEGORIES = set(CROSSWALK["categories"]["debt"])
ALL_CATEGORIES = REVENUE_CATEGORIES | EXPENDITURE_CATEGORIES | DEBT_CATEGORIES
STOCK_CATEGORIES = {"debt_outstanding"}
MEASURES = ("flow", "stock")
STATE_ENTITY = "STATE OF GEORGIA"
STATE_FIPS = "13"
NORMALIZED_COLUMNS = ["entity", "entity_type", "fips", "fiscal_year",
                      "category", "subcategory", "measure", "amount"]
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

CONSOLIDATED_GOVERNMENTS = {
    "ATHENS-CLARKE": "CLARKE",
    "AUGUSTA-RICHMOND": "RICHMOND",
    "COLUMBUS-MUSCOGEE": "MUSCOGEE",
    "CUSSETA-CHATTAHOOCHEE": "CHATTAHOOCHEE",
    "GEORGETOWN-QUITMAN": "QUITMAN",
    "MACON-BIBB": "BIBB",
    "PRESTON-WEBSTER": "WEBSTER",
    "STATENVILLE-ECHOLS": "ECHOLS",
}
CONSOLIDATED_COUNTY_FIPS = {government: COUNTY_FIPS[county]
                            for government, county in CONSOLIDATED_GOVERNMENTS.items()}
LOCAL_ENTITY_TYPES = ("county", "city", "consolidated")


def side(category: str) -> str:
    if category in REVENUE_CATEGORIES:
        return "revenue"
    return "debt" if category in DEBT_CATEGORIES else "expenditure"


def is_synthetic(subcategory: pd.Series) -> pd.Series:
    return subcategory.str.endswith(SYNTHETIC_MARKERS)


def counties_covered(frame: pd.DataFrame) -> bool:
    present = set(frame.loc[frame.entity_type == "county", "entity"])
    unaccounted = set(COUNTY_FIPS) - present - set(KNOWN_MISSING_COUNTIES)
    return not unaccounted


def consolidated_covered(frame: pd.DataFrame) -> bool:
    present = set(frame.loc[frame.entity_type == "consolidated", "entity"])
    return not present or present == set(CONSOLIDATED_GOVERNMENTS)


def fips_consistent(frame: pd.DataFrame) -> pd.Series:
    expected = (frame.entity.map(COUNTY_FIPS)
                .where(frame.entity_type == "county",
                       frame.entity.map(CONSOLIDATED_COUNTY_FIPS))
                .where(frame.entity_type.isin(["county", "consolidated"]),
                       STATE_FIPS))
    return frame.fips == expected


def no_impossible_negatives(frame: pd.DataFrame) -> pd.Series:
    negative = frame.amount < 0
    synthetic = is_synthetic(frame.subcategory)
    state_violation = negative & (frame.entity_type == "state") & ~synthetic
    local_tax_violation = (negative & frame.entity_type.isin(LOCAL_ENTITY_TYPES)
                           & (frame.category == "taxes") & ~synthetic)
    return ~(state_violation | local_tax_violation)


def measure_matches_category(frame: pd.DataFrame) -> pd.Series:
    return (frame.measure == "stock") == frame.category.isin(STOCK_CATEGORIES)


def side_sums(frame: pd.DataFrame) -> pd.Series:
    sides = frame.category.map(side)
    return frame.groupby([frame.entity_type, frame.entity, frame.fiscal_year,
                          sides], sort=False).amount.sum()


def reconciles(frame: pd.DataFrame, expected_totals: dict[tuple, float],
               relative_tolerance: float, absolute_tolerance: float) -> bool:
    sums = side_sums(frame)
    for key, expected in expected_totals.items():
        actual = sums.get(key, 0.0)
        allowed = max(absolute_tolerance, relative_tolerance * abs(expected))
        if abs(actual - expected) > allowed:
            return False
    return True


def reconciliation_report(frame: pd.DataFrame,
                          expected_totals: dict[tuple, float]) -> dict:
    sums = side_sums(frame)
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


DEBT_MEASURE_SUFFIXES = {
    "Beginning Amount Outstanding": "beginning",
    "New Issued Amount": "issued",
    "Amount Retired": "retired",
    "Ending Amount Outstanding": "ending",
}


def debt_identity_report(debt_frame: pd.DataFrame,
                         absolute_tolerance: float = 5.0) -> dict:
    """Check beginning + issued - retired = ending per entity/year/debt type.

    Part XI prints no total lines, so this internal identity is the debt
    analogue of source-total reconciliation. Violations describe the filing
    itself and are reported, not gated on.
    """
    rows = debt_frame[debt_frame.depth == 2].copy()
    measures = pd.Series("", index=rows.index)
    debt_type = rows.classification.copy()
    for suffix, name in DEBT_MEASURE_SUFFIXES.items():
        matches = rows.classification.str.endswith(suffix)
        measures[matches] = name
        debt_type[matches] = rows.classification[matches].str.removesuffix(
            suffix).str.strip()
    rows = rows.assign(measure=measures, debt_type=debt_type)
    rows = rows[rows.measure != ""]
    pivot = rows.pivot_table(index=["entity", "fiscal_year", "debt_type"],
                             columns="measure", values="amount",
                             aggfunc="sum", fill_value=0.0)
    for column in DEBT_MEASURE_SUFFIXES.values():
        if column not in pivot.columns:
            pivot[column] = 0.0
    deviation = (pivot.beginning + pivot.issued - pivot.retired
                 - pivot.ending).abs()
    filed = pivot[(pivot[list(DEBT_MEASURE_SUFFIXES.values())] != 0)
                  .any(axis=1)]
    filed_deviation = deviation.loc[filed.index]
    return {
        "identities_checked": int(len(filed)),
        "violations": int((filed_deviation > absolute_tolerance).sum()),
        "max_absolute_deviation": round(float(filed_deviation.max()), 2)
        if len(filed_deviation) else 0.0,
        "negative_amount_rows": int((debt_frame.amount < 0).sum()),
    }


def build_schema(expected_totals: dict[tuple, float] | None = None,
                 relative_tolerance: float = DEFAULT_RELATIVE_TOLERANCE,
                 absolute_tolerance: float = DEFAULT_ABSOLUTE_TOLERANCE,
                 ) -> pa.DataFrameSchema:
    checks = [
        pa.Check(counties_covered, name="all_counties_present_or_flagged",
                 error="counties missing without a KNOWN_MISSING_COUNTIES entry"),
        pa.Check(consolidated_covered, name="all_consolidated_present",
                 error="consolidated rows present but not all 8 governments"),
        pa.Check(fips_consistent, name="fips_matches_roster",
                 error="fips does not match the Census roster for the entity"),
        pa.Check(no_impossible_negatives, name="no_impossible_negatives",
                 error="negative amount where the contract forbids it"),
        pa.Check(measure_matches_category, name="measure_matches_category",
                 error="stock measure is reserved for debt_outstanding"),
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
            "entity_type": pa.Column(str, pa.Check.isin(
                ["state", *LOCAL_ENTITY_TYPES])),
            "fips": pa.Column(str, pa.Check.str_matches(r"^13(\d{3})?$")),
            "fiscal_year": pa.Column(int, pa.Check.in_range(1990, 2100)),
            "category": pa.Column(str, pa.Check.isin(sorted(ALL_CATEGORIES))),
            "subcategory": pa.Column(str, pa.Check.str_length(min_value=1)),
            "measure": pa.Column(str, pa.Check.isin(list(MEASURES))),
            "amount": pa.Column(float, pa.Check(lambda s: s.notna() & (s.abs() < 1e12),
                                                element_wise=False,
                                                name="amount_finite")),
        },
        checks=checks,
        ordered=True,
        strict=True,
    )
