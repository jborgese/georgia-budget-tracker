"""Transform Census population estimates into Georgia lookups.

Downloads the two vintage files registered in pipeline/sources.json
(``census_county_pop_2010s`` for 2010-2020 and ``census_county_pop_2020s``
for 2020 onward; the newer vintage wins where they overlap), filters to
Georgia county rows (STATE 13, SUMLEV 050), and writes
data/processed/county_population.json keyed by county FIPS.

Populations are July 1 estimates for the named calendar year; per-capita
metrics elsewhere in the pipeline pair fiscal year FY20NN with the year-20NN
estimate.

Incorporated places: downloads the two SUB-EST vintage files
(``census_place_pop_2010s`` for 2010-2020 and ``census_place_pop_2020s``
for 2020 onward; the newer vintage wins where they overlap), filters to
whole-place rows (SUMLEV 162), and writes
data/processed/city_population.json keyed by the place name normalized to
the TED convention (uppercase, "city"/"town" suffix stripped) so city
per-capita metrics can join on the RLGF entity name. The 2010s vintage
carries a POPESTIMATE042020 April-census column; only four-digit
POPESTIMATE years are kept.

Usage: etl_population.py [path-2010s-csv path-2020s-csv
                          [path-places-2010s-csv path-places-2020s-csv]]
With local paths the download is skipped (the files are still copied into
data/raw/).
"""

from __future__ import annotations

import csv
import io
import json
import shutil
import sys
from pathlib import Path

import runlog
from fetching import download_file

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "pipeline" / "sources.json"
RAW_DIR = ROOT / "data" / "raw"
OUTPUT_FILE = ROOT / "data" / "processed" / "county_population.json"
CITY_OUTPUT_FILE = ROOT / "data" / "processed" / "city_population.json"
SOURCE_IDS = ["census_county_pop_2010s", "census_county_pop_2020s"]
PLACE_SOURCE_IDS = ["census_place_pop_2010s", "census_place_pop_2020s"]
USER_AGENT = (
    "georgia-budget-tracker/0.1 (+https://github.com/<owner>/georgia-budget-tracker; "
    "civic data project)"
)
GEORGIA_STATE_FIPS = "13"
COUNTY_SUMLEV = "050"
PLACE_SUMLEV = "162"
PLACE_SUFFIXES = (" city", " town")


def source_urls() -> dict[str, str]:
    sources = {s["id"]: s["url"] for s in json.loads(SOURCES_FILE.read_text())["sources"]}
    wanted = [*SOURCE_IDS, *PLACE_SOURCE_IDS]
    missing = [sid for sid in wanted if sid not in sources]
    if missing:
        raise SystemExit(f"Sources {missing} not found in {SOURCES_FILE}")
    return {sid: sources[sid] for sid in wanted}


def year_estimates(row: dict[str, str | None]) -> dict[str, int]:
    years = {
        column.removeprefix("POPESTIMATE"): value
        for column, value in row.items()
        if column and column.startswith("POPESTIMATE") and value
    }
    return {year: int(value) for year, value in years.items()
            if year.isdigit() and len(year) == 4}


def georgia_populations(csv_text: str) -> dict[str, dict[str, int]]:
    reader = csv.DictReader(io.StringIO(csv_text))
    populations: dict[str, dict[str, int]] = {}
    for row in reader:
        if (row.get("SUMLEV") != COUNTY_SUMLEV
                or row.get("STATE") != GEORGIA_STATE_FIPS):
            continue
        fips = row["STATE"] + row["COUNTY"]
        populations[fips] = year_estimates(row)
    return populations


def place_entity_name(census_name: str) -> str:
    name = census_name.strip()
    for suffix in PLACE_SUFFIXES:
        if name.lower().endswith(suffix):
            name = name[: -len(suffix)]
            break
    return name.upper()


def georgia_place_populations(csv_text: str) -> dict[str, dict[str, int]]:
    reader = csv.DictReader(io.StringIO(csv_text))
    populations: dict[str, dict[str, int]] = {}
    for row in reader:
        if (row.get("SUMLEV") != PLACE_SUMLEV
                or row.get("STATE") != GEORGIA_STATE_FIPS):
            continue
        name = place_entity_name(row["NAME"])
        estimates = year_estimates(row)
        if name in populations and populations[name] != estimates:
            raise SystemExit(
                f"Distinct place rows normalize to the same name {name!r}.")
        populations[name] = estimates
    return populations


def merge_vintages(older: dict[str, dict[str, int]],
                   newer: dict[str, dict[str, int]]) -> dict[str, dict[str, int]]:
    merged: dict[str, dict[str, int]] = {}
    for fips in sorted(older.keys() | newer.keys()):
        merged[fips] = {**older.get(fips, {}), **newer.get(fips, {})}
    return merged


def main() -> int:
    urls = source_urls()
    all_ids = [*SOURCE_IDS, *PLACE_SOURCE_IDS]
    local_paths = (dict(zip(all_ids, sys.argv[1:1 + len(all_ids)]))
                   if len(sys.argv) > 2 else {})
    texts: dict[str, str] = {}
    any_failed = False
    for source_id in all_ids:
        raw_file = RAW_DIR / f"{source_id}.csv"
        if source_id in local_paths:
            RAW_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(local_paths[source_id], raw_file)
            print(f"Copied {local_paths[source_id]} -> {raw_file}")
            runlog.record_outcome(source_id, ok=True)
        else:
            try:
                download_file(urls[source_id], raw_file, source=source_id)
                print(f"Downloaded {urls[source_id]} "
                      f"({raw_file.stat().st_size:,} bytes)")
                runlog.record_outcome(source_id, ok=True)
            except (Exception, SystemExit) as exc:
                failures = runlog.record_outcome(source_id, ok=False,
                                                 error=str(exc))
                runlog.log_event("transform_failed", source_id,
                                 consecutive_failures=failures,
                                 error=str(exc)[:300])
                print(f"ERROR {source_id}: {exc}", file=sys.stderr)
                any_failed = True
                if not raw_file.exists():
                    print(f"No committed copy of {raw_file.name} to fall back "
                          "on; existing outputs left untouched.",
                          file=sys.stderr)
                    return 1
                runlog.log_event("fallback", source_id,
                                 reason="using committed raw file")
        texts[source_id] = raw_file.read_text(encoding="latin-1")

    by_vintage = [georgia_populations(texts[sid]) for sid in SOURCE_IDS]
    merged = merge_vintages(*by_vintage)
    if len(merged) != 159:
        raise SystemExit(f"Expected 159 Georgia counties, parsed {len(merged)}.")

    years = sorted({year for county in merged.values() for year in county})
    document = {
        "sources": SOURCE_IDS,
        "years": [int(year) for year in years],
        "populations": merged,
    }
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(document, indent=1, sort_keys=True) + "\n")
    runlog.log_event("transformed", "county_population", counties=len(merged))
    print(f"Wrote populations for {len(merged)} counties "
          f"({years[0]}-{years[-1]}) to {runlog.display_path(OUTPUT_FILE)}")

    place_vintages = [georgia_place_populations(texts[sid])
                      for sid in PLACE_SOURCE_IDS]
    places = merge_vintages(*place_vintages)
    if not places:
        raise SystemExit("No Georgia incorporated places parsed — "
                         "layout may have changed.")
    place_years = sorted({year for place in places.values() for year in place})
    CITY_OUTPUT_FILE.write_text(json.dumps({
        "sources": PLACE_SOURCE_IDS,
        "years": [int(year) for year in place_years],
        "populations": places,
    }, indent=1, sort_keys=True) + "\n")
    runlog.log_event("transformed", "city_population", places=len(places))
    print(f"Wrote populations for {len(places)} incorporated places "
          f"({place_years[0]}-{place_years[-1]}) to "
          f"{runlog.display_path(CITY_OUTPUT_FILE)}")
    return 1 if any_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
