import {
  consolidatedByCountyFips,
  loadCountyMetrics,
  loadDashboardData,
  loadStateCategories,
} from "@/lib/data";
import { georgiaCountyFeatures } from "@/lib/geo";
import { BASIS_LABELS, fiscalYearLabel, formatBillions, formatDollars } from "@/lib/format";
import { CountyChoropleth } from "@/components/CountyChoropleth";
import { INK, MUTED, PAPER, RULE, SERIES, SPRUCE, GOLD, segmentColors } from "@/lib/theme";
import type { CategorySeries } from "@/lib/types";
import { spendingSlices, stateSpendingNodes } from "@/lib/spending";
import { SpendingTable } from "@/components/SpendingTable";
import { CategoryStackChart } from "@/components/CategoryStackChart";
import { SpendingPie } from "@/components/SpendingPie";
import { ChartLegend } from "@/components/ChartLegend";
import { DataTable } from "@/components/DataTable";
import { RevenueExpenditureChart } from "@/components/RevenueExpenditureChart";
import { StatTile } from "@/components/StatTile";

function stackLegend(series: CategorySeries) {
  const colors = segmentColors(series.segments);
  return series.segments.map((segment) => ({
    label: segment.label,
    color: colors[segment.key],
    kind: "rect" as const,
  }));
}

function stackTable(series: CategorySeries) {
  const columns = ["Fiscal year", ...series.segments.map((s) => s.label), "Basis"];
  const rows = series.fiscalYears.map((year) => [
    fiscalYearLabel(year),
    ...series.segments.map((segment) =>
      formatDollars(segment.amountsByYear[String(year)] ?? 0),
    ),
    BASIS_LABELS[series.basisByYear[String(year)] ?? ""] ?? "—",
  ]);
  return { columns, rows };
}

export default function Home() {
  const data = loadDashboardData();
  const fy = fiscalYearLabel(data.headline.fiscalYear);
  const revenueTable = stackTable(data.revenueCategories);
  const expenditureTable = stackTable(data.expenditureCategories);
  const countyMetrics = loadCountyMetrics();
  const countyFeatures = georgiaCountyFeatures();
  const stateSpendingSlices = spendingSlices(
    stateSpendingNodes(loadStateCategories(), data.lastReportedYear),
  );
  const latestCountyYear = String(countyMetrics.fiscal_years.at(-1));
  const countyTableRows = countyMetrics.counties
    .filter((entry) => entry.included)
    .map((entry) => {
      const m = entry.included ? entry.years[latestCountyYear] : null;
      return [
        entry.county,
        m?.revenue != null ? formatDollars(m.revenue) : "—",
        m?.expenditure != null ? formatDollars(m.expenditure) : "—",
        m?.revenue_per_capita != null ? formatDollars(m.revenue_per_capita) : "—",
        m?.population != null ? m.population.toLocaleString("en-US") : "—",
      ];
    });

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
          A public ledger for Georgia
        </p>

        <h1
          className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl"
          style={{ color: SPRUCE }}
        >
          Georgia State Budget Tracker
        </h1>

        <p className="mt-6 max-w-prose text-base leading-relaxed sm:text-lg">
          How the State of Georgia — down to each of its 159 counties —
          apportions its finances. Every figure below comes from public
          records, and every revision of the data is kept in the open.
        </p>

        <section
          aria-label={`Headline figures, fiscal year ${data.headline.fiscalYear}`}
          className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4"
        >
          <StatTile
            label={`${fy} revenues`}
            value={formatBillions(data.headline.revenue)}
            detail="State treasury receipts, reported"
          />
          <StatTile
            label={`${fy} expenditures`}
            value={formatBillions(data.headline.expenditure)}
            detail="State funds, actual"
          />
          <StatTile
            label={`${fy} balance`}
            value={`${data.headline.balance >= 0 ? "+" : "−"}${formatBillions(
              Math.abs(data.headline.balance),
            )}`}
            detail="Receipts less state-funds spending"
          />
          <StatTile
            label="County ledgers"
            value={`${data.headline.countiesCovered} of ${data.headline.countiesTotal}`}
            detail="Consolidated governments pending"
          />
        </section>

        <section aria-label="Where a state tax dollar goes" className="mt-16">
          <div className="border-t pb-1 pt-3" style={{ borderColor: INK }}>
            <h2
              className="font-mono text-xs uppercase tracking-widest"
              style={{ color: SPRUCE }}
            >
              Where a state tax dollar goes
            </h2>
          </div>
          <p className="mt-3 max-w-prose text-sm leading-relaxed">
            Every dollar of {fy} state-funds spending, by what it paid for.
          </p>
          <SpendingPie
            slices={stateSpendingSlices}
            total={data.headline.expenditure}
            centerLabel={`${fy} spending`}
            ariaLabel={`Pie chart of Georgia ${fy} state-funds spending by category; exact values, including per-agency detail, are in the table below.`}
          />
          <SpendingTable
            caption={`Georgia ${fy} state-funds spending by category, expandable to agencies`}
            slices={stateSpendingSlices}
            total={data.headline.expenditure}
          />
        </section>

        <section aria-label="Revenues versus expenditures" className="mt-16">
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
                { label: "Expenditures (state funds)", color: SERIES.gold, kind: "line" },
                { label: "Estimated / budget", color: MUTED, kind: "line", dashed: true },
              ]}
            />
          </div>
          <RevenueExpenditureChart
            totals={data.fiscalYearTotals}
            lastReportedYear={data.lastReportedYear}
          />
          <p className="mt-2 text-xs" style={{ color: MUTED }}>
            Solid lines are reported receipts and actual expenditures through{" "}
            {fiscalYearLabel(data.lastReportedYear)}; dashed continuations are the
            Governor&apos;s estimates and recommended budgets.
          </p>
          <DataTable
            caption="Revenues and expenditures by fiscal year"
            columns={[
              "Fiscal year",
              "Revenues",
              "Revenue basis",
              "Expenditures",
              "Expenditure basis",
            ]}
            rows={data.fiscalYearTotals.map((t) => [
              fiscalYearLabel(t.fiscalYear),
              t.revenue != null ? formatDollars(t.revenue) : "—",
              BASIS_LABELS[t.revenueBasis ?? ""] ?? "—",
              t.expenditure != null ? formatDollars(t.expenditure) : "—",
              BASIS_LABELS[t.expenditureBasis ?? ""] ?? "—",
            ])}
          />
        </section>

        <div className="mt-16 grid gap-14 lg:grid-cols-2 lg:gap-10">
          <section aria-label="Revenues by category">
            <div
              className="border-t pb-1 pt-3"
              style={{ borderColor: INK }}
            >
              <h2
                className="font-mono text-xs uppercase tracking-widest"
                style={{ color: SPRUCE }}
              >
                Where the money comes from
              </h2>
              <div className="mt-2">
                <ChartLegend entries={stackLegend(data.revenueCategories)} />
              </div>
            </div>
            <CategoryStackChart
              series={data.revenueCategories}
              ariaLabel="Stacked bar chart of state revenues by category and fiscal year"
            />
            <DataTable
              caption="State revenues by category and fiscal year"
              columns={revenueTable.columns}
              rows={revenueTable.rows}
            />
          </section>

          <section aria-label="Expenditures by category">
            <div
              className="border-t pb-1 pt-3"
              style={{ borderColor: INK }}
            >
              <h2
                className="font-mono text-xs uppercase tracking-widest"
                style={{ color: SPRUCE }}
              >
                Where the money goes
              </h2>
              <div className="mt-2">
                <ChartLegend entries={stackLegend(data.expenditureCategories)} />
              </div>
            </div>
            <CategoryStackChart
              series={data.expenditureCategories}
              ariaLabel="Stacked bar chart of state expenditures by category and fiscal year"
            />
            <DataTable
              caption="State expenditures by category and fiscal year"
              columns={expenditureTable.columns}
              rows={expenditureTable.rows}
            />
          </section>
        </div>

        <p className="mt-4 text-xs leading-relaxed" style={{ color: MUTED }}>
          Categories follow this project&apos;s crosswalk of the state&apos;s own
          classifications. {fiscalYearLabel(data.lastReportedYear + 1)} and later
          are budgeted, not actual, figures.
        </p>

        <section aria-label="County ledgers" className="mt-16">
          <div
            className="border-t pb-1 pt-3"
            style={{ borderColor: INK }}
          >
            <h2
              className="font-mono text-xs uppercase tracking-widest"
              style={{ color: SPRUCE }}
            >
              The county ledgers
            </h2>
          </div>
          <div className="mt-4">
            <CountyChoropleth
              features={countyFeatures}
              metrics={countyMetrics}
              consolidated={consolidatedByCountyFips()}
            />
          </div>
          <DataTable
            caption={`County finances, ${fiscalYearLabel(Number(latestCountyYear))}`}
            columns={["County", "Revenues", "Expenditures", "Rev / resident", "Population"]}
            rows={countyTableRows}
          />
        </section>

        <section aria-label="Data vintage" className="mt-16">
          <div
            className="border-t pb-2 pt-3 font-mono text-xs uppercase tracking-widest"
            style={{ borderColor: INK, color: SPRUCE }}
          >
            Data vintage
          </div>
          <ul>
            {data.sourceNotes.map((note) => (
              <li
                key={note.id}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t py-3"
                style={{ borderColor: RULE }}
              >
                <div>
                  <p className="text-sm">{note.name}</p>
                  <p className="mt-1 font-mono text-xs" style={{ color: MUTED }}>
                    {note.coverage}
                  </p>
                </div>
                <span
                  className="shrink-0 font-mono text-xs"
                  style={{ color: GOLD }}
                >
                  {note.vintage}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t" style={{ borderColor: INK }} />
          <p className="mt-3 text-xs leading-relaxed" style={{ color: MUTED }}>
            {data.reconciliationNote} Every refresh of the underlying data is a
            commit in the public repository, so any figure can be traced to the
            document it came from.
          </p>
        </section>

        <footer
          className="mt-12 font-mono text-xs leading-relaxed"
          style={{ color: MUTED }}
        >
          Sources: Open Georgia · Governor&apos;s Office of Planning and Budget ·
          Georgia DCA · UGA Tax &amp; Expenditure Data Center. Open source under
          the MIT license.
        </footer>
      </div>
    </main>
  );
}
