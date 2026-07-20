import type { Metadata } from "next";
import Link from "next/link";
import { loadGadoeOverlay, loadSchoolIndex } from "@/lib/data";
import { fiscalYearLabel, formatCompactDollars, formatDollars } from "@/lib/format";
import { GOLD, INK, MUTED, PAPER, RULE, SPRUCE } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Georgia school district ledgers",
  description:
    "Enrollment, revenues, spending, and per-pupil figures for every " +
    "Georgia public school district, from the Census F-33 survey plus " +
    "GaDOE's current-year collection.",
};

export default function SchoolsIndexPage() {
  const index = loadSchoolIndex();
  const latestYear = index.districts[0]?.latest_fiscal_year;
  const overlay = loadGadoeOverlay();
  const overlayYear = overlay ? Math.max(...overlay.fiscal_years) : null;
  const overlayRevenue = (ncesid: string): number | null =>
    overlay && overlayYear != null
      ? (overlay.districts[ncesid]?.years[String(overlayYear)]?.revenue.total ??
        null)
      : null;

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
          School district ledgers
        </p>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight"
          style={{ color: SPRUCE }}
        >
          Georgia school districts
        </h1>
        <p className="mt-4 max-w-prose text-sm leading-relaxed">
          Georgia&apos;s {index.districts.length} regular public school
          systems — county districts plus the independent city districts that
          tax separately from the county around them. School taxes are usually
          the largest line on a property tax bill. Figures are{" "}
          {latestYear ? fiscalYearLabel(latestYear) : "the latest year"}, the
          newest available from the Census school-finance survey.
          {overlay && overlayYear != null ? (
            <>
              {" "}
              The survey runs about 18 months behind, so the last column adds{" "}
              {fiscalYearLabel(overlayYear)} operating revenues from the
              state&apos;s own current-year collection.
            </>
          ) : null}
        </p>

        <div className="mt-10 overflow-x-auto">
          <table className="w-full text-sm" style={{ color: INK }}>
            <caption className="sr-only">
              Georgia school districts: enrollment, revenues, expenditures,
              and per-pupil current spending from the Census F-33 survey
              {overlay && overlayYear != null
                ? `, plus ${fiscalYearLabel(overlayYear)} operating revenues from GaDOE's current-year collection`
                : ""}
            </caption>
            <thead>
              <tr
                className="border-t font-mono text-xs uppercase tracking-widest"
                style={{ borderColor: INK, color: MUTED }}
              >
                <th scope="col" className="py-2 pr-4 text-left font-normal">
                  District
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  Enrollment
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  Revenues
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  Spending
                </th>
                <th
                  scope="col"
                  className={`py-2 text-right font-normal ${overlay ? "pr-4" : ""}`}
                >
                  Per-pupil
                </th>
                {overlay && overlayYear != null ? (
                  <th scope="col" className="py-2 text-right font-normal">
                    {fiscalYearLabel(overlayYear)} revenues (GaDOE)
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {index.districts.map((district) => (
                <tr
                  key={district.slug}
                  className="border-t"
                  style={{ borderColor: RULE }}
                >
                  <td className="py-1.5 pr-4">
                    <Link
                      href={`/school/${district.slug}/`}
                      className="underline underline-offset-4"
                      style={{ color: SPRUCE }}
                    >
                      {district.display_name}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                    {district.enrollment.toLocaleString("en-US")}
                  </td>
                  <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                    {formatCompactDollars(district.revenue)}
                  </td>
                  <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                    {formatCompactDollars(district.expenditure)}
                  </td>
                  <td
                    className={`py-1.5 text-right font-mono tabular-nums ${overlay ? "pr-4" : ""}`}
                  >
                    {district.per_pupil_current_spending != null
                      ? formatDollars(district.per_pupil_current_spending)
                      : "—"}
                  </td>
                  {overlay ? (
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {overlayRevenue(district.ncesid) != null
                        ? formatCompactDollars(
                            overlayRevenue(district.ncesid) as number,
                          )
                        : "—"}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t" style={{ borderColor: INK }} />
        </div>

        {overlay && overlayYear != null ? (
          <p
            className="mt-4 max-w-prose text-xs leading-relaxed"
            style={{ color: MUTED }}
          >
            {fiscalYearLabel(overlayYear)} revenues are from GaDOE&apos;s
            Financial Data Collection System, the state&apos;s current-year
            reporting. {overlay.basis} The other columns are{" "}
            {latestYear ? fiscalYearLabel(latestYear) : "the latest year"}{" "}
            all-funds figures from the Census survey, which publishes about 18
            months after each fiscal year closes but with full revenue and
            spending detail.
          </p>
        ) : null}

        <p className="mt-8">
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-widest underline underline-offset-4"
            style={{ color: SPRUCE }}
          >
            ← Back to the statewide ledger
          </Link>
        </p>
      </div>
    </main>
  );
}
