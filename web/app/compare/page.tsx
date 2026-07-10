import type { Metadata } from "next";
import { Suspense } from "react";
import { loadCountyMetrics } from "@/lib/data";
import { GOLD, INK, PAPER, SPRUCE } from "@/lib/theme";
import { CompareView } from "@/components/CompareView";

export const metadata: Metadata = {
  title: "Compare counties",
  description:
    "Compare revenues, expenditures, and per-resident figures for any two to four Georgia counties, side by side, across fiscal years.",
};

export default function ComparePage() {
  const metrics = loadCountyMetrics();
  return (
    <main
      className="flex-1 px-6 py-16 sm:py-20"
      style={{ backgroundColor: PAPER, color: INK }}
    >
      <div className="mx-auto w-full max-w-4xl">
        <p
          className="font-mono text-xs uppercase tracking-[0.25em]"
          style={{ color: GOLD }}
        >
          Side by side
        </p>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight"
          style={{ color: SPRUCE }}
        >
          Compare counties
        </h1>
        <p className="mt-6 max-w-prose text-base leading-relaxed">
          Pick two to four county governments and set their ledgers side by
          side — totals and per-resident figures, fiscal year by fiscal year.
        </p>
        <div className="mt-10">
          <Suspense fallback={null}>
            <CompareView metrics={metrics} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
