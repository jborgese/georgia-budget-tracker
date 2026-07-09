# Data

Versioned datasets with provenance.

- `raw/` — files as downloaded from each source (see `pipeline/sources.json`).
- `processed/` — cleaned, normalized Parquet + pre-aggregated JSON per county and fiscal year.
- `.source-state.json` — fingerprints written by `pipeline/check_sources.py`.

Every change to these files goes through a commit, so the full revision history of the numbers is publicly auditable.
