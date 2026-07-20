import type { Metadata } from "next";
import { buildCityCompare } from "@/lib/compare";
import { CompareShell } from "../shell";

export const metadata: Metadata = {
  title: "Compare cities",
  description:
    "Compare revenues, expenditures, and per-resident figures for any two to four Georgia city governments, side by side, across fiscal years.",
};

export default function CompareCitiesPage() {
  return (
    <CompareShell
      title="Compare cities"
      intro={
        "Pick two to four city governments and set their ledgers side by " +
        "side — totals and per-resident figures, fiscal year by fiscal year."
      }
      note={
        "Per-resident figures use US Census incorporated-place population " +
        "estimates. Places the Census does not publish an estimate for show " +
        "— instead of a fabricated figure."
      }
      data={buildCityCompare()}
    />
  );
}
