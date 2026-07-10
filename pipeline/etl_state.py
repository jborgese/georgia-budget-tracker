"""Transform state-level Georgia finance sources into normalized datasets.

Two source families feed this transform (registry: pipeline/sources.json):

- Open Georgia (source id ``open_georgia_poa``): the payments, obligations,
  and professional-services search apps behind open.ga.gov/openga expose CSV
  exports after a disclaimer + search POST. Exports are vendor-level; this
  transform aggregates to per-organization totals (state organizations, org
  type 1) per fiscal year. Vendor-level detail (~9 MB per year per app) is
  deliberately not committed — data/raw/open_georgia_manifest.json records
  the SHA-256 and row count of every export consumed instead.
- OPB Governor's Budget Report PDFs (source ids in ``OPB_REPORTS``): the
  "Georgia Revenues — Reported and Estimated" statement (revenue by source)
  and the "Expenditures and Appropriations" statements (state funds and total
  funds, by agency) are parsed with pdfplumber using word x-positions, since
  rows are sparse and amounts are right-aligned under fiscal-year columns.

GDAC (gdac.georgia.gov/budget) is intentionally absent: its Tableau
dashboards disable data export by permission (allow_export_data=false,
verified 2026-07), so the revenue/expenditure figures they display are taken
from the OPB budget report instead.

Records share the county transform's long format with ``entity`` in place of
``county`` plus two provenance columns:
(entity, fiscal_year, category, section, classification, depth, line, path,
 amount, basis, source)
``basis`` distinguishes actual/reported figures from estimated and budgeted
ones; ``amount`` is dollars (cents preserved where the source has them).

Outputs:
- data/raw/<opb source id>.pdf                     report as downloaded
- data/raw/open_georgia_manifest.json              export provenance
- data/processed/state_finances.parquet            all state-level records
- data/processed/state/revenues.json               OPB revenue lines
- data/processed/state/expenditures.json           OPB agency expenditures
- data/processed/state/payments.json               Open Georgia aggregates
- data/processed/state/index.json                  headline totals per year

Usage: etl_state.py [open_georgia_poa] [opb_governors_budget_report_fy2026]
With no arguments every dataset is refreshed; with source-id arguments only
those datasets are refreshed (existing parquet records are kept for the rest).
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import sys
import time
from pathlib import Path

import duckdb
import httpx
import pandas as pd
import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "pipeline" / "sources.json"
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
STATE_DIR = PROCESSED_DIR / "state"
PARQUET_FILE = PROCESSED_DIR / "state_finances.parquet"
MANIFEST_FILE = RAW_DIR / "open_georgia_manifest.json"
USER_AGENT = (
    "georgia-budget-tracker/0.1 (+https://github.com/<owner>/georgia-budget-tracker; "
    "civic data project)"
)
ENTITY = "STATE OF GEORGIA"
OPENGA_SOURCE = "open_georgia_poa"
OPENGA_BASE = "https://open.ga.gov/openga"
OPENGA_THROTTLE_SECONDS = 1.0
OPENGA_APPS = {
    "payments": {
        "index": "payment/index",
        "form": "payment/index/paymentForm",
        "search": {"selectedPaymentOrgType": "1", "selectedPaymentEntity": "",
                   "selectedFundingSource": "", "selectedVendorName": "",
                   "selectedDescription": ""},
        "export_action": "_action_exportPaymentSummary",
        "amount_column": "Total Payment Amount",
    },
    "obligations": {
        "index": "obligation/index",
        "form": "obligation/index/obligationForm",
        "search": {"selectedPoOrgType": "1", "selectedPoEntity": "",
                   "selectedPoVendor": ""},
        "export_action": "_action_obligationExport",
        "amount_column": "Obligation Amount",
    },
    "professional_services": {
        "index": "perdiem/index",
        "form": "perdiem/index/perdiemForm",
        "search": {},
        "export_action": "_action_perdiemExport",
        "amount_column": "Amount",
        "detail_column": "Description",
    },
}
OPB_REPORTS = ["opb_governors_budget_report_fy2026"]
NUMERIC = re.compile(r"^\(?\$?[\d,]+\)?$")
ROW_TOLERANCE = 3.0
SUBGROUP_MIN_X0 = 37.0


def load_sources() -> dict:
    return {s["id"]: s for s in json.loads(SOURCES_FILE.read_text())["sources"]}


def openga_client() -> httpx.Client:
    client = httpx.Client(
        base_url=OPENGA_BASE,
        headers={"User-Agent": USER_AGENT},
        timeout=180,
        follow_redirects=True,
    )
    client.get("/poa")
    client.post("/poHome/acceptDisclaimer",
                data={"_action_acceptDisclaimer": "I Understand : Proceed"})
    return client


def openga_years(client: httpx.Client, app: dict) -> list[int]:
    page = client.get(f"/{app['index']}").text
    select = re.search(r'name="selectedYear".*?</select>', page, re.S)
    if not select:
        raise SystemExit(f"No year list on {app['index']} — layout may have changed.")
    return sorted(int(y) for y in re.findall(r'<option value="(\d{4})"', select.group(0)))


def openga_export(client: httpx.Client, app: dict, year: int) -> str:
    base = {"selectedYear": str(year), "actionPath": "index", **app["search"]}
    time.sleep(OPENGA_THROTTLE_SECONDS)
    client.post(f"/{app['form']}", data={**base, "_action_search": "Search"})
    time.sleep(OPENGA_THROTTLE_SECONDS)
    response = client.post(
        f"/{app['form']}",
        data={**base, app["export_action"]: "CSV", "f": "csv", "extension": "csv"},
    )
    response.raise_for_status()
    if "text/csv" not in response.headers.get("content-type", ""):
        raise SystemExit(f"Export for {app['index']} {year} did not return CSV.")
    return response.text


def openga_records(section: str, app: dict, year: int, csv_text: str) -> list[dict]:
    frame = pd.read_csv(io.StringIO(csv_text))
    frame[app["amount_column"]] = pd.to_numeric(frame[app["amount_column"]],
                                                errors="coerce").fillna(0)
    detail = app.get("detail_column")

    def record(classification: str, depth: int, path: str, amount: float) -> dict:
        return {
            "entity": ENTITY,
            "fiscal_year": year,
            "category": "expenditure",
            "section": section,
            "classification": classification,
            "depth": depth,
            "line": 0,
            "path": path,
            "amount": round(float(amount), 2),
            "basis": "actual",
            "source": OPENGA_SOURCE,
        }

    by_org = frame.groupby("Organization")[app["amount_column"]].sum().sort_index()
    records = [record(org, 0, org, amount) for org, amount in by_org.items()]
    if detail:
        by_detail = (frame.groupby(["Organization", detail])[app["amount_column"]]
                     .sum().sort_index())
        records += [record(desc, 1, f"{org} > {desc}", amount)
                    for (org, desc), amount in by_detail.items()]
    return records


def load_manifest() -> dict:
    return json.loads(MANIFEST_FILE.read_text()) if MANIFEST_FILE.exists() else {}


def refresh_openga() -> tuple[list[dict], dict]:
    manifest = load_manifest()
    client = openga_client()
    records: list[dict] = []
    for section, app in OPENGA_APPS.items():
        years = openga_years(client, app)
        fetched = {int(y) for y in manifest.get(section, {})}
        wanted = sorted((set(years) - fetched) | {max(years)})
        print(f"open georgia {section}: years {wanted} "
              f"(available {min(years)}-{max(years)})")
        for year in wanted:
            csv_text = openga_export(client, app, year)
            year_records = openga_records(section, app, year, csv_text)
            records += year_records
            manifest.setdefault(section, {})[str(year)] = {
                "sha256": hashlib.sha256(csv_text.encode()).hexdigest(),
                "vendor_rows": csv_text.count("\n") - 1,
                "organizations": sum(1 for r in year_records if r["depth"] == 0),
            }
    client.close()
    return records, manifest


def download_pdf(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, headers={"User-Agent": USER_AGENT},
                      timeout=180, follow_redirects=True) as response:
        response.raise_for_status()
        with destination.open("wb") as handle:
            for chunk in response.iter_bytes():
                handle.write(chunk)


def parse_amount(text: str) -> float | None:
    cleaned = text.replace("$", "").replace(",", "")
    if cleaned in ("", "-"):
        return None
    if cleaned.startswith("(") and cleaned.endswith(")"):
        return -float(cleaned[1:-1])
    return float(cleaned)


def cluster_rows(words: list[dict]) -> list[list[dict]]:
    rows: list[list[dict]] = []
    for word in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if rows and word["top"] - rows[-1][0]["top"] <= ROW_TOLERANCE:
            rows[-1].append(word)
        else:
            rows.append([word])
    return [sorted(row, key=lambda w: w["x0"]) for row in rows]


def split_row(row: list[dict]) -> tuple[list[dict], list[dict]]:
    labels = [w for w in row if not (NUMERIC.match(w["text"]) and w["x0"] > 200)]
    amounts = [w for w in row if NUMERIC.match(w["text"]) and w["x0"] > 200]
    return labels, amounts


def year_columns(rows: list[list[dict]]) -> list[tuple[int, float]]:
    for row in rows:
        years = [(int(w["text"]), w["x1"]) for w in row
                 if re.match(r"^20\d\d$", w["text"])]
        if len(years) >= 3:
            return years
    raise SystemExit("No fiscal-year header row found — layout may have changed.")


def column_basis(rows: list[list[dict]], columns: list[tuple[int, float]],
                 default: str) -> dict[int, str]:
    basis = {year: default for year, _ in columns}
    for row in rows[:6]:
        tokens = {w["text"] for w in row}
        if not tokens & {"Reported", "Estimated", "Expenditures", "Budget"}:
            continue
        for word in row:
            if word["text"] not in ("Reported", "Estimated", "Expenditures", "Budget"):
                continue
            year = min(columns, key=lambda c: abs(c[1] - word["x1"]))[0]
            basis[year] = {"Reported": "reported", "Estimated": "estimated",
                           "Expenditures": "actual", "Budget": "budget"}[word["text"]]
    for row in rows[:6]:
        for word in row:
            if word["text"] == "Amended":
                year = min(columns, key=lambda c: abs(c[1] - word["x1"]))[0]
                if basis.get(year) == "budget":
                    basis[year] = "amended_budget"
    return basis


def assign_amounts(amounts: list[dict],
                   columns: list[tuple[int, float]]) -> dict[int, float]:
    assigned = {}
    for word in amounts:
        value = parse_amount(word["text"])
        if value is None:
            continue
        year = min(columns, key=lambda c: abs(c[1] - word["x1"]))[0]
        assigned[year] = value
    return assigned


def find_pages(pdf: pdfplumber.PDF, title: str, subtitle: str | None = None,
               scan_limit: int = 60) -> list:
    matches = []
    for page in pdf.pages[:scan_limit]:
        lines = (page.extract_text() or "").split("\n")
        if any(line.strip().startswith(title) for line in lines[:2]):
            if subtitle is None or any(subtitle in line for line in lines[:3]):
                matches.append(page)
    if not matches:
        raise SystemExit(f"No pages titled {title!r} — layout may have changed.")
    return matches


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def is_bold(word: dict) -> bool:
    return "Bold" in word.get("fontname", "")


def parse_revenues(pdf: pdfplumber.PDF, source: str) -> list[dict]:
    records = []
    stack: list[tuple[str, float]] = []
    for page in find_pages(pdf, "Georgia Revenues", "Reported and Estimated"):
        rows = cluster_rows(page.extract_words(extra_attrs=["fontname"]))
        columns = year_columns(rows)
        basis = column_basis(rows, columns, "reported")
        for row in rows:
            labels, amounts = split_row(row)
            if not labels or labels[0]["x0"] > 200:
                continue
            name = " ".join(w["text"] for w in labels)
            x0 = labels[0]["x0"]
            while stack and stack[-1][1] >= x0:
                stack.pop()
            assigned = assign_amounts(amounts, columns)
            if not assigned:
                stack.append((name, x0))
                continue
            path_parts = [part for part, _ in stack] + [name]
            section = slugify(path_parts[0]) if len(path_parts) > 1 else slugify(name)
            records += [{
                "entity": ENTITY,
                "fiscal_year": year,
                "category": "revenue",
                "section": section,
                "classification": name,
                "depth": len(stack),
                "line": 0,
                "path": " > ".join(path_parts),
                "amount": value,
                "basis": basis[year],
                "source": source,
            } for year, value in sorted(assigned.items())]
    return records


def parse_expenditures(pdf: pdfplumber.PDF, source: str, fund_scope: str,
                       title: str) -> list[dict]:
    records = []
    branch = None
    for page in find_pages(pdf, title):
        rows = cluster_rows(page.extract_words(extra_attrs=["fontname"]))
        columns = year_columns(rows)
        basis = column_basis(rows, columns, "budget")
        for row in rows:
            labels, amounts = split_row(row)
            if not labels or labels[0]["x0"] > 200 or labels[0]["x0"] < 20:
                continue
            name = " ".join(w["text"] for w in labels)
            if name in (title, "Amended"):
                continue
            is_header = (is_bold(labels[0]) or name.endswith(":")
                         or name == name.upper())
            assigned = assign_amounts(amounts, columns)
            if not assigned:
                if is_header:
                    branch = name
                elif records and records[-1]["source"] == source:
                    tail = [r for r in records
                            if r["path"] == records[-1]["path"]]
                    for entry in tail:
                        entry["classification"] += f" {name}"
                        entry["path"] = (f"{branch} > {entry['classification']}"
                                         if branch else entry["classification"])
                continue
            depth = 0 if is_header else (1 if branch else 0)
            path = f"{branch} > {name}" if depth else name
            records += [{
                "entity": ENTITY,
                "fiscal_year": year,
                "category": "expenditure",
                "section": fund_scope,
                "classification": name,
                "depth": depth,
                "line": 0,
                "path": path,
                "amount": value,
                "basis": basis[year],
                "source": source,
            } for year, value in sorted(assigned.items())]
    return records


def refresh_opb(sources: dict) -> list[dict]:
    records = []
    for source_id in OPB_REPORTS:
        destination = RAW_DIR / f"{source_id}.pdf"
        download_pdf(sources[source_id]["url"], destination)
        print(f"Downloaded {sources[source_id]['url']} "
              f"({destination.stat().st_size:,} bytes)")
        with pdfplumber.open(destination) as pdf:
            records += parse_revenues(pdf, source_id)
            records += parse_expenditures(
                pdf, source_id, "state_funds",
                "Expenditures and Appropriations: State Funds")
            records += parse_expenditures(
                pdf, source_id, "total_funds",
                "Expenditures and Appropriations: Total Funds")
    return records


def number_lines(frame: pd.DataFrame) -> pd.DataFrame:
    ordered = frame.sort_values(
        ["source", "section", "path", "depth", "fiscal_year"]).reset_index(drop=True)
    keys = ordered[["source", "section", "path", "depth"]].apply(tuple, axis=1)
    ordered["line"] = keys.ne(keys.shift()).cumsum()
    return ordered


def merge_records(fresh: pd.DataFrame) -> pd.DataFrame:
    if not PARQUET_FILE.exists() or fresh.empty:
        return fresh
    existing = duckdb.sql(f"FROM '{PARQUET_FILE}'").df()
    keys = {"source", "section", "fiscal_year"}
    refreshed = set(fresh[sorted(keys)].apply(tuple, axis=1))
    kept = existing[~existing[sorted(keys)].apply(tuple, axis=1).isin(refreshed)]
    return pd.concat([kept, fresh], ignore_index=True)


def write_parquet(frame: pd.DataFrame) -> None:
    PARQUET_FILE.parent.mkdir(parents=True, exist_ok=True)
    connection = duckdb.connect()
    connection.register("records", frame)
    connection.execute(
        f"""
        COPY (SELECT * FROM records ORDER BY source, section, line, fiscal_year)
        TO '{PARQUET_FILE}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )


def rows_document(frame: pd.DataFrame) -> list[dict]:
    documents = []
    for (path, classification, section, depth), group in frame.groupby(
            ["path", "classification", "section", "depth"], sort=False):
        documents.append({
            "classification": classification,
            "section": section,
            "depth": int(depth),
            "path": path,
            "amounts": {str(int(r.fiscal_year)): round(float(r.amount), 2)
                        for r in group.itertuples()},
            "basis": {str(int(r.fiscal_year)): r.basis for r in group.itertuples()},
        })
    return documents


def headline(frame: pd.DataFrame, classification: str) -> dict:
    rows = frame[frame.classification == classification]
    return {str(int(r.fiscal_year)): round(float(r.amount), 2)
            for r in rows.itertuples()}


def write_state_json(frame: pd.DataFrame) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    opb = frame[frame.source.isin(OPB_REPORTS)].sort_values(["line", "fiscal_year"])
    openga = frame[frame.source == OPENGA_SOURCE].sort_values(["line", "fiscal_year"])
    revenues = opb[opb.category == "revenue"]
    expenditures = opb[opb.category == "expenditure"]
    documents = {
        "revenues.json": {"entity": ENTITY, "sources": OPB_REPORTS,
                          "rows": rows_document(revenues)},
        "expenditures.json": {"entity": ENTITY, "sources": OPB_REPORTS,
                              "rows": rows_document(expenditures)},
        "payments.json": {"entity": ENTITY, "sources": [OPENGA_SOURCE],
                          "rows": rows_document(openga)},
        "index.json": {
            "entity": ENTITY,
            "fiscal_years": sorted(int(y) for y in frame.fiscal_year.unique()),
            "totals": {
                "revenue": headline(revenues, "Total State Treasury Receipts"),
                "expenditure_state_funds": headline(
                    expenditures[expenditures.section == "state_funds"],
                    "TOTAL STATE FUNDS APPROPRIATIONS"),
                "expenditure_total_funds": headline(
                    expenditures[expenditures.section == "total_funds"],
                    "TOTAL FUNDS APPROPRIATIONS"),
                "payments": {
                    str(int(year)): round(float(amount), 2)
                    for year, amount in openga[
                        (openga.section == "payments") & (openga.depth == 0)
                    ].groupby("fiscal_year").amount.sum().items()},
            },
        },
    }
    for filename, document in documents.items():
        (STATE_DIR / filename).write_text(json.dumps(document, indent=1) + "\n")


def main() -> int:
    requested = set(sys.argv[1:])
    sources = load_sources()
    known = {OPENGA_SOURCE, *OPB_REPORTS}
    refresh = known & requested if requested else known
    if requested and not refresh:
        print(f"No state-level sources among {sorted(requested)}; nothing to do.")
        return 0

    fresh: list[dict] = []
    manifest = None
    if OPENGA_SOURCE in refresh:
        openga_rows, manifest = refresh_openga()
        fresh += openga_rows
    if refresh & set(OPB_REPORTS):
        fresh += refresh_opb(sources)

    frame = merge_records(pd.DataFrame.from_records(fresh))
    if frame.empty:
        raise SystemExit("No state records produced — layouts may have changed.")
    frame = number_lines(frame)
    write_parquet(frame)
    write_state_json(frame)
    if manifest is not None:
        MANIFEST_FILE.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST_FILE.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n")

    print(f"Wrote {len(frame):,} records "
          f"({frame.fiscal_year.min()}-{frame.fiscal_year.max()}) to "
          f"{PARQUET_FILE.relative_to(ROOT)} and {STATE_DIR.relative_to(ROOT)}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
