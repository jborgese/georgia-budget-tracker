import fs from "node:fs";
import path from "node:path";
import type {
  Basis,
  CategorySeries,
  CountiesIndexDocument,
  CountyCategoriesDocument,
  CountyDocument,
  CountyMetricsDocument,
  CountyPageData,
  DashboardData,
  FiscalYearTotals,
  ManifestDocument,
  MedianYear,
  Side,
  SourceNote,
  StateCategoriesDocument,
  StateIndexDocument,
} from "./types";

const PROCESSED_DIR = path.resolve(process.cwd(), "..", "data", "processed");
const PIPELINE_DIR = path.resolve(process.cwd(), "..", "pipeline");

export const CATEGORY_LABELS: Record<string, string> = {
  taxes: "Taxes",
  charges_and_fees: "Charges & fees",
  other_revenue: "Other revenue",
  intergovernmental_revenue: "Intergovernmental",
  enterprise_revenue: "Enterprise",
  education: "Education",
  health_and_welfare: "Health & welfare",
  public_safety: "Public safety",
  public_works: "Public works & transportation",
  general_government: "General government",
  judicial: "Judicial",
  community_and_economic_development: "Community & economic development",
  natural_resources: "Natural resources & agriculture",
  debt_service: "Debt service",
  culture_and_recreation: "Culture & recreation",
  enterprise_operations: "Enterprise operations",
  intergovernmental_expenditure: "Intergovernmental",
  other_expenditure: "Other",
};

const SOURCE_NAMES: Record<string, string> = {
  ted_rlgf_county_workbook: "UGA TED — Report of Local Government Finances",
  open_georgia_poa: "Open Georgia — payments, obligations, professional services",
  opb_governors_budget_report_fy2026:
    "OPB — Governor's Budget Report, AFY 2025 & FY 2026",
  census_county_pop_2020s: "US Census — county population estimates",
};

function readJson<T>(...segments: string[]): T {
  const file = path.join(PROCESSED_DIR, ...segments);
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

export interface CrosswalkDocument {
  categories: { revenue: string[]; expenditure: string[] };
  rlgf: Record<"revenues" | "operating" | "capital", Record<string, string>>;
  opb: {
    revenue_groups: Record<string, string>;
    agencies: Record<string, string>;
  };
}

export interface SourceRegistryEntry {
  id: string;
  name: string;
  url: string;
  provides: string;
  cadence: string;
  level: "state" | "county";
  note?: string;
  check?: string;
}

export function loadCrosswalk(): CrosswalkDocument {
  const file = path.join(PIPELINE_DIR, "crosswalk.json");
  return JSON.parse(fs.readFileSync(file, "utf-8")) as CrosswalkDocument;
}

export function loadSourceRegistry(): SourceRegistryEntry[] {
  const file = path.join(PIPELINE_DIR, "sources.json");
  return (JSON.parse(fs.readFileSync(file, "utf-8")) as {
    sources: SourceRegistryEntry[];
  }).sources;
}

export function loadManifest(): ManifestDocument {
  return readJson<ManifestDocument>("manifest.json");
}

function fiscalYearTotals(
  index: StateIndexDocument,
  categories: StateCategoriesDocument,
): FiscalYearTotals[] {
  const years = Object.keys({
    ...index.totals.revenue,
    ...index.totals.expenditure_state_funds,
  }).sort();
  return years.map((year) => ({
    fiscalYear: Number(year),
    revenue: index.totals.revenue[year] ?? null,
    revenueBasis: categories.basis_by_year.revenue[year] ?? null,
    expenditure: index.totals.expenditure_state_funds[year] ?? null,
    expenditureBasis: categories.basis_by_year.expenditure[year] ?? null,
  }));
}

function categorySeries(
  categories: StateCategoriesDocument,
  side: Side,
  keepCount: number,
  foldLabel: string,
): CategorySeries {
  const rows = categories.rows.filter((row) => row.side === side);
  const fiscalYears = [...new Set(rows.map((row) => row.fiscal_year))].sort();
  const basisByYear: Record<string, Basis> = categories.basis_by_year[side];
  const reportedYears = fiscalYears.filter((year) =>
    ["reported", "actual"].includes(basisByYear[String(year)]),
  );
  const rankYear = reportedYears.at(-1) ?? fiscalYears.at(-1);

  const totalsByCategory = new Map<string, number>();
  for (const row of rows.filter((r) => r.fiscal_year === rankYear)) {
    totalsByCategory.set(row.category, row.amount);
  }
  const kept = [...totalsByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, keepCount)
    .map(([category]) => category);

  const segments = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const key = kept.includes(row.category) ? row.category : "__other";
    const amounts = segments.get(key) ?? {};
    const yearKey = String(row.fiscal_year);
    amounts[yearKey] = (amounts[yearKey] ?? 0) + row.amount;
    segments.set(key, amounts);
  }

  const ordered = [...kept, ...(segments.has("__other") ? ["__other"] : [])];
  return {
    side,
    fiscalYears,
    basisByYear,
    segments: ordered.map((key) => ({
      key,
      label: key === "__other" ? foldLabel : (CATEGORY_LABELS[key] ?? key),
      amountsByYear: segments.get(key) ?? {},
    })),
  };
}

function formatVintage(manifest: ManifestDocument, id: string): string {
  const vintage = manifest.sources[id]?.vintage;
  const lastModified = vintage?.fingerprint?.last_modified;
  if (lastModified) {
    const date = new Date(lastModified);
    return `upstream file dated ${date.toISOString().slice(0, 10)}`;
  }
  if (vintage?.checked_at) {
    return `last verified ${vintage.checked_at.slice(0, 10)}`;
  }
  return "vintage unknown";
}

function sourceNotes(manifest: ManifestDocument): SourceNote[] {
  return Object.entries(SOURCE_NAMES).map(([id, name]) => {
    const entry = manifest.sources[id];
    const years =
      entry?.fiscal_years ??
      [...new Set(Object.values(entry?.fiscal_years_by_basis ?? {}).flat())].sort();
    const span = years.length
      ? `FY${Math.min(...years)}–FY${Math.max(...years)}`
      : "";
    const counties =
      entry?.counties_present != null
        ? ` · ${entry.counties_present} of 159 counties`
        : "";
    return {
      id,
      name,
      vintage: formatVintage(manifest, id),
      coverage: `${span}${counties}`,
    };
  });
}

export function loadCountyMetrics(): CountyMetricsDocument {
  return readJson<CountyMetricsDocument>("counties", "metrics.json");
}

export function loadStateCategories(): StateCategoriesDocument {
  return readJson<StateCategoriesDocument>("state", "categories.json");
}

export interface CountyOption {
  name: string;
  slug: string;
}

export function loadCountyOptions(): CountyOption[] {
  return loadCountyMetrics()
    .counties.filter((entry) => entry.included)
    .map((entry) => ({
      name: countyDisplayName(entry.county),
      slug: entry.slug as string,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const COUNTY_NAME_EXCEPTIONS: Record<string, string> = {
  DEKALB: "DeKalb",
  MCDUFFIE: "McDuffie",
  MCINTOSH: "McIntosh",
};

export function countyDisplayName(county: string): string {
  return (
    COUNTY_NAME_EXCEPTIONS[county] ??
    county
      .toLowerCase()
      .split(" ")
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" ")
  );
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stateMedians(metrics: CountyMetricsDocument): Record<string, MedianYear> {
  const keys = [
    "revenue",
    "expenditure",
    "revenue_per_capita",
    "expenditure_per_capita",
  ] as const;
  const medians: Record<string, MedianYear> = {};
  for (const year of metrics.fiscal_years) {
    const filed = metrics.counties
      .filter((entry) => entry.included)
      .map((entry) => (entry.included ? entry.years[String(year)] : null))
      .filter((m): m is NonNullable<typeof m> => m != null);
    medians[String(year)] = Object.fromEntries(
      keys.map((key) => [
        key,
        median(filed.map((m) => m[key]).filter((v): v is number => v != null)),
      ]),
    ) as unknown as MedianYear;
  }
  return medians;
}

function countyProvenance(manifest: ManifestDocument): string {
  const ted = manifest.sources["ted_rlgf_county_workbook"];
  const census = manifest.sources["census_county_pop_2020s"];
  const years = ted?.fiscal_years ?? [];
  const span = years.length
    ? `fiscal years ${Math.min(...years)}–${Math.max(...years)}`
    : "";
  const tedVintage = formatVintage(manifest, "ted_rlgf_county_workbook");
  const censusVintage = census ? formatVintage(manifest, "census_county_pop_2020s") : "";
  return (
    `Source: DCA Report of Local Government Finances via the UGA Tax & ` +
    `Expenditure Data Center (${tedVintage}), ${span}. Population ` +
    `denominators: US Census county estimates (${censusVintage}). ` +
    `Expenditures are operating plus capital, as filed. A year the county ` +
    `did not file appears as missing, never as zero.`
  );
}

export function loadCountyPage(slug: string): CountyPageData | null {
  const metrics = loadCountyMetrics();
  const entry = metrics.counties.find(
    (candidate) => candidate.included && candidate.slug === slug,
  );
  if (!entry || !entry.included) return null;
  const manifest = readJson<ManifestDocument>("manifest.json");
  const document = readJson<CountyDocument>("counties", `${slug}.json`);
  const categories = readJson<CountyCategoriesDocument>(
    "counties", "categories.json");
  const filedYears = metrics.fiscal_years.filter(
    (year) => entry.years[String(year)] != null,
  );
  const latestFiledYear = filedYears.at(-1) ?? metrics.fiscal_years[0];
  return {
    county: entry.county,
    displayName: countyDisplayName(entry.county),
    fips: entry.fips,
    slug,
    fiscalYears: metrics.fiscal_years,
    latestFiledYear,
    missingYears: metrics.fiscal_years.filter(
      (year) => entry.years[String(year)] == null,
    ),
    years: entry.years,
    medians: stateMedians(metrics),
    document,
    provenance: countyProvenance(manifest),
    spendingByCategory:
      categories.counties[slug]?.years[String(latestFiledYear)]?.expenditure ??
      {},
  };
}

export function loadDashboardData(): DashboardData {
  const index = readJson<StateIndexDocument>("state", "index.json");
  const categories = readJson<StateCategoriesDocument>("state", "categories.json");
  const manifest = readJson<ManifestDocument>("manifest.json");
  const counties = readJson<CountiesIndexDocument>("counties", "index.json");

  const totals = fiscalYearTotals(index, categories);
  const reported = totals.filter(
    (t) => t.revenueBasis === "reported" && t.expenditureBasis === "actual",
  );
  const latest = reported.at(-1);
  if (!latest?.revenue || !latest?.expenditure) {
    throw new Error("No fully reported fiscal year in state data");
  }

  const reconciliation = manifest.normalized.reconciliation;
  return {
    fiscalYearTotals: totals,
    lastReportedYear: latest.fiscalYear,
    revenueCategories: categorySeries(categories, "revenue", 2, "Other revenue"),
    expenditureCategories: categorySeries(categories, "expenditure", 5, "All other"),
    headline: {
      revenue: latest.revenue,
      expenditure: latest.expenditure,
      balance: latest.revenue - latest.expenditure,
      fiscalYear: latest.fiscalYear,
      countiesCovered: counties.counties.length,
      countiesTotal: 159,
    },
    sourceNotes: sourceNotes(manifest),
    reconciliationNote:
      `${manifest.normalized.reconciliation.totals_checked.toLocaleString()} ` +
      `entity-year totals reconciled against source documents ` +
      `(max deviation ${(reconciliation.max_relative_deviation * 100).toFixed(4)}%).`,
  };
}
