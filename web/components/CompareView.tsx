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
import type {
  CompareDataset,
  CompareEntityRow,
  CompareFormat,
  CompareMetricSpec,
} from "@/lib/compare";
import { INK, MUTED, PAPER, RULE, SLOTS, SPRUCE } from "@/lib/theme";
import {
  fiscalYearLabel,
  formatCompactCount,
  formatCompactDollars,
  formatCount,
  formatDollars,
} from "@/lib/format";
import { ChartTooltipFrame, type TooltipRow } from "./ChartTooltip";
import { ChartLegend } from "./ChartLegend";
import { DataTable } from "./DataTable";

const MAX_SELECTIONS = 4;

const FORMATTERS: Record<
  CompareFormat,
  { axis: (value: number) => string; cell: (value: number) => string }
> = {
  dollars: { axis: formatDollars, cell: formatDollars },
  compact: { axis: formatCompactDollars, cell: formatDollars },
  count: { axis: formatCompactCount, cell: formatCount },
};

interface Series {
  slug: string;
  label: string;
  color: string;
  entity: CompareEntityRow;
}

function cellText(
  entity: CompareEntityRow,
  key: string,
  yearIndex: number,
  format: CompareFormat,
): string {
  const value = entity.values[key]?.[yearIndex];
  if (value != null) return FORMATTERS[format].cell(value);
  return entity.filed[yearIndex] ? "—" : "no filing";
}

function CompareTooltip({
  active,
  payload,
  label,
  series,
  spec,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number }[];
  label?: number;
  series: Series[];
  spec: CompareMetricSpec;
}) {
  if (!active || !payload?.length || label == null) return null;
  const bySlug = Object.fromEntries(series.map((s) => [s.slug, s]));
  const rows: TooltipRow[] = payload
    .filter((entry) => typeof entry.value === "number")
    .map((entry) => ({
      label: bySlug[String(entry.dataKey)]?.label ?? String(entry.dataKey),
      value: entry.value as number,
      color: bySlug[String(entry.dataKey)]?.color ?? INK,
    }));
  if (!rows.length) return null;
  return (
    <ChartTooltipFrame
      title={fiscalYearLabel(label)}
      subtitle={spec.perUnit}
      rows={rows}
      format={FORMATTERS[spec.format].cell}
    />
  );
}

function CompareLines({
  series,
  fiscalYears,
  spec,
  nounPlural,
}: {
  series: Series[];
  fiscalYears: number[];
  spec: CompareMetricSpec;
  nounPlural: string;
}) {
  const rows = fiscalYears.map((year, index) => {
    const row: Record<string, number | null> & { fiscalYear: number } = {
      fiscalYear: year,
    };
    for (const s of series) {
      row[s.slug] = s.entity.values[spec.key]?.[index] ?? null;
    }
    return row;
  });
  return (
    <div
      role="img"
      aria-label={`Line chart of ${spec.title.toLowerCase()} for the selected ${nounPlural}`}
    >
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
            tickFormatter={FORMATTERS[spec.format].axis}
            tick={{ fill: MUTED, fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
            axisLine={false}
            tickLine={false}
            width={64}
            domain={[0, "auto"]}
          />
          <Tooltip
            content={<CompareTooltip series={series} spec={spec} />}
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
              name={s.label}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompareView({ data }: { data: CompareDataset }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const bySlug = useMemo(
    () => new Map(data.entities.map((entity) => [entity.slug, entity])),
    [data],
  );

  const [slugs, setSlugs] = useState<(string | null)[]>(() => {
    const fromUrl = (searchParams.get("c") ?? "")
      .split(",")
      .filter((slug) => bySlug.has(slug))
      .slice(0, MAX_SELECTIONS);
    const initial = fromUrl.length >= 2 ? fromUrl : data.defaults;
    return [...initial, ...Array(MAX_SELECTIONS).fill(null)].slice(
      0,
      MAX_SELECTIONS,
    );
  });

  useEffect(() => {
    const selected = slugs.filter((slug): slug is string => slug != null);
    const query = selected.length ? `?c=${selected.join(",")}` : "";
    router.replace(`${pathname}${query}`, { scroll: false });
  }, [slugs, router, pathname]);

  const series: Series[] = slugs.flatMap((slug, index) => {
    if (!slug) return [];
    const entity = bySlug.get(slug);
    return entity
      ? [{ slug, label: entity.label, color: SLOTS[index], entity }]
      : [];
  });

  const legendEntries = series.map((s) => ({
    label: s.label,
    color: s.color,
    kind: "line" as const,
  }));

  const latestYear = data.fiscalYears.at(-1) ?? 0;
  const latestIndex = data.fiscalYears.length - 1;

  return (
    <div>
      <div
        className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t pt-4"
        style={{ borderColor: INK }}
      >
        {Array.from({ length: MAX_SELECTIONS }, (_, index) => (
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
              {data.slotLabel} {index + 1}
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
              {data.entities.map((entity) => (
                <option
                  key={entity.slug}
                  value={entity.slug}
                  disabled={
                    slugs.includes(entity.slug) && slugs[index] !== entity.slug
                  }
                >
                  {entity.label}
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
            {data.charts.map((spec) => (
              <section key={spec.key} aria-label={spec.title}>
                <h2
                  className="border-t pb-2 pt-3 font-mono text-xs uppercase tracking-widest"
                  style={{ borderColor: INK, color: SPRUCE }}
                >
                  {spec.title}
                </h2>
                <CompareLines
                  series={series}
                  fiscalYears={data.fiscalYears}
                  spec={spec}
                  nounPlural={data.nounPlural}
                />
                <DataTable
                  caption={`${spec.title} by fiscal year for the selected ${data.nounPlural}`}
                  columns={["Fiscal year", ...series.map((s) => s.label)]}
                  rows={data.fiscalYears.map((year, index) => [
                    fiscalYearLabel(year),
                    ...series.map((s) =>
                      cellText(s.entity, spec.key, index, spec.format),
                    ),
                  ])}
                />
              </section>
            ))}
          </div>

          <section
            aria-label={`Latest figures, ${fiscalYearLabel(latestYear)}`}
            className="mt-12"
          >
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
                      {data.slotLabel}
                    </th>
                    {data.latestColumns.map((column) => (
                      <th
                        key={column.key}
                        scope="col"
                        className="py-2 pr-4 text-right font-normal"
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {series.map((s) => (
                    <tr
                      key={s.slug}
                      className="border-t"
                      style={{ borderColor: RULE }}
                    >
                      <td className="py-2 pr-4">
                        <span
                          aria-hidden="true"
                          className="mr-2 inline-block h-2.5 w-2.5 rounded-[2px] align-middle"
                          style={{ backgroundColor: s.color }}
                        />
                        <a
                          href={`${data.route}/${s.slug}/`}
                          className="underline underline-offset-4"
                        >
                          {s.label}
                        </a>
                      </td>
                      {data.latestColumns.map((column) => (
                        <td
                          key={column.key}
                          className="py-2 pr-4 text-right font-mono tabular-nums"
                        >
                          {cellText(s.entity, column.key, latestIndex, column.format)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t" style={{ borderColor: INK }} />
            </div>
          </section>

          <p className="mt-4 text-xs" style={{ color: MUTED }}>
            {data.gapNote}
          </p>
        </>
      ) : (
        <p className="mt-8 text-sm" style={{ color: MUTED }}>
          Pick at least two {data.nounPlural} to compare.
        </p>
      )}
    </div>
  );
}
