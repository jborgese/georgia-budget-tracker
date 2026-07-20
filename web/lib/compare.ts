import type { EntityKind, EntityYearMetrics } from "./types";
import {
  countyDisplayName,
  entityDisplayName,
  loadCountyMetrics,
  loadEntityMetrics,
  loadSchoolDocument,
  loadSchoolIndex,
} from "./data";

export type CompareKind = "county" | EntityKind | "school";
export type CompareFormat = "dollars" | "compact" | "count";

export interface CompareMetricSpec {
  key: string;
  title: string;
  format: CompareFormat;
  perUnit?: string;
}

export interface CompareColumnSpec {
  key: string;
  label: string;
  format: CompareFormat;
}

export interface CompareEntityRow {
  slug: string;
  label: string;
  filed: boolean[];
  values: Record<string, (number | null)[]>;
}

export interface CompareDataset {
  kind: CompareKind;
  route: string;
  slotLabel: string;
  nounPlural: string;
  fiscalYears: number[];
  charts: CompareMetricSpec[];
  latestColumns: CompareColumnSpec[];
  entities: CompareEntityRow[];
  defaults: string[];
  gapNote: string;
}

const PER_RESIDENT_CHARTS: CompareMetricSpec[] = [
  {
    key: "revenue_per_capita",
    title: "Revenue per resident",
    format: "dollars",
    perUnit: "per resident",
  },
  {
    key: "expenditure_per_capita",
    title: "Expenditure per resident",
    format: "dollars",
    perUnit: "per resident",
  },
];

const TOTALS_CHARTS: CompareMetricSpec[] = [
  { key: "revenue", title: "Revenues", format: "compact" },
  { key: "expenditure", title: "Expenditures", format: "compact" },
];

const FISCAL_COLUMNS: CompareColumnSpec[] = [
  { key: "revenue", label: "Revenues", format: "dollars" },
  { key: "expenditure", label: "Expenditures", format: "dollars" },
  { key: "revenue_per_capita", label: "Rev / resident", format: "dollars" },
  { key: "population", label: "Population", format: "count" },
];

const FISCAL_KEYS = [
  "revenue",
  "expenditure",
  "population",
  "revenue_per_capita",
  "expenditure_per_capita",
] as const;

function fiscalRow(
  slug: string,
  label: string,
  years: Record<string, EntityYearMetrics | null>,
  fiscalYears: number[],
): CompareEntityRow {
  const byYear = fiscalYears.map((year) => years[String(year)] ?? null);
  return {
    slug,
    label,
    filed: byYear.map(
      (m) => m?.revenue != null || m?.expenditure != null,
    ),
    values: Object.fromEntries(
      FISCAL_KEYS.map((key) => [key, byYear.map((m) => m?.[key] ?? null)]),
    ),
  };
}

function byLabel(a: CompareEntityRow, b: CompareEntityRow): number {
  return a.label.localeCompare(b.label);
}

export function buildCountyCompare(): CompareDataset {
  const metrics = loadCountyMetrics();
  return {
    kind: "county",
    route: "/county",
    slotLabel: "County",
    nounPlural: "counties",
    fiscalYears: metrics.fiscal_years,
    charts: PER_RESIDENT_CHARTS,
    latestColumns: FISCAL_COLUMNS,
    entities: metrics.counties
      .flatMap((entry) =>
        entry.included
          ? [
              fiscalRow(
                entry.slug,
                `${countyDisplayName(entry.county)} County`,
                entry.years,
                metrics.fiscal_years,
              ),
            ]
          : [],
      )
      .sort(byLabel),
    defaults: ["fulton", "chatham"],
    gapNote:
      "Gaps in a line are fiscal years the county did not file an RLGF " +
      "report — never zeros.",
  };
}

function entityCompare(
  kind: EntityKind,
  labelFor: (entity: string) => string,
): Pick<CompareDataset, "fiscalYears" | "entities"> {
  const metrics = loadEntityMetrics(kind);
  return {
    fiscalYears: metrics.fiscal_years,
    entities: Object.entries(metrics.entities)
      .map(([slug, entry]) =>
        fiscalRow(slug, labelFor(entry.entity), entry.years, metrics.fiscal_years),
      )
      .sort(byLabel),
  };
}

export function buildCityCompare(): CompareDataset {
  return {
    kind: "city",
    route: "/city",
    slotLabel: "City",
    nounPlural: "cities",
    charts: [...TOTALS_CHARTS, ...PER_RESIDENT_CHARTS],
    latestColumns: FISCAL_COLUMNS,
    defaults: ["atlanta", "savannah"],
    gapNote:
      "Gaps in a line are fiscal years the city did not file an RLGF " +
      "report — never zeros. Per-resident figures need a Census population " +
      "estimate for the place; cities without one show — instead.",
    ...entityCompare("city", (entity) => `City of ${entityDisplayName(entity)}`),
  };
}

export function buildConsolidatedCompare(): CompareDataset {
  return {
    kind: "consolidated",
    route: "/consolidated",
    slotLabel: "Government",
    nounPlural: "consolidated governments",
    charts: [...TOTALS_CHARTS, ...PER_RESIDENT_CHARTS],
    latestColumns: FISCAL_COLUMNS,
    defaults: ["athens-clarke", "augusta-richmond"],
    gapNote:
      "Gaps in a line are fiscal years the government did not file an RLGF " +
      "report — never zeros. Per-resident figures use the population of the " +
      "consolidated county.",
    ...entityCompare("consolidated", entityDisplayName),
  };
}

const SCHOOL_CHARTS: CompareMetricSpec[] = [
  { key: "enrollment", title: "Enrollment", format: "count" },
  { key: "revenue", title: "Revenue", format: "compact" },
  { key: "expenditure", title: "Spending", format: "compact" },
  {
    key: "per_pupil_current_spending",
    title: "Per-pupil current spending",
    format: "dollars",
    perUnit: "per pupil",
  },
];

const SCHOOL_COLUMNS: CompareColumnSpec[] = [
  { key: "enrollment", label: "Enrollment", format: "count" },
  { key: "revenue", label: "Revenue", format: "dollars" },
  { key: "expenditure", label: "Spending", format: "dollars" },
  {
    key: "per_pupil_current_spending",
    label: "Per pupil",
    format: "dollars",
  },
];

export function buildSchoolCompare(): CompareDataset {
  const index = loadSchoolIndex();
  const entities = index.districts
    .map((district) => {
      const document = loadSchoolDocument(district.slug);
      const byYear = index.fiscal_years.map(
        (year) => document.years[String(year)] ?? null,
      );
      return {
        slug: district.slug,
        label: district.display_name,
        filed: byYear.map((y) => y != null),
        values: {
          enrollment: byYear.map((y) => y?.enrollment ?? null),
          revenue: byYear.map((y) => y?.revenue.total ?? null),
          expenditure: byYear.map((y) => y?.expenditure.total ?? null),
          per_pupil_current_spending: byYear.map(
            (y) => y?.per_pupil.current_spending ?? null,
          ),
        },
      };
    })
    .sort(byLabel);
  return {
    kind: "school",
    route: "/school",
    slotLabel: "District",
    nounPlural: "school districts",
    fiscalYears: index.fiscal_years,
    charts: SCHOOL_CHARTS,
    latestColumns: SCHOOL_COLUMNS,
    entities,
    defaults: [
      "gwinnett-county-school-district",
      "cobb-county-school-district",
    ],
    gapNote:
      "Gaps in a line are fiscal years the district is absent from the " +
      "Census F-33 survey — never zeros.",
  };
}
