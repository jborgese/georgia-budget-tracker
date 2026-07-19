import type { Metadata } from "next";
import Link from "next/link";
import { loadEntityListings } from "@/lib/data";
import { fiscalYearLabel, formatCompactDollars } from "@/lib/format";
import { GOLD, INK, MUTED, PAPER, RULE, SPRUCE } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Georgia city ledgers",
  description:
    "Revenues and expenditures for every Georgia city government that files " +
    "the Report of Local Government Finances, from public RLGF filings.",
};

export default function CityIndexPage() {
  const listings = loadEntityListings("city");
  const filed = listings.filter((listing) => listing.latestFiledYear != null);
  const unfiled = listings.length - filed.length;

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
          City ledgers
        </p>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight"
          style={{ color: SPRUCE }}
        >
          Georgia city governments
        </h1>
        <p className="mt-4 max-w-prose text-sm leading-relaxed">
          Every Georgia municipality files a Report of Local Government
          Finances. The {filed.length} cities below have at least one filing in
          this dataset; each links to its full ledger. Figures are the latest
          filed fiscal year.
        </p>

        <div className="mt-10 overflow-x-auto">
          <table className="w-full text-sm" style={{ color: INK }}>
            <caption className="sr-only">
              Georgia cities with RLGF filings: latest filed fiscal year,
              revenues, and expenditures
            </caption>
            <thead>
              <tr
                className="border-t font-mono text-xs uppercase tracking-widest"
                style={{ borderColor: INK, color: MUTED }}
              >
                <th scope="col" className="py-2 pr-4 text-left font-normal">
                  City
                </th>
                <th scope="col" className="py-2 pr-4 text-left font-normal">
                  Latest filing
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  Revenues
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Expenditures
                </th>
              </tr>
            </thead>
            <tbody>
              {filed.map((listing) => (
                <tr
                  key={listing.slug}
                  className="border-t"
                  style={{ borderColor: RULE }}
                >
                  <td className="py-1.5 pr-4">
                    <Link
                      href={`/city/${listing.slug}/`}
                      className="underline underline-offset-4"
                      style={{ color: SPRUCE }}
                    >
                      {listing.displayName}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-4 font-mono text-xs">
                    {listing.latestFiledYear != null
                      ? fiscalYearLabel(listing.latestFiledYear)
                      : "—"}
                  </td>
                  <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                    {listing.revenue != null
                      ? formatCompactDollars(listing.revenue)
                      : "no filing"}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {listing.expenditure != null
                      ? formatCompactDollars(listing.expenditure)
                      : "no filing"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t" style={{ borderColor: INK }} />
        </div>

        {unfiled ? (
          <p className="mt-4 text-xs leading-relaxed" style={{ color: MUTED }}>
            {unfiled} {unfiled === 1 ? "city appears" : "cities appear"} in the
            source workbook with no non-zero filing in any year and{" "}
            {unfiled === 1 ? "is" : "are"} not listed.
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
