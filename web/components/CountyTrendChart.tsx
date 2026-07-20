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
import {
  fiscalYearLabel,
  formatCompactDollars,
} from "@/lib/format";
import { ChartTooltipFrame, type TooltipRow } from "./ChartTooltip";

export interface TrendRow {
  fiscalYear: number;
  revenue: number | null;
  expenditure: number | null;
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: TrendRow }[];
  label?: number;
}) {
  if (!active || !payload?.length || label == null) return null;
  const row = payload[0].payload;
  if (row.revenue == null && row.expenditure == null) {
    return (
      <ChartTooltipFrame title={fiscalYearLabel(label)} subtitle="no filing" rows={[]} />
    );
  }
  const rows: TooltipRow[] = [];
  if (row.revenue != null) {
    rows.push({ label: "revenues", value: row.revenue, color: SERIES.green });
  }
  if (row.expenditure != null) {
    rows.push({ label: "expenditures", value: row.expenditure, color: SERIES.gold });
  }
  return (
    <ChartTooltipFrame
      title={fiscalYearLabel(label)}
      rows={rows}
      format={formatCompactDollars}
    />
  );
}

export function CountyTrendChart({
  rows,
  entityLabel,
}: {
  rows: TrendRow[];
  entityLabel: string;
}) {
  const shared = {
    strokeWidth: 2,
    dot: { r: 4, stroke: PAPER, strokeWidth: 2 },
    activeDot: { r: 5, stroke: PAPER, strokeWidth: 2 },
    isAnimationActive: false,
    connectNulls: false,
  } as const;

  return (
    <div
      role="img"
      aria-label={`Line chart of ${entityLabel} revenues and expenditures by fiscal year; unfiled years are gaps`}
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
            tickFormatter={formatCompactDollars}
            tick={{ fill: MUTED, fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
            axisLine={false}
            tickLine={false}
            width={64}
            domain={[0, "auto"]}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: RULE, strokeWidth: 1 }} />
          <Line {...shared} dataKey="revenue" stroke={SERIES.green} name="Revenues" />
          <Line {...shared} dataKey="expenditure" stroke={SERIES.gold} name="Expenditures" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
