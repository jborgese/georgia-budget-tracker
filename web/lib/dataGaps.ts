export interface DataGap {
  id: string;
  title: string;
  explanation: string;
  href?: string;
}

export function digestGapExplanation(
  countyName: string,
  years: number[],
): string {
  const yearList =
    years.length > 1
      ? `${years.slice(0, -1).join(", ")} and ${years.at(-1)}`
      : String(years[0]);
  return (
    `The state's compiled digest export carries no rows for ${countyName} ` +
    `County in tax year${years.length > 1 ? "s" : ""} ${yearList} — the ` +
    `county is absent from the DOR file upstream, not withheld here. Those ` +
    `years appear as breaks in the series, never as zeros.`
  );
}

// What the taxpayer receipt deliberately leaves out, each with the reason.
export const RECEIPT_DATA_GAPS: DataGap[] = [
  {
    id: "receipt-income-detail",
    title: "Income-tax detail beyond the standard deduction",
    explanation:
      "The receipt applies Georgia's flat rate to salary minus the standard deduction. Dependent exemptions, the retirement income exclusion, credits, the 2026–2028 tips and overtime exclusions, itemized deductions, and non-wage income all change a real return and are not modeled.",
  },
  {
    id: "receipt-lost-split",
    title: "The county/city split of shared sales cents",
    explanation:
      "LOST and similar shared cents divide between a county and its cities under negotiated distribution certificates that Georgia publishes only as documents, not data. The receipt apportions those dollars by the county government's spending mix as a stand-in.",
  },
  {
    id: "receipt-consumption",
    title: "Spending the consumption model excludes",
    explanation:
      "The sales-tax estimate covers taxable retail categories from national consumer-expenditure patterns. Housing, utilities, healthcare, vehicle purchases (Georgia levies TAVT instead), motor fuel (excise-taxed), education, insurance, and contributions are excluded, so the estimate is conservative.",
  },
  {
    id: "receipt-other-taxes",
    title: "Every other tax and fee",
    explanation:
      "Vehicle TAVT and registration, motor-fuel excise, alcohol and tobacco excises, insurance premium taxes, utility franchise fees, and service charges all fund the same governments but have no per-resident data source here.",
  },
];

export const LEDGER_DATA_GAPS: DataGap[] = [
  {
    id: "school-taxes",
    title: "School district taxes and spending",
    explanation:
      "School systems levy their own property tax and ESPLOST — usually the largest line on a property tax bill. They publish separately and appear on their own ledgers, not in this government's totals.",
    href: "/schools/",
  },
  {
    id: "authorities",
    title: "Special-purpose authority budgets",
    explanation:
      "Water and sewer, housing, hospital, airport, development, and transit authorities (including MARTA) are separate legal entities with their own budgets. Where an authority levies a property tax, its rate appears in the county's property-tax rates table — but the budgets behind those levies are collected by DCA's Annual Authority Registration and Financial report and published only as a display dashboard, so no machine-readable statewide spending data exists to include here.",
  },
  {
    id: "tads",
    title: "Tax allocation districts (TADs)",
    explanation:
      "TADs redirect the growth in property-tax collections inside a defined zone toward redevelopment financing, which can make a government's reported revenue understate what its tax base generates. Georgia publishes no central registry or financial data for TADs; they surface only in individual audit documents.",
  },
  {
    id: "debt-detail",
    title: "Per-issuance debt detail",
    explanation:
      "The state collects a report on every local debt issuance over $1 million within 60 days, but publishes only annual PDF compilations without machine-readable data. The debt figures shown here come from the annual RLGF filing instead.",
  },
];
