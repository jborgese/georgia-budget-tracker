"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { SpendingSlice } from "@/lib/spending";
import { INK, MUTED, NEUTRAL_SERIES, PAPER, SLOTS, SPRUCE } from "@/lib/theme";
import { formatCompactDollars } from "@/lib/format";
import { ChartTooltipFrame } from "./ChartTooltip";

function sliceColor(slice: SpendingSlice, index: number): string {
  return slice.key === "__other" ? NEUTRAL_SERIES : SLOTS[index % SLOTS.length];
}

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: SpendingSlice & { fill?: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload;
  return (
    <ChartTooltipFrame
      title={slice.label}
      subtitle={`${(slice.share * 100).toFixed(1)}% of spending`}
      rows={[{ label: "", value: slice.amount, color: slice.fill ?? INK }]}
    />
  );
}

function sliceLabel(props: {
  cx?: number | string;
  cy?: number | string;
  midAngle?: number;
  outerRadius?: number;
  percent?: number;
  name?: string | number;
}): React.ReactElement {
  const { cx, cy, midAngle, outerRadius, percent, name } = props;
  if (cx == null || cy == null || midAngle == null || outerRadius == null ||
      percent == null || name == null) {
    return <g />;
  }
  const radians = (-midAngle * Math.PI) / 180;
  const radius = outerRadius + 18;
  const x = Number(cx) + radius * Math.cos(radians);
  const y = Number(cy) + radius * Math.sin(radians);
  const anchor = x > Number(cx) + 4 ? "start" : x < Number(cx) - 4 ? "end" : "middle";
  return (
    <text x={x} y={y} textAnchor={anchor} dominantBaseline="central"
          fontSize={12} fill={INK}>
      {name} <tspan fill={MUTED}>{Math.round(percent * 100)}%</tspan>
    </text>
  );
}

export function SpendingPie({
  slices,
  total,
  centerLabel,
  ariaLabel,
}: {
  slices: SpendingSlice[];
  total: number;
  centerLabel: string;
  ariaLabel: string;
}) {
  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer
        width="100%"
        height={340}
        initialDimension={{ width: 640, height: 340 }}
      >
        <PieChart margin={{ top: 8, right: 96, bottom: 8, left: 96 }}>
          <Tooltip content={<PieTooltip />} />
          <Pie
            data={slices}
            dataKey="amount"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={108}
            stroke={PAPER}
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
            label={sliceLabel}
            labelLine={{ stroke: MUTED, strokeWidth: 1 }}
          >
            {slices.map((slice, index) => (
              <Cell key={slice.key} fill={sliceColor(slice, index)} />
            ))}
          </Pie>
          <text
            x="50%"
            y="47%"
            textAnchor="middle"
            className="font-mono"
            fontSize={22}
            fontWeight={600}
            fill={SPRUCE}
          >
            {formatCompactDollars(total)}
          </text>
          <text x="50%" y="55%" textAnchor="middle" fontSize={11} fill={MUTED}>
            {centerLabel}
          </text>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
