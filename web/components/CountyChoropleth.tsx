"use client";

import { useId, useMemo, useState } from "react";
import { geoConicEqualArea, geoPath } from "d3-geo";
import type { CountyFeature } from "@/lib/geo";
import type { CountyMetricsDocument, CountyYearMetrics } from "@/lib/types";
import {
  INK,
  MUTED,
  NO_DATA_FILL,
  PAPER,
  RULE,
  SEQUENTIAL_RAMP,
  SPRUCE,
} from "@/lib/theme";
import {
  fiscalYearLabel,
  formatCompactDollars,
  formatDollars,
} from "@/lib/format";

const WIDTH = 520;
const HEIGHT = 540;

const METRICS = [
  { key: "revenue_per_capita", label: "Revenues per resident", perCapita: true },
  { key: "expenditure_per_capita", label: "Expenditures per resident", perCapita: true },
  { key: "revenue", label: "Total revenues", perCapita: false },
  { key: "expenditure", label: "Total expenditures", perCapita: false },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

interface HoverState {
  x: number;
  y: number;
  county: string;
  lines: string[];
}

function metricValue(
  years: Record<string, CountyYearMetrics | null>,
  year: number,
  metric: MetricKey,
): number | null {
  return years[String(year)]?.[metric] ?? null;
}

function quintileThresholds(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return [1, 2, 3, 4].map(
    (i) => sorted[Math.min(sorted.length - 1, Math.floor((i * sorted.length) / 5))],
  );
}

function binIndex(value: number, thresholds: number[]): number {
  const index = thresholds.findIndex((t) => value < t);
  return index === -1 ? thresholds.length : index;
}

function formatMetric(value: number, perCapita: boolean): string {
  return perCapita ? formatDollars(value) : formatCompactDollars(value);
}

function hoverLines(
  entry: CountyMetricsDocument["counties"][number],
  year: number,
): string[] {
  if (!entry.included) return [entry.note];
  const metrics = entry.years[String(year)];
  if (!metrics) return [`No RLGF filing for ${fiscalYearLabel(year)}`];
  return [
    metrics.revenue != null
      ? `Revenues ${formatCompactDollars(metrics.revenue)}`
      : "Revenues not reported",
    metrics.expenditure != null
      ? `Expenditures ${formatCompactDollars(metrics.expenditure)}`
      : "Expenditures not reported",
    metrics.revenue_per_capita != null
      ? `Per resident ${formatDollars(metrics.revenue_per_capita)} rev · ${
          metrics.expenditure_per_capita != null
            ? formatDollars(metrics.expenditure_per_capita)
            : "—"
        } exp`
      : "Per-capita unavailable",
    metrics.population != null
      ? `Population ${metrics.population.toLocaleString("en-US")}`
      : "Population unavailable",
  ];
}

export function CountyChoropleth({
  features,
  metrics,
}: {
  features: CountyFeature[];
  metrics: CountyMetricsDocument;
}) {
  const selectId = useId();
  const years = metrics.fiscal_years;
  const [metric, setMetric] = useState<MetricKey>("revenue_per_capita");
  const [year, setYear] = useState<number>(years.at(-1) ?? 0);
  const [hover, setHover] = useState<HoverState | null>(null);

  const metricConfig = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const byFips = useMemo(
    () => new Map(metrics.counties.map((entry) => [entry.fips, entry])),
    [metrics],
  );

  const path = useMemo(() => {
    const collection = {
      type: "FeatureCollection" as const,
      features: features.map((f) => ({
        type: "Feature" as const,
        properties: {},
        geometry: f.geometry,
      })),
    };
    const projection = geoConicEqualArea()
      .parallels([30.6, 34.7])
      .rotate([83.4, 0])
      .fitExtent(
        [
          [8, 8],
          [WIDTH - 8, HEIGHT - 8],
        ],
        collection,
      );
    return geoPath(projection);
  }, [features]);

  const values = useMemo(() => {
    const result = new Map<string, number>();
    for (const entry of metrics.counties) {
      if (!entry.included) continue;
      const value = metricValue(entry.years, year, metric);
      if (value != null) result.set(entry.fips, value);
    }
    return result;
  }, [metrics, year, metric]);

  const thresholds = useMemo(
    () => (values.size ? quintileThresholds([...values.values()]) : []),
    [values],
  );

  const missingCount = metrics.counties.length - values.size;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <label
          className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest"
          style={{ color: MUTED }}
          htmlFor={`${selectId}-metric`}
        >
          Metric
          <select
            id={`${selectId}-metric`}
            value={metric}
            onChange={(event) => setMetric(event.target.value as MetricKey)}
            className="rounded-none border px-2 py-1 font-mono text-xs normal-case tracking-normal"
            style={{ borderColor: RULE, backgroundColor: PAPER, color: INK }}
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label
          className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest"
          style={{ color: MUTED }}
          htmlFor={`${selectId}-year`}
        >
          Fiscal year
          <select
            id={`${selectId}-year`}
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="rounded-none border px-2 py-1 font-mono text-xs normal-case tracking-normal"
            style={{ borderColor: RULE, backgroundColor: PAPER, color: INK }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {fiscalYearLabel(y)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="relative mt-4">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          aria-label={`Georgia county map colored by ${metricConfig.label.toLowerCase()}, ${fiscalYearLabel(year)}. Every value is also in the table below the map.`}
          className="w-full max-w-xl"
          onPointerLeave={() => setHover(null)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setHover(null);
          }}
        >
          {features.map((feature) => {
            const entry = byFips.get(feature.fips);
            const value = values.get(feature.fips);
            const fill =
              value != null && thresholds.length
                ? SEQUENTIAL_RAMP[binIndex(value, thresholds)]
                : NO_DATA_FILL;
            const d = path({
              type: "Feature",
              properties: {},
              geometry: feature.geometry,
            });
            if (!d || !entry) return null;
            const shape = (
              <path
                d={d}
                fill={fill}
                stroke={PAPER}
                strokeWidth={hover?.county === entry.county ? 1.5 : 0.75}
                onPointerMove={(event) => {
                  const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                  if (!box) return;
                  setHover({
                    x: event.clientX - box.left,
                    y: event.clientY - box.top,
                    county: entry.county,
                    lines: hoverLines(entry, year),
                  });
                }}
                onFocus={() => {
                  setHover({
                    x: WIDTH / 2,
                    y: 24,
                    county: entry.county,
                    lines: hoverLines(entry, year),
                  });
                }}
                onBlur={() => setHover(null)}
              />
            );
            return entry.included ? (
              <a
                key={feature.fips}
                href={`/county/${entry.slug}/`}
                aria-label={`${feature.name} County — open its ledger`}
              >
                {shape}
              </a>
            ) : (
              <g
                key={feature.fips}
                tabIndex={0}
                role="img"
                aria-label={`${feature.name} County — ${entry.note}`}
              >
                {shape}
              </g>
            );
          })}
        </svg>

        {hover ? (
          <div
            className="pointer-events-none absolute z-10 rounded-sm border px-3 py-2 shadow-sm"
            style={{
              left: Math.min(hover.x + 14, 340),
              top: hover.y + 14,
              backgroundColor: PAPER,
              borderColor: RULE,
              color: INK,
              maxWidth: 240,
            }}
          >
            <p
              className="font-mono text-xs uppercase tracking-widest"
              style={{ color: SPRUCE }}
            >
              {hover.county}
            </p>
            {hover.lines.map((line) => (
              <p key={line} className="mt-1 text-xs" style={{ color: MUTED }}>
                {line}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {thresholds.length ? (
          <ul className="flex items-center gap-0.5" aria-label="Color scale, low to high">
            {SEQUENTIAL_RAMP.map((color, index) => (
              <li key={color} className="flex flex-col">
                <span
                  className="block h-3 w-12"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span
                  className="mt-1 font-mono text-[10px] tabular-nums"
                  style={{ color: MUTED }}
                >
                  {index === 0
                    ? "low"
                    : formatMetric(thresholds[index - 1], metricConfig.perCapita)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <span className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <span
            className="inline-block h-3 w-3"
            style={{ backgroundColor: NO_DATA_FILL }}
            aria-hidden="true"
          />
          No data ({missingCount} {missingCount === 1 ? "county" : "counties"})
        </span>
      </div>
      <p className="mt-2 text-xs" style={{ color: MUTED }}>
        Click a county for its full ledger. Gray counties either filed no RLGF
        report for {fiscalYearLabel(year)} or are consolidated city-county
        governments not in this dataset.
      </p>
    </div>
  );
}
