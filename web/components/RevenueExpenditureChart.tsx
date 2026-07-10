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
import type { FiscalYearTotals } from "@/lib/types";
import { INK, MUTED, PAPER, RULE, SERIES } from "@/lib/theme";
import { BASIS_LABELS, fiscalYearLabel, formatAxisTick, formatBillions } from "@/lib/format";
import { ChartTooltipFrame, type TooltipRow } from "./ChartTooltip";

const REVENUE_COLOR = SERIES.green;
const EXPENDITURE_COLOR = SERIES.gold;

interface ChartRow {
  fiscalYear: number;
  revenueActual: number | null;
  revenueProjected: number | null;
  expenditureActual: number | null;
  expenditureProjected: number | null;
  revenueBasis: string | null;
  expenditureBasis: string | null;
  revenue: number | null;
  expenditure: number | null;
}

function toRows(totals: FiscalYearTotals[], lastReportedYear: number): ChartRow[] {
  return totals.map((t) => ({
    fiscalYear: t.fiscalYear,
    revenueActual: t.fiscalYear <= lastReportedYear ? t.revenue : null,
    revenueProjected: t.fiscalYear >= lastReportedYear ? t.revenue : null,
    expenditureActual: t.fiscalYear <= lastReportedYear ? t.expenditure : null,
    expenditureProjected: t.fiscalYear >= lastReportedYear ? t.expenditure : null,
    revenueBasis: t.revenueBasis,
    expenditureBasis: t.expenditureBasis,
    revenue: t.revenue,
    expenditure: t.expenditure,
  }));
}

function TotalsTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
  label?: number;
}) {
  if (!active || !payload?.length || label == null) return null;
  const row = payload[0].payload;
  const rows: TooltipRow[] = [];
  if (row.revenue != null) {
    rows.push({
      label: `revenues (${BASIS_LABELS[row.revenueBasis ?? ""] ?? "—"})`,
      value: row.revenue,
      color: REVENUE_COLOR,
      dashed: row.revenueBasis === "estimated",
    });
  }
  if (row.expenditure != null) {
    rows.push({
      label: `expenditures (${BASIS_LABELS[row.expenditureBasis ?? ""] ?? "—"})`,
      value: row.expenditure,
      color: EXPENDITURE_COLOR,
      dashed: row.expenditureBasis !== "actual",
    });
  }
  return <ChartTooltipFrame title={fiscalYearLabel(label)} rows={rows} />;
}

function endLabel(
  lastReportedYear: number,
  data: ChartRow[],
  dy: number,
): (props: {
  x?: number | string;
  y?: number | string;
  value?: unknown;
  index?: number;
}) => React.ReactElement {
  const labelIndex = data.findIndex((row) => row.fiscalYear === lastReportedYear);
  return function EndLabel({ x, y, value, index }) {
    if (index !== labelIndex || x == null || y == null || typeof value !== "number") {
      return <g />;
    }
    return (
      <text
        x={Number(x)}
        y={Number(y) + dy}
        textAnchor="middle"
        className="font-mono"
        fontSize={11}
        fill={INK}
      >
        {formatBillions(Number(value))}
      </text>
    );
  };
}

export function RevenueExpenditureChart({
  totals,
  lastReportedYear,
}: {
  totals: FiscalYearTotals[];
  lastReportedYear: number;
}) {
  const data = toRows(totals, lastReportedYear);
  const shared = {
    strokeWidth: 2,
    dot: { r: 4, stroke: PAPER, strokeWidth: 2 },
    activeDot: { r: 5, stroke: PAPER, strokeWidth: 2 },
    isAnimationActive: false,
  } as const;

  return (
    <div role="img" aria-label="Line chart of Georgia state revenues and expenditures by fiscal year">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 24, right: 16, bottom: 4, left: 8 }}>
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
          <Tooltip content={<TotalsTooltip />} cursor={{ stroke: RULE, strokeWidth: 1 }} />
          <Line
            {...shared}
            dataKey="revenueActual"
            stroke={REVENUE_COLOR}
            name="Revenues"
            label={endLabel(lastReportedYear, data, -12)}
          />
          <Line
            {...shared}
            dataKey="revenueProjected"
            stroke={REVENUE_COLOR}
            strokeDasharray="5 4"
            dot={false}
            legendType="none"
          />
          <Line
            {...shared}
            dataKey="expenditureActual"
            stroke={EXPENDITURE_COLOR}
            name="Expenditures"
            label={endLabel(lastReportedYear, data, 22)}
          />
          <Line
            {...shared}
            dataKey="expenditureProjected"
            stroke={EXPENDITURE_COLOR}
            strokeDasharray="5 4"
            dot={false}
            legendType="none"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
