"""Transform the TED RLGF all-counties workbook into normalized datasets.

The UGA Carl Vinson Institute's Tax & Expenditure Data Center publishes a
prebuilt Excel export of Report of Local Government Finances data (source id
``ted_rlgf_county_workbook`` in pipeline/sources.json). Each sheet is one
county (152 sheets — the seven consolidated city-county governments are
published under a separate government type and are not included), rows are
the RLGF classification hierarchy indented five spaces per level, and columns
are fiscal years (2016 onward).

Sheet layout conventions this parser relies on:
- Row 1 is ``Classification`` followed by fiscal-year columns.
- Unindented Title Case rows with no amounts ("Revenues", "Debt", ...) are
  section headers; unindented ALL CAPS rows ("TOTAL REVENUES", ...) are that
  section's total lines.
- Only the Revenues, Operating Expenditures, and Capital Expenditures
  sections are extracted; the remaining sections (debt, cash, fund equity,
  personnel) are out of scope for now.

Outputs:
- data/raw/ted_rlgf_county_workbook.xlsx        workbook as downloaded
- data/processed/rlgf_county_finances.parquet   one row per
  (county, fiscal_year, classification line)
- data/processed/counties/<slug>.json           per-county totals plus a
  shallow (depth <= 2) breakdown for the frontend
- data/processed/counties/index.json            county list with latest totals

Usage: etl_rlgf.py [path-to-local-workbook]
When a local path is given it is copied into data/raw/ instead of downloading.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import duckdb
import httpx
import openpyxl
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "pipeline" / "sources.json"
SOURCE_ID = "ted_rlgf_county_workbook"
RAW_FILE = ROOT / "data" / "raw" / f"{SOURCE_ID}.xlsx"
PARQUET_FILE = ROOT / "data" / "processed" / "rlgf_county_finances.parquet"
COUNTIES_DIR = ROOT / "data" / "processed" / "counties"
USER_AGENT = (
    "georgia-budget-tracker/0.1 (+https://github.com/<owner>/georgia-budget-tracker; "
    "civic data project)"
)
TIMEOUT_SECONDS = 120
INDENT_WIDTH = 5
SECTIONS = {
    "Revenues": ("revenue", "revenues"),
    "Operating Expenditures": ("expenditure", "operating"),
    "Capital Expenditures": ("expenditure", "capital"),
}
JSON_BREAKDOWN_MAX_DEPTH = 2


def source_url() -> str:
    sources = json.loads(SOURCES_FILE.read_text())["sources"]
    matches = [s["url"] for s in sources if s["id"] == SOURCE_ID]
    if not matches:
        raise SystemExit(f"Source {SOURCE_ID!r} not found in {SOURCES_FILE}")
    return matches[0]


def download_workbook(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream(
        "GET",
        url,
        headers={"User-Agent": USER_AGENT},
        timeout=TIMEOUT_SECONDS,
        follow_redirects=True,
    ) as response:
        response.raise_for_status()
        with destination.open("wb") as handle:
            for chunk in response.iter_bytes():
                handle.write(chunk)


def indent_depth(label: str) -> int:
    return (len(label) - len(label.lstrip(" "))) // INDENT_WIDTH


def is_section_header(name: str, depth: int, amounts: list) -> bool:
    return depth == 0 and name != name.upper() and all(a is None for a in amounts)


def to_amount(value) -> int | None:
    numeric = pd.to_numeric(value, errors="coerce")
    return None if pd.isna(numeric) else int(numeric)


def sheet_records(county: str, header: tuple, rows: list[tuple]) -> list[dict]:
    years = [int(cell) for cell in header[1:] if cell is not None]
    section = None
    stack: list[str] = []
    records = []
    for line, cells in enumerate(rows, start=2):
        raw = cells[0]
        if raw is None or not str(raw).strip():
            continue
        label = str(raw)
        name = label.strip()
        depth = indent_depth(label)
        amounts = [to_amount(cell) for cell in cells[1 : len(years) + 1]]
        if is_section_header(name, depth, amounts):
            section = SECTIONS.get(name)
            stack = []
            continue
        if section is None:
            continue
        category, section_name = section
        stack = stack[:depth] + [name]
        path = " > ".join(stack)
        records.extend(
            {
                "county": county,
                "fiscal_year": year,
                "category": category,
                "section": section_name,
                "classification": name,
                "depth": depth,
                "line": line,
                "path": path,
                "amount": amount,
            }
            for year, amount in zip(years, amounts)
            if amount is not None
        )
    return records


def parse_workbook(path: Path) -> pd.DataFrame:
    workbook = openpyxl.load_workbook(path, read_only=True)
    records = [
        record
        for sheet in workbook.sheetnames
        for rows in [list(workbook[sheet].iter_rows(values_only=True))]
        for record in sheet_records(sheet, rows[0], rows[1:])
    ]
    workbook.close()
    return pd.DataFrame.from_records(records)


def county_slug(county: str) -> str:
    return county.lower().replace(" ", "-")


def write_parquet(connection: duckdb.DuckDBPyConnection) -> None:
    PARQUET_FILE.parent.mkdir(parents=True, exist_ok=True)
    connection.execute(
        f"""
        COPY (SELECT * FROM records ORDER BY county, line, fiscal_year)
        TO '{PARQUET_FILE}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )


def county_totals(connection: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    return connection.execute(
        """
        SELECT
            county,
            fiscal_year,
            sum(amount) FILTER (category = 'revenue') AS revenue,
            sum(amount) FILTER (category = 'expenditure') AS expenditure,
            sum(amount) FILTER (section = 'operating') AS expenditure_operating,
            sum(amount) FILTER (section = 'capital') AS expenditure_capital
        FROM records
        WHERE depth = 0
        GROUP BY county, fiscal_year
        ORDER BY county, fiscal_year
        """
    ).df()


def county_breakdown(connection: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    return connection.execute(
        """
        SELECT county, classification, category, section, depth, line, path,
               map_from_entries(
                   list((fiscal_year, amount) ORDER BY fiscal_year)
               ) AS amounts
        FROM records
        WHERE depth <= ?
        GROUP BY county, classification, category, section, depth, line, path
        ORDER BY county, line
        """,
        [JSON_BREAKDOWN_MAX_DEPTH],
    ).df()


def totals_entry(row: pd.Series) -> dict:
    return {
        "fiscal_year": int(row.fiscal_year),
        "revenue": None if pd.isna(row.revenue) else int(row.revenue),
        "expenditure": None if pd.isna(row.expenditure) else int(row.expenditure),
        "expenditure_operating": (
            None if pd.isna(row.expenditure_operating) else int(row.expenditure_operating)
        ),
        "expenditure_capital": (
            None if pd.isna(row.expenditure_capital) else int(row.expenditure_capital)
        ),
    }


def breakdown_entry(row: pd.Series) -> dict:
    return {
        "classification": row.classification,
        "category": row.category,
        "section": row.section,
        "depth": int(row.depth),
        "path": row.path,
        "amounts": {str(year): int(amount) for year, amount in row.amounts.items()},
    }


def county_document(county: str, totals: pd.DataFrame, breakdown: pd.DataFrame) -> dict:
    return {
        "county": county,
        "source": SOURCE_ID,
        "fiscal_years": [int(year) for year in sorted(totals.fiscal_year)],
        "totals": [totals_entry(row) for row in totals.itertuples(index=False)],
        "breakdown": [breakdown_entry(row) for row in breakdown.itertuples(index=False)],
    }


def index_document(totals: pd.DataFrame) -> dict:
    latest = totals.sort_values("fiscal_year").groupby("county").last().reset_index()
    return {
        "source": SOURCE_ID,
        "fiscal_years": [int(year) for year in sorted(totals.fiscal_year.unique())],
        "counties": [
            {
                "county": row.county,
                "slug": county_slug(row.county),
                "latest_fiscal_year": int(row.fiscal_year),
                "revenue": None if pd.isna(row.revenue) else int(row.revenue),
                "expenditure": None if pd.isna(row.expenditure) else int(row.expenditure),
            }
            for row in latest.sort_values("county").itertuples(index=False)
        ],
    }


def write_json(path: Path, document: dict) -> None:
    path.write_text(json.dumps(document, indent=1) + "\n")


def write_county_json(connection: duckdb.DuckDBPyConnection) -> int:
    totals = county_totals(connection)
    breakdown = county_breakdown(connection)
    COUNTIES_DIR.mkdir(parents=True, exist_ok=True)
    for stale in COUNTIES_DIR.glob("*.json"):
        stale.unlink()
    for county, county_rows in totals.groupby("county"):
        document = county_document(
            county, county_rows, breakdown[breakdown.county == county]
        )
        write_json(COUNTIES_DIR / f"{county_slug(county)}.json", document)
    write_json(COUNTIES_DIR / "index.json", index_document(totals))
    return totals.county.nunique()


def main() -> int:
    if len(sys.argv) > 1:
        RAW_FILE.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(sys.argv[1], RAW_FILE)
        print(f"Copied local workbook {sys.argv[1]} -> {RAW_FILE}")
    else:
        url = source_url()
        download_workbook(url, RAW_FILE)
        print(f"Downloaded {url} -> {RAW_FILE} ({RAW_FILE.stat().st_size:,} bytes)")

    records = parse_workbook(RAW_FILE)
    if records.empty:
        raise SystemExit("Workbook parsed to zero records — layout may have changed.")

    connection = duckdb.connect()
    connection.register("records", records)
    write_parquet(connection)
    county_count = write_county_json(connection)

    print(
        f"Wrote {len(records):,} records for {county_count} counties "
        f"({records.fiscal_year.min()}-{records.fiscal_year.max()}) to "
        f"{PARQUET_FILE.relative_to(ROOT)} and "
        f"{COUNTIES_DIR.relative_to(ROOT)}/"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
