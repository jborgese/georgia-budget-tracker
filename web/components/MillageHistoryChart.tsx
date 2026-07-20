"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MUTED, PAPER, RULE } from "@/lib/theme";
import { ChartTooltipFrame, type TooltipRow } from "./ChartTooltip";

export interface MillageHistoryLine {
  key: string;
  label: string;
  color: string;
}

export type MillageHistoryRow = { taxYear: number } & Record<
  string,
  number | null
>;

function formatMills(value: number): string {
  return value.toFixed(3);
}

function HistoryTooltip({
  active,
  payload,
  label,
  lines,
}: {
  active?: boolean;
  payload?: { payload: MillageHistoryRow }[];
  label?: number;
  lines: MillageHistoryLine[];
}) {
  if (!active || !payload?.length || label == null) return null;
  const row = payload[0].payload;
  const rows: TooltipRow[] = lines.flatMap((line) => {
    const value = row[line.key];
    return value != null
      ? [{ label: line.label, value, color: line.color }]
      : [];
  });
  if (!rows.length) {
    return (
      <ChartTooltipFrame title={String(label)} subtitle="no rates" rows={[]} />
    );
  }
  return (
    <ChartTooltipFrame
      title={String(label)}
      subtitle="mills"
      rows={rows}
      format={formatMills}
    />
  );
}

export function MillageHistoryChart({
  rows,
  lines,
  countyName,
}: {
  rows: MillageHistoryRow[];
  lines: MillageHistoryLine[];
  countyName: string;
}) {
  return (
    <div
      role="img"
      aria-label={`Line chart of ${countyName} County property tax rates in mills by tax year, one line per taxing district; years the district reported no rate are gaps`}
    >
      <ResponsiveContainer
        width="100%"
        height={280}
        initialDimension={{ width: 640, height: 280 }}
      >
        <LineChart
          data={rows}
          margin={{ top: 12, right: 16, bottom: 4, left: 8 }}
        >
          <CartesianGrid stroke={RULE} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="taxYear"
            tick={{
              fill: MUTED,
              fontSize: 11,
              fontFamily: "var(--font-geist-mono)",
            }}
            axisLine={{ stroke: RULE }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value: number) => String(value)}
            tick={{
              fill: MUTED,
              fontSize: 11,
              fontFamily: "var(--font-geist-mono)",
            }}
            axisLine={false}
            tickLine={false}
            width={40}
            domain={[0, "auto"]}
          />
          <Tooltip
            content={<HistoryTooltip lines={lines} />}
            cursor={{ stroke: RULE, strokeWidth: 1 }}
          />
          {lines.map((line) => (
            <Line
              key={line.key}
              dataKey={line.key}
              name={line.label}
              stroke={line.color}
              strokeWidth={2}
              dot={{ r: 2.5, stroke: PAPER, strokeWidth: 1 }}
              activeDot={{ r: 4.5, stroke: PAPER, strokeWidth: 2 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
