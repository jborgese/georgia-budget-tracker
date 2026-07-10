import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCountyMetrics } from "@/lib/data";
import { fiscalYearLabel, formatDollars } from "@/lib/format";
import { GOLD, INK, MUTED, PAPER, RULE, SPRUCE } from "@/lib/theme";

export const dynamicParams = false;

export function generateStaticParams() {
  return loadCountyMetrics()
    .counties.filter((entry) => entry.included)
    .map((entry) => ({ slug: entry.slug as string }));
}

function titleCase(county: string): string {
  return county
    .toLowerCase()
    .split(" ")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export default async function CountyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const metrics = loadCountyMetrics();
  const entry = metrics.counties.find(
    (candidate) => candidate.included && candidate.slug === slug,
  );
  if (!entry || !entry.included) notFound();

  const name = titleCase(entry.county);
  const years = metrics.fiscal_years;
  const latest = [...years]
    .reverse()
    .map((year) => entry.years[String(year)])
    .find((metricsForYear) => metricsForYear != null);

  return (
    <main
      className="flex-1 px-6 py-16 sm:py-20"
      style={{ backgroundColor: PAPER, color: INK }}
    >
      <div className="mx-auto w-full max-w-3xl">
        <p
          className="font-mono text-xs uppercase tracking-[0.25em]"
          style={{ color: GOLD }}
        >
          County ledger · FIPS {entry.fips}
        </p>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight"
          style={{ color: SPRUCE }}
        >
          {name} County
        </h1>
        {latest?.population != null ? (
          <p className="mt-4 text-base" style={{ color: MUTED }}>
            Population {latest.population.toLocaleString("en-US")} (latest
            estimate in this dataset)
          </p>
        ) : null}

        <section aria-label="Finances by fiscal year" className="mt-10">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-t font-mono text-xs uppercase tracking-widest"
                  style={{ borderColor: INK, color: MUTED }}
                >
                  <th scope="col" className="py-2 pr-4 text-left font-normal">
                    Fiscal year
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">
                    Revenues
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">
                    Expenditures
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">
                    Rev / resident
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">
                    Exp / resident
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Population
                  </th>
                </tr>
              </thead>
              <tbody>
                {years.map((year) => {
                  const m = entry.years[String(year)];
                  const cells = m
                    ? [
                        m.revenue != null ? formatDollars(m.revenue) : "—",
                        m.expenditure != null ? formatDollars(m.expenditure) : "—",
                        m.revenue_per_capita != null
                          ? formatDollars(m.revenue_per_capita)
                          : "—",
                        m.expenditure_per_capita != null
                          ? formatDollars(m.expenditure_per_capita)
                          : "—",
                        m.population != null
                          ? m.population.toLocaleString("en-US")
                          : "—",
                      ]
                    : null;
                  return (
                    <tr
                      key={year}
                      className="border-t"
                      style={{ borderColor: RULE }}
                    >
                      <td className="py-2 pr-4 font-mono text-xs">
                        {fiscalYearLabel(year)}
                      </td>
                      {cells ? (
                        cells.map((cell, index) => (
                          <td
                            key={index}
                            className={`py-2 text-right font-mono tabular-nums ${
                              index < 4 ? "pr-4" : ""
                            }`}
                          >
                            {cell}
                          </td>
                        ))
                      ) : (
                        <td
                          colSpan={5}
                          className="py-2 text-right text-xs italic"
                          style={{ color: MUTED }}
                        >
                          No RLGF filing for this year
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t" style={{ borderColor: INK }} />
          </div>
        </section>

        <p className="mt-6 text-xs leading-relaxed" style={{ color: MUTED }}>
          Source: DCA Report of Local Government Finances via the UGA Tax &amp;
          Expenditure Data Center; population from US Census county estimates.
          Revenues and expenditures are the county government&apos;s totals as
          filed; expenditures include operating and capital.
        </p>

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
