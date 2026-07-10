"""Structured run logging and per-source failure accounting.

Standard library only, so pipeline/check_sources.py can import it without
installing dependencies.

``log_event`` prints one JSON object per line to stdout — the machine-readable
record of what a run fetched, skipped, retried, and failed. Human-readable
prints elsewhere are unaffected.

``record_outcome`` maintains ``consecutive_failures`` and ``last_error`` on a
source's entry in data/.source-state.json (alongside the fingerprint state the
change detector keeps there). Any successful check or transform for a source
resets its counter; pipeline/report_failures.py turns sustained failures into
a GitHub issue.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE_FILE = ROOT / "data" / ".source-state.json"


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def log_event(event: str, source: str | None = None, **fields) -> None:
    record = {"event": event}
    if source is not None:
        record["source"] = source
    record.update({key: value for key, value in fields.items() if value is not None})
    print(json.dumps(record, sort_keys=True), flush=True)


def _load_state(state_file: Path) -> dict:
    return json.loads(state_file.read_text()) if state_file.exists() else {}


def _write_state(state: dict, state_file: Path) -> None:
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")


def record_outcome(source_id: str, ok: bool, error: str | None = None,
                   state_file: Path | None = None) -> int:
    state_file = state_file or STATE_FILE
    state = _load_state(state_file)
    entry = state.setdefault(source_id, {})
    if ok:
        entry.pop("consecutive_failures", None)
        entry.pop("last_error", None)
        failures = 0
    else:
        failures = int(entry.get("consecutive_failures", 0)) + 1
        entry["consecutive_failures"] = failures
        entry["last_error"] = str(error)[:500] if error else "unknown error"
    _write_state(state, state_file)
    return failures


def failing_sources(threshold: int, state_file: Path | None = None) -> dict[str, dict]:
    state = _load_state(state_file or STATE_FILE)
    return {
        source_id: entry
        for source_id, entry in sorted(state.items())
        if int(entry.get("consecutive_failures", 0)) >= threshold
    }
