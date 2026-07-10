"""Change detection for upstream Georgia finance data sources.

Uses only the Python standard library so the scheduled workflow can run it
without installing dependencies. For each source in pipeline/sources.json,
fingerprint the resource — preferring ETag / Last-Modified headers, falling
back to a SHA-256 hash of the response body — and compare against the state
recorded in data/.source-state.json.

Exit code is always 0; changes are reported on stdout and, when running in
GitHub Actions, via the `changed` output so later steps can decide whether
to run the full ETL.
"""

from __future__ import annotations

import hashlib
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from runlog import log_event

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "pipeline" / "sources.json"
STATE_FILE = ROOT / "data" / ".source-state.json"
USER_AGENT = (
    "georgia-budget-tracker/0.1 (+https://github.com/<owner>/georgia-budget-tracker; "
    "civic data project; change detection only)"
)
TIMEOUT_SECONDS = 30


OPENGA_BASE = "https://open.ga.gov/openga"
OPENGA_INDEXES = ("payment/index", "obligation/index", "perdiem/index")


def fetch(opener, url: str, data: dict | None = None) -> str:
    encoded = urllib.parse.urlencode(data).encode() if data is not None else None
    request = urllib.request.Request(url, data=encoded,
                                     headers={"User-Agent": USER_AGENT})
    with opener.open(request, timeout=TIMEOUT_SECONDS) as response:
        return response.read().decode("utf-8", errors="replace")


def openga_years_fingerprint() -> dict:
    """Fingerprint the fiscal years offered by the Open Georgia search apps.

    The CSV exports sit behind a disclaimer POST and a session, so header or
    body fingerprints are meaningless; a new fiscal year appearing in any
    app's year dropdown is the signal that new data was published.
    """
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    fetch(opener, f"{OPENGA_BASE}/poa")
    fetch(opener, f"{OPENGA_BASE}/poHome/acceptDisclaimer",
          {"_action_acceptDisclaimer": "I Understand : Proceed"})
    years = {}
    for index in OPENGA_INDEXES:
        page = fetch(opener, f"{OPENGA_BASE}/{index}")
        select = re.search(r'name="selectedYear".*?</select>', page, re.S)
        found = re.findall(r'<option value="(\d{4})"', select.group(0)) if select else []
        years[index.split("/")[0]] = sorted(found)
    return {"years": years}


def fingerprint_with_retries(source_id: str, url: str, check: str,
                             attempts: int = 3, base_delay: float = 2.0) -> dict:
    for attempt in range(1, attempts + 1):
        try:
            return fingerprint(url, check)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            if attempt == attempts:
                raise
            delay = base_delay * 2 ** (attempt - 1)
            log_event("retry", source_id, attempt=attempt, delay_seconds=delay,
                      error=str(exc)[:300])
            time.sleep(delay)
    raise AssertionError("unreachable")


def fingerprint(url: str, check: str = "http") -> dict:
    """Return a fingerprint for the resource at ``url``."""
    if check == "openga_years":
        return openga_years_fingerprint()
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        headers = response.headers
        etag = headers.get("ETag")
        last_modified = headers.get("Last-Modified")
        if etag or last_modified:
            return {"etag": etag, "last_modified": last_modified}
        body = response.read()
        return {"sha256": hashlib.sha256(body).hexdigest()}


def main() -> int:
    sources = json.loads(SOURCES_FILE.read_text())["sources"]
    state = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}

    changed: list[str] = []
    errors: list[str] = []

    for source in sources:
        source_id, url = source["id"], source["url"]
        entry = state.setdefault(source_id, {})
        try:
            current = fingerprint_with_retries(source_id, url,
                                               source.get("check", "http"))
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            errors.append(f"{source_id}: {exc}")
            failures = int(entry.get("consecutive_failures", 0)) + 1
            entry["consecutive_failures"] = failures
            entry["last_error"] = str(exc)[:500]
            log_event("check_failed", source_id, consecutive_failures=failures,
                      error=str(exc)[:300])
            continue

        entry.pop("consecutive_failures", None)
        entry.pop("last_error", None)
        previous = entry.get("fingerprint")
        if previous != current:
            changed.append(source_id)
        log_event("changed" if previous != current else "unchanged", source_id)
        entry["fingerprint"] = current
        entry["checked_at"] = datetime.now(timezone.utc).isoformat(
            timespec="seconds")

    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")

    if changed:
        print(f"Changed sources: {', '.join(changed)}")
    else:
        print("No source changes detected.")
    for error in errors:
        print(f"WARNING unreachable — {error}", file=sys.stderr)

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as handle:
            handle.write(f"changed={'true' if changed else 'false'}\n")
            handle.write(f"changed_sources={' '.join(changed)}\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
