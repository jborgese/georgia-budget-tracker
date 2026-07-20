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
import { MUTED, PAPER, RULE, SERIES } from "@/lib/theme";
import { fiscalYearLabel, formatDollars } from "@/lib/format";
import { ChartTooltipFrame, type TooltipRow } from "./ChartTooltip";

export interface MedianRow {
  fiscalYear: number;
  county: number | null;
  median: number | null;
}

function MedianTooltip({
  active,
  payload,
  label,
  countyName,
}: {
  active?: boolean;
  payload?: { payload: MedianRow }[];
  label?: number;
  countyName: string;
}) {
  if (!active || !payload?.length || label == null) return null;
  const row = payload[0].payload;
  const rows: TooltipRow[] = [];
  if (row.county != null) {
    rows.push({
      label: `${countyName} County`,
      value: row.county,
      color: SERIES.green,
    });
  }
  if (row.median != null) {
    rows.push({ label: "state median", value: row.median, color: MUTED, dashed: true });
  }
  return (
    <ChartTooltipFrame
      title={fiscalYearLabel(label)}
      subtitle={row.county == null ? "no filing" : undefined}
      rows={rows}
      format={formatDollars}
    />
  );
}

export function CountyMedianChart({
  rows,
  countyName,
}: {
  rows: MedianRow[];
  countyName: string;
}) {
  return (
    <div
      role="img"
      aria-label={`Line chart comparing ${countyName} County revenues per resident with the median Georgia county`}
    >
      <ResponsiveContainer
        width="100%"
        height={260}
        initialDimension={{ width: 640, height: 260 }}
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
            tickFormatter={(value: number) => formatDollars(value)}
            tick={{ fill: MUTED, fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
            axisLine={false}
            tickLine={false}
            width={64}
            domain={[0, "auto"]}
          />
          <Tooltip
            content={<MedianTooltip countyName={countyName} />}
            cursor={{ stroke: RULE, strokeWidth: 1 }}
          />
          <Line
            dataKey="county"
            stroke={SERIES.green}
            strokeWidth={2}
            dot={{ r: 4, stroke: PAPER, strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: PAPER, strokeWidth: 2 }}
            isAnimationActive={false}
            connectNulls={false}
            name={`${countyName} County`}
          />
          <Line
            dataKey="median"
            stroke={MUTED}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: 5, stroke: PAPER, strokeWidth: 2 }}
            isAnimationActive={false}
            name="State median"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
