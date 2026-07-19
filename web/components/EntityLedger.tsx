import Link from "next/link";
import { fiscalYearLabel, formatCompactDollars, formatDollars } from "@/lib/format";
import { GOLD, INK, MUTED, PAPER, RULE, SERIES, SPRUCE } from "@/lib/theme";
import type { EntityPageData } from "@/lib/types";
import { spendingSlices } from "@/lib/spending";
import { ChartLegend } from "@/components/ChartLegend";
import { DataGapsSection } from "@/components/DataGapsSection";
import { DebtSection } from "@/components/DebtSection";
import { SalesTaxSection } from "@/components/SalesTaxSection";
import { SpendingPie } from "@/components/SpendingPie";
import { SpendingTable } from "@/components/SpendingTable";
import { CountyTrendChart, type TrendRow } from "@/components/CountyTrendChart";
import { DataTable } from "@/components/DataTable";
import { StatTile } from "@/components/StatTile";

export function entityHeading(data: EntityPageData): string {
  return data.kind === "city" ? `City of ${data.displayName}` : data.displayName;
}

function trendRows(data: EntityPageData): TrendRow[] {
  return data.fiscalYears.map((year) => ({
    fiscalYear: year,
    revenue: data.totalsByYear[String(year)]?.revenue ?? null,
    expenditure: data.totalsByYear[String(year)]?.expenditure ?? null,
  }));
}

function BreakdownTable({
  data,
  sections,
  denominator,
  label,
}: {
  data: EntityPageData;
  sections: string[];
  denominator: number | null;
  label: string;
}) {
  const year = String(data.latestFiledYear);
  const rows = data.document.breakdown.filter(
    (row) =>
      sections.includes(row.section) &&
      (row.depth < 2 || (row.amounts[year] ?? 0) !== 0),
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ color: INK }}>
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr
            className="border-t font-mono text-xs uppercase tracking-widest"
            style={{ borderColor: INK, color: MUTED }}
          >
            <th scope="col" className="py-2 pr-4 text-left font-normal">
              Line item
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">
              {fiscalYearLabel(data.latestFiledYear)}
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const amount = row.amounts[year] ?? 0;
            const share =
              denominator && row.depth > 0 ? (amount / denominator) * 100 : null;
            return (
              <tr key={row.path} className="border-t" style={{ borderColor: RULE }}>
                <td
                  className={`py-1.5 pr-4 ${row.depth === 0 ? "font-semibold" : ""}`}
                  style={{ paddingLeft: `${row.depth * 20}px` }}
                >
                  {row.classification}
                </td>
                <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                  {formatDollars(amount)}
                </td>
                <td
                  className="py-1.5 text-right font-mono tabular-nums text-xs"
                  style={{ color: MUTED }}
                >
                  {share != null ? `${share.toFixed(1)}%` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t" style={{ borderColor: INK }} />
    </div>
  );
}

export function EntityLedger({ data }: { data: EntityPageData }) {
  const heading = entityHeading(data);
  const fy = fiscalYearLabel(data.latestFiledYear);
  const latest = data.totalsByYear[String(data.latestFiledYear)];
  const latestMetrics = data.metricsByYear[String(data.latestFiledYear)];
  const eyebrow =
    data.kind === "city"
      ? "City ledger"
      : `Consolidated government ledger${data.countyServed ? ` · serves ${data.countyServed} County` : ""}`;

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
          {eyebrow}
        </p>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight"
          style={{ color: SPRUCE }}
        >
          {heading}
        </h1>
        {data.kind === "consolidated" ? (
          <p className="mt-3 max-w-prose text-sm leading-relaxed">
            A consolidated city-county government provides both county and
            municipal services, so its totals are not directly comparable to
            county-only or city-only governments.
          </p>
        ) : null}

        <section
          aria-label={`Headline figures, ${fy}`}
          className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4"
        >
          <StatTile
            label={`${fy} revenues`}
            value={latest?.revenue != null ? formatCompactDollars(latest.revenue) : "—"}
            detail="As filed"
          />
          <StatTile
            label={`${fy} expenditures`}
            value={
              latest?.expenditure != null
                ? formatCompactDollars(latest.expenditure)
                : "—"
            }
            detail="Operating plus capital"
          />
          <StatTile
            label="Revenue / resident"
            value={
              latestMetrics?.revenue_per_capita != null
                ? formatDollars(latestMetrics.revenue_per_capita)
                : "—"
            }
            detail={
              latestMetrics?.revenue_per_capita != null
                ? `${fy}, per Census estimate`
                : "Population estimate unavailable"
            }
          />
          <StatTile
            label="Population"
            value={
              latestMetrics?.population != null
                ? latestMetrics.population.toLocaleString("en-US")
                : "—"
            }
            detail={
              latestMetrics?.population != null
                ? `Census estimate, ${data.latestFiledYear}`
                : "Not in the Census place file"
            }
          />
        </section>

        {spendingSlices(data.spendingByCategory).length ? (
          <section
            aria-label={`Where a ${heading} tax dollar goes`}
            className="mt-14"
          >
            <div className="border-t pb-1 pt-3" style={{ borderColor: INK }}>
              <h2
                className="font-mono text-xs uppercase tracking-widest"
                style={{ color: SPRUCE }}
              >
                Where a {heading} tax dollar goes
              </h2>
            </div>
            <p className="mt-3 max-w-prose text-sm leading-relaxed">
              Every dollar the government spent in {fy}, by what it paid for.
            </p>
            <SpendingPie
              slices={spendingSlices(data.spendingByCategory)}
              total={latest?.expenditure ?? 0}
              centerLabel={`${fy} spending`}
              ariaLabel={`Pie chart of ${heading} ${fy} spending by category; exact values are in the table below.`}
            />
            <SpendingTable
              caption={`${heading} ${fy} spending by category, expandable to line items`}
              slices={spendingSlices(data.spendingByCategory)}
              total={latest?.expenditure ?? 0}
            />
          </section>
        ) : null}

        <section aria-label="Revenues and expenditures over time" className="mt-14">
          <div
            className="flex flex-wrap items-baseline justify-between gap-2 border-t pb-1 pt-3"
            style={{ borderColor: INK }}
          >
            <h2
              className="font-mono text-xs uppercase tracking-widest"
              style={{ color: SPRUCE }}
            >
              Revenues vs. expenditures
            </h2>
            <ChartLegend
              entries={[
                { label: "Revenues", color: SERIES.green, kind: "line" },
                { label: "Expenditures", color: SERIES.gold, kind: "line" },
              ]}
            />
          </div>
          <CountyTrendChart rows={trendRows(data)} entityLabel={heading} />
          {data.missingYears.length ? (
            <p className="mt-2 text-xs" style={{ color: MUTED }}>
              No RLGF filing for {data.missingYears.map(fiscalYearLabel).join(", ")}{" "}
              — shown as gaps, not zeros.
            </p>
          ) : null}
          <DataTable
            caption={`${heading} revenues and expenditures by fiscal year`}
            columns={[
              "Fiscal year",
              "Revenues",
              "Expenditures",
              "Operating",
              "Capital",
              "Rev / resident",
              "Population",
            ]}
            rows={data.fiscalYears.map((year) => {
              const totals = data.totalsByYear[String(year)];
              const metrics = data.metricsByYear[String(year)];
              return [
                fiscalYearLabel(year),
                totals?.revenue != null ? formatDollars(totals.revenue) : "no filing",
                totals?.expenditure != null
                  ? formatDollars(totals.expenditure)
                  : "no filing",
                totals?.expenditure_operating != null
                  ? formatDollars(totals.expenditure_operating)
                  : "—",
                totals?.expenditure_capital != null
                  ? formatDollars(totals.expenditure_capital)
                  : "—",
                metrics?.revenue_per_capita != null
                  ? formatDollars(metrics.revenue_per_capita)
                  : "—",
                metrics?.population != null
                  ? metrics.population.toLocaleString("en-US")
                  : "—",
              ];
            })}
          />
        </section>

        <div className="mt-14 grid gap-12 lg:grid-cols-2 lg:gap-8">
          <section aria-label={`Revenue breakdown, ${fy}`}>
            <div className="border-t pb-2 pt-3" style={{ borderColor: INK }}>
              <h2
                className="font-mono text-xs uppercase tracking-widest"
                style={{ color: SPRUCE }}
              >
                Where {fy} revenue came from
              </h2>
            </div>
            <BreakdownTable
              data={data}
              sections={["revenues"]}
              denominator={latest?.revenue ?? null}
              label={`${heading} revenue breakdown, ${fy}`}
            />
          </section>

          <section aria-label={`Expenditure breakdown, ${fy}`}>
            <div className="border-t pb-2 pt-3" style={{ borderColor: INK }}>
              <h2
                className="font-mono text-xs uppercase tracking-widest"
                style={{ color: SPRUCE }}
              >
                Where {fy} spending went
              </h2>
            </div>
            <BreakdownTable
              data={data}
              sections={["operating", "capital"]}
              denominator={latest?.expenditure ?? null}
              label={`${heading} expenditure breakdown, ${fy}`}
            />
          </section>
        </div>

        <SalesTaxSection
          lines={data.salesTaxLines}
          latestFiledYear={data.latestFiledYear}
          entityLabel={heading}
          revenueTotal={latest?.revenue ?? null}
        />

        <DebtSection
          breakdown={data.document.breakdown}
          latestFiledYear={data.latestFiledYear}
          entityLabel={heading}
        />

        <DataGapsSection entityLabel={heading} />

        <footer className="mt-14">
          <div className="border-t pt-3" style={{ borderColor: INK }}>
            <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
              {data.provenance}
            </p>
          </div>
          <p className="mt-8">
            <Link
              href={data.kind === "city" ? "/city/" : "/consolidated/"}
              className="font-mono text-xs uppercase tracking-widest underline underline-offset-4"
              style={{ color: SPRUCE }}
            >
              ← All {data.kind === "city" ? "city" : "consolidated"} ledgers
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
