# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static-first civic data project tracking how the State of Georgia (down to the county level) apportions its finances. There is **no runtime database or application server** — government finance data publishes on annual schedules, so the architecture is:

1. A daily GitHub Actions workflow (`.github/workflows/data-refresh.yml`) runs cheap change detection against each upstream source.
2. When a source changes, the Python ETL in `pipeline/` downloads and normalizes data into `data/processed/` (Parquet + pre-aggregated JSON per county/fiscal year).
3. Data changes are **committed to git** — the revision history of the numbers is intentionally the public audit trail — and a commit triggers a rebuild of the static site in `web/`.

Current status: change detection, the ETLs (`etl_rlgf.py` covering county, city, and consolidated-government workbooks, `etl_state.py`, `etl_population.py`, `etl_schools.py`, `etl_digest.py`), the statewide dashboard homepage, the county choropleth, ledger pages for every level (`/county/[slug]`, `/city/[slug]`, `/consolidated/[slug]`, `/school/[slug]`), the resident-profile tax stack (`/stack` and `/stack/[county]` — digest millage rates stacked per address with a city picker), the comparison view (`/compare`), the methodology page (`/about`, which renders `pipeline/crosswalk.json` directly so the documented crosswalk can't drift from the code), and a site nav with search across all government types are all live.

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
pip install -r requirements.txt   # httpx, openpyxl, pandas, duckdb, pdfplumber, pyarrow, xlrd
python etl_rlgf.py                # RLGF transform; optional args = government type (county|city|consolidated, default county) and local workbook path (skips download)
python etl_state.py               # state-level transform; optional args = changed source ids (refreshes only those)
python etl_schools.py             # Census F-33 school district transform; optional args = changed source ids
python etl_digest.py              # DOR tax digest (millage) transform; optional args = changed source ids
python etl_population.py          # county + incorporated-place population denominators
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
- **`pipeline/etl_rlgf.py`** parses the three TED RLGF workbooks — counties (`ted_rlgf_county_workbook`), cities (`ted_rlgf_city_workbook`, 522 sheets), and consolidated city-county governments (`ted_rlgf_consolidated_workbook`, 8 sheets) — which share one layout: one sheet per government, classification rows indented 5 spaces per hierarchy level, fiscal-year columns. Each run writes a tidy Parquet file plus per-government JSON aggregates (`data/processed/counties|cities|consolidated/`). Only the Revenues / Operating Expenditures / Capital Expenditures sections are extracted. Parquet output is byte-deterministic, so data-refresh commits only show real changes. County outputs keep legacy `county`/`counties` key names; city and consolidated outputs use generic `entity`/`entities`. Consolidated sheet names are canonicalized (`Macon-Bibb County` → `MACON-BIBB`).
- **`pipeline/schema.py` + `pipeline/crosswalk.json`** define the data contract: the normalized long format (`entity, entity_type state|county|city|consolidated, fips, fiscal_year, category, subcategory, amount`), the disjoint revenue/expenditure category vocabulary (never reuse a category name across sides — reconciliation derives the side from the category), the Census county roster (`ga_counties.json`, all 159 counties), `KNOWN_MISSING_COUNTIES` (the 8 consolidated governments, absent from *county* filings), and `CONSOLIDATED_GOVERNMENTS` (their roster; fips = the underlying county's). City fips is the bare `13` state prefix until the Census place roster lands. Reconciliation totals are keyed by `(entity_type, entity, fiscal_year, side)` because city and county names collide (DECATUR). Pandera checks enforce county + consolidated completeness, source-total reconciliation, and no impossible negatives.
- **`pipeline/normalize.py`** maps both transforms through the crosswalk into `data/processed/normalized.parquet` and writes `data/processed/manifest.json` (vintage + coverage per source, reconciliation stats). Synthetic `(unallocated)`/`(reconciliation adjustment)` rows keep every entity/year summing exactly to the source's printed totals — the sources themselves are internally inconsistent in places (e.g. RLGF operating parts exceed the printed total; the FY2026 OPB PDF prints one revenue line twice). Unmapped classifications fail loudly: add new agencies/classifications to crosswalk.json deliberately. Open Georgia data is excluded from the normalized table (cash-basis payments would double-count OPB budgetary expenditures) but covered in the manifest.
- **`pipeline/etl_schools.py`** parses the Census F-33 individual-unit workbooks (source ids `census_f33_YYYY`, FY1992+, all at `tables/YYYY/secondary-education-finance/elsecYY.xls[x]`) into `data/processed/school_finances.parquet` and per-district JSON in `data/processed/schools/`: Georgia's regular school systems (school level 03) with revenues by source (property tax, ESPLOST sales tax, state, federal), expenditures by function, debt, enrollment, and per-pupil metrics. F-33 dollars are in thousands (scaled to whole dollars); pre-2022 vintages identify Georgia by Census state code 11 instead of FIPST, and vintages through FY2002 carry the county FIPS as `FIPS` rather than `CONUM` (each entry in `F33_FIELDS` is a tuple of accepted column names) — the longest name variant becomes the canonical display name and slug. School finances stay **out of** `normalized.parquet`: state QBE aid is already counted there as state Department of Education spending (same double-count reasoning that excludes Open Georgia). Raw F-33 workbooks (~12-16 MB each, nationwide) are fingerprinted but not committed.
- **`pipeline/etl_digest.py`** parses the DOR consolidated tax digest exports republished by GeorgiaData.org (source ids `dor_digest_YYYY`, tax years 1990+; fid = year − 1856 for 1990–2015) into `data/processed/digest.parquet` (full history) and `data/processed/counties/millage.json` (windowed to the most recent `MILLAGE_WEB_YEARS` = 10 tax years — the site renders only the latest year, so the web JSON stays small while the parquet keeps the full series): one row per county and taxing district with assessed values, M&O/bond millage rates, and levies — the tax-bill lens, and the only machine-readable view of sub-county districts (fire, hospital/development-authority levies). Empty millage cells stay null (not reported), never 0. Vintages 1990–2013 use raw DOR column names (`tax-mlg-mo`); 2014+ use display names (`Millage Rate-M&O`) — `DIGEST_COLUMNS` maps each field to both. The 2023–2024 vintages key some rows under truncated/suffixed county names (`CHARLT TB`, `GORDCO`); `canonical_county()` resolves them against the Census roster by progressively dropping trailing tokens, with a duplicate guard. `KNOWN_MISSING` documents counties absent upstream (WAYNE 2014–2015, FULTON 2017–2018); split district rows with one rate (2022 CHEROKEE fire district) are summed. georgiadata.org's WAF blocks httpx's TLS fingerprint but allows stdlib urllib — downloads use `fetching.download_file_stdlib` and fall back to the committed raw file. This data feeds the county pages' rates tables and the `/stack` resident-profile view.
- **`pipeline/etl_population.py`** merges the two Census county-population vintages (newer wins on overlap) into `data/processed/county_population.json`, and merges the two incorporated-place vintage files (SUMLEV 162, 2010+; the 2010s file lives at `datasets/2010-2020/cities/SUB-EST2020_13.csv` — no `totals/` segment, uppercase — and carries a `POPESTIMATE042020` April-census column that is excluded) into `data/processed/city_population.json` keyed by place name normalized to the RLGF convention; `normalize.py` joins the latter to city entities (alias map `PLACE_NAME_ALIASES` bridges spelling differences) for `cities/metrics.json`. `normalize.py` joins it with RLGF totals into `data/processed/counties/metrics.json` for the choropleth and county pages. County-years the TED workbook fills with literal zeros are non-filings and become explicit nulls, never $0.
- **`pipeline/runlog.py` (stdlib) + `pipeline/fetching.py`** are the hardening layer: structured JSON event lines to stdout (fetched/skipped/retry/transform_failed), retries with exponential backoff under a wall-clock budget (downloads go to a `.part` file and rename on success), and per-source `consecutive_failures`/`last_error` counters kept in `data/.source-state.json` alongside fingerprints (any success resets a source's counter). ETL steps in the workflow run `continue-on-error: true` so one bad source can't block the others; the normalize step stays a hard gate; on contract failure only `.source-state.json` is committed. `pipeline/report_failures.py` (run with `issues: write`) opens/updates/closes a single `source-failure` GitHub issue when any source hits 3 consecutive failures — update the one issue, never duplicate.
- **`data/`** holds `raw/` (files as downloaded) and `processed/` (normalized outputs), plus `.source-state.json` (fingerprint state and failure counters, committed by the workflow's bot).
- **`web/`** is Next.js 16 (App Router, TypeScript, Tailwind 4) with `output: "export"` — fully static, no server. Per `web/AGENTS.md`: this Next.js version has breaking changes vs. training data — read the relevant guide in `web/node_modules/next/dist/docs/` before writing Next.js code.
- **`web/lib/data.ts`** is the typed build-time data layer: server components read `../data/processed/*.json` (types in `web/lib/types.ts`) during `next build`, so the site rebuilds from committed data with no fetches. Charts are Recharts client components fed typed props. Chart colors live in `web/lib/theme.ts` — the 5 categorical slots were validated for CVD/contrast against the paper background; don't add or reorder slots casually, and keep the ledger design language (paper/spruce/gold, mono figures). Every chart keeps its legend and a "View as table" twin. The county choropleth (`web/components/CountyChoropleth.tsx`) filters Georgia from us-atlas TopoJSON server-side (`web/lib/geo.ts`) and projects client-side with d3-geo; its sequential green ramp was validated for monotone lightness — non-filing and consolidated counties render as gray "No data", never as zeros.
