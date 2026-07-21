export type RevenueBasis = "reported" | "estimated";
export type ExpenditureBasis = "actual" | "amended_budget" | "budget";
export type Basis = RevenueBasis | ExpenditureBasis;
export type Side = "revenue" | "expenditure";

export interface StateIndexDocument {
  entity: string;
  fiscal_years: number[];
  totals: {
    revenue: Record<string, number>;
    expenditure_state_funds: Record<string, number>;
    expenditure_total_funds: Record<string, number>;
    payments: Record<string, number>;
  };
}

export interface StateCategoriesDocument {
  entity: string;
  sources: string[];
  basis_by_year: {
    revenue: Record<string, RevenueBasis>;
    expenditure: Record<string, ExpenditureBasis>;
  };
  rows: {
    side: Side;
    category: string;
    fiscal_year: number;
    amount: number;
    subcategories?: Record<string, number>;
  }[];
}

export interface CategoryNode {
  total: number;
  subcategories: Record<string, number>;
}

export interface CountiesIndexDocument {
  source: string;
  fiscal_years: number[];
  counties: {
    county: string;
    slug: string;
    latest_fiscal_year: number;
    revenue: number | null;
    expenditure: number | null;
  }[];
}

export interface CountyYearMetrics {
  revenue: number | null;
  expenditure: number | null;
  population: number | null;
  revenue_per_capita: number | null;
  expenditure_per_capita: number | null;
}

export type CountyMetricsEntry =
  | {
      county: string;
      fips: string;
      slug: string;
      included: true;
      years: Record<string, CountyYearMetrics | null>;
    }
  | {
      county: string;
      fips: string;
      slug: null;
      included: false;
      note: string;
      years: null;
    };

export interface CountyMetricsDocument {
  sources: string[];
  fiscal_years: number[];
  counties: CountyMetricsEntry[];
}

export interface CountyDocument {
  county: string;
  source: string;
  fiscal_years: number[];
  totals: {
    fiscal_year: number;
    revenue: number | null;
    expenditure: number | null;
    expenditure_operating: number | null;
    expenditure_capital: number | null;
  }[];
  breakdown: {
    classification: string;
    category: "revenue" | "expenditure";
    section: string;
    depth: number;
    path: string;
    amounts: Record<string, number>;
  }[];
}

export type EntityKind = "city" | "consolidated";

export interface EntitiesIndexDocument {
  source: string;
  fiscal_years: number[];
  entities: {
    entity: string;
    slug: string;
    latest_fiscal_year: number;
    revenue: number | null;
    expenditure: number | null;
  }[];
}

export interface EntityDocument {
  entity: string;
  source: string;
  fiscal_years: number[];
  totals: CountyDocument["totals"];
  breakdown: CountyDocument["breakdown"];
}

export interface EntityCategoriesDocument {
  sources: string[];
  fiscal_years: number[];
  entities: Record<
    string,
    {
      entity: string;
      years: Record<
        string,
        {
          revenue?: Record<string, CategoryNode>;
          expenditure?: Record<string, CategoryNode>;
        }
      >;
    }
  >;
}

export interface SalesTaxLine {
  classification: string;
  amounts: Record<string, number>;
}

export interface SalesTaxDocument {
  source: string;
  fiscal_years: number[];
  entities: Record<string, { entity: string; lines: SalesTaxLine[] }>;
}

export interface EntityYearTotals {
  revenue: number | null;
  expenditure: number | null;
  expenditure_operating: number | null;
  expenditure_capital: number | null;
}

export interface EntityYearMetrics {
  revenue: number | null;
  expenditure: number | null;
  population: number | null;
  revenue_per_capita: number | null;
  expenditure_per_capita: number | null;
}

export interface EntityMetricsDocument {
  sources: string[];
  fiscal_years: number[];
  entities: Record<
    string,
    { entity: string; years: Record<string, EntityYearMetrics | null> }
  >;
}

export interface EntityPageData {
  kind: EntityKind;
  entity: string;
  displayName: string;
  slug: string;
  fiscalYears: number[];
  latestFiledYear: number;
  missingYears: number[];
  totalsByYear: Record<string, EntityYearTotals | null>;
  metricsByYear: Record<string, EntityYearMetrics | null>;
  document: EntityDocument;
  spendingByCategory: Record<string, CategoryNode>;
  salesTaxLines: SalesTaxLine[];
  provenance: string;
  countyServed?: string;
}

export interface EntityListing {
  entity: string;
  displayName: string;
  slug: string;
  latestFiledYear: number | null;
  revenue: number | null;
  expenditure: number | null;
}

export interface SchoolYear {
  enrollment: number;
  revenue: {
    total: number;
    federal: number;
    state: number;
    local: number;
    property_tax: number;
    sales_tax: number;
    parent_government: number;
  };
  expenditure: {
    total: number;
    current: number;
    instruction: number;
    support_services: number;
    other_current: number;
    capital: number;
    interest_on_debt: number;
  };
  debt: { outstanding: number; issued: number; retired: number };
  per_pupil: {
    revenue: number | null;
    current_spending: number | null;
    instruction: number | null;
  };
}

export interface SchoolDocument {
  district: string;
  display_name: string;
  slug: string;
  ncesid: string;
  county_fips: string;
  source: string;
  fiscal_years: number[];
  years: Record<string, SchoolYear>;
}

export interface SchoolIndexDocument {
  source: string;
  fiscal_years: number[];
  districts: {
    district: string;
    display_name: string;
    slug: string;
    ncesid: string;
    county_fips: string;
    latest_fiscal_year: number;
    enrollment: number;
    revenue: number;
    expenditure: number;
    per_pupil_current_spending: number | null;
  }[];
}

export interface GadoeYear {
  fte: number;
  revenue: { local: number; state: number; federal: number; total: number };
  per_fte: {
    local: number | null;
    state: number | null;
    federal: number | null;
    total: number | null;
  };
}

export interface GadoeDistrict {
  system_code: string;
  system_name: string;
  slug: string;
  years: Record<string, GadoeYear>;
}

export interface GadoeOverlayDocument {
  source: string;
  report: string;
  basis: string;
  f33_latest_fiscal_year: number;
  fiscal_years: number[];
  statewide: Record<string, GadoeYear>;
  districts: Record<string, GadoeDistrict>;
}

export interface SchoolPageData {
  document: SchoolDocument;
  displayName: string;
  countyName: string | null;
  countySlug: string | null;
  latestYear: number;
  filedYears: number[];
  provenance: string;
  gadoe: { fiscalYear: number; year: GadoeYear; note: string } | null;
}

export interface MillageDistrictYear {
  millage_mo: number | null;
  millage_bond: number | null;
  tax_mo: number | null;
  tax_bond: number | null;
}

export interface MillageCountyEntry {
  county: string;
  county_total: Record<
    string,
    { parcels: number | null; assessed_mo: number | null; assessed_bond: number | null }
  >;
  districts: {
    district: string;
    code: number;
    years: Record<string, MillageDistrictYear>;
  }[];
}

export interface MillageDocument {
  sources: string[];
  tax_years: number[];
  counties: Record<string, MillageCountyEntry>;
}

export interface MillageHistoryDistrict {
  district: string;
  code: number;
  rates: Record<string, [number | null, number | null]>;
}

export interface MillageHistoryCountyEntry {
  county: string;
  districts: MillageHistoryDistrict[];
}

export interface MillageHistoryDocument {
  sources: string[];
  tax_years: number[];
  known_missing: Record<string, number[]>;
  counties: Record<string, MillageHistoryCountyEntry>;
}

export interface SalesJurisdiction {
  name: string;
  county: string;
  total: number;
  letters: string;
  // 4 everywhere except Central Yards (803), whose printed rate excludes
  // the state's cents; 803 never appears in the resolution map.
  state_cents: number;
  cents: { education: number; transit: number; local_shared: number };
}

export interface SalesRatesDocument {
  source: string;
  effective_from: string;
  effective_through: string;
  state_cents: number;
  jurisdictions: Record<string, SalesJurisdiction>;
  resolution: Record<
    string,
    {
      county: string;
      fips: string;
      default: string;
      cities: Record<string, string>;
    }
  >;
}

export interface TaxParametersDocument {
  income_tax: {
    tax_year: number;
    rate: number;
    standard_deduction: { single: number; married_filing_jointly: number };
    statute: string;
    provenance: string[];
    verified: string;
    omissions: string[];
    note: string;
  };
  consumption_model: {
    source: string;
    fred_series: Record<string, string[]>;
    quintiles: {
      income_pretax: number;
      taxable_nonfood_share: number;
      food_at_home_share: number;
    }[];
    taxable_nonfood_categories: string[];
    excluded_categories: string[];
    caveats: string[];
  };
}

export interface MedianYear {
  revenue: number | null;
  expenditure: number | null;
  revenue_per_capita: number | null;
  expenditure_per_capita: number | null;
}

export interface CountyCategoriesDocument {
  sources: string[];
  fiscal_years: number[];
  counties: Record<
    string,
    {
      county: string;
      years: Record<
        string,
        {
          revenue?: Record<string, CategoryNode>;
          expenditure?: Record<string, CategoryNode>;
        }
      >;
    }
  >;
}

export interface CountyPageData {
  county: string;
  displayName: string;
  fips: string;
  slug: string;
  fiscalYears: number[];
  latestFiledYear: number;
  missingYears: number[];
  years: Record<string, CountyYearMetrics | null>;
  medians: Record<string, MedianYear>;
  document: CountyDocument;
  provenance: string;
  spendingByCategory: Record<string, CategoryNode>;
  salesTaxLines: SalesTaxLine[];
  millage: MillageCountyEntry | null;
  millageTaxYears: number[];
  millageHistory: MillageHistoryCountyEntry | null;
  millageHistoryTaxYears: number[];
  millageMissingYears: number[];
}

export interface SourceVintage {
  fingerprint: {
    etag?: string | null;
    last_modified?: string | null;
    sha256?: string;
    years?: Record<string, string[]>;
  } | null;
  checked_at: string | null;
}

export interface ManifestDocument {
  sources: Record<
    string,
    {
      vintage: SourceVintage;
      fiscal_years?: number[];
      fiscal_years_by_basis?: Record<string, number[]>;
      records: number;
      counties_present?: number;
      counties_missing?: Record<string, string>;
      cities_present?: number;
      governments?: Record<string, string>;
      districts?: number;
      tax_years?: number[];
      vintages?: Record<string, SourceVintage>;
      note?: string;
    }
  >;
  normalized: {
    records: number;
    entities: number;
    fiscal_years: number[];
    categories: string[];
    tolerance: { relative: number; absolute: number };
    reconciliation: {
      totals_checked: number;
      max_absolute_deviation: number;
      max_relative_deviation: number;
      synthetic_rows: number;
      synthetic_amount_absolute_sum: number;
    };
  };
}

export interface FiscalYearTotals {
  fiscalYear: number;
  revenue: number | null;
  revenueBasis: RevenueBasis | null;
  expenditure: number | null;
  expenditureBasis: ExpenditureBasis | null;
}

export interface CategorySeries {
  side: Side;
  fiscalYears: number[];
  basisByYear: Record<string, Basis>;
  segments: {
    key: string;
    label: string;
    amountsByYear: Record<string, number>;
  }[];
}

export interface SourceNote {
  id: string;
  name: string;
  vintage: string;
  coverage: string;
}

export interface DashboardData {
  fiscalYearTotals: FiscalYearTotals[];
  lastReportedYear: number;
  revenueCategories: CategorySeries;
  expenditureCategories: CategorySeries;
  headline: {
    revenue: number;
    expenditure: number;
    balance: number;
    fiscalYear: number;
    countiesCovered: number;
    countiesTotal: number;
  };
  sourceNotes: SourceNote[];
  reconciliationNote: string;
}
