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
  EntitiesIndexDocument,
  EntityCategoriesDocument,
  EntityDocument,
  EntityKind,
  EntityListing,
  EntityMetricsDocument,
  EntityPageData,
  EntityYearMetrics,
  EntityYearTotals,
  FiscalYearTotals,
  GadoeOverlayDocument,
  ManifestDocument,
  MedianYear,
  MillageDocument,
  MillageHistoryDocument,
  SalesTaxDocument,
  SalesTaxLine,
  SchoolDocument,
  SchoolIndexDocument,
  SchoolPageData,
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
  ted_rlgf_city_workbook: "UGA TED — RLGF, city governments",
  ted_rlgf_consolidated_workbook:
    "UGA TED — RLGF, consolidated city-county governments",
  open_georgia_poa: "Open Georgia — payments, obligations, professional services",
  opb_governors_budget_report_fy2026:
    "OPB — Governor's Budget Report, AFY 2025 & FY 2026",
  census_county_pop_2020s: "US Census — county population estimates",
  census_f33: "US Census — Annual Survey of School System Finances (F-33)",
  gadoe_revenues:
    "GaDOE — Financial Data Collection System (current-year school revenues)",
  dor_digest: "DOR — consolidated tax digest (millage rates), via GeorgiaData.org",
};

const ENTITY_LEVELS: Record<
  EntityKind,
  { dir: string; source: string; label: string }
> = {
  city: { dir: "cities", source: "ted_rlgf_city_workbook", label: "City" },
  consolidated: {
    dir: "consolidated",
    source: "ted_rlgf_consolidated_workbook",
    label: "Consolidated government",
  },
};

function readJson<T>(...segments: string[]): T {
  const file = path.join(PROCESSED_DIR, ...segments);
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

const jsonCache = new Map<string, unknown>();

function readJsonCached<T>(...segments: string[]): T {
  const key = segments.join("/");
  if (!jsonCache.has(key)) jsonCache.set(key, readJson<T>(...segments));
  return jsonCache.get(key) as T;
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

export function formatVintage(manifest: ManifestDocument, id: string): string {
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
      ? Math.min(...years) === Math.max(...years)
        ? `FY${years[0]}`
        : `FY${Math.min(...years)}–FY${Math.max(...years)}`
      : "";
    const counties =
      entry?.counties_present != null
        ? ` · ${entry.counties_present} of 159 counties`
        : "";
    const cities =
      entry?.cities_present != null ? ` · ${entry.cities_present} cities` : "";
    const governments =
      entry?.governments != null
        ? ` · ${Object.keys(entry.governments).length} consolidated governments`
        : "";
    const districts =
      entry?.districts != null ? ` · ${entry.districts} school districts` : "";
    const digestYears = entry?.tax_years?.length
      ? `tax years ${Math.min(...entry.tax_years)}–${Math.max(...entry.tax_years)}`
      : "";
    return {
      id,
      name,
      vintage: formatVintage(manifest, id),
      coverage: `${span || digestYears}${counties}${cities}${governments}${districts}`,
    };
  });
}

export function loadMillage(): MillageDocument {
  return readJsonCached<MillageDocument>("counties", "millage.json");
}

export function loadMillageHistory(): MillageHistoryDocument {
  return readJsonCached<MillageHistoryDocument>(
    "counties",
    "millage_history.json",
  );
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

const ENTITY_NAME_EXCEPTIONS: Record<string, string> = {
  DEKALB: "DeKalb",
  LAGRANGE: "LaGrange",
};

function capitalize(part: string): string {
  if (part.startsWith("mc") && part.length > 2) {
    return `Mc${part[2].toUpperCase()}${part.slice(3)}`;
  }
  return part ? part[0].toUpperCase() + part.slice(1) : part;
}

export function entityDisplayName(entity: string): string {
  return (
    ENTITY_NAME_EXCEPTIONS[entity] ??
    entity
      .toLowerCase()
      .split(" ")
      .map((word) => word.split("-").map(capitalize).join("-"))
      .join(" ")
  );
}

export function countyDisplayName(county: string): string {
  return entityDisplayName(county);
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
    salesTaxLines: salesTaxLinesFor("counties", slug),
    millage: loadMillage().counties[slug] ?? null,
    millageTaxYears: loadMillage().tax_years,
    millageHistory: loadMillageHistory().counties[slug] ?? null,
    millageHistoryTaxYears: loadMillageHistory().tax_years,
    millageMissingYears: loadMillageHistory().known_missing[slug] ?? [],
  };
}

function filedYearTotals(
  totals: EntityDocument["totals"][number],
): EntityYearTotals | null {
  if (!totals.revenue && !totals.expenditure) return null;
  return {
    revenue: totals.revenue,
    expenditure: totals.expenditure,
    expenditure_operating: totals.expenditure_operating,
    expenditure_capital: totals.expenditure_capital,
  };
}

function salesTaxLinesFor(dir: string, slug: string): SalesTaxLine[] {
  const document = readJsonCached<SalesTaxDocument>(dir, "sales_tax.json");
  return document.entities[slug]?.lines ?? [];
}

function entityMetricsFor(
  dir: string,
  slug: string,
): Record<string, EntityYearMetrics | null> {
  const document = readJsonCached<EntityMetricsDocument>(dir, "metrics.json");
  return document.entities[slug]?.years ?? {};
}

export function loadEntityIndex(kind: EntityKind): EntitiesIndexDocument {
  return readJsonCached<EntitiesIndexDocument>(
    ENTITY_LEVELS[kind].dir, "index.json");
}

export function loadEntityMetrics(kind: EntityKind): EntityMetricsDocument {
  return readJsonCached<EntityMetricsDocument>(
    ENTITY_LEVELS[kind].dir, "metrics.json");
}

const listingsCache = new Map<EntityKind, EntityListing[]>();

function buildEntityListings(kind: EntityKind): EntityListing[] {
  const index = loadEntityIndex(kind);
  return index.entities
    .map((entry) => {
      const document = readJson<EntityDocument>(
        ENTITY_LEVELS[kind].dir,
        `${entry.slug}.json`,
      );
      const filed = document.totals
        .map((totals) => ({ year: totals.fiscal_year, totals: filedYearTotals(totals) }))
        .filter((candidate) => candidate.totals != null);
      const latest = filed.at(-1);
      return {
        entity: entry.entity,
        displayName: entityDisplayName(entry.entity),
        slug: entry.slug,
        latestFiledYear: latest?.year ?? null,
        revenue: latest?.totals?.revenue ?? null,
        expenditure: latest?.totals?.expenditure ?? null,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function loadEntityListings(kind: EntityKind): EntityListing[] {
  if (!listingsCache.has(kind)) listingsCache.set(kind, buildEntityListings(kind));
  return listingsCache.get(kind) as EntityListing[];
}

function entityProvenance(
  kind: EntityKind,
  manifest: ManifestDocument,
): string {
  const level = ENTITY_LEVELS[kind];
  const years = manifest.sources[level.source]?.fiscal_years ?? [];
  const span = years.length
    ? `fiscal years ${Math.min(...years)}–${Math.max(...years)}`
    : "";
  const vintage = formatVintage(manifest, level.source);
  const caveat =
    kind === "consolidated"
      ? " A consolidated government provides both county and municipal " +
        "services, so its figures are not directly comparable to " +
        "county-only or city-only governments."
      : "";
  const denominators =
    kind === "city"
      ? " Population denominators: US Census incorporated-place estimates, " +
        "available from 2020 onward; earlier years and places absent from " +
        "the Census file show no per-resident figures."
      : " Population denominators: US Census county estimates.";
  return (
    `Source: DCA Report of Local Government Finances via the UGA Tax & ` +
    `Expenditure Data Center (${vintage}), ${span}. Expenditures are ` +
    `operating plus capital, as filed. A year the government did not file ` +
    `appears as missing, never as zero.${denominators}${caveat}`
  );
}

export function loadEntityPage(
  kind: EntityKind,
  slug: string,
): EntityPageData | null {
  const level = ENTITY_LEVELS[kind];
  const index = loadEntityIndex(kind);
  const entry = index.entities.find((candidate) => candidate.slug === slug);
  if (!entry) return null;
  const document = readJson<EntityDocument>(level.dir, `${slug}.json`);
  const totalsByYear: Record<string, EntityYearTotals | null> =
    Object.fromEntries(
      index.fiscal_years.map((year) => [
        String(year),
        filedYearTotals(
          document.totals.find((totals) => totals.fiscal_year === year) ?? {
            fiscal_year: year,
            revenue: null,
            expenditure: null,
            expenditure_operating: null,
            expenditure_capital: null,
          },
        ),
      ]),
    );
  const filedYears = index.fiscal_years.filter(
    (year) => totalsByYear[String(year)] != null,
  );
  const latestFiledYear = filedYears.at(-1);
  if (latestFiledYear == null) return null;
  const manifest = readJsonCached<ManifestDocument>("manifest.json");
  const categories = readJsonCached<EntityCategoriesDocument>(
    level.dir,
    "categories.json",
  );
  const countyServed =
    kind === "consolidated"
      ? manifest.sources[level.source]?.governments?.[entry.entity]
      : undefined;
  return {
    kind,
    entity: entry.entity,
    displayName: entityDisplayName(entry.entity),
    slug,
    fiscalYears: index.fiscal_years,
    latestFiledYear,
    missingYears: index.fiscal_years.filter(
      (year) => totalsByYear[String(year)] == null,
    ),
    totalsByYear,
    document,
    spendingByCategory:
      categories.entities[slug]?.years[String(latestFiledYear)]?.expenditure ??
      {},
    salesTaxLines: salesTaxLinesFor(level.dir, slug),
    metricsByYear: entityMetricsFor(level.dir, slug),
    provenance: entityProvenance(kind, manifest),
    countyServed: countyServed ? countyDisplayName(countyServed) : undefined,
  };
}

export function loadSchoolIndex(): SchoolIndexDocument {
  return readJsonCached<SchoolIndexDocument>("schools", "index.json");
}

export function schoolsByCountyFips(): Record<
  string,
  { name: string; slug: string }[]
> {
  const grouped: Record<string, { name: string; slug: string }[]> = {};
  for (const district of loadSchoolIndex().districts) {
    (grouped[district.county_fips] ??= []).push({
      name: district.display_name,
      slug: district.slug,
    });
  }
  return grouped;
}

export function loadGadoeOverlay(): GadoeOverlayDocument | null {
  const file = path.join(PROCESSED_DIR, "schools", "gadoe.json");
  if (!fs.existsSync(file)) return null;
  const overlay = readJsonCached<GadoeOverlayDocument>("schools", "gadoe.json");
  return overlay.fiscal_years.length ? overlay : null;
}

function gadoeNote(overlay: GadoeOverlayDocument, fiscalYear: number): string {
  return (
    `Source: Georgia Department of Education Financial Data Collection ` +
    `System, School System Revenues report, fiscal year ${fiscalYear}. ` +
    `${overlay.basis} Figures may be revised as systems file through the ` +
    `year; the Census survey covers this year in full detail roughly 18 ` +
    `months after it closes.`
  );
}

function schoolProvenance(manifest: ManifestDocument): string {
  const entry = manifest.sources["census_f33"];
  const years = entry?.fiscal_years ?? [];
  const span = years.length
    ? `fiscal years ${Math.min(...years)}–${Math.max(...years)}`
    : "";
  return (
    `Source: US Census Bureau Annual Survey of School System Finances ` +
    `(F-33 individual unit files), ${span}. The survey publishes roughly ` +
    `18 months after each fiscal year closes, so the newest school year ` +
    `always lags the newest county and city filings. Figures are as ` +
    `reported to the Census Bureau; dollar amounts are converted from the ` +
    `survey's thousands.`
  );
}

export function loadSchoolDocument(slug: string): SchoolDocument {
  return readJson<SchoolDocument>("schools", `${slug}.json`);
}

export function loadSchoolPage(slug: string): SchoolPageData | null {
  const index = loadSchoolIndex();
  const entry = index.districts.find((candidate) => candidate.slug === slug);
  if (!entry) return null;
  const document = loadSchoolDocument(slug);
  const manifest = readJsonCached<ManifestDocument>("manifest.json");
  const county = loadCountyMetrics().counties.find(
    (candidate) => candidate.fips === document.county_fips,
  );
  const filedYears = Object.keys(document.years).map(Number).sort();
  const overlay = loadGadoeOverlay();
  const gadoeDistrict = overlay?.districts[document.ncesid];
  const gadoeYears = gadoeDistrict
    ? Object.keys(gadoeDistrict.years).map(Number)
    : [];
  const gadoeFiscalYear = gadoeYears.length ? Math.max(...gadoeYears) : null;
  return {
    document,
    displayName: document.display_name,
    countyName: county ? countyDisplayName(county.county) : null,
    countySlug: county?.slug ?? null,
    latestYear: filedYears.at(-1) as number,
    filedYears,
    provenance: schoolProvenance(manifest),
    gadoe:
      overlay && gadoeDistrict && gadoeFiscalYear != null
        ? {
            fiscalYear: gadoeFiscalYear,
            year: gadoeDistrict.years[String(gadoeFiscalYear)],
            note: gadoeNote(overlay, gadoeFiscalYear),
          }
        : null,
  };
}

export interface SearchOption {
  name: string;
  slug: string;
  kind: "county" | EntityKind | "school";
}

const SEARCH_KIND_ORDER: Record<SearchOption["kind"], number> = {
  county: 0,
  consolidated: 1,
  city: 2,
  school: 3,
};

export function loadSearchOptions(): SearchOption[] {
  const counties: SearchOption[] = loadCountyOptions().map((option) => ({
    ...option,
    kind: "county",
  }));
  const entities: SearchOption[] = (["consolidated", "city"] as const).flatMap(
    (kind) =>
      loadEntityListings(kind)
        .filter((listing) => listing.latestFiledYear != null)
        .map((listing) => ({
          name: listing.displayName,
          slug: listing.slug,
          kind,
        })),
  );
  const schools: SearchOption[] = loadSchoolIndex().districts.map(
    (district) => ({
      name: district.display_name,
      slug: district.slug,
      kind: "school",
    }),
  );
  return [...counties, ...entities, ...schools].sort(
    (a, b) =>
      a.name.localeCompare(b.name) ||
      SEARCH_KIND_ORDER[a.kind] - SEARCH_KIND_ORDER[b.kind],
  );
}

export interface ConsolidatedLink {
  name: string;
  slug: string;
}

export function consolidatedCountyServed(): Record<string, string> {
  const manifest = readJsonCached<ManifestDocument>("manifest.json");
  const governments =
    manifest.sources[ENTITY_LEVELS.consolidated.source]?.governments ?? {};
  const slugsByEntity = new Map(
    loadEntityIndex("consolidated").entities.map((entry) => [
      entry.entity,
      entry.slug,
    ]),
  );
  return Object.fromEntries(
    Object.entries(governments).flatMap(([government, county]) => {
      const slug = slugsByEntity.get(government);
      return slug ? [[slug, countyDisplayName(county)]] : [];
    }),
  );
}

export function consolidatedByCountyFips(): Record<string, ConsolidatedLink> {
  const manifest = readJsonCached<ManifestDocument>("manifest.json");
  const governments =
    manifest.sources[ENTITY_LEVELS.consolidated.source]?.governments ?? {};
  const slugsByEntity = new Map(
    loadEntityIndex("consolidated").entities.map((entry) => [
      entry.entity,
      entry.slug,
    ]),
  );
  const fipsByCounty = new Map(
    loadCountyMetrics().counties.map((entry) => [entry.county, entry.fips]),
  );
  return Object.fromEntries(
    Object.entries(governments).flatMap(([government, county]) => {
      const fips = fipsByCounty.get(county);
      const slug = slugsByEntity.get(government);
      if (!fips || !slug) return [];
      return [[fips, { name: entityDisplayName(government), slug }]];
    }),
  );
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
