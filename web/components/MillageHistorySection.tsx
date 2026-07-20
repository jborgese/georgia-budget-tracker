import { INK, MUTED, SPRUCE, SLOTS } from "@/lib/theme";
import type { MillageCountyEntry, MillageHistoryCountyEntry } from "@/lib/types";
import { digestGapExplanation } from "@/lib/dataGaps";
import { ChartLegend } from "./ChartLegend";
import { DataTable } from "./DataTable";
import { WarningTip } from "./WarningTip";
import {
  MillageHistoryChart,
  type MillageHistoryLine,
  type MillageHistoryRow,
} from "./MillageHistoryChart";

const MAX_LINES = SLOTS.length;

function totalRate(
  pair: [number | null, number | null] | undefined,
): number | null {
  if (!pair) return null;
  const [mo, bond] = pair;
  if (mo == null && bond == null) return null;
  return Math.round(((mo ?? 0) + (bond ?? 0)) * 1000) / 1000;
}

function latestLevies(
  millage: MillageCountyEntry | null,
  millageTaxYears: number[],
): Map<string, number> {
  const levies = new Map<string, number>();
  if (!millage) return levies;
  const latestYear = String(millageTaxYears.at(-1));
  for (const district of millage.districts) {
    const year = district.years[latestYear];
    if (!year) continue;
    levies.set(
      `${district.code}|${district.district}`,
      (year.tax_mo ?? 0) + (year.tax_bond ?? 0),
    );
  }
  return levies;
}

export function MillageHistorySection({
  history,
  millage,
  historyTaxYears,
  millageTaxYears,
  missingYears,
  countyName,
}: {
  history: MillageHistoryCountyEntry | null;
  millage: MillageCountyEntry | null;
  historyTaxYears: number[];
  millageTaxYears: number[];
  missingYears: number[];
  countyName: string;
}) {
  if (!history || !historyTaxYears.length) return null;
  const levies = latestLevies(millage, millageTaxYears);
  const charted = history.districts
    .filter((district) =>
      Object.values(district.rates).some((pair) => totalRate(pair) != null),
    )
    .map((district) => ({
      district,
      levy: levies.get(`${district.code}|${district.district}`) ?? 0,
    }))
    .sort((a, b) => b.levy - a.levy || a.district.code - b.district.code)
    .slice(0, MAX_LINES);
  if (!charted.length) return null;

  const lines: MillageHistoryLine[] = charted.map(({ district }, index) => ({
    key: `d${district.code}-${index}`,
    label: district.district,
    color: SLOTS[index],
  }));
  const rows: MillageHistoryRow[] = historyTaxYears.map((taxYear) => {
    const row: MillageHistoryRow = { taxYear };
    charted.forEach(({ district }, index) => {
      row[lines[index].key] = totalRate(district.rates[String(taxYear)]);
    });
    return row;
  });

  const firstYear = historyTaxYears[0];
  const lastYear = historyTaxYears.at(-1);
  return (
    <section
      aria-label={`Property tax rates over time, ${firstYear}–${lastYear}`}
      className="mt-14"
    >
      <div
        className="flex flex-wrap items-baseline justify-between gap-2 border-t pb-1 pt-3"
        style={{ borderColor: INK }}
      >
        <h2
          className="font-mono text-xs uppercase tracking-widest"
          style={{ color: SPRUCE }}
        >
          Property tax rates over time
          {missingYears.length ? (
            <WarningTip
              text={digestGapExplanation(countyName, missingYears)}
              subject={`${countyName} County digest gaps`}
            />
          ) : null}
        </h2>
        <ChartLegend
          entries={lines.map((line) => ({
            label: line.label,
            color: line.color,
            kind: "line" as const,
          }))}
        />
      </div>
      <p className="mt-3 max-w-prose text-sm leading-relaxed">
        Combined rate — maintenance &amp; operations plus any bond levy, in
        mills — charged on {countyName} County property since {firstYear}, for
        the districts levying the most in the latest digest.
      </p>
      <div className="mt-4">
        <MillageHistoryChart
          rows={rows}
          lines={lines}
          countyName={countyName}
        />
      </div>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: MUTED }}>
        {missingYears.length ? (
          <>
            No digest rows for {countyName} County in{" "}
            {missingYears.join(", ")} — shown as gaps, not zeros.{" "}
          </>
        ) : null}
        A break in a line means the district reported no rate to the state
        compilation that year, never a rate of zero. The statewide quarter-mill
        state levy was phased out after 2015. From the DOR consolidated tax
        digests, {firstYear}–{lastYear}.
      </p>
      <DataTable
        caption={`${countyName} County combined property tax rate in mills by tax year for ${lines
          .map((line) => line.label)
          .join(", ")}`}
        columns={["Tax year", ...lines.map((line) => line.label)]}
        rows={rows.map((row) => [
          String(row.taxYear),
          ...lines.map((line) => {
            const value = row[line.key];
            return value != null ? value.toFixed(3) : "—";
          }),
        ])}
      />
    </section>
  );
}
