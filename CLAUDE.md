# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static-first civic data project tracking how the State of Georgia (down to the county level) apportions its finances. There is **no runtime database or application server** — government finance data publishes on annual schedules, so the architecture is:

1. A daily GitHub Actions workflow (`.github/workflows/data-refresh.yml`) runs cheap change detection against each upstream source.
2. When a source changes, the Python ETL in `pipeline/` downloads and normalizes data into `data/processed/` (Parquet + pre-aggregated JSON per county/fiscal year).
3. Data changes are **committed to git** — the revision history of the numbers is intentionally the public audit trail — and a commit triggers a rebuild of the static site in `web/`.

Current status: change detection, the ETLs (`etl_rlgf.py`, `etl_state.py`, `etl_population.py`), the statewide dashboard homepage, the county choropleth, per-county ledger pages (`/county/[slug]`), the comparison view (`/compare`), the methodology page (`/about`, which renders `pipeline/crosswalk.json` directly so the documented crosswalk can't drift from the code), and a site nav with county search are all live.

## Commands

Frontend (`web/`):

```bash
cd web
npm install
npm run dev      # dev server
npm run build    # static build
npm run lint     # eslint
# accessibility scan of the built site (serve out/, then axe via headless Firefox):
python3 -m http.server 8377 --directory out &
MOZ_HEADLESS=1 npx axe http://localhost:8377/ --browser firefox
```

Accessibility invariants: text colors must hold WCAG AA on paper (`GOLD` was darkened to #856624 for this — don't lighten it), every chart keeps a table twin, the choropleth `svg` must NOT have `role="img"` (it contains focusable county links), and non-filing data renders as explicit "no filing"/gaps, never $0.

Pipeline (`pipeline/`):

```bash
cd pipeline
python check_sources.py    # change detection — stdlib only, no venv/deps needed
# Full ETL deps (only needed for transforms, not check_sources.py):
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # httpx, openpyxl, pandas, duckdb, pdfplumber, pyarrow
python etl_rlgf.py                # RLGF county transform; optional arg = local workbook path (skips download)
python etl_state.py               # state-level transform; optional args = changed source ids (refreshes only those)
python normalize.py               # build normalized.parquet + manifest.json, validating the data contract
```

Tests and lint (run from the repo root; config in `pyproject.toml`, dev deps in `pipeline/requirements-dev.txt`):

```bash
pytest                            # pipeline/tests — pure-function tests, no network
pytest pipeline/tests/test_schema.py::test_valid_frame_passes   # single test
ruff check pipeline
```

CI (`.github/workflows/ci.yml`) runs ruff + pytest and the web eslint on every PR and push to main.

## Architecture notes

- **`pipeline/sources.json`** is the machine-readable source registry (id, url, cadence, level: state|county). Add new upstream sources here — both `check_sources.py` and the README's source table derive from it.
- **`pipeline/check_sources.py`** fingerprints each source (ETag/Last-Modified headers, falling back to SHA-256 of the body) and compares against `data/.source-state.json`. It is deliberately stdlib-only so the scheduled workflow runs it without installing dependencies — keep it that way. It always exits 0 and communicates changes via stdout and the `changed`/`changed_sources` `GITHUB_OUTPUT` values, which gate the per-source ETL steps in the workflow. A source with `"check": "openga_years"` in sources.json is fingerprinted by the fiscal-year lists in the Open Georgia search apps (behind a disclaimer POST) instead of by URL headers.
- **`pipeline/etl_state.py`** produces `data/processed/state_finances.parquet` and `data/processed/state/*.json` in the county long format with `entity` in place of `county` plus `basis` (actual/reported/estimated/amended_budget/budget) and `source` columns. Open Georgia CSV exports are aggregated to per-organization totals (vendor-level raw is not committed — see `data/README.md`); OPB Governor's Budget Report tables are parsed from PDF via word x-positions (amounts map to fiscal-year columns by right-edge proximity; sparse rows are why order-based parsing fails). When OPB publishes a new report (the `opb_budget_reports` listing source will flag it), add the PDF to sources.json and to `OPB_REPORTS` in etl_state.py — never register the report whose URL slug says UNPUBLISHED/DO-NOT-SHARE. GDAC dashboards are display-only (Tableau export disabled by permission) — don't try to scrape them.
- **`pipeline/etl_rlgf.py`** parses the TED all-counties workbook (source id `ted_rlgf_county_workbook`: one sheet per county, classification rows indented 5 spaces per hierarchy level, fiscal-year columns) into a tidy Parquet file plus per-county JSON aggregates in `data/processed/counties/`. Only the Revenues / Operating Expenditures / Capital Expenditures sections are extracted. Parquet output is byte-deterministic, so data-refresh commits only show real changes. The 8 consolidated city-county governments are a separate TED government type and are not in this dataset.
- **`pipeline/schema.py` + `pipeline/crosswalk.json`** define the data contract: the normalized long format (`entity, entity_type state|county, fips, fiscal_year, category, subcategory, amount`), the disjoint revenue/expenditure category vocabulary (never reuse a category name across sides — reconciliation derives the side from the category), the Census county roster (`ga_counties.json`, all 159 counties), and `KNOWN_MISSING_COUNTIES` (the 8 consolidated governments). Pandera checks enforce county completeness, source-total reconciliation, and no impossible negatives.
- **`pipeline/normalize.py`** maps both transforms through the crosswalk into `data/processed/normalized.parquet` and writes `data/processed/manifest.json` (vintage + coverage per source, reconciliation stats). Synthetic `(unallocated)`/`(reconciliation adjustment)` rows keep every entity/year summing exactly to the source's printed totals — the sources themselves are internally inconsistent in places (e.g. RLGF operating parts exceed the printed total; the FY2026 OPB PDF prints one revenue line twice). Unmapped classifications fail loudly: add new agencies/classifications to crosswalk.json deliberately. Open Georgia data is excluded from the normalized table (cash-basis payments would double-count OPB budgetary expenditures) but covered in the manifest.
- **`pipeline/etl_population.py`** merges the two Census county-population vintages (newer wins on overlap) into `data/processed/county_population.json`. `normalize.py` joins it with RLGF totals into `data/processed/counties/metrics.json` for the choropleth and county pages. County-years the TED workbook fills with literal zeros are non-filings and become explicit nulls, never $0.
- **`data/`** holds `raw/` (files as downloaded) and `processed/` (normalized outputs), plus `.source-state.json` (fingerprint state, committed by the workflow's bot).
- **`web/`** is Next.js 16 (App Router, TypeScript, Tailwind 4) with `output: "export"` — fully static, no server. Per `web/AGENTS.md`: this Next.js version has breaking changes vs. training data — read the relevant guide in `web/node_modules/next/dist/docs/` before writing Next.js code.
- **`web/lib/data.ts`** is the typed build-time data layer: server components read `../data/processed/*.json` (types in `web/lib/types.ts`) during `next build`, so the site rebuilds from committed data with no fetches. Charts are Recharts client components fed typed props. Chart colors live in `web/lib/theme.ts` — the 5 categorical slots were validated for CVD/contrast against the paper background; don't add or reorder slots casually, and keep the ledger design language (paper/spruce/gold, mono figures). Every chart keeps its legend and a "View as table" twin. The county choropleth (`web/components/CountyChoropleth.tsx`) filters Georgia from us-atlas TopoJSON server-side (`web/lib/geo.ts`) and projects client-side with d3-geo; its sequential green ramp was validated for monotone lightness — non-filing and consolidated counties render as gray "No data", never as zeros.
