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
      format={formatCompactDollars}
    />
  );
}

const LABEL_OFFSET = 18;
const LABEL_GAP = 16;

interface LabelPlacement {
  x: number;
  y: number;
  anchor: "start" | "end";
  leader: string;
}

function spreadWithinSide(
  labels: { index: number; y: number }[],
): Map<number, number> {
  const spread = [...labels]
    .sort((a, b) => a.y - b.y)
    .reduce<{ index: number; y: number }[]>((placed, label) => {
      const floor = placed.length
        ? placed[placed.length - 1].y + LABEL_GAP
        : label.y;
      return [...placed, { index: label.index, y: Math.max(label.y, floor) }];
    }, []);
  return new Map(spread.map(({ index, y }) => [index, y]));
}

function labelPlacements(
  amounts: number[],
  cx: number,
  cy: number,
  outerRadius: number,
): LabelPlacement[] {
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const labelRadius = outerRadius + LABEL_OFFSET;
  let swept = 0;
  const ideal = amounts.map((amount, index) => {
    const share = total > 0 ? amount / total : 0;
    const radians = ((360 * (swept + share / 2) - 90) * Math.PI) / 180;
    swept += share;
    return {
      index,
      rightSide: Math.cos(radians) >= 0,
      y: cy + labelRadius * Math.sin(radians),
      arcX: cx + (outerRadius + 2) * Math.cos(radians),
      arcY: cy + (outerRadius + 2) * Math.sin(radians),
    };
  });
  const adjusted = new Map([
    ...spreadWithinSide(ideal.filter((label) => label.rightSide)),
    ...spreadWithinSide(ideal.filter((label) => !label.rightSide)),
  ]);
  return ideal.map((label) => {
    const y = adjusted.get(label.index) ?? label.y;
    const dy = y - cy;
    const dx = Math.max(
      Math.sqrt(Math.max(labelRadius ** 2 - dy ** 2, 0)),
      12,
    );
    const x = label.rightSide ? cx + dx : cx - dx;
    const hook = label.rightSide ? x - 4 : x + 4;
    return {
      x,
      y,
      anchor: label.rightSide ? "start" : "end",
      leader: `${label.arcX},${label.arcY} ${hook},${y}`,
    };
  });
}

function sliceLabel(amounts: number[]) {
  return function renderSliceLabel(props: {
    cx?: number | string;
    cy?: number | string;
    outerRadius?: number;
    percent?: number;
    name?: string | number;
    index?: number;
  }): React.ReactElement {
    const { cx, cy, outerRadius, percent, name, index } = props;
    if (cx == null || cy == null || outerRadius == null || percent == null ||
        name == null || index == null) {
      return <g />;
    }
    const placement = labelPlacements(
      amounts,
      Number(cx),
      Number(cy),
      outerRadius,
    )[index];
    const rounded = Math.round(percent * 100);
    return (
      <g>
        <polyline
          points={placement.leader}
          stroke={MUTED}
          strokeWidth={1}
          fill="none"
        />
        <text x={placement.x} y={placement.y} textAnchor={placement.anchor}
              dominantBaseline="central" fontSize={12} fill={INK}>
          {name}{" "}
          <tspan fill={MUTED}>{rounded === 0 ? "<1%" : `${rounded}%`}</tspan>
        </text>
      </g>
    );
  };
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
            label={sliceLabel(slices.map((slice) => slice.amount))}
            labelLine={false}
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
