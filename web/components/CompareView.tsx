"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CountyMetricsDocument, CountyYearMetrics } from "@/lib/types";
import { INK, MUTED, PAPER, RULE, SLOTS, SPRUCE } from "@/lib/theme";
import { fiscalYearLabel, formatCompactDollars, formatDollars } from "@/lib/format";
import { ChartTooltipFrame, type TooltipRow } from "./ChartTooltip";
import { ChartLegend } from "./ChartLegend";

const MAX_COUNTIES = 4;
const METRIC_CHARTS = [
  { key: "revenue_per_capita", title: "Revenue per resident", perCapita: true },
  { key: "expenditure_per_capita", title: "Expenditure per resident", perCapita: true },
] as const;

type IncludedEntry = Extract<
  CountyMetricsDocument["counties"][number],
  { included: true }
>;

interface Series {
  slug: string;
  name: string;
  color: string;
  entry: IncludedEntry;
}

function displayName(county: string): string {
  const exceptions: Record<string, string> = {
    DEKALB: "DeKalb",
    MCDUFFIE: "McDuffie",
    MCINTOSH: "McIntosh",
  };
  return (
    exceptions[county] ??
    county
      .toLowerCase()
      .split(" ")
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" ")
  );
}

function CompareTooltip({
  active,
  payload,
  label,
  series,
  perCapita,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number }[];
  label?: number;
  series: Series[];
  perCapita: boolean;
}) {
  if (!active || !payload?.length || label == null) return null;
  const bySlug = Object.fromEntries(series.map((s) => [s.slug, s]));
  const rows: TooltipRow[] = payload
    .filter((entry) => typeof entry.value === "number")
    .map((entry) => ({
      label: bySlug[String(entry.dataKey)]?.name ?? String(entry.dataKey),
      value: entry.value as number,
      color: bySlug[String(entry.dataKey)]?.color ?? INK,
    }));
  if (!rows.length) return null;
  return (
    <ChartTooltipFrame
      title={fiscalYearLabel(label)}
      subtitle={perCapita ? "per resident" : undefined}
      rows={rows}
    />
  );
}

function CompareLines({
  series,
  fiscalYears,
  metric,
  perCapita,
  title,
}: {
  series: Series[];
  fiscalYears: number[];
  metric: keyof CountyYearMetrics;
  perCapita: boolean;
  title: string;
}) {
  const rows = fiscalYears.map((year) => {
    const row: Record<string, number | null> & { fiscalYear: number } = {
      fiscalYear: year,
    };
    for (const s of series) {
      row[s.slug] = s.entry.years[String(year)]?.[metric] ?? null;
    }
    return row;
  });
  return (
    <div role="img" aria-label={`Line chart of ${title.toLowerCase()} for the selected counties`}>
      <ResponsiveContainer
        width="100%"
        height={280}
        initialDimension={{ width: 640, height: 280 }}
      >
        <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={RULE} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="fiscalYear"
            tickFormatter={fiscalYearLabel}
            tick={{ fill: MUTED, fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
            axisLine={{ stroke: RULE }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value: number) =>
              perCapita ? formatDollars(value) : formatCompactDollars(value)
            }
            tick={{ fill: MUTED, fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
            axisLine={false}
            tickLine={false}
            width={64}
            domain={[0, "auto"]}
          />
          <Tooltip
            content={<CompareTooltip series={series} perCapita={perCapita} />}
            cursor={{ stroke: RULE, strokeWidth: 1 }}
          />
          {series.map((s) => (
            <Line
              key={s.slug}
              dataKey={s.slug}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 4, stroke: PAPER, strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: PAPER, strokeWidth: 2 }}
              isAnimationActive={false}
              connectNulls={false}
              name={s.name}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompareView({ metrics }: { metrics: CountyMetricsDocument }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const included = useMemo(
    () =>
      metrics.counties.filter((entry): entry is IncludedEntry => entry.included),
    [metrics],
  );
  const bySlug = useMemo(
    () => new Map(included.map((entry) => [entry.slug, entry])),
    [included],
  );

  const [slugs, setSlugs] = useState<(string | null)[]>(() => {
    const fromUrl = (searchParams.get("c") ?? "")
      .split(",")
      .filter((slug) => bySlug.has(slug))
      .slice(0, MAX_COUNTIES);
    const initial = fromUrl.length >= 2 ? fromUrl : ["fulton", "chatham"];
    return [...initial, ...Array(MAX_COUNTIES).fill(null)].slice(0, MAX_COUNTIES);
  });

  useEffect(() => {
    const selected = slugs.filter((slug): slug is string => slug != null);
    const query = selected.length ? `?c=${selected.join(",")}` : "";
    router.replace(`${pathname}${query}`, { scroll: false });
  }, [slugs, router, pathname]);

  const series: Series[] = slugs.flatMap((slug, index) => {
    if (!slug) return [];
    const entry = bySlug.get(slug);
    return entry
      ? [{ slug, name: displayName(entry.county), color: SLOTS[index], entry }]
      : [];
  });

  const legendEntries = series.map((s) => ({
    label: `${s.name} County`,
    color: s.color,
    kind: "line" as const,
  }));

  const latestYear = metrics.fiscal_years.at(-1) ?? 0;

  return (
    <div>
      <div
        className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t pt-4"
        style={{ borderColor: INK }}
      >
        {Array.from({ length: MAX_COUNTIES }, (_, index) => (
          <label
            key={index}
            className="flex flex-col gap-1 font-mono text-xs uppercase tracking-widest"
            style={{ color: MUTED }}
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-[2px]"
                style={{
                  backgroundColor: slugs[index] ? SLOTS[index] : RULE,
                }}
              />
              County {index + 1}
              {index >= 2 ? " (optional)" : ""}
            </span>
            <select
              value={slugs[index] ?? ""}
              onChange={(event) => {
                const value = event.target.value || null;
                setSlugs((current) =>
                  current.map((slug, i) => (i === index ? value : slug)),
                );
              }}
              className="border px-2 py-1 font-mono text-xs normal-case tracking-normal"
              style={{ borderColor: RULE, backgroundColor: PAPER, color: INK }}
            >
              {index >= 2 ? <option value="">—</option> : null}
              {included.map((entry) => (
                <option
                  key={entry.slug}
                  value={entry.slug}
                  disabled={slugs.includes(entry.slug) && slugs[index] !== entry.slug}
                >
                  {displayName(entry.county)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {series.length >= 2 ? (
        <>
          <div className="mt-6">
            <ChartLegend entries={legendEntries} />
          </div>
          <div className="mt-4 grid gap-12 lg:grid-cols-2 lg:gap-8">
            {METRIC_CHARTS.map((chart) => (
              <section key={chart.key} aria-label={chart.title}>
                <h2
                  className="border-t pb-2 pt-3 font-mono text-xs uppercase tracking-widest"
                  style={{ borderColor: INK, color: SPRUCE }}
                >
                  {chart.title}
                </h2>
                <CompareLines
                  series={series}
                  fiscalYears={metrics.fiscal_years}
                  metric={chart.key}
                  perCapita={chart.perCapita}
                  title={chart.title}
                />
              </section>
            ))}
          </div>

          <section aria-label={`Latest figures, ${fiscalYearLabel(latestYear)}`} className="mt-12">
            <div
              className="border-t pb-2 pt-3 font-mono text-xs uppercase tracking-widest"
              style={{ borderColor: INK, color: SPRUCE }}
            >
              {fiscalYearLabel(latestYear)} side by side
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ color: INK }}>
                <thead>
                  <tr
                    className="border-t font-mono text-xs uppercase tracking-widest"
                    style={{ borderColor: RULE, color: MUTED }}
                  >
                    <th scope="col" className="py-2 pr-4 text-left font-normal">
                      County
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
                    <th scope="col" className="py-2 text-right font-normal">
                      Population
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((s) => {
                    const m = s.entry.years[String(latestYear)];
                    return (
                      <tr key={s.slug} className="border-t" style={{ borderColor: RULE }}>
                        <td className="py-2 pr-4">
                          <span
                            aria-hidden="true"
                            className="mr-2 inline-block h-2.5 w-2.5 rounded-[2px] align-middle"
                            style={{ backgroundColor: s.color }}
                          />
                          <a
                            href={`/county/${s.slug}/`}
                            className="underline underline-offset-4"
                          >
                            {s.name} County
                          </a>
                        </td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums">
                          {m?.revenue != null ? formatDollars(m.revenue) : "no filing"}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums">
                          {m?.expenditure != null
                            ? formatDollars(m.expenditure)
                            : "no filing"}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums">
                          {m?.revenue_per_capita != null
                            ? formatDollars(m.revenue_per_capita)
                            : "—"}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums">
                          {m?.population != null
                            ? m.population.toLocaleString("en-US")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="border-t" style={{ borderColor: INK }} />
            </div>
          </section>

          <p className="mt-4 text-xs" style={{ color: MUTED }}>
            Gaps in a line are fiscal years the county did not file an RLGF
            report — never zeros.
          </p>
        </>
      ) : (
        <p className="mt-8 text-sm" style={{ color: MUTED }}>
          Pick at least two counties to compare.
        </p>
      )}
    </div>
  );
}
