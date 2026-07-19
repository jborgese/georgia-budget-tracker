"""Transform Census F-33 school system finance files into normalized datasets.

The Annual Survey of School System Finances (source ids ``census_f33_YYYY``
in pipeline/sources.json) publishes one individual-unit workbook per fiscal
year with revenues by source, expenditures by function, debt, and enrollment
for every U.S. public school system. Dollar figures are reported in
thousands; this transform scales them to whole dollars. Georgia rows are
selected by state FIPS (13) and school level "03" (regular elementary-
secondary systems, ~177 districts) — state charter facilities and special
state schools carry other levels and are excluded from the district ledger.

``CONUM`` is the district's county FIPS, which links county and independent
city school systems to the county pages; vintages through FY2002 carry the
same code under the older ``FIPS`` name (the second entry in that field's
F33_FIELDS tuple). School finances stay out of
data/processed/normalized.parquet: state QBE aid is already counted there as
state Department of Education spending, so adding district revenues and
expenditures would double-count it (the same reasoning that excludes Open
Georgia cash-basis payments).

Raw F-33 workbooks (~12-16 MB each) are not committed — like the Open
Georgia exports, data/.source-state.json records each file's fingerprint,
and the extracted Georgia records live in the parquet output.

Outputs:
- data/processed/school_finances.parquet   one row per (district, fiscal year)
- data/processed/schools/<slug>.json       per-district years with per-pupil
  metrics
- data/processed/schools/index.json        district list with latest figures

Usage: etl_schools.py [census_f33_YYYY ...]
With no arguments every year is refreshed; with source-id arguments only
those files are re-downloaded (other years reuse the raw file on disk,
downloading it first if absent).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import duckdb
import pandas as pd

import runlog
from fetching import download_file

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "pipeline" / "sources.json"
RAW_DIR = ROOT / "data" / "raw"
PARQUET_FILE = ROOT / "data" / "processed" / "school_finances.parquet"
SCHOOLS_DIR = ROOT / "data" / "processed" / "schools"
SOURCE_PREFIX = "census_f33_"
GEORGIA_FIPS = "13"
GEORGIA_CENSUS_STATE = "11"
REGULAR_SCHOOL_LEVEL = "3"
THOUSANDS = 1000

F33_FIELDS = {
    "name": ("NAME",),
    "county_fips": ("CONUM", "FIPS"),
    "ncesid": ("NCESID",),
    "enrollment": ("V33",),
    "revenue_total": ("TOTALREV",),
    "revenue_federal": ("TFEDREV",),
    "revenue_state": ("TSTREV",),
    "revenue_local": ("TLOCREV",),
    "revenue_property_tax": ("T06",),
    "revenue_sales_tax": ("T09",),
    "revenue_parent_government": ("T02",),
    "expenditure_total": ("TOTALEXP",),
    "expenditure_current": ("TCURELSC",),
    "expenditure_instruction": ("TCURINST",),
    "expenditure_support_services": ("TCURSSVC",),
    "expenditure_other_current": ("TCUROTH",),
    "expenditure_capital": ("TCAPOUT",),
    "interest_on_debt": ("Q11",),
    "debt_outstanding": ("_19H",),
    "debt_issued": ("_21F",),
    "debt_retired": ("_31F",),
}
COUNT_FIELDS = {"enrollment"}
KEY_FIELDS = {"name", "county_fips", "ncesid"}
NAME_EXPANSIONS = {
    "CO": "County",
    "SCH": "School",
    "DIST": "District",
    "IND": "Independent",
    "BD": "Board",
    "ED": "Education",
}
NAME_CASE_EXCEPTIONS = {"DEKALB": "DeKalb", "LAGRANGE": "LaGrange"}


def school_sources() -> dict[str, dict]:
    sources = json.loads(SOURCES_FILE.read_text())["sources"]
    return {s["id"]: s for s in sources if s["id"].startswith(SOURCE_PREFIX)}


def raw_file(source: dict) -> Path:
    extension = source["url"].rsplit(".", 1)[-1]
    return RAW_DIR / f"{source['id']}.{extension}"


def source_year(source_id: str) -> int:
    return int(source_id.removeprefix(SOURCE_PREFIX))


def title_word(word: str) -> str:
    if word in NAME_CASE_EXCEPTIONS:
        return NAME_CASE_EXCEPTIONS[word]
    if word in NAME_EXPANSIONS:
        return NAME_EXPANSIONS[word]
    lowered = word.lower()
    if lowered.startswith("mc") and len(lowered) > 2:
        return f"Mc{lowered[2].upper()}{lowered[3:]}"
    return lowered[0].upper() + lowered[1:] if lowered else lowered


def display_name(raw_name: str) -> str:
    return " ".join(title_word(word) for word in raw_name.split())


def district_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", display_name(name).lower()).strip("-")


def normalized_code(series: pd.Series) -> pd.Series:
    return (series.astype(str).str.strip().str.split(".").str[0]
            .str.lstrip("0"))


def georgia_mask(frame: pd.DataFrame) -> pd.Series:
    if "FIPST" in frame.columns:
        return normalized_code(frame.FIPST) == GEORGIA_FIPS
    return normalized_code(frame.STATE) == GEORGIA_CENSUS_STATE


def parse_year(path: Path, fiscal_year: int) -> pd.DataFrame:
    frame = pd.read_excel(path, sheet_name=0, dtype=str)
    columns = {field: next((code for code in codes if code in frame.columns),
                           None)
               for field, codes in F33_FIELDS.items()}
    missing = [F33_FIELDS[field][0] for field, code in columns.items()
               if code is None]
    if missing:
        raise SystemExit(
            f"{path.name} lacks expected F-33 columns {missing} — "
            "layout may have changed.")
    georgia = frame[georgia_mask(frame)
                    & (normalized_code(frame.SCHLEV) == REGULAR_SCHOOL_LEVEL)]
    records = georgia[list(columns.values())].rename(
        columns={code: field for field, code in columns.items()})
    records["name"] = records["name"].str.strip()
    records["county_fips"] = normalized_code(records.county_fips).str.zfill(5)
    records["ncesid"] = normalized_code(records.ncesid).str.zfill(7)
    for field in F33_FIELDS:
        if field in KEY_FIELDS:
            continue
        numeric = pd.to_numeric(records[field], errors="coerce").fillna(0)
        records[field] = (numeric if field in COUNT_FIELDS
                          else numeric * THOUSANDS).astype("int64")
    return records.assign(fiscal_year=fiscal_year)


def canonical_name(names: pd.Series) -> str:
    return sorted(names, key=lambda name: (-len(name), name))[0]


def combine(frames: list[pd.DataFrame]) -> pd.DataFrame:
    combined = pd.concat(frames, ignore_index=True)
    canonical = combined.groupby("ncesid").name.agg(canonical_name)
    slugs = canonical.map(district_slug)
    collisions = slugs[slugs.duplicated(keep=False)]
    if not collisions.empty:
        raise SystemExit(f"District slug collisions: {sorted(set(collisions))}")
    return combined.assign(slug=combined.ncesid.map(slugs),
                           display_name=combined.ncesid.map(
                               canonical.map(display_name)))


def write_parquet(frame: pd.DataFrame) -> None:
    PARQUET_FILE.parent.mkdir(parents=True, exist_ok=True)
    connection = duckdb.connect()
    connection.register("schools", frame)
    connection.execute(
        f"""
        COPY (SELECT * FROM schools ORDER BY ncesid, fiscal_year)
        TO '{PARQUET_FILE}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )


def per_pupil(amount: int, enrollment: int) -> float | None:
    return round(amount / enrollment, 2) if enrollment else None


def year_entry(row) -> dict:
    return {
        "enrollment": int(row.enrollment),
        "revenue": {
            "total": int(row.revenue_total),
            "federal": int(row.revenue_federal),
            "state": int(row.revenue_state),
            "local": int(row.revenue_local),
            "property_tax": int(row.revenue_property_tax),
            "sales_tax": int(row.revenue_sales_tax),
            "parent_government": int(row.revenue_parent_government),
        },
        "expenditure": {
            "total": int(row.expenditure_total),
            "current": int(row.expenditure_current),
            "instruction": int(row.expenditure_instruction),
            "support_services": int(row.expenditure_support_services),
            "other_current": int(row.expenditure_other_current),
            "capital": int(row.expenditure_capital),
            "interest_on_debt": int(row.interest_on_debt),
        },
        "debt": {
            "outstanding": int(row.debt_outstanding),
            "issued": int(row.debt_issued),
            "retired": int(row.debt_retired),
        },
        "per_pupil": {
            "revenue": per_pupil(row.revenue_total, row.enrollment),
            "current_spending": per_pupil(row.expenditure_current,
                                          row.enrollment),
            "instruction": per_pupil(row.expenditure_instruction,
                                     row.enrollment),
        },
    }


def district_document(rows: pd.DataFrame, fiscal_years: list[int]) -> dict:
    latest = rows.sort_values("fiscal_year").iloc[-1]
    return {
        "district": latest["name"],
        "display_name": latest.display_name,
        "slug": latest.slug,
        "ncesid": latest.ncesid,
        "county_fips": latest.county_fips,
        "source": "census_f33",
        "fiscal_years": fiscal_years,
        "years": {str(int(row.fiscal_year)): year_entry(row)
                  for row in rows.itertuples(index=False)},
    }


def write_school_json(frame: pd.DataFrame) -> int:
    fiscal_years = sorted(int(y) for y in frame.fiscal_year.unique())
    SCHOOLS_DIR.mkdir(parents=True, exist_ok=True)
    for stale in SCHOOLS_DIR.glob("*.json"):
        stale.unlink()
    for _, rows in frame.groupby("ncesid"):
        document = district_document(rows, fiscal_years)
        (SCHOOLS_DIR / f"{document['slug']}.json").write_text(
            json.dumps(document, indent=1) + "\n")
    latest_year = fiscal_years[-1]
    latest = frame[frame.fiscal_year == latest_year]
    index = {
        "source": "census_f33",
        "fiscal_years": fiscal_years,
        "districts": [
            {
                "district": row.name,
                "display_name": row.display_name,
                "slug": row.slug,
                "ncesid": row.ncesid,
                "county_fips": row.county_fips,
                "latest_fiscal_year": latest_year,
                "enrollment": int(row.enrollment),
                "revenue": int(row.revenue_total),
                "expenditure": int(row.expenditure_total),
                "per_pupil_current_spending": per_pupil(
                    row.expenditure_current, row.enrollment),
            }
            for row in latest.sort_values("display_name")
                             .itertuples(index=False)
        ],
    }
    (SCHOOLS_DIR / "index.json").write_text(json.dumps(index, indent=1) + "\n")
    return frame.ncesid.nunique()


def ensure_raw(source: dict, refresh: bool) -> Path:
    target = raw_file(source)
    if refresh or not target.exists():
        download_file(source["url"], target, source=source["id"])
        print(f"Downloaded {source['url']} -> {target} "
              f"({target.stat().st_size:,} bytes)")
    return target


def main() -> int:
    requested = set(sys.argv[1:])
    sources = school_sources()
    refresh = set(sources) & requested if requested else set(sources)
    if requested and not refresh:
        print(f"No F-33 sources among {sorted(requested)}; nothing to do.")
        return 0

    frames = []
    any_failed = False
    for source_id, source in sorted(sources.items()):
        try:
            path = ensure_raw(source, refresh=source_id in refresh)
            frames.append(parse_year(path, source_year(source_id)))
        except (Exception, SystemExit) as exc:
            failures = runlog.record_outcome(source_id, ok=False,
                                             error=str(exc))
            runlog.log_event("transform_failed", source_id,
                             consecutive_failures=failures,
                             error=str(exc)[:300])
            print(f"ERROR {source_id}: {exc}", file=sys.stderr)
            any_failed = True
            continue
        if source_id in refresh:
            runlog.record_outcome(source_id, ok=True)

    if not frames:
        print("No F-33 files parsed; existing outputs left untouched.",
              file=sys.stderr)
        return 1

    combined = combine(frames)
    write_parquet(combined)
    district_count = write_school_json(combined)
    runlog.log_event("transformed", "census_f33", records=len(combined),
                     districts=district_count)
    print(
        f"Wrote {len(combined):,} district-year records for "
        f"{district_count} districts "
        f"({combined.fiscal_year.min()}-{combined.fiscal_year.max()}) to "
        f"{PARQUET_FILE.relative_to(ROOT)} and "
        f"{SCHOOLS_DIR.relative_to(ROOT)}/"
    )
    return 1 if any_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
