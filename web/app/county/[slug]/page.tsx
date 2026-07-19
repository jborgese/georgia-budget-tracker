import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCountyMetrics, loadCountyPage, schoolsByCountyFips } from "@/lib/data";
import {
  fiscalYearLabel,
  formatCompactDollars,
  formatDollars,
} from "@/lib/format";
import { GOLD, INK, MUTED, PAPER, RULE, SERIES, SPRUCE } from "@/lib/theme";
import type { CountyPageData } from "@/lib/types";
import { spendingSlices } from "@/lib/spending";
import { ChartLegend } from "@/components/ChartLegend";
import { DebtSection } from "@/components/DebtSection";
import { SalesTaxSection } from "@/components/SalesTaxSection";
import { CountyMedianChart, type MedianRow } from "@/components/CountyMedianChart";
import { SpendingPie } from "@/components/SpendingPie";
import { SpendingTable } from "@/components/SpendingTable";
import { CountyTrendChart, type TrendRow } from "@/components/CountyTrendChart";
import { DataTable } from "@/components/DataTable";
import { StatTile } from "@/components/StatTile";

export const dynamicParams = false;

export function generateStaticParams() {
  return loadCountyMetrics()
    .counties.filter((entry) => entry.included)
    .map((entry) => ({ slug: entry.slug as string }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = loadCountyPage(slug);
  if (!data) return {};
  const latest = data.years[String(data.latestFiledYear)];
  const fy = fiscalYearLabel(data.latestFiledYear);
  const description =
    `${data.displayName} County, Georgia government finances: ` +
    `${fy} revenues ${latest?.revenue != null ? formatCompactDollars(latest.revenue) : "n/a"}, ` +
    `expenditures ${latest?.expenditure != null ? formatCompactDollars(latest.expenditure) : "n/a"}` +
    `${latest?.revenue_per_capita != null ? `, ${formatDollars(latest.revenue_per_capita)} revenue per resident` : ""}. ` +
    `Multi-year trends, breakdowns, and per-capita comparisons from public RLGF filings.`;
  const title = `${data.displayName} County, GA — county finances ${fy}`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary", title, description },
  };
}

function trendRows(data: CountyPageData): TrendRow[] {
  return data.fiscalYears.map((year) => ({
    fiscalYear: year,
    revenue: data.years[String(year)]?.revenue ?? null,
    expenditure: data.years[String(year)]?.expenditure ?? null,
  }));
}

function medianRows(data: CountyPageData): MedianRow[] {
  return data.fiscalYears.map((year) => ({
    fiscalYear: year,
    county: data.years[String(year)]?.revenue_per_capita ?? null,
    median: data.medians[String(year)]?.revenue_per_capita ?? null,
  }));
}

function medianDelta(data: CountyPageData): string | null {
  const year = String(data.latestFiledYear);
  const county = data.years[year]?.revenue_per_capita;
  const median = data.medians[year]?.revenue_per_capita;
  if (county == null || median == null || median === 0) return null;
  const delta = ((county - median) / median) * 100;
  const direction = delta >= 0 ? "above" : "below";
  return `${Math.abs(delta).toFixed(0)}% ${direction} the state median (${formatDollars(median)})`;
}

function BreakdownTable({
  data,
  sections,
  denominator,
  label,
}: {
  data: CountyPageData;
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
              <tr
                key={row.path}
                className="border-t"
                style={{ borderColor: RULE }}
              >
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

export default async function CountyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = loadCountyPage(slug);
  if (!data) notFound();

  const fy = fiscalYearLabel(data.latestFiledYear);
  const latest = data.years[String(data.latestFiledYear)];
  const revenueTotal =
    data.document.totals.find((t) => t.fiscal_year === data.latestFiledYear)
      ?.revenue ?? null;
  const expenditureTotal = latest?.expenditure ?? null;
  const delta = medianDelta(data);

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
          County ledger · FIPS {data.fips}
        </p>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight"
          style={{ color: SPRUCE }}
        >
          {data.displayName} County
        </h1>

        <section
          aria-label={`Headline figures, ${fy}`}
          className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4"
        >
          <StatTile
            label={`${fy} revenues`}
            value={latest?.revenue != null ? formatCompactDollars(latest.revenue) : "—"}
            detail="County government, as filed"
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
              latest?.revenue_per_capita != null
                ? formatDollars(latest.revenue_per_capita)
                : "—"
            }
            detail={delta ?? "State median unavailable"}
          />
          <StatTile
            label="Population"
            value={
              latest?.population != null
                ? latest.population.toLocaleString("en-US")
                : "—"
            }
            detail={`Census estimate, ${data.latestFiledYear}`}
          />
        </section>

        {spendingSlices(data.spendingByCategory).length ? (
          <section
            aria-label={`Where a ${data.displayName} County tax dollar goes`}
            className="mt-14"
          >
            <div className="border-t pb-1 pt-3" style={{ borderColor: INK }}>
              <h2
                className="font-mono text-xs uppercase tracking-widest"
                style={{ color: SPRUCE }}
              >
                Where a {data.displayName} County tax dollar goes
              </h2>
            </div>
            <p className="mt-3 max-w-prose text-sm leading-relaxed">
              Every dollar the county government spent in {fy}, by what it
              paid for.
            </p>
            <SpendingPie
              slices={spendingSlices(data.spendingByCategory)}
              total={latest?.expenditure ?? 0}
              centerLabel={`${fy} spending`}
              ariaLabel={`Pie chart of ${data.displayName} County ${fy} spending by category; exact values are in the table below.`}
            />
            <SpendingTable
              caption={`${data.displayName} County ${fy} spending by category, expandable to line items`}
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
          <CountyTrendChart
            rows={trendRows(data)}
            entityLabel={`${data.displayName} County`}
          />
          {data.missingYears.length ? (
            <p className="mt-2 text-xs" style={{ color: MUTED }}>
              No RLGF filing for{" "}
              {data.missingYears.map(fiscalYearLabel).join(", ")} — shown as gaps,
              not zeros.
            </p>
          ) : null}
          <DataTable
            caption={`${data.displayName} County revenues and expenditures by fiscal year`}
            columns={[
              "Fiscal year",
              "Revenues",
              "Expenditures",
              "Rev / resident",
              "Exp / resident",
              "Population",
            ]}
            rows={data.fiscalYears.map((year) => {
              const m = data.years[String(year)];
              return [
                fiscalYearLabel(year),
                m?.revenue != null ? formatDollars(m.revenue) : "no filing",
                m?.expenditure != null ? formatDollars(m.expenditure) : "no filing",
                m?.revenue_per_capita != null
                  ? formatDollars(m.revenue_per_capita)
                  : "—",
                m?.expenditure_per_capita != null
                  ? formatDollars(m.expenditure_per_capita)
                  : "—",
                m?.population != null ? m.population.toLocaleString("en-US") : "—",
              ];
            })}
          />
        </section>

        <section aria-label="Comparison with the state median" className="mt-14">
          <div
            className="flex flex-wrap items-baseline justify-between gap-2 border-t pb-1 pt-3"
            style={{ borderColor: INK }}
          >
            <h2
              className="font-mono text-xs uppercase tracking-widest"
              style={{ color: SPRUCE }}
            >
              Revenue per resident vs. the median county
            </h2>
            <ChartLegend
              entries={[
                {
                  label: `${data.displayName} County`,
                  color: SERIES.green,
                  kind: "line",
                },
                { label: "State median", color: MUTED, kind: "line", dashed: true },
              ]}
            />
          </div>
          <CountyMedianChart rows={medianRows(data)} countyName={data.displayName} />
          <p className="mt-2 text-xs" style={{ color: MUTED }}>
            Median across the county governments that filed in each year (151
            counties in this dataset);{" "}
            <Link
              href="/consolidated/"
              className="underline underline-offset-2"
              style={{ color: SPRUCE }}
            >
              consolidated city-county governments
            </Link>{" "}
            are not included.
          </p>
          <DataTable
            caption={`${data.displayName} County revenue per resident versus the state median, by fiscal year`}
            columns={["Fiscal year", `${data.displayName} County`, "State median"]}
            rows={medianRows(data).map((row) => [
              fiscalYearLabel(row.fiscalYear),
              row.county != null ? formatDollars(row.county) : "no filing",
              row.median != null ? formatDollars(row.median) : "—",
            ])}
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
              denominator={revenueTotal}
              label={`${data.displayName} County revenue breakdown, ${fy}`}
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
              denominator={expenditureTotal}
              label={`${data.displayName} County expenditure breakdown, ${fy}`}
            />
          </section>
        </div>

        <SalesTaxSection
          lines={data.salesTaxLines}
          latestFiledYear={data.latestFiledYear}
          entityLabel={`${data.displayName} County`}
          revenueTotal={revenueTotal}
        />

        <DebtSection
          breakdown={data.document.breakdown}
          latestFiledYear={data.latestFiledYear}
          entityLabel={`${data.displayName} County`}
        />

        {(schoolsByCountyFips()[data.fips] ?? []).length ? (
          <section aria-label="School systems in this county" className="mt-14">
            <div className="border-t pb-1 pt-3" style={{ borderColor: INK }}>
              <h2
                className="font-mono text-xs uppercase tracking-widest"
                style={{ color: SPRUCE }}
              >
                School systems in this county
              </h2>
            </div>
            <p className="mt-3 max-w-prose text-sm leading-relaxed">
              School districts tax and spend separately from the county
              government — usually the largest line on a property tax bill.
              These figures are not included in the county totals above.
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {(schoolsByCountyFips()[data.fips] ?? []).map((district) => (
                <li key={district.slug}>
                  <Link
                    href={`/school/${district.slug}/`}
                    className="underline underline-offset-4"
                    style={{ color: SPRUCE }}
                  >
                    {district.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="mt-14">
          <div className="border-t pt-3" style={{ borderColor: INK }}>
            <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
              {data.provenance}
            </p>
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
        </footer>
      </div>
    </main>
  );
}
