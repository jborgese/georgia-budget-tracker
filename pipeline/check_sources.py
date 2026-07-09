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
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "pipeline" / "sources.json"
STATE_FILE = ROOT / "data" / ".source-state.json"
USER_AGENT = (
    "georgia-budget-tracker/0.1 (+https://github.com/<owner>/georgia-budget-tracker; "
    "civic data project; change detection only)"
)
TIMEOUT_SECONDS = 30


def fingerprint(url: str) -> dict:
    """Return a fingerprint for the resource at ``url``."""
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
        try:
            current = fingerprint(url)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            errors.append(f"{source_id}: {exc}")
            continue

        previous = state.get(source_id, {}).get("fingerprint")
        if previous != current:
            changed.append(source_id)
        state[source_id] = {
            "fingerprint": current,
            "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }

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
