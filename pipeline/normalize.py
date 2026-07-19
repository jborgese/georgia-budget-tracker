"""Build the normalized cross-level table and the data-contract manifest.

Reads the transform outputs (rlgf_county_finances.parquet,
rlgf_city_finances.parquet, rlgf_consolidated_finances.parquet, and
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
- data/processed/cities/categories.json and
  data/processed/consolidated/categories.json  the same category totals for
  the city and consolidated-government levels (generic ``entities`` naming)
- data/processed/counties/metrics.json  per-county totals and per-capita
  values by fiscal year (population from data/processed/county_population.json,
  July 1 estimate of the fiscal year's calendar year); counties without an
  RLGF filing for a year carry an explicit null — including county-years the
  TED workbook fills with literal zeros, which are non-filings, not $0
  budgets — and the 8 consolidated governments are listed with
  included=false rather than omitted (their finances live under the
  consolidated entity type and mix county and municipal functions, so they
  are not county-comparable)
- data/processed/manifest.json        vintage and coverage per source plus
  reconciliation statistics for the normalized table

Grain: local-government rows (county, city, consolidated) are the RLGF
depth-2 classifications; state rows are the OPB revenue lines and state-funds
agency appropriations. Synthetic "(unallocated)" and "(reconciliation
adjustment)" rows keep every entity/year reconciled to the source's own
printed totals — see pipeline/schema.py. Reconciliation keys carry the
entity_type because city and county names collide (DECATUR).

Open Georgia aggregates are covered in the manifest but excluded from the
normalized table: cash-basis vendor payments would double-count the budgetary
expenditures reported by OPB.

Usage: normalize.py (no arguments; reads committed parquet outputs)
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import duckdb
import pandas as pd
import pandera.errors

PIPELINE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE_DIR))

import schema as contract  # noqa: E402

ROOT = PIPELINE_DIR.parent
SCHOOL_PARQUET = ROOT / "data" / "processed" / "school_finances.parquet"
COUNTY_PARQUET = ROOT / "data" / "processed" / "rlgf_county_finances.parquet"
CITY_PARQUET = ROOT / "data" / "processed" / "rlgf_city_finances.parquet"
CONSOLIDATED_PARQUET = (ROOT / "data" / "processed"
                        / "rlgf_consolidated_finances.parquet")
STATE_PARQUET = ROOT / "data" / "processed" / "state_finances.parquet"
NORMALIZED_PARQUET = ROOT / "data" / "processed" / "normalized.parquet"
MANIFEST_FILE = ROOT / "data" / "processed" / "manifest.json"
SOURCE_STATE_FILE = ROOT / "data" / ".source-state.json"
SOURCES_FILE = PIPELINE_DIR / "sources.json"
POPULATION_FILE = ROOT / "data" / "processed" / "county_population.json"
CITY_POPULATION_FILE = ROOT / "data" / "processed" / "city_population.json"
METRICS_FILE = ROOT / "data" / "processed" / "counties" / "metrics.json"
COUNTY_SOURCE = "ted_rlgf_county_workbook"
CITY_SOURCE = "ted_rlgf_city_workbook"
CONSOLIDATED_SOURCE = "ted_rlgf_consolidated_workbook"
OPENGA_SOURCE = "open_georgia_poa"
OPB_SOURCE = "opb_governors_budget_report_fy2026"
POPULATION_SOURCES = ["census_county_pop_2010s", "census_county_pop_2020s"]
PLACE_POPULATION_SOURCE = "census_place_pop_2020s"
PLACE_NAME_ALIASES = {
    "DESOTO": "DE SOTO",
    "DUPONT": "DU PONT",
    "EDGEHILL": "EDGE HILL",
    "PINELAKE": "PINE LAKE",
    "SOUTH FULTON CITY": "SOUTH FULTON",
    "STONECREST CITY": "STONECREST",
    "VIDETTE TOWN": "VIDETTE",
}
RLGF_SIDES = {"revenues": "revenue", "operating": "expenditure",
              "capital": "expenditure"}
RLGF_LEVELS = {
    "county": {"source": COUNTY_SOURCE, "parquet": COUNTY_PARQUET,
               "entity_column": "county",
               "fips": lambda entity: contract.COUNTY_FIPS[entity]},
    "city": {"source": CITY_SOURCE, "parquet": CITY_PARQUET,
             "entity_column": "entity",
             "fips": lambda entity: contract.STATE_FIPS},
    "consolidated": {"source": CONSOLIDATED_SOURCE,
                     "parquet": CONSOLIDATED_PARQUET,
                     "entity_column": "entity",
                     "fips": lambda entity:
                         contract.CONSOLIDATED_COUNTY_FIPS[entity]},
}
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


def local_row(entity_type: str, entity: str, fips: str, fiscal_year: int,
              category: str, subcategory: str, amount: float,
              measure: str = "flow") -> dict:
    return {"entity": entity, "entity_type": entity_type,
            "fips": fips, "fiscal_year": int(fiscal_year),
            "category": category, "subcategory": subcategory,
            "measure": measure, "amount": round(float(amount), 2)}


def normalize_rlgf_group(entity_type: str, entity: str, fips: str,
                         fiscal_year: int, section: str,
                         group: pd.DataFrame) -> tuple[list[dict], float]:
    mapping = contract.CROSSWALK["rlgf"][section]
    records = []
    parents = group[group.depth == 1]
    children = group[group.depth == 2]
    totals = group[group.depth == 0]
    for parent in parents.itertuples():
        below = children[children.path.str.startswith(parent.path + " > ")]
        records += [local_row(entity_type, entity, fips, fiscal_year,
                              crosswalk_category(mapping, row.classification),
                              row.classification, row.amount)
                    for row in below.itertuples()]
        residual = parent.amount - below.amount.sum()
        if below.empty:
            records.append(local_row(
                entity_type, entity, fips, fiscal_year,
                crosswalk_category(mapping, parent.classification),
                parent.classification, parent.amount))
        elif abs(residual) > 0.005:
            records.append(local_row(
                entity_type, entity, fips, fiscal_year,
                crosswalk_category(mapping, parent.classification),
                f"{parent.classification} (unallocated)", residual))
    total = float(totals.amount.iloc[0]) if not totals.empty \
        else float(parents.amount.sum())
    adjustment = total - parents.amount.sum()
    if abs(adjustment) > 0.005 and not totals.empty:
        records.append(local_row(
            entity_type, entity, fips, fiscal_year,
            "other_revenue" if RLGF_SIDES[section] == "revenue" else "other_expenditure",
            f"{totals.classification.iloc[0]} (reconciliation adjustment)",
            adjustment))
    return records, total


def debt_category(classification: str) -> str | None:
    mapping = contract.CROSSWALK["rlgf_debt"]
    if classification in mapping:
        return mapping[classification]
    for suffix, category in mapping.items():
        if classification.endswith(suffix):
            return category
    if classification.endswith("Beginning Amount Outstanding"):
        return None
    raise SystemExit(f"No rlgf_debt entry matches {classification!r} — "
                     "add it to pipeline/crosswalk.json.")


def normalize_debt_group(entity_type: str, entity: str, fips: str,
                         fiscal_year: int, group: pd.DataFrame) -> list[dict]:
    records = []
    for row in group[group.depth == 2].itertuples():
        if not row.amount:
            continue
        category = debt_category(row.classification)
        if category is None:
            continue
        records.append(local_row(
            entity_type, entity, fips, fiscal_year, category,
            row.classification, row.amount,
            measure="stock" if category in contract.STOCK_CATEGORIES
            else "flow"))
    return records


def normalize_rlgf(frame: pd.DataFrame,
                   entity_type: str) -> tuple[list[dict], dict[tuple, float]]:
    level = RLGF_LEVELS[entity_type]
    records: list[dict] = []
    expected: dict[tuple, float] = {}
    for (entity, fiscal_year, section), group in frame.groupby(
            [level["entity_column"], "fiscal_year", "section"], sort=True):
        if section == "debt":
            records += normalize_debt_group(
                entity_type, entity, level["fips"](entity), int(fiscal_year),
                group)
            continue
        group_records, total = normalize_rlgf_group(
            entity_type, entity, level["fips"](entity), int(fiscal_year),
            section, group)
        records += group_records
        key = (entity_type, entity, int(fiscal_year), RLGF_SIDES[section])
        expected[key] = expected.get(key, 0.0) + total
    return records, expected


def state_row(fiscal_year: int, category: str, subcategory: str,
              amount: float) -> dict:
    return {"entity": contract.STATE_ENTITY, "entity_type": "state",
            "fips": contract.STATE_FIPS, "fiscal_year": int(fiscal_year),
            "category": category, "subcategory": subcategory,
            "measure": "flow", "amount": round(float(amount), 2)}


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
        key = ("state", contract.STATE_ENTITY, int(row.fiscal_year), "revenue")
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
        key = ("state", contract.STATE_ENTITY, int(row.fiscal_year),
               "expenditure")
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


def entity_slug(entity: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", entity.lower()).strip("-")


def entity_year_metrics(entity_type: str, entity: str, fiscal_year: int,
                        expected: dict[tuple, float],
                        population: int | None) -> dict | None:
    revenue = expected.get((entity_type, entity, fiscal_year, "revenue"))
    expenditure = expected.get((entity_type, entity, fiscal_year,
                                "expenditure"))
    if not revenue and not expenditure:
        return None
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


def county_year_metrics(county: str, fiscal_year: int,
                        expected: dict[tuple, float],
                        populations: dict[str, dict[str, int]]) -> dict | None:
    population = populations.get(contract.COUNTY_FIPS[county],
                                 {}).get(str(fiscal_year))
    return entity_year_metrics("county", county, fiscal_year, expected,
                               population)


def county_metrics_document(county_expected: dict[tuple, float],
                            populations: dict[str, dict[str, int]]) -> dict:
    fiscal_years = sorted({key[2] for key in county_expected})
    filed = {key[1] for key in county_expected}
    counties = []
    for county in sorted(contract.COUNTY_FIPS):
        if county in filed:
            counties.append({
                "county": county,
                "fips": contract.COUNTY_FIPS[county],
                "slug": entity_slug(county),
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


def city_population_lookup(entity: str,
                           places: dict[str, dict[str, int]],
                           fiscal_year: int) -> int | None:
    key = PLACE_NAME_ALIASES.get(entity, entity)
    return places.get(key, {}).get(str(fiscal_year))


def entity_metrics_document(entity_type: str, expected: dict[tuple, float],
                            population_for, sources: list[str]) -> dict:
    keys = [key for key in expected if key[0] == entity_type]
    fiscal_years = sorted({key[2] for key in keys})
    entities = sorted({key[1] for key in keys})
    return {
        "sources": sources,
        "fiscal_years": [int(year) for year in fiscal_years],
        "entities": {
            entity_slug(entity): {
                "entity": entity,
                "years": {str(year): entity_year_metrics(
                    entity_type, entity, year, expected,
                    population_for(entity, year))
                    for year in fiscal_years},
            }
            for entity in entities
        },
    }


def categories_document(normalized: pd.DataFrame, entity_type: str,
                        container_key: str, entry_key: str) -> dict:
    rows = normalized[normalized.entity_type == entity_type].assign(
        side=lambda f: f.category.map(contract.side))
    rows = rows[rows.side != "debt"]
    grouped = (rows.groupby(
        ["entity", "fiscal_year", "side", "category", "subcategory"])
        .amount.sum())
    entities: dict[str, dict] = {}
    for (entity, fiscal_year, side_name, category,
         subcategory), amount in grouped.items():
        slug = entity_slug(entity)
        years = entities.setdefault(slug, {entry_key: entity, "years": {}})["years"]
        year_sides = years.setdefault(str(int(fiscal_year)), {})
        node = year_sides.setdefault(side_name, {}).setdefault(
            category, {"total": 0.0, "subcategories": {}})
        node["total"] = round(node["total"] + float(amount), 2)
        node["subcategories"][subcategory] = round(float(amount), 2)
    return {
        "sources": [RLGF_LEVELS[entity_type]["source"]],
        "fiscal_years": sorted(int(y) for y in rows.fiscal_year.unique()),
        container_key: dict(sorted(entities.items())),
    }


def assemble(records: list[dict]) -> pd.DataFrame:
    frame = pd.DataFrame.from_records(records, columns=contract.NORMALIZED_COLUMNS)
    return frame.sort_values(contract.NORMALIZED_COLUMNS[:6]).reset_index(drop=True)


def vintage(source_state: dict, source_id: str) -> dict:
    entry = source_state.get(source_id, {})
    return {"fingerprint": entry.get("fingerprint"),
            "checked_at": entry.get("checked_at")}


def school_manifest_entry(source_state: dict) -> dict | None:
    if not SCHOOL_PARQUET.exists():
        return None
    schools = duckdb.sql(f"FROM '{SCHOOL_PARQUET}'").df()
    return {
        "vintages": {
            source_id: vintage(source_state, source_id)
            for source_id in sorted(source_state)
            if source_id.startswith("census_f33_")},
        "fiscal_years": sorted(int(y) for y in schools.fiscal_year.unique()),
        "records": int(len(schools)),
        "districts": int(schools.ncesid.nunique()),
        "in_normalized_table": False,
        "note": ("regular school systems (F-33 school level 03); excluded "
                 "from the normalized table because state QBE aid is already "
                 "counted as state Department of Education spending"),
    }


def debt_identity(county: pd.DataFrame, city: pd.DataFrame,
                  consolidated: pd.DataFrame) -> dict:
    frames = [county.rename(columns={"county": "entity"}), city, consolidated]
    debt = pd.concat([frame[frame.section == "debt"] for frame in frames],
                     ignore_index=True)
    return contract.debt_identity_report(debt)


def build_manifest(normalized: pd.DataFrame, county: pd.DataFrame,
                   city: pd.DataFrame, consolidated: pd.DataFrame,
                   state: pd.DataFrame, expected: dict[tuple, float],
                   cities_with_population: int | None = None) -> dict:
    source_state = json.loads(SOURCE_STATE_FILE.read_text()) \
        if SOURCE_STATE_FILE.exists() else {}
    openga = state[state.source == OPENGA_SOURCE]
    opb = state[state.source == OPB_SOURCE]
    counties_present = sorted(county.county.unique())
    schools = school_manifest_entry(source_state)
    return {
        "sources": {
            **({"census_f33": schools} if schools else {}),
            COUNTY_SOURCE: {
                "vintage": vintage(source_state, COUNTY_SOURCE),
                "fiscal_years": sorted(int(y) for y in county.fiscal_year.unique()),
                "records": int(len(county)),
                "counties_present": len(counties_present),
                "counties_missing": contract.KNOWN_MISSING_COUNTIES,
            },
            CITY_SOURCE: {
                "vintage": vintage(source_state, CITY_SOURCE),
                "fiscal_years": sorted(int(y) for y in city.fiscal_year.unique()),
                "records": int(len(city)),
                "cities_present": int(city.entity.nunique()),
                "note": ("municipal RLGF filings; city fips carries the bare "
                         "state prefix until the Census place roster lands"),
            },
            CONSOLIDATED_SOURCE: {
                "vintage": vintage(source_state, CONSOLIDATED_SOURCE),
                "fiscal_years": sorted(
                    int(y) for y in consolidated.fiscal_year.unique()),
                "records": int(len(consolidated)),
                "governments": contract.CONSOLIDATED_GOVERNMENTS,
                "note": ("consolidated city-county governments mix county and "
                         "municipal functions; not comparable to county-only "
                         "filings"),
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
            **({PLACE_POPULATION_SOURCE: {
                "vintage": vintage(source_state, PLACE_POPULATION_SOURCE),
                "cities_with_population": cities_with_population,
                "note": ("incorporated-place denominators 2020 onward, "
                         "matched to RLGF city names; cities missing from "
                         "the Census place file carry null population"),
            }} if cities_with_population is not None else {}),
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
            "entities": int(normalized.groupby(["entity_type", "entity"]).ngroups),
            "fiscal_years": sorted(int(y) for y in normalized.fiscal_year.unique()),
            "categories": sorted(normalized.category.unique()),
            "tolerance": {"relative": contract.DEFAULT_RELATIVE_TOLERANCE,
                          "absolute": contract.DEFAULT_ABSOLUTE_TOLERANCE},
            "reconciliation": contract.reconciliation_report(normalized, expected),
            "debt_identity": debt_identity(county, city, consolidated),
        },
    }


def main() -> int:
    county = duckdb.sql(f"FROM '{COUNTY_PARQUET}'").df()
    city = duckdb.sql(f"FROM '{CITY_PARQUET}'").df()
    consolidated = duckdb.sql(f"FROM '{CONSOLIDATED_PARQUET}'").df()
    state = duckdb.sql(f"FROM '{STATE_PARQUET}'").df()

    county_records, county_expected = normalize_rlgf(county, "county")
    city_records, city_expected = normalize_rlgf(city, "city")
    consolidated_records, consolidated_expected = normalize_rlgf(
        consolidated, "consolidated")
    state_records, state_expected = normalize_state(state)
    normalized = assemble(county_records + city_records
                          + consolidated_records + state_records)
    expected = {**county_expected, **city_expected,
                **consolidated_expected, **state_expected}

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
    cities_with_population = None
    if CITY_POPULATION_FILE.exists():
        place_lookup = json.loads(
            CITY_POPULATION_FILE.read_text())["populations"]
        city_names = {key[1] for key in city_expected if key[0] == "city"}
        cities_with_population = sum(
            1 for name in city_names
            if PLACE_NAME_ALIASES.get(name, name) in place_lookup)
    manifest = build_manifest(normalized, county, city, consolidated, state,
                              expected, cities_with_population)
    MANIFEST_FILE.write_text(json.dumps(manifest, indent=1) + "\n")
    categories = state_categories_document(normalized, state)
    categories_file = ROOT / "data" / "processed" / "state" / "categories.json"
    categories_file.parent.mkdir(parents=True, exist_ok=True)
    categories_file.write_text(json.dumps(categories, indent=1) + "\n")
    populations = json.loads(POPULATION_FILE.read_text())["populations"]
    metrics = county_metrics_document(county_expected, populations)
    METRICS_FILE.write_text(json.dumps(metrics, indent=1) + "\n")
    county_categories = categories_document(
        normalized, "county", "counties", "county")
    (METRICS_FILE.parent / "categories.json").write_text(
        json.dumps(county_categories, indent=1) + "\n")
    for entity_type, directory in (("city", "cities"),
                                   ("consolidated", "consolidated")):
        document = categories_document(
            normalized, entity_type, "entities", "entity")
        target = ROOT / "data" / "processed" / directory / "categories.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(document, indent=1) + "\n")
    if CITY_POPULATION_FILE.exists():
        places = json.loads(CITY_POPULATION_FILE.read_text())["populations"]
        city_metrics = entity_metrics_document(
            "city", city_expected,
            lambda entity, year: city_population_lookup(entity, places, year),
            [CITY_SOURCE, PLACE_POPULATION_SOURCE])
        (ROOT / "data" / "processed" / "cities" / "metrics.json").write_text(
            json.dumps(city_metrics, indent=1) + "\n")
    consolidated_metrics = entity_metrics_document(
        "consolidated", consolidated_expected,
        lambda entity, year: populations.get(
            contract.CONSOLIDATED_COUNTY_FIPS[entity], {}).get(str(year)),
        [CONSOLIDATED_SOURCE, *POPULATION_SOURCES])
    (ROOT / "data" / "processed" / "consolidated" / "metrics.json").write_text(
        json.dumps(consolidated_metrics, indent=1) + "\n")

    report = manifest["normalized"]["reconciliation"]
    print(f"Wrote {len(normalized):,} normalized records "
          f"({manifest['normalized']['entities']} entities) to "
          f"{NORMALIZED_PARQUET.relative_to(ROOT)}; "
          f"{report['totals_checked']} totals reconciled, max deviation "
          f"{report['max_relative_deviation']:.6%}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
