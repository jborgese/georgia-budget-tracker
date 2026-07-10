"""Resilient downloads for the ETL transforms.

``download_file`` and ``call_with_retries`` retry transient failures with
exponential backoff (base_delay, doubling per attempt) under a wall-clock
budget: a retry is only attempted while elapsed time plus the next delay fits
inside ``budget`` seconds, so a flaky source cannot stall a run indefinitely.
Every fetch, retry, and terminal failure is logged as a structured event via
pipeline/runlog.py.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Callable, TypeVar

import httpx

from runlog import log_event

USER_AGENT = (
    "georgia-budget-tracker/0.1 (+https://github.com/<owner>/georgia-budget-tracker; "
    "civic data project)"
)
DEFAULT_ATTEMPTS = 4
DEFAULT_BASE_DELAY = 2.0
DEFAULT_TIMEOUT = 120.0
DEFAULT_BUDGET = 600.0
class TransientDataError(OSError):
    """A response arrived but was not usable; worth retrying."""


RETRYABLE = (httpx.HTTPError, OSError)

T = TypeVar("T")


def call_with_retries(operation: Callable[[], T], *, source: str,
                      description: str,
                      attempts: int = DEFAULT_ATTEMPTS,
                      base_delay: float = DEFAULT_BASE_DELAY,
                      budget: float = DEFAULT_BUDGET) -> T:
    start = time.monotonic()
    for attempt in range(1, attempts + 1):
        try:
            return operation()
        except RETRYABLE as exc:
            delay = base_delay * 2 ** (attempt - 1)
            elapsed = time.monotonic() - start
            if attempt == attempts or elapsed + delay > budget:
                log_event("fetch_failed", source, description=description,
                          attempts=attempt, elapsed_seconds=round(elapsed, 1),
                          error=str(exc)[:300])
                raise
            log_event("retry", source, description=description, attempt=attempt,
                      delay_seconds=delay, error=str(exc)[:300])
            time.sleep(delay)
    raise AssertionError("unreachable")


def download_file(url: str, destination: Path, *, source: str,
                  attempts: int = DEFAULT_ATTEMPTS,
                  base_delay: float = DEFAULT_BASE_DELAY,
                  timeout: float = DEFAULT_TIMEOUT,
                  budget: float = DEFAULT_BUDGET) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + ".part")

    def fetch() -> None:
        with httpx.stream("GET", url, headers={"User-Agent": USER_AGENT},
                          timeout=timeout, follow_redirects=True) as response:
            response.raise_for_status()
            with partial.open("wb") as handle:
                for chunk in response.iter_bytes():
                    handle.write(chunk)

    try:
        call_with_retries(fetch, source=source, description=url,
                          attempts=attempts, base_delay=base_delay, budget=budget)
    except RETRYABLE:
        partial.unlink(missing_ok=True)
        raise
    partial.replace(destination)
    log_event("fetched", source, url=url, bytes=destination.stat().st_size)
