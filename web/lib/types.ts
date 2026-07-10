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
  }[];
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
