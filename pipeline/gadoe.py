"""Session-bound access to GaDOE's Financial Review reporting portal.

Standard library only, so pipeline/check_sources.py can import it without
installing dependencies (the same constraint as runlog.py); etl_gadoe.py
shares the flow for its downloads.

The portal (financeweb.doe.k12.ga.us/FinancialPublicWeb) is a classic
ASP.NET WebForms page in front of an SSRS ReportViewer: posting the fiscal
year back populates the system and report dropdowns, "View Report" renders
the report inline, and the export handler
(Reserved.ReportViewerWebControl.axd?...&OpType=Export) is bound to the
ASP.NET session cookie plus a per-render ReportSession. URL-header
fingerprints are therefore meaningless and every export must replay the
postback flow — the same reason Open Georgia has its disclaimer POST in
etl_state.py.

Renders are deterministic except the State Total row's percentage cells (an
upstream SSRS aggregate quirk), so ``csv_digest`` fingerprints only the
per-system fields of the CSV render: SystemID, SystemName, ColumnName, and
the cell value. The repeated statewide-total columns and the fund/source
legend rows are excluded.
"""

from __future__ import annotations

import csv
import hashlib
import http.cookiejar
import io
import json
import re
import time
import urllib.parse
import urllib.request

BASE_URL = "https://financeweb.doe.k12.ga.us/FinancialPublicWeb/"
MENU_URL = BASE_URL + "ReportsMenuPublic.aspx"
REVENUES_REPORT = "School System Revenues"
ALL_SYSTEMS = "All Systems"
USER_AGENT = (
    "georgia-budget-tracker/0.1 (+https://github.com/<owner>/georgia-budget-tracker; "
    "civic data project)"
)
TIMEOUT_SECONDS = 180
THROTTLE_SECONDS = 1.0
CSV_DATA_WIDTH = 9


class PortalLayoutError(OSError):
    """An expected page element is missing — the portal layout changed."""


def build_opener() -> urllib.request.OpenerDirector:
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def fetch_bytes(opener, url: str, data: dict | None = None) -> bytes:
    encoded = urllib.parse.urlencode(data).encode() if data is not None else None
    request = urllib.request.Request(url, data=encoded,
                                     headers={"User-Agent": USER_AGENT})
    with opener.open(request, timeout=TIMEOUT_SECONDS) as response:
        return response.read()


def fetch_text(opener, url: str, data: dict | None = None) -> str:
    return fetch_bytes(opener, url, data).decode("utf-8", errors="replace")


def hidden_fields(page: str) -> dict[str, str]:
    return dict(re.findall(
        r'<input type="hidden" name="([^"]+)"[^>]*value="([^"]*)"', page))


def select_options(page: str, name: str) -> dict[str, str]:
    select = re.search(rf'<select name="{name}"[^>]*>(.*?)</select>', page, re.S)
    if not select:
        raise PortalLayoutError(f"No <select name={name!r}> on the page.")
    return {label.strip(): value for value, label in re.findall(
        r'<option(?:\s+selected="selected")?\s+value="([^"]*)">([^<]*)</option>',
        select.group(1))}


def year_values(page: str) -> dict[int, str]:
    years = {int(label): value
             for label, value in select_options(page, "ddlFiscalYear").items()
             if re.fullmatch(r"\d{4}", label)}
    if not years:
        raise PortalLayoutError("No fiscal years in the ddlFiscalYear options.")
    return years


def export_url(page: str, export_format: str) -> str:
    match = re.search(r'"ExportUrlBase":"([^"]+)"', page)
    if not match:
        raise PortalLayoutError("No ExportUrlBase in the rendered report page.")
    base = json.loads(f'"{match.group(1)}"')
    return urllib.parse.urljoin(BASE_URL, base) + export_format


def export_revenues(opener, year_value: str, export_format: str) -> bytes:
    page = fetch_text(opener, MENU_URL)
    time.sleep(THROTTLE_SECONDS)
    page = fetch_text(opener, MENU_URL, {
        **hidden_fields(page), "__EVENTTARGET": "ddlFiscalYear",
        "__EVENTARGUMENT": "", "ddlFiscalYear": year_value,
        "ddlSystem": "0", "ddlReports": "0"})
    systems = select_options(page, "ddlSystem")
    reports = select_options(page, "ddlReports")
    if ALL_SYSTEMS not in systems or REVENUES_REPORT not in reports:
        raise PortalLayoutError(
            f"Postback did not offer {ALL_SYSTEMS!r} and {REVENUES_REPORT!r}.")
    time.sleep(THROTTLE_SECONDS)
    page = fetch_text(opener, MENU_URL, {
        **hidden_fields(page), "__EVENTTARGET": "", "__EVENTARGUMENT": "",
        "ddlFiscalYear": year_value, "ddlSystem": systems[ALL_SYSTEMS],
        "ddlReports": reports[REVENUES_REPORT],
        "btnPrintReport": "View Report"})
    return fetch_bytes(opener, export_url(page, export_format))


def csv_digest(text: str) -> str:
    rows = csv.reader(io.StringIO(text.lstrip("﻿")))
    stable = [",".join(field.strip() for field in row[:4]) for row in rows
              if len(row) == CSV_DATA_WIDTH and row[0].strip().isdigit()]
    if not stable:
        raise PortalLayoutError("CSV render contained no per-system rows.")
    return hashlib.sha256("\n".join(stable).encode()).hexdigest()


def revenues_fingerprint() -> dict:
    """Fingerprint for check_sources.py (``"check": "gadoe_revenues"``).

    The fiscal-year list catches a new year appearing; the digest of the
    newest year's CSV render catches systems filing or revising figures
    within the year.
    """
    opener = build_opener()
    years = year_values(fetch_text(opener, MENU_URL))
    newest = max(years)
    text = export_revenues(opener, years[newest], "CSV").decode(
        "utf-8", errors="replace")
    return {"years": sorted(years), "fiscal_year": newest,
            "sha256": csv_digest(text)}
