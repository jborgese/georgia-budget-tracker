# Data

Versioned datasets with provenance.

- `raw/` — files as downloaded from each source (see `pipeline/sources.json`).
  Exception: Open Georgia vendor-level CSV exports (~9 MB per fiscal year per
  app) are not committed; `raw/open_georgia_manifest.json` records the SHA-256
  and row count of every export consumed, and the aggregated per-organization
  records live in `processed/state_finances.parquet`.
- `processed/` — cleaned, normalized Parquet + pre-aggregated JSON per county and fiscal year.
- `.source-state.json` — fingerprints written by `pipeline/check_sources.py`.

Every change to these files goes through a commit, so the full revision history of the numbers is publicly auditable.
