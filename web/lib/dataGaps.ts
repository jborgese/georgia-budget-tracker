export interface DataGap {
  id: string;
  title: string;
  explanation: string;
  href?: string;
}

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
    title: "Special-purpose authorities",
    explanation:
      "Water and sewer, housing, hospital, airport, development, and transit authorities (including MARTA) are separate legal entities with their own budgets. Georgia collects their finances through DCA's Annual Authority Registration and Financial report, but publishes the results only as a display dashboard — no machine-readable statewide data exists to include here.",
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
