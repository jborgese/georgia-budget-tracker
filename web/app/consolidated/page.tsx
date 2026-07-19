import type { Metadata } from "next";
import Link from "next/link";
import { consolidatedCountyServed, loadEntityListings } from "@/lib/data";
import { fiscalYearLabel, formatCompactDollars } from "@/lib/format";
import { GOLD, INK, MUTED, PAPER, RULE, SPRUCE } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Georgia consolidated city-county government ledgers",
  description:
    "Revenues and expenditures for Georgia's eight consolidated city-county " +
    "governments, from public RLGF filings.",
};

export default function ConsolidatedIndexPage() {
  const listings = loadEntityListings("consolidated");
  const countyServed = consolidatedCountyServed();

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
          Consolidated government ledgers
        </p>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight"
          style={{ color: SPRUCE }}
        >
          Georgia consolidated city-county governments
        </h1>
        <p className="mt-4 max-w-prose text-sm leading-relaxed">
          Eight Georgia counties merged with their principal city into a single
          consolidated government. Each files one combined Report of Local
          Government Finances covering both county and municipal services, so
          these figures are not directly comparable to county-only or city-only
          governments.
        </p>

        <div className="mt-10 overflow-x-auto">
          <table className="w-full text-sm" style={{ color: INK }}>
            <caption className="sr-only">
              Georgia consolidated governments: latest filed fiscal year,
              revenues, and expenditures
            </caption>
            <thead>
              <tr
                className="border-t font-mono text-xs uppercase tracking-widest"
                style={{ borderColor: INK, color: MUTED }}
              >
                <th scope="col" className="py-2 pr-4 text-left font-normal">
                  Government
                </th>
                <th scope="col" className="py-2 pr-4 text-left font-normal">
                  Serves
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
              {listings.map((listing) => (
                <tr
                  key={listing.slug}
                  className="border-t"
                  style={{ borderColor: RULE }}
                >
                  <td className="py-1.5 pr-4">
                    <Link
                      href={`/consolidated/${listing.slug}/`}
                      className="underline underline-offset-4"
                      style={{ color: SPRUCE }}
                    >
                      {listing.displayName}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-4 text-xs">
                    {countyServed[listing.slug]
                      ? `${countyServed[listing.slug]} County`
                      : "—"}
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
