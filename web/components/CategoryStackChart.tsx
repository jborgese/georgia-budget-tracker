"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CategorySeries } from "@/lib/types";
import { MUTED, PAPER, RULE, segmentColors } from "@/lib/theme";
import { BASIS_LABELS, fiscalYearLabel, formatAxisTick } from "@/lib/format";
import { ChartTooltipFrame, type TooltipRow } from "./ChartTooltip";

interface StackRow {
  fiscalYear: number;
  [segment: string]: number;
}

function toRows(series: CategorySeries): StackRow[] {
  return series.fiscalYears.map((year) => {
    const row: StackRow = { fiscalYear: year };
    for (const segment of series.segments) {
      row[segment.key] = segment.amountsByYear[String(year)] ?? 0;
    }
    return row;
  });
}

function StackTooltip({
  active,
  payload,
  label,
  series,
  colors,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number }[];
  label?: number;
  series: CategorySeries;
  colors: Record<string, string>;
}) {
  if (!active || !payload?.length || label == null) return null;
  const labels = Object.fromEntries(series.segments.map((s) => [s.key, s.label]));
  const rows: TooltipRow[] = [...payload]
    .reverse()
    .filter((entry) => typeof entry.value === "number")
    .map((entry) => ({
      label: labels[String(entry.dataKey)] ?? String(entry.dataKey),
      value: entry.value as number,
      color: colors[String(entry.dataKey)],
    }));
  const basis = BASIS_LABELS[series.basisByYear[String(label)] ?? ""] ?? undefined;
  return <ChartTooltipFrame title={fiscalYearLabel(label)} subtitle={basis} rows={rows} />;
}

export function CategoryStackChart({
  series,
  ariaLabel,
}: {
  series: CategorySeries;
  ariaLabel: string;
}) {
  const data = toRows(series);
  const colors = segmentColors(series.segments);
  const lastKey = series.segments.at(-1)?.key;

  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer
        width="100%"
        height={300}
        initialDimension={{ width: 480, height: 300 }}
      >
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={RULE} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="fiscalYear"
            tickFormatter={fiscalYearLabel}
            tick={{ fill: MUTED, fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
            axisLine={{ stroke: RULE }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatAxisTick}
            tick={{ fill: MUTED, fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
            axisLine={false}
            tickLine={false}
            width={48}
            domain={[0, 45e9]}
            ticks={[0, 15e9, 30e9, 45e9]}
          />
          <Tooltip
            content={<StackTooltip series={series} colors={colors} />}
            cursor={{ fill: RULE, fillOpacity: 0.3 }}
          />
          {series.segments.map((segment) => (
            <Bar
              key={segment.key}
              dataKey={segment.key}
              stackId="fy"
              fill={colors[segment.key]}
              stroke={PAPER}
              strokeWidth={1}
              barSize={22}
              radius={segment.key === lastKey ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
