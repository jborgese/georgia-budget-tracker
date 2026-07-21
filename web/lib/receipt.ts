// The receipt calculator: pure functions only, no filesystem access, so the
// client-side view can recompute as the visitor types. Dollars stay floats
// throughout; formatting happens in the components.
import type { StackRate } from "./stack";
import type {
  CategoryNode,
  SalesJurisdiction,
  TaxParametersDocument,
} from "./types";
import { NEUTRAL_SERIES, SERIES } from "./theme";

export type FilingStatus = "single" | "married_filing_jointly";

export interface MixSubcategory {
  label: string;
  share: number;
}

// A spending mix reduced to shares of the layer total: multiplying by a
// layer's dollars yields CategoryNode-shaped amounts.
export interface MixNode {
  share: number;
  subcategories: MixSubcategory[];
}

export type ReceiptMix = Record<string, MixNode>;

export function incomeTax(
  salary: number,
  status: FilingStatus,
  parameters: TaxParametersDocument["income_tax"],
): number {
  const deduction = parameters.standard_deduction[status];
  return parameters.rate * Math.max(0, salary - deduction);
}

function interpolateShare(
  salary: number,
  points: { income: number; share: number }[],
): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (salary <= first.income) return first.share;
  if (salary >= last.income) return last.share;
  const upper = points.findIndex((point) => point.income >= salary);
  const low = points[upper - 1];
  const high = points[upper];
  const position = (salary - low.income) / (high.income - low.income);
  return low.share + position * (high.share - low.share);
}

export interface ConsumptionBases {
  nonfood: number;
  foodAtHome: number;
}

export function consumptionBases(
  salary: number,
  model: TaxParametersDocument["consumption_model"],
): ConsumptionBases {
  const nonfood = interpolateShare(
    salary,
    model.quintiles.map((quintile) => ({
      income: quintile.income_pretax,
      share: quintile.taxable_nonfood_share,
    })),
  );
  const food = interpolateShare(
    salary,
    model.quintiles.map((quintile) => ({
      income: quintile.income_pretax,
      share: quintile.food_at_home_share,
    })),
  );
  return { nonfood: nonfood * salary, foodAtHome: food * salary };
}

export interface SalesTaxEstimate {
  total: number;
  groups: {
    state: number;
    education: number;
    transit: number;
    local_shared: number;
  };
}

// Groceries (food at home) are exempt from the state's 4 cents but pay the
// local cents; everything else pays the full jurisdiction rate.
export function salesTax(
  bases: ConsumptionBases,
  jurisdiction: SalesJurisdiction,
  stateCents: number,
): SalesTaxEstimate {
  const both = bases.nonfood + bases.foodAtHome;
  const groups = {
    state: (bases.nonfood * stateCents) / 100,
    education: (both * jurisdiction.cents.education) / 100,
    transit: (both * jurisdiction.cents.transit) / 100,
    local_shared: (both * jurisdiction.cents.local_shared) / 100,
  };
  return {
    total:
      groups.state + groups.education + groups.transit + groups.local_shared,
    groups,
  };
}

export interface PropertyLine {
  dollars: number;
  // One of the two rates (M&O or bond) is missing from the digest — the
  // line is an underestimate, not a complete rate.
  partial: boolean;
}

const ASSESSMENT_RATIO = 0.4;

export function propertyLine(
  homeValue: number,
  rate: StackRate | null,
): PropertyLine | null {
  if (!rate || (rate.mo == null && rate.bond == null)) return null;
  const mills = (rate.mo ?? 0) + (rate.bond ?? 0);
  return {
    dollars: (homeValue * ASSESSMENT_RATIO * mills) / 1000,
    partial: rate.mo == null || rate.bond == null,
  };
}

export interface ApportionedLayer {
  dollars: number;
  mix: ReceiptMix;
  // Prefixed onto subcategory labels so, e.g., state and county
  // "public safety" line items stay distinguishable in one merged table.
  prefix: string;
}

export function categoryNodes(
  layers: ApportionedLayer[],
): Record<string, CategoryNode> {
  const nodes: Record<string, CategoryNode> = {};
  for (const layer of layers) {
    if (layer.dollars <= 0) continue;
    for (const [key, mixNode] of Object.entries(layer.mix)) {
      const node = (nodes[key] ??= { total: 0, subcategories: {} });
      node.total += layer.dollars * mixNode.share;
      for (const subcategory of mixNode.subcategories) {
        const label = `${layer.prefix}${subcategory.label}`;
        node.subcategories[label] =
          (node.subcategories[label] ?? 0) +
          layer.dollars * subcategory.share;
      }
    }
  }
  return nodes;
}

// Sales cents that fund transit and road construction have no ledger of
// their own here; they land in public works with one explicit subcategory.
export const TRANSIT_MIX: ReceiptMix = {
  public_works: {
    share: 1,
    subcategories: [
      { label: "Transit & transportation sales taxes (MARTA, TSPLOST)", share: 1 },
    ],
  },
};

export type LevelKey =
  | "state"
  | "schools"
  | "county"
  | "city"
  | "shared"
  | "transit";

export const LEVEL_COLORS: Record<LevelKey, string> = {
  state: SERIES.green,
  schools: SERIES.gold,
  county: SERIES.blue,
  city: SERIES.terracotta,
  shared: NEUTRAL_SERIES,
  transit: SERIES.plum,
};

export interface LevelSlice {
  key: LevelKey;
  label: string;
  amount: number;
  share: number;
}

// Fixed narrative order (state first, then the local stack), not sorted by
// amount, so the bar reads the same across counties.
export function levelSlices(
  amounts: Partial<Record<LevelKey, number>>,
  labels: Partial<Record<LevelKey, string>> = {},
): LevelSlice[] {
  const defaults: Record<LevelKey, string> = {
    state: "State of Georgia",
    schools: "School districts",
    county: "County",
    city: "City",
    shared: "County & cities (shared sales cents)",
    transit: "Transit & transportation",
  };
  const order: LevelKey[] = [
    "state",
    "schools",
    "county",
    "city",
    "shared",
    "transit",
  ];
  const total = order.reduce((sum, key) => sum + (amounts[key] ?? 0), 0);
  if (total <= 0) return [];
  return order
    .filter((key) => (amounts[key] ?? 0) > 0)
    .map((key) => ({
      key,
      label: labels[key] ?? defaults[key],
      amount: amounts[key] as number,
      share: (amounts[key] as number) / total,
    }));
}
