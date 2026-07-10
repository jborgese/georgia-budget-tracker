"""Transform Census county population estimates into a Georgia lookup.

Downloads the two vintage files registered in pipeline/sources.json
(``census_county_pop_2010s`` for 2010-2020 and ``census_county_pop_2020s``
for 2020 onward; the newer vintage wins where they overlap), filters to
Georgia county rows (STATE 13, SUMLEV 050), and writes
data/processed/county_population.json keyed by county FIPS.

Populations are July 1 estimates for the named calendar year; per-capita
metrics elsewhere in the pipeline pair fiscal year FY20NN with the year-20NN
estimate.

Usage: etl_population.py [path-2010s-csv path-2020s-csv]
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
SOURCE_IDS = ["census_county_pop_2010s", "census_county_pop_2020s"]
USER_AGENT = (
    "georgia-budget-tracker/0.1 (+https://github.com/<owner>/georgia-budget-tracker; "
    "civic data project)"
)
GEORGIA_STATE_FIPS = "13"
COUNTY_SUMLEV = "050"


def source_urls() -> dict[str, str]:
    sources = {s["id"]: s["url"] for s in json.loads(SOURCES_FILE.read_text())["sources"]}
    missing = [sid for sid in SOURCE_IDS if sid not in sources]
    if missing:
        raise SystemExit(f"Sources {missing} not found in {SOURCES_FILE}")
    return {sid: sources[sid] for sid in SOURCE_IDS}


def georgia_populations(csv_text: str) -> dict[str, dict[str, int]]:
    reader = csv.DictReader(io.StringIO(csv_text))
    populations: dict[str, dict[str, int]] = {}
    for row in reader:
        if (row.get("SUMLEV") != COUNTY_SUMLEV
                or row.get("STATE") != GEORGIA_STATE_FIPS):
            continue
        fips = row["STATE"] + row["COUNTY"]
        estimates = {
            column.removeprefix("POPESTIMATE"): int(value)
            for column, value in row.items()
            if column.startswith("POPESTIMATE") and value
        }
        populations[fips] = estimates
    return populations


def merge_vintages(older: dict[str, dict[str, int]],
                   newer: dict[str, dict[str, int]]) -> dict[str, dict[str, int]]:
    merged: dict[str, dict[str, int]] = {}
    for fips in sorted(older.keys() | newer.keys()):
        merged[fips] = {**older.get(fips, {}), **newer.get(fips, {})}
    return merged


def main() -> int:
    urls = source_urls()
    local_paths = dict(zip(SOURCE_IDS, sys.argv[1:3])) if len(sys.argv) > 2 else {}
    texts: dict[str, str] = {}
    any_failed = False
    for source_id in SOURCE_IDS:
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
    return 1 if any_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
