"""Build the normalized cross-level table and the data-contract manifest.

Reads the transform outputs (rlgf_county_finances.parquet and
state_finances.parquet), maps source classifications onto the shared category
vocabulary in pipeline/crosswalk.json, validates the result against the
pandera contract in pipeline/schema.py, and writes:

- data/processed/normalized.parquet   (entity, entity_type, fips, fiscal_year,
  category, subcategory, amount)
- data/processed/state/categories.json  state-level category totals per fiscal
  year and side, plus the basis of each year, for the web frontend
- data/processed/counties/categories.json  per-county category totals per
  fiscal year and side (the county analogue of state/categories.json), for
  the citizen-facing share-of-spending charts
- data/processed/counties/metrics.json  per-county totals and per-capita
  values by fiscal year (population from data/processed/county_population.json,
  July 1 estimate of the fiscal year's calendar year); counties without an
  RLGF filing for a year carry an explicit null — including county-years the
  TED workbook fills with literal zeros, which are non-filings, not $0
  budgets — and the 8 consolidated governments are listed with
  included=false rather than omitted
- data/processed/manifest.json        vintage and coverage per source plus
  reconciliation statistics for the normalized table

Grain: county rows are the RLGF depth-2 classifications; state rows are the
OPB revenue lines and state-funds agency appropriations. Synthetic
"(unallocated)" and "(reconciliation adjustment)" rows keep every entity/year
reconciled to the source's own printed totals — see pipeline/schema.py.

Open Georgia aggregates are covered in the manifest but excluded from the
normalized table: cash-basis vendor payments would double-count the budgetary
expenditures reported by OPB.

Usage: normalize.py (no arguments; reads committed parquet outputs)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import duckdb
import pandas as pd
import pandera.errors

PIPELINE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE_DIR))

import schema as contract  # noqa: E402

ROOT = PIPELINE_DIR.parent
COUNTY_PARQUET = ROOT / "data" / "processed" / "rlgf_county_finances.parquet"
STATE_PARQUET = ROOT / "data" / "processed" / "state_finances.parquet"
NORMALIZED_PARQUET = ROOT / "data" / "processed" / "normalized.parquet"
MANIFEST_FILE = ROOT / "data" / "processed" / "manifest.json"
SOURCE_STATE_FILE = ROOT / "data" / ".source-state.json"
SOURCES_FILE = PIPELINE_DIR / "sources.json"
POPULATION_FILE = ROOT / "data" / "processed" / "county_population.json"
METRICS_FILE = ROOT / "data" / "processed" / "counties" / "metrics.json"
COUNTY_SOURCE = "ted_rlgf_county_workbook"
OPENGA_SOURCE = "open_georgia_poa"
OPB_SOURCE = "opb_governors_budget_report_fy2026"
POPULATION_SOURCES = ["census_county_pop_2010s", "census_county_pop_2020s"]
RLGF_SIDES = {"revenues": "revenue", "operating": "expenditure",
              "capital": "expenditure"}
OPB_REVENUE_SECTIONS = {
    "state_general_fund_receipts", "lottery_for_education",
    "tobacco_settlement_funds", "brain_and_spinal_injury_trust_fund",
    "safe_harbor_for_children_trust_fund", "federal_revenue",
    "guaranteed_revenue_debt_common_reserve_fund_interest",
}
OPB_REVENUE_SUBTOTALS = {
    "Total Net Taxes", "Total Interest Fees and Sales",
    "Net Taxes - Department of Revenue",
    "Interest, Fees, and Sales - Department of Revenue",
    "Interest Fees and Sales - Other Departments",
}
OPB_REVENUE_TOTAL = "Total State Treasury Receipts"
OPB_EXPENDITURE_TOTAL = "TOTAL STATE FUNDS APPROPRIATIONS"


def crosswalk_category(mapping: dict[str, str], classification: str) -> str:
    if classification in mapping:
        return mapping[classification]
    for key in sorted(mapping, key=len, reverse=True):
        if classification.startswith(key):
            return mapping[key]
    raise SystemExit(f"No crosswalk entry for classification {classification!r} — "
                     "add it to pipeline/crosswalk.json.")


def county_row(county: str, fiscal_year: int, category: str, subcategory: str,
               amount: float) -> dict:
    return {"entity": county, "entity_type": "county",
            "fips": contract.COUNTY_FIPS[county], "fiscal_year": int(fiscal_year),
            "category": category, "subcategory": subcategory,
            "amount": round(float(amount), 2)}


def normalize_county_group(county: str, fiscal_year: int, section: str,
                           group: pd.DataFrame) -> tuple[list[dict], float]:
    mapping = contract.CROSSWALK["rlgf"][section]
    records = []
    parents = group[group.depth == 1]
    children = group[group.depth == 2]
    totals = group[group.depth == 0]
    for parent in parents.itertuples():
        below = children[children.path.str.startswith(parent.path + " > ")]
        records += [county_row(county, fiscal_year,
                               crosswalk_category(mapping, row.classification),
                               row.classification, row.amount)
                    for row in below.itertuples()]
        residual = parent.amount - below.amount.sum()
        if below.empty:
            records.append(county_row(
                county, fiscal_year,
                crosswalk_category(mapping, parent.classification),
                parent.classification, parent.amount))
        elif abs(residual) > 0.005:
            records.append(county_row(
                county, fiscal_year,
                crosswalk_category(mapping, parent.classification),
                f"{parent.classification} (unallocated)", residual))
    total = float(totals.amount.iloc[0]) if not totals.empty \
        else float(parents.amount.sum())
    adjustment = total - parents.amount.sum()
    if abs(adjustment) > 0.005 and not totals.empty:
        records.append(county_row(
            county, fiscal_year,
            "other_revenue" if RLGF_SIDES[section] == "revenue" else "other_expenditure",
            f"{totals.classification.iloc[0]} (reconciliation adjustment)",
            adjustment))
    return records, total


def normalize_county(frame: pd.DataFrame) -> tuple[list[dict], dict[tuple, float]]:
    records: list[dict] = []
    expected: dict[tuple, float] = {}
    for (county, fiscal_year, section), group in frame.groupby(
            ["county", "fiscal_year", "section"], sort=True):
        group_records, total = normalize_county_group(
            county, int(fiscal_year), section, group)
        records += group_records
        key = (county, int(fiscal_year), RLGF_SIDES[section])
        expected[key] = expected.get(key, 0.0) + total
    return records, expected


def state_row(fiscal_year: int, category: str, subcategory: str,
              amount: float) -> dict:
    return {"entity": contract.STATE_ENTITY, "entity_type": "state",
            "fips": contract.STATE_FIPS, "fiscal_year": int(fiscal_year),
            "category": category, "subcategory": subcategory,
            "amount": round(float(amount), 2)}


def opb_revenue_category(path: str) -> str:
    for group, category in contract.CROSSWALK["opb"]["revenue_groups"].items():
        if group in path:
            return category
    raise SystemExit(f"No revenue crosswalk group matches path {path!r} — "
                     "add it to pipeline/crosswalk.json.")


def normalize_state(frame: pd.DataFrame) -> tuple[list[dict], dict[tuple, float]]:
    opb = frame[frame.source == OPB_SOURCE]
    records: list[dict] = []
    expected: dict[tuple, float] = {}

    leaves = opb[(opb.category == "revenue")
                 & opb.section.isin(OPB_REVENUE_SECTIONS)
                 & ~opb.classification.isin(OPB_REVENUE_SUBTOTALS)]
    records += [state_row(row.fiscal_year, opb_revenue_category(row.path),
                          row.classification, row.amount)
                for row in leaves.itertuples()]
    totals = opb[opb.classification == OPB_REVENUE_TOTAL]
    for row in totals.itertuples():
        key = (contract.STATE_ENTITY, int(row.fiscal_year), "revenue")
        expected[key] = float(row.amount)
        gap = row.amount - leaves[leaves.fiscal_year == row.fiscal_year].amount.sum()
        if abs(gap) > 0.005:
            records.append(state_row(
                row.fiscal_year, "other_revenue",
                f"{OPB_REVENUE_TOTAL} (reconciliation adjustment)", gap))

    agencies = opb[(opb.section == "state_funds") & (opb.depth == 1)
                   & ~opb.path.str.startswith("Less:")]
    agency_map = contract.CROSSWALK["opb"]["agencies"]
    records += [state_row(row.fiscal_year,
                          crosswalk_category(agency_map, row.classification),
                          row.classification, row.amount)
                for row in agencies.itertuples()]
    totals = opb[(opb.section == "state_funds")
                 & (opb.classification == OPB_EXPENDITURE_TOTAL)]
    for row in totals.itertuples():
        key = (contract.STATE_ENTITY, int(row.fiscal_year), "expenditure")
        expected[key] = float(row.amount)
        gap = row.amount - agencies[agencies.fiscal_year == row.fiscal_year].amount.sum()
        if abs(gap) > 0.005:
            records.append(state_row(
                row.fiscal_year, "other_expenditure",
                f"{OPB_EXPENDITURE_TOTAL} (reconciliation adjustment)", gap))
    return records, expected


def state_categories_document(normalized: pd.DataFrame,
                              state: pd.DataFrame) -> dict:
    state_rows = normalized[normalized.entity_type == "state"]
    sides = state_rows.category.map(contract.side)
    totals = (state_rows.groupby([sides.rename("side"), "category",
                                  "fiscal_year"]).amount.sum().reset_index())
    subtotals = (state_rows.groupby([sides.rename("side"), "category",
                                     "fiscal_year", "subcategory"])
                 .amount.sum())
    subcategories = {
        key: {sub: round(float(amount), 2)
              for (*_, sub), amount in group.items()}
        for key, group in subtotals.groupby(level=[0, 1, 2])
    }
    opb = state[state.source == OPB_SOURCE]
    basis = {
        side_name: {str(int(row.fiscal_year)): row.basis
                    for row in group.drop_duplicates("fiscal_year").itertuples()}
        for side_name, group in opb[opb.section.isin(
            OPB_REVENUE_SECTIONS | {"state_funds"})].assign(
            side=lambda f: f.category.where(f.category == "revenue",
                                            "expenditure")).groupby("side")
    }
    return {
        "entity": contract.STATE_ENTITY,
        "sources": [OPB_SOURCE],
        "basis_by_year": basis,
        "rows": [{"side": row.side, "category": row.category,
                  "fiscal_year": int(row.fiscal_year),
                  "amount": round(float(row.amount), 2),
                  "subcategories": subcategories.get(
                      (row.side, row.category, row.fiscal_year), {})}
                 for row in totals.itertuples()],
    }


def county_slug(county: str) -> str:
    return county.lower().replace(" ", "-")


def county_year_metrics(county: str, fiscal_year: int,
                        expected: dict[tuple, float],
                        populations: dict[str, dict[str, int]]) -> dict | None:
    revenue = expected.get((county, fiscal_year, "revenue"))
    expenditure = expected.get((county, fiscal_year, "expenditure"))
    if not revenue and not expenditure:
        return None
    population = populations.get(contract.COUNTY_FIPS[county], {}).get(str(fiscal_year))
    return {
        "revenue": revenue,
        "expenditure": expenditure,
        "population": population,
        "revenue_per_capita": (
            round(revenue / population, 2)
            if revenue is not None and population else None),
        "expenditure_per_capita": (
            round(expenditure / population, 2)
            if expenditure is not None and population else None),
    }


def county_metrics_document(county_expected: dict[tuple, float],
                            populations: dict[str, dict[str, int]]) -> dict:
    fiscal_years = sorted({key[1] for key in county_expected})
    filed = {key[0] for key in county_expected}
    counties = []
    for county in sorted(contract.COUNTY_FIPS):
        if county in filed:
            counties.append({
                "county": county,
                "fips": contract.COUNTY_FIPS[county],
                "slug": county_slug(county),
                "included": True,
                "years": {str(year): county_year_metrics(
                    county, year, county_expected, populations)
                    for year in fiscal_years},
            })
        else:
            counties.append({
                "county": county,
                "fips": contract.COUNTY_FIPS[county],
                "slug": None,
                "included": False,
                "note": contract.KNOWN_MISSING_COUNTIES.get(
                    county, "no RLGF county-government filings"),
                "years": None,
            })
    return {
        "sources": [COUNTY_SOURCE, *POPULATION_SOURCES],
        "fiscal_years": [int(year) for year in fiscal_years],
        "counties": counties,
    }


def county_categories_document(normalized: pd.DataFrame) -> dict:
    county_rows = normalized[normalized.entity_type == "county"].assign(
        side=lambda f: f.category.map(contract.side))
    grouped = (county_rows.groupby(
        ["entity", "fiscal_year", "side", "category", "subcategory"])
        .amount.sum())
    counties: dict[str, dict] = {}
    for (entity, fiscal_year, side_name, category,
         subcategory), amount in grouped.items():
        slug = county_slug(entity)
        years = counties.setdefault(slug, {"county": entity, "years": {}})["years"]
        year_sides = years.setdefault(str(int(fiscal_year)), {})
        node = year_sides.setdefault(side_name, {}).setdefault(
            category, {"total": 0.0, "subcategories": {}})
        node["total"] = round(node["total"] + float(amount), 2)
        node["subcategories"][subcategory] = round(float(amount), 2)
    return {
        "sources": [COUNTY_SOURCE],
        "fiscal_years": sorted(int(y) for y in county_rows.fiscal_year.unique()),
        "counties": dict(sorted(counties.items())),
    }


def assemble(records: list[dict]) -> pd.DataFrame:
    frame = pd.DataFrame.from_records(records, columns=contract.NORMALIZED_COLUMNS)
    return frame.sort_values(contract.NORMALIZED_COLUMNS[:6]).reset_index(drop=True)


def vintage(source_state: dict, source_id: str) -> dict:
    entry = source_state.get(source_id, {})
    return {"fingerprint": entry.get("fingerprint"),
            "checked_at": entry.get("checked_at")}


def build_manifest(normalized: pd.DataFrame, county: pd.DataFrame,
                   state: pd.DataFrame, expected: dict[tuple, float]) -> dict:
    source_state = json.loads(SOURCE_STATE_FILE.read_text()) \
        if SOURCE_STATE_FILE.exists() else {}
    openga = state[state.source == OPENGA_SOURCE]
    opb = state[state.source == OPB_SOURCE]
    counties_present = sorted(county.county.unique())
    return {
        "sources": {
            COUNTY_SOURCE: {
                "vintage": vintage(source_state, COUNTY_SOURCE),
                "fiscal_years": sorted(int(y) for y in county.fiscal_year.unique()),
                "records": int(len(county)),
                "counties_present": len(counties_present),
                "counties_missing": contract.KNOWN_MISSING_COUNTIES,
            },
            OPENGA_SOURCE: {
                "vintage": vintage(source_state, OPENGA_SOURCE),
                "fiscal_years": sorted(int(y) for y in openga.fiscal_year.unique()),
                "records": int(len(openga)),
                "sections": sorted(openga.section.unique()),
                "organizations": int(openga[openga.depth == 0]
                                     .classification.nunique()),
                "in_normalized_table": False,
                "note": ("cash-basis vendor payments; excluded from the "
                         "normalized table to avoid double-counting OPB "
                         "budgetary expenditures"),
            },
            POPULATION_SOURCES[0]: {
                "vintage": vintage(source_state, POPULATION_SOURCES[0]),
                "note": "county population denominators 2010-2020 (vintage 2020, final)",
            },
            POPULATION_SOURCES[1]: {
                "vintage": vintage(source_state, POPULATION_SOURCES[1]),
                "note": "county population denominators 2020 onward (latest vintage)",
            },
            OPB_SOURCE: {
                "vintage": vintage(source_state, OPB_SOURCE),
                "fiscal_years_by_basis": {
                    basis: sorted(int(y) for y in group.fiscal_year.unique())
                    for basis, group in opb.groupby("basis")},
                "records": int(len(opb)),
                "note": ("the published PDF prints 'Other DOR Interest, Fees, "
                         "and Sales' twice with different amounts; the copy "
                         "excluded from the report's own subtotals surfaces in "
                         "the reconciliation adjustment"),
            },
        },
        "normalized": {
            "records": int(len(normalized)),
            "entities": int(normalized.entity.nunique()),
            "fiscal_years": sorted(int(y) for y in normalized.fiscal_year.unique()),
            "categories": sorted(normalized.category.unique()),
            "tolerance": {"relative": contract.DEFAULT_RELATIVE_TOLERANCE,
                          "absolute": contract.DEFAULT_ABSOLUTE_TOLERANCE},
            "reconciliation": contract.reconciliation_report(normalized, expected),
        },
    }


def main() -> int:
    county = duckdb.sql(f"FROM '{COUNTY_PARQUET}'").df()
    state = duckdb.sql(f"FROM '{STATE_PARQUET}'").df()

    county_records, county_expected = normalize_county(county)
    state_records, state_expected = normalize_state(state)
    normalized = assemble(county_records + state_records)
    expected = {**county_expected, **state_expected}

    try:
        contract.build_schema(expected).validate(normalized, lazy=True)
    except pandera.errors.SchemaErrors as errors:
        print(errors.failure_cases.to_string(), file=sys.stderr)
        raise SystemExit("Normalized table violates the data contract.")

    connection = duckdb.connect()
    connection.register("normalized", normalized)
    connection.execute(
        f"""
        COPY (SELECT * FROM normalized)
        TO '{NORMALIZED_PARQUET}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )
    manifest = build_manifest(normalized, county, state, expected)
    MANIFEST_FILE.write_text(json.dumps(manifest, indent=1) + "\n")
    categories = state_categories_document(normalized, state)
    categories_file = ROOT / "data" / "processed" / "state" / "categories.json"
    categories_file.parent.mkdir(parents=True, exist_ok=True)
    categories_file.write_text(json.dumps(categories, indent=1) + "\n")
    populations = json.loads(POPULATION_FILE.read_text())["populations"]
    metrics = county_metrics_document(county_expected, populations)
    METRICS_FILE.write_text(json.dumps(metrics, indent=1) + "\n")
    county_categories = county_categories_document(normalized)
    (METRICS_FILE.parent / "categories.json").write_text(
        json.dumps(county_categories, indent=1) + "\n")

    report = manifest["normalized"]["reconciliation"]
    print(f"Wrote {len(normalized):,} normalized records "
          f"({normalized.entity.nunique()} entities) to "
          f"{NORMALIZED_PARQUET.relative_to(ROOT)}; "
          f"{report['totals_checked']} totals reconciled, max deviation "
          f"{report['max_relative_deviation']:.6%}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
