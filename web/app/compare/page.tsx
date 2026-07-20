import type { Metadata } from "next";
import { buildCountyCompare } from "@/lib/compare";
import { CompareShell } from "./shell";

export const metadata: Metadata = {
  title: "Compare counties",
  description:
    "Compare revenues, expenditures, and per-resident figures for any two to four Georgia counties, side by side, across fiscal years.",
};

export default function ComparePage() {
  return (
    <CompareShell
      title="Compare counties"
      intro={
        "Pick two to four county governments and set their ledgers side by " +
        "side — totals and per-resident figures, fiscal year by fiscal year."
      }
      data={buildCountyCompare()}
    />
  );
}
