export function formatBillions(value: number): string {
  const billions = value / 1e9;
  const digits = Math.abs(billions) >= 10 ? 1 : 2;
  return `$${billions.toFixed(digits)}B`;
}

export function formatDollars(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function formatAxisTick(value: number): string {
  if (value === 0) return "$0";
  return `$${Math.round(value / 1e9)}B`;
}

export function fiscalYearLabel(year: number): string {
  return `FY${year}`;
}

export const BASIS_LABELS: Record<string, string> = {
  reported: "reported",
  actual: "actual",
  estimated: "estimated",
  amended_budget: "amended budget",
  budget: "budget",
};
