# Georgia State Budget Tracker

A user-friendly, web-hosted page that coalesces publicly available data so visitors can
easily view how the State of Georgia — down to the county level — apportions its finances.

## How it works

This is a static-first project. Georgia's budget and local-government finance data is
published on annual government schedules, not in real time, so there is no runtime
database or application server. Instead:

1. A scheduled GitHub Actions workflow (`.github/workflows/data-refresh.yml`) runs a
   cheap change-detection pass against each upstream source (ETag / Last-Modified
   headers, or a content hash when neither is available).
2. When a source has changed, the full ETL in `pipeline/` downloads, cleans, and
   normalizes the data into versioned files under `data/processed/`.
3. New data is committed to this repository — so every revision of the numbers is
   publicly auditable in git history — and the commit triggers a rebuild of the static
   site in `web/`.

## Repository layout

| Path         | Purpose                                                        |
| ------------ | -------------------------------------------------------------- |
| `web/`       | Next.js (TypeScript + Tailwind) statically generated frontend  |
| `pipeline/`  | Python ETL: source registry, change detection, transforms      |
| `data/`      | Versioned raw + processed datasets, with provenance notes      |
| `.github/`   | Scheduled data-refresh workflow                                |

## Data sources

| Source | What it provides | Cadence |
| ------ | ---------------- | ------- |
| [Open Georgia](https://open.ga.gov/) | State employee salaries & travel; payments, obligations, and professional-services expenditures of state organizations | Annual |
| [Georgia Data Analytics Center](https://gdac.georgia.gov/budget) | State of Georgia revenues and expenditures dashboards | Annual |
| [DCA — Report of Local Government Finances](https://dca.georgia.gov/community-assistance/government-authority-reporting/report-local-government-finance-rlgf) | County / municipal revenues, expenditures, debt, and assets (required annual filing) | Rolling — due 6 months after each government's fiscal year closes |
| [Tax & Expenditure Data Center (UGA CVIOG)](https://ted.cviog.uga.edu/) | Downloadable RLGF datasets and local budget documents | Rolling / annual |
| [GeorgiaData.org Local Government Financial Portal](https://georgiadata.org/financialdata) | Searchable county, municipal, and school-system financial data | Annual |

A machine-readable registry of these sources lives in `pipeline/sources.json`.

## Local development

Frontend:

```bash
cd web
npm install
npm run dev
```

Pipeline:

```bash
cd pipeline
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python check_sources.py        # change detection only (stdlib, no deps needed)
```

## Status

Early scaffold. The change-detection workflow is live; ETL transforms and the
visualization layer (charts + county choropleth) are the next milestones.

## License

MIT — see [LICENSE](LICENSE).
