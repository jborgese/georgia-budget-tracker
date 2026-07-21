import { formatDollars } from "@/lib/format";
import { LEVEL_COLORS, type LevelSlice } from "@/lib/receipt";
import { INK } from "@/lib/theme";
import { ChartLegend } from "./ChartLegend";

// A stacked horizontal bar built from plain divs — no chart library — with
// a legend; the caller renders the exact-values table twin alongside.
export function LevelBar({
  slices,
  ariaLabel,
}: {
  slices: LevelSlice[];
  ariaLabel: string;
}) {
  if (!slices.length) return null;
  return (
    <div>
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex h-8 w-full overflow-hidden"
      >
        {slices.map((slice) => (
          <div
            key={slice.key}
            style={{
              width: `${slice.share * 100}%`,
              backgroundColor: LEVEL_COLORS[slice.key],
            }}
            title={`${slice.label}: ${formatDollars(slice.amount)} (${Math.round(slice.share * 100)}%)`}
          />
        ))}
      </div>
      <div className="mt-2 text-xs" style={{ color: INK }}>
        <ChartLegend
          entries={slices.map((slice) => ({
            label: `${slice.label} ${Math.round(slice.share * 100)}%`,
            color: LEVEL_COLORS[slice.key],
            kind: "rect" as const,
          }))}
        />
      </div>
    </div>
  );
}
