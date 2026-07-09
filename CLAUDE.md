# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static-first civic data project tracking how the State of Georgia (down to the county level) apportions its finances. There is **no runtime database or application server** — government finance data publishes on annual schedules, so the architecture is:

1. A daily GitHub Actions workflow (`.github/workflows/data-refresh.yml`) runs cheap change detection against each upstream source.
2. When a source changes, the Python ETL in `pipeline/` downloads and normalizes data into `data/processed/` (Parquet + pre-aggregated JSON per county/fiscal year).
3. Data changes are **committed to git** — the revision history of the numbers is intentionally the public audit trail — and a commit triggers a rebuild of the static site in `web/`.

Current status: early scaffold. Change detection is live; the ETL transforms ("Run ETL" workflow step is a placeholder) and visualization layer (charts + county choropleth) are not built yet.

## Commands

Frontend (`web/`):

```bash
cd web
npm install
npm run dev      # dev server
npm run build    # static build
npm run lint     # eslint
```

Pipeline (`pipeline/`):

```bash
cd pipeline
python check_sources.py    # change detection — stdlib only, no venv/deps needed
# Full ETL deps (only needed for transforms, not check_sources.py):
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # httpx, pandas, duckdb, pdfplumber, pyarrow
```

There is no test suite yet.

## Architecture notes

- **`pipeline/sources.json`** is the machine-readable source registry (id, url, cadence, level: state|county). Add new upstream sources here — both `check_sources.py` and the README's source table derive from it.
- **`pipeline/check_sources.py`** fingerprints each source (ETag/Last-Modified headers, falling back to SHA-256 of the body) and compares against `data/.source-state.json`. It is deliberately stdlib-only so the scheduled workflow runs it without installing dependencies — keep it that way. It always exits 0 and communicates changes via stdout and the `changed`/`changed_sources` `GITHUB_OUTPUT` values, which gate the ETL step in the workflow.
- **`data/`** holds `raw/` (files as downloaded) and `processed/` (normalized outputs), plus `.source-state.json` (fingerprint state, committed by the workflow's bot).
- **`web/`** is Next.js 16 (App Router, TypeScript, Tailwind 4). Per `web/AGENTS.md`: this Next.js version has breaking changes vs. training data — read the relevant guide in `web/node_modules/next/dist/docs/` before writing Next.js code.
