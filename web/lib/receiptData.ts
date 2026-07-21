// Build-time composition for the /receipt pages: reuses the stack's
// property-rate assembly wholesale and converts each government's spending
// breakdown into lean share-only mixes so the client-side calculator can
// apportion any salary without shipping the full category documents.
import {
  loadCountyCategories,
  loadEntityCategories,
  loadSalesRates,
  loadSchoolDocument,
  loadStateCategories,
  loadTaxParameters,
} from "./data";
import { loadStackCounty, type StackData } from "./stack";
import { stateSpendingNodes } from "./spending";
import type { ReceiptMix } from "./receipt";
import type {
  CategoryNode,
  SalesJurisdiction,
  SchoolDocument,
  TaxParametersDocument,
} from "./types";

export interface ReceiptMixWithBasis {
  fiscalYear: number;
  mix: ReceiptMix;
  // Set when the mix comes from an older filing than the dataset's latest
  // year — disclosed next to the layer.
  staleNote?: string;
}

export interface ReceiptSalesEntry extends SalesJurisdiction {
  code: string;
}

export interface ReceiptSales {
  effectiveFrom: string;
  effectiveThrough: string;
  stateCents: number;
  county: ReceiptSalesEntry;
  byCity: Record<string, ReceiptSalesEntry>;
}

export interface ReceiptPayload {
  slug: string;
  countyName: string;
  kind: StackData["kind"];
  stack: StackData;
  taxParameters: TaxParametersDocument;
  stateMix: ReceiptMixWithBasis;
  localMix: ReceiptMixWithBasis | null;
  cityMixes: Record<string, ReceiptMixWithBasis | null>;
  countySchoolMix: ReceiptMixWithBasis | null;
  citySchoolMixes: Record<string, ReceiptMixWithBasis | null>;
  sales: ReceiptSales | null;
}

const SUBCATEGORIES_KEPT = 6;

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

// Shares are normalized over the positive category totals only: a negative
// reconciliation-adjustment category would otherwise push the kept shares
// above 1 and the apportioned dollars past the layer total.
function toMix(nodes: Record<string, CategoryNode>): ReceiptMix | null {
  const total = Object.values(nodes).reduce(
    (sum, node) => sum + Math.max(node.total, 0),
    0,
  );
  if (total <= 0) return null;
  return Object.fromEntries(
    Object.entries(nodes)
      .filter(([, node]) => node.total > 0)
      .map(([key, node]) => [
        key,
        {
          share: round6(node.total / total),
          subcategories: Object.entries(node.subcategories)
            .filter(([, amount]) => amount > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, SUBCATEGORIES_KEPT)
            .map(([label, amount]) => ({
              label,
              share: round6(amount / total),
            })),
        },
      ]),
  );
}

interface CategoryYears {
  years: Record<
    string,
    { expenditure?: Record<string, CategoryNode> } | undefined
  >;
}

function latestExpenditureMix(
  entry: CategoryYears | undefined,
  latestDatasetYear: number,
): ReceiptMixWithBasis | null {
  if (!entry) return null;
  const filed = Object.keys(entry.years)
    .map(Number)
    .filter((year) => {
      const nodes = entry.years[String(year)]?.expenditure;
      return (
        nodes != null &&
        Object.values(nodes).some((node) => node.total > 0)
      );
    })
    .sort((a, b) => a - b);
  const year = filed.at(-1);
  if (year == null) return null;
  const mix = toMix(entry.years[String(year)]?.expenditure ?? {});
  if (!mix) return null;
  return {
    fiscalYear: year,
    mix,
    ...(year < latestDatasetYear
      ? {
          staleNote:
            `latest filed year FY${year} — no FY${latestDatasetYear} ` +
            `filing`,
        }
      : {}),
  };
}

function stateMix(): ReceiptMixWithBasis {
  const categories = loadStateCategories();
  const actualYears = Object.entries(categories.basis_by_year.expenditure)
    .filter(([, basis]) => basis === "actual")
    .map(([year]) => Number(year))
    .sort((a, b) => a - b);
  const year = actualYears.at(-1);
  if (year == null) throw new Error("No actual-basis state fiscal year");
  const mix = toMix(stateSpendingNodes(categories, year));
  if (!mix) throw new Error(`Empty state spending mix for FY${year}`);
  return { fiscalYear: year, mix };
}

const SCHOOL_FUNCTIONS: [string, keyof SchoolDocument["years"][string]["expenditure"]][] = [
  ["Instruction", "instruction"],
  ["Support services", "support_services"],
  ["Other current spending", "other_current"],
  ["Capital projects", "capital"],
  ["Interest on debt", "interest_on_debt"],
];

function schoolMixFromHref(href: string | null): ReceiptMixWithBasis | null {
  const slug = href?.match(/^\/school\/([^/]+)\/$/)?.[1];
  if (!slug) return null;
  const document = loadSchoolDocument(slug);
  const years = Object.keys(document.years)
    .map(Number)
    .sort((a, b) => a - b);
  const year = years.at(-1);
  if (year == null) return null;
  const expenditure = document.years[String(year)].expenditure;
  if (!expenditure.total) return null;
  return {
    fiscalYear: year,
    mix: {
      education: {
        share: 1,
        subcategories: SCHOOL_FUNCTIONS.filter(
          ([, field]) => expenditure[field] > 0,
        ).map(([label, field]) => ({
          label,
          share: round6(expenditure[field] / expenditure.total),
        })),
      },
    },
  };
}

function entitySlugFromHref(
  href: string | null,
  kind: "city" | "consolidated",
): string | null {
  return href?.match(new RegExp(`^/${kind}/([^/]+)/$`))?.[1] ?? null;
}

function salesFor(
  slug: string,
  cityKeys: string[],
): ReceiptSales | null {
  const document = loadSalesRates();
  const resolution = document?.resolution[slug];
  if (!document || !resolution) return null;
  const entry = (code: string): ReceiptSalesEntry => ({
    code,
    ...document.jurisdictions[code],
  });
  const byCity = Object.fromEntries(
    cityKeys.flatMap((key) => {
      const code = resolution.cities[key];
      return code ? [[key, entry(code)]] : [];
    }),
  );
  return {
    effectiveFrom: document.effective_from,
    effectiveThrough: document.effective_through,
    stateCents: document.state_cents,
    county: entry(resolution.default),
    byCity,
  };
}

export function loadReceiptCounty(slug: string): ReceiptPayload | null {
  const stack = loadStackCounty(slug);
  if (!stack) return null;

  const countyCategories = loadCountyCategories();
  const latestCountyYear = Math.max(...countyCategories.fiscal_years);
  let localMix: ReceiptMixWithBasis | null;
  if (stack.kind === "consolidated") {
    const consolidated = loadEntityCategories("consolidated");
    const consolidatedSlug = entitySlugFromHref(
      stack.government.href,
      "consolidated",
    );
    localMix = latestExpenditureMix(
      consolidatedSlug ? consolidated.entities[consolidatedSlug] : undefined,
      Math.max(...consolidated.fiscal_years),
    );
  } else {
    localMix = latestExpenditureMix(
      countyCategories.counties[slug],
      latestCountyYear,
    );
  }

  const cityCategories = loadEntityCategories("city");
  const latestCityYear = Math.max(...cityCategories.fiscal_years);
  const cityMixes = Object.fromEntries(
    stack.cities.map((option) => {
      const citySlug = entitySlugFromHref(option.city.href, "city");
      return [
        option.key,
        latestExpenditureMix(
          citySlug ? cityCategories.entities[citySlug] : undefined,
          latestCityYear,
        ),
      ];
    }),
  );

  const citySchoolMixes = Object.fromEntries(
    stack.cities
      .filter((option) => option.school)
      .map((option) => [
        option.key,
        schoolMixFromHref(option.school?.href ?? null),
      ]),
  );

  return {
    slug,
    countyName: stack.countyName,
    kind: stack.kind,
    stack,
    taxParameters: loadTaxParameters(),
    stateMix: stateMix(),
    localMix,
    cityMixes,
    countySchoolMix: schoolMixFromHref(stack.countySchool.href),
    citySchoolMixes,
    sales: salesFor(
      slug,
      stack.cities.map((option) => option.key),
    ),
  };
}
