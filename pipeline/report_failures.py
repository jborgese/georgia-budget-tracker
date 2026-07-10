"""Open, update, or close the source-failure GitHub issue.

Reads the per-source ``consecutive_failures`` counters that
pipeline/runlog.py and pipeline/check_sources.py maintain in
data/.source-state.json. When any source has failed on
``FAILURE_THRESHOLD`` or more consecutive runs, one issue (labelled
``source-failure``) is opened with the details — or, if it is already open,
its body is updated in place rather than a duplicate being filed. When every
source has recovered, the open issue is closed with a comment.

Runs in the data-refresh workflow with ``gh`` authenticated via GH_TOKEN.
Standard library only. Exits 0 unless the gh CLI itself fails.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from runlog import failing_sources

ROOT = Path(__file__).resolve().parent.parent
FAILURE_THRESHOLD = 3
LABEL = "source-failure"
TITLE = "Data refresh: sources failing on consecutive runs"


def gh(*args: str, capture: bool = False) -> str:
    result = subprocess.run(["gh", *args], check=True, text=True,
                            capture_output=capture)
    return result.stdout if capture else ""


def open_issue_number() -> int | None:
    output = gh("issue", "list", "--state", "open", "--label", LABEL,
                "--json", "number", capture=True)
    issues = json.loads(output or "[]")
    return issues[0]["number"] if issues else None


def issue_body(failing: dict[str, dict]) -> str:
    lines = [
        f"The daily data refresh has failed for the sources below on "
        f"{FAILURE_THRESHOLD} or more consecutive runs.",
        "",
        "| Source | Consecutive failures | Last error |",
        "| --- | --- | --- |",
    ]
    for source_id, entry in failing.items():
        error = str(entry.get("last_error", "")).replace("|", "\\|")[:200]
        lines.append(f"| `{source_id}` | {entry.get('consecutive_failures')} "
                     f"| {error} |")
    lines += [
        "",
        "Counters live in `data/.source-state.json`; a successful check or "
        "transform for a source resets its counter, and this issue closes "
        "automatically once every source recovers.",
        "",
        "_Maintained by the data-refresh workflow — edits to this body will "
        "be overwritten._",
    ]
    return "\n".join(lines)


def main() -> int:
    failing = failing_sources(FAILURE_THRESHOLD)
    existing = open_issue_number()

    if failing:
        body = issue_body(failing)
        if existing is not None:
            gh("issue", "edit", str(existing), "--body", body)
            print(f"Updated issue #{existing} "
                  f"({len(failing)} failing source(s)).")
        else:
            gh("label", "create", LABEL, "--force",
               "--description", "A data source is failing on consecutive runs",
               "--color", "B14E31")
            gh("issue", "create", "--title", TITLE, "--label", LABEL,
               "--body", body)
            print(f"Opened source-failure issue "
                  f"({len(failing)} failing source(s)).")
    elif existing is not None:
        gh("issue", "close", str(existing), "--comment",
           "Every source has succeeded again; closing automatically.")
        print(f"Closed issue #{existing}: all sources recovered.")
    else:
        print("No sources at the failure threshold; nothing to report.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        print(f"gh failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
