import { INK } from "@/lib/theme";

export interface LegendEntry {
  label: string;
  color: string;
  kind: "line" | "rect";
  dashed?: boolean;
}

export function ChartLegend({ entries }: { entries: LegendEntry[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {entries.map((entry) => (
        <li key={entry.label} className="flex items-center gap-2">
          {entry.kind === "line" ? (
            <svg width="18" height="4" aria-hidden="true">
              <line
                x1="0"
                y1="2"
                x2="18"
                y2="2"
                stroke={entry.color}
                strokeWidth="2.5"
                strokeDasharray={entry.dashed ? "4 3" : undefined}
              />
            </svg>
          ) : (
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-[2px]"
              style={{ backgroundColor: entry.color }}
            />
          )}
          <span className="text-xs" style={{ color: INK }}>
            {entry.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
