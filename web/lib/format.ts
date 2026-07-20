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

export function formatCompactDollars(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function formatCompactCount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${Math.round(value / 1e3)}k`;
  return formatCount(value);
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
