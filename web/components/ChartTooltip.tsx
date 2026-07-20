import { INK, MUTED, PAPER, RULE } from "@/lib/theme";
import { formatBillions } from "@/lib/format";

export interface TooltipRow {
  label: string;
  value: number;
  color: string;
  dashed?: boolean;
}

export function ChartTooltipFrame({
  title,
  subtitle,
  rows,
  format = formatBillions,
}: {
  title: string;
  subtitle?: string;
  rows: TooltipRow[];
  format?: (value: number) => string;
}) {
  return (
    <div
      className="rounded-sm border px-3 py-2 shadow-sm"
      style={{ backgroundColor: PAPER, borderColor: RULE, color: INK }}
    >
      <p className="font-mono text-xs uppercase tracking-widest" style={{ color: MUTED }}>
        {title}
        {subtitle ? <span> · {subtitle}</span> : null}
      </p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <svg width="14" height="4" aria-hidden="true">
              <line
                x1="0"
                y1="2"
                x2="14"
                y2="2"
                stroke={row.color}
                strokeWidth="3"
                strokeDasharray={row.dashed ? "4 3" : undefined}
              />
            </svg>
            <span className="font-mono text-sm font-semibold tabular-nums">
              {format(row.value)}
            </span>
            <span className="text-xs" style={{ color: MUTED }}>
              {row.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
