"use client";

import { useId } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { SpendingSlice } from "@/lib/spending";
import { LEVEL_ORDER, LEVEL_SHORT_LABELS, type LevelKey } from "@/lib/receipt";
import { INK, MUTED, NEUTRAL_SERIES, PAPER, SLOTS, SPRUCE } from "@/lib/theme";
import { formatCompactDollars } from "@/lib/format";
import { ChartTooltipFrame } from "./ChartTooltip";

const STRIPE_ANGLES: Partial<Record<LevelKey, number>> = {
  county: 45,
  city: 135,
  shared: 90,
  transit: 0,
};

function sliceColor(slice: SpendingSlice, index: number): string {
  return slice.key === "__other" ? NEUTRAL_SERIES : SLOTS[index % SLOTS.length];
}

interface Segment {
  categoryIndex: number;
  firstOfCategory: boolean;
  categoryLabel: string;
  categoryShare: number;
  level: LevelKey;
  amount: number;
  share: number;
  color: string;
}

function toSegments(slices: SpendingSlice[]): Segment[] {
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);
  return slices.flatMap((slice, index) =>
    (slice.levels ?? []).map((level, levelIndex) => ({
      categoryIndex: index,
      firstOfCategory: levelIndex === 0,
      categoryLabel: slice.label,
      categoryShare: slice.share,
      level: level.key,
      amount: level.amount,
      share: total > 0 ? level.amount / total : 0,
      color: sliceColor(slice, index),
    })),
  );
}

function LevelPattern({
  id,
  color,
  level,
}: {
  id: string;
  color: string;
  level: LevelKey;
}) {
  if (level === "schools") {
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" width="7" height="7">
        <rect width="7" height="7" fill={color} />
        <circle cx="3.5" cy="3.5" r="1.3" fill={PAPER} />
      </pattern>
    );
  }
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width="7"
      height="7"
      patternTransform={`rotate(${STRIPE_ANGLES[level] ?? 45})`}
    >
      <rect width="7" height="7" fill={color} />
      <line x1="0" y1="0" x2="0" y2="7" stroke={PAPER} strokeWidth="2" />
    </pattern>
  );
}

function segmentFill(uid: string, segment: Segment): string {
  return segment.level === "state"
    ? segment.color
    : `url(#${uid}-${segment.categoryIndex}-${segment.level})`;
}

function PieTooltip({
  active,
  payload,
  levelLabels,
}: {
  active?: boolean;
  payload?: { payload: (SpendingSlice | Segment) & { fill?: string } }[];
  levelLabels: Record<LevelKey, string>;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  if ("categoryLabel" in datum) {
    return (
      <ChartTooltipFrame
        title={datum.categoryLabel}
        subtitle={`${levelLabels[datum.level]} · ${(datum.share * 100).toFixed(1)}% of spending`}
        rows={[{ label: "", value: datum.amount, color: datum.color }]}
        format={formatCompactDollars}
      />
    );
  }
  return (
    <ChartTooltipFrame
      title={datum.label}
      subtitle={`${(datum.share * 100).toFixed(1)}% of spending`}
      rows={[{ label: "", value: datum.amount, color: datum.fill ?? INK }]}
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

function categoryLabelText(
  placement: LabelPlacement,
  label: string,
  share: number,
): React.ReactElement {
  const rounded = Math.round(share * 100);
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
        {label}{" "}
        <tspan fill={MUTED}>{rounded === 0 ? "<1%" : `${rounded}%`}</tspan>
      </text>
    </g>
  );
}

interface LabelProps {
  cx?: number | string;
  cy?: number | string;
  innerRadius?: number;
  outerRadius?: number;
  midAngle?: number;
  percent?: number;
  name?: string | number;
  index?: number;
}

const SMALL_SEGMENT_SHARE = 0.04;

// A sliver narrower than one pattern tile can catch zero PAPER marks and
// read as solid — which the legend reserves for the state level — so small
// non-state segments get one explicit mark at their mid-arc.
function smallSegmentMark(
  cx: number,
  cy: number,
  radius: number,
  midAngle: number,
  level: LevelKey,
): React.ReactElement {
  const radians = (-midAngle * Math.PI) / 180;
  const x = cx + radius * Math.cos(radians);
  const y = cy + radius * Math.sin(radians);
  if (level === "schools") {
    return <circle cx={x} cy={y} r={1.3} fill={PAPER} />;
  }
  return (
    <line
      x1={x}
      y1={y - 2.2}
      x2={x}
      y2={y + 2.2}
      stroke={PAPER}
      strokeWidth={1.8}
      transform={`rotate(${STRIPE_ANGLES[level] ?? 45}, ${x}, ${y})`}
    />
  );
}

function sliceLabel(amounts: number[]) {
  return function renderSliceLabel(props: LabelProps): React.ReactElement {
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
    return categoryLabelText(placement, String(name), percent);
  };
}

function segmentLabel(segments: Segment[], categoryAmounts: number[]) {
  return function renderSegmentLabel(props: LabelProps): React.ReactElement {
    const { cx, cy, innerRadius, outerRadius, midAngle, index } = props;
    if (cx == null || cy == null || outerRadius == null || index == null) {
      return <g />;
    }
    const segment = segments[index];
    if (!segment) return <g />;
    const mark =
      segment.level !== "state" &&
      segment.share < SMALL_SEGMENT_SHARE &&
      midAngle != null &&
      innerRadius != null
        ? smallSegmentMark(
            Number(cx),
            Number(cy),
            (Number(innerRadius) + outerRadius) / 2,
            midAngle,
            segment.level,
          )
        : null;
    const label = segment.firstOfCategory
      ? categoryLabelText(
          labelPlacements(
            categoryAmounts,
            Number(cx),
            Number(cy),
            outerRadius,
          )[segment.categoryIndex],
          segment.categoryLabel,
          segment.categoryShare,
        )
      : null;
    return (
      <g>
        {mark}
        {label}
      </g>
    );
  };
}

function PatternLegend({
  uid,
  levels,
  levelLabels,
}: {
  uid: string;
  levels: LevelKey[];
  levelLabels: Record<LevelKey, string>;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs"
      style={{ color: MUTED }}
    >
      {levels.map((level) => (
        <span key={level} className="inline-flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            {level === "state" ? null : (
              <LevelPattern
                id={`${uid}-legend-${level}`}
                color={NEUTRAL_SERIES}
                level={level}
              />
            )}
            <rect
              width="14"
              height="14"
              fill={
                level === "state"
                  ? NEUTRAL_SERIES
                  : `url(#${uid}-legend-${level})`
              }
            />
          </svg>
          {levelLabels[level]}
        </span>
      ))}
    </div>
  );
}

export function SpendingPie({
  slices,
  total,
  centerLabel,
  ariaLabel,
  levelLabels: levelLabelOverrides,
}: {
  slices: SpendingSlice[];
  total: number;
  centerLabel: string;
  ariaLabel: string;
  levelLabels?: Partial<Record<LevelKey, string>>;
}) {
  const uid = useId().replace(/:/g, "");
  const levelLabels = { ...LEVEL_SHORT_LABELS, ...levelLabelOverrides };
  const segments = slices.some((slice) => slice.levels?.length)
    ? toSegments(slices)
    : null;
  const presentLevels = segments
    ? LEVEL_ORDER.filter((level) =>
        segments.some((segment) => segment.level === level),
      )
    : [];

  return (
    <div>
      <div role="img" aria-label={ariaLabel}>
        <ResponsiveContainer
          width="100%"
          height={340}
          initialDimension={{ width: 640, height: 340 }}
          >
          <PieChart margin={{ top: 8, right: 96, bottom: 8, left: 96 }}>
            {segments ? (
              <defs>
                {segments
                  .filter((segment) => segment.level !== "state")
                  .map((segment) => (
                    <LevelPattern
                      key={`${segment.categoryIndex}-${segment.level}`}
                      id={`${uid}-${segment.categoryIndex}-${segment.level}`}
                      color={segment.color}
                      level={segment.level}
                    />
                  ))}
              </defs>
            ) : null}
            <Tooltip content={<PieTooltip levelLabels={levelLabels} />} />
            {segments ? (
              <Pie
                data={segments}
                dataKey="amount"
                nameKey="categoryLabel"
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={108}
                minAngle={3}
                stroke={PAPER}
                strokeWidth={2}
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
                label={segmentLabel(segments, slices.map((slice) => slice.amount))}
                labelLine={false}
              >
                {segments.map((segment, index) => (
                  <Cell
                    key={`${segment.categoryIndex}-${segment.level}-${index}`}
                    fill={segmentFill(uid, segment)}
                    stroke={PAPER}
                    strokeWidth={segment.firstOfCategory ? 2 : 1}
                  />
                ))}
              </Pie>
            ) : (
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
            )}
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
      {presentLevels.length > 1 ? (
        <PatternLegend
          uid={uid}
          levels={presentLevels}
          levelLabels={levelLabels}
        />
      ) : null}
    </div>
  );
}
