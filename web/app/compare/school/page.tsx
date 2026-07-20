import type { Metadata } from "next";
import { buildSchoolCompare } from "@/lib/compare";
import { CompareShell } from "../shell";

export const metadata: Metadata = {
  title: "Compare school districts",
  description:
    "Compare enrollment, revenue, spending, and per-pupil figures for any two to four Georgia school districts, side by side, across school years.",
};

export default function CompareSchoolsPage() {
  return (
    <CompareShell
      title="Compare school districts"
      intro={
        "Pick two to four school districts and set their finances side by " +
        "side — enrollment, revenue, spending, and per-pupil figures, " +
        "school year by school year."
      }
      note={
        "Figures come from the US Census Bureau's Annual Survey of School " +
        "System Finances (F-33), which publishes roughly 18 months after " +
        "each school year closes — so the newest school year lags the " +
        "newest county and city filings. School spending is compared per " +
        "pupil, not per resident."
      }
      data={buildSchoolCompare()}
    />
  );
}
