import type { Metadata } from "next";
import { buildConsolidatedCompare } from "@/lib/compare";
import { CompareShell } from "../shell";

export const metadata: Metadata = {
  title: "Compare consolidated governments",
  description:
    "Compare revenues, expenditures, and per-resident figures for Georgia's consolidated city-county governments, side by side, across fiscal years.",
};

export default function CompareConsolidatedPage() {
  return (
    <CompareShell
      title="Compare consolidated governments"
      intro={
        "Pick two to four of Georgia's eight consolidated city-county " +
        "governments and set their ledgers side by side — totals and " +
        "per-resident figures, fiscal year by fiscal year."
      }
      note={
        "A consolidated government provides both county and municipal " +
        "services, so its figures only compare cleanly with other " +
        "consolidated governments — not with county-only or city-only " +
        "ledgers. Per-resident figures use the population of the " +
        "consolidated county."
      }
      data={buildConsolidatedCompare()}
    />
  );
}
