"use client";

import { useId, useState } from "react";
import type { SpendingSlice } from "@/lib/spending";
import { LEVEL_SHORT_LABELS, type LevelKey } from "@/lib/receipt";
import { describeCategory, describeSubcategory } from "@/lib/glossary";
import { INK, MUTED, RULE } from "@/lib/theme";
import { formatDollars } from "@/lib/format";
import { InfoTip } from "./InfoTip";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      className="inline-block"
      style={{ transform: open ? "rotate(90deg)" : "none" }}
    >
      <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function SpendingTable({
  caption,
  slices,
  total,
  levelLabels: levelLabelOverrides,
}: {
  caption: string;
  slices: SpendingSlice[];
  total: number;
  levelLabels?: Partial<Record<LevelKey, string>>;
}) {
  const captionId = useId();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const levelLabels = { ...LEVEL_SHORT_LABELS, ...levelLabelOverrides };
  const showLevels = slices.some((slice) => (slice.levels?.length ?? 0) > 1);

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <details className="mt-3">
      <summary
        className="cursor-pointer py-2 font-mono text-xs uppercase tracking-widest"
        style={{ color: MUTED }}
      >
        View as table
      </summary>
      <div
        className="mt-2 overflow-x-auto"
        role="region"
        aria-labelledby={captionId}
        tabIndex={0}
      >
        <table className="w-full text-sm" style={{ color: INK }}>
          <caption id={captionId} className="sr-only">
            {caption}
          </caption>
          <thead>
            <tr
              className="border-t font-mono text-xs uppercase tracking-widest"
              style={{ borderColor: INK }}
            >
              <th scope="col" className="py-2 pr-4 text-left font-normal" style={{ color: MUTED }}>
                Category
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal" style={{ color: MUTED }}>
                Amount
              </th>
              <th scope="col" className="py-2 text-right font-normal" style={{ color: MUTED }}>
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {slices.map((slice) => {
              const open = expanded.has(slice.key);
              const expandable = slice.subcategories.length > 0;
              const categoryInfo = describeCategory(slice.key);
              return [
                <tr key={slice.key} className="border-t" style={{ borderColor: RULE }}>
                  <td className="py-2 pr-4">
                    {expandable ? (
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => toggle(slice.key)}
                        className="-my-1 inline-flex items-center gap-2 py-1 text-left"
                        style={{ color: INK }}
                      >
                        <Chevron open={open} />
                        {slice.label}
                      </button>
                    ) : (
                      <span className="pl-[18px]">{slice.label}</span>
                    )}
                    {categoryInfo ? (
                      <InfoTip text={categoryInfo} subject={slice.label} />
                    ) : null}
                    {showLevels && slice.levels?.length ? (
                      <span
                        className="mt-0.5 block pl-[18px] font-mono text-xs tabular-nums"
                        style={{ color: MUTED }}
                      >
                        {slice.levels
                          .map(
                            (level) =>
                              `${levelLabels[level.key]} ${formatDollars(level.amount)}`,
                          )
                          .join(" · ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums">
                    {formatDollars(slice.amount)}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums">
                    {(slice.share * 100).toFixed(1)}%
                  </td>
                </tr>,
                ...(open
                  ? slice.subcategories.map((sub) => (
                      <tr
                        key={`${slice.key}-${sub.label}`}
                        className="border-t"
                        style={{ borderColor: RULE }}
                      >
                        <td
                          className="py-1.5 pl-9 pr-4 text-sm"
                          style={{ color: MUTED }}
                        >
                          {sub.label}
                          {describeSubcategory(sub.label) ? (
                            <InfoTip
                              text={describeSubcategory(sub.label) as string}
                              subject={sub.label}
                            />
                          ) : null}
                        </td>
                        <td
                          className="py-1.5 pr-4 text-right font-mono text-xs tabular-nums"
                          style={{ color: MUTED }}
                        >
                          {formatDollars(sub.amount)}
                        </td>
                        <td
                          className="py-1.5 text-right font-mono text-xs tabular-nums"
                          style={{ color: MUTED }}
                        >
                          {total > 0 ? `${((sub.amount / total) * 100).toFixed(1)}%` : ""}
                        </td>
                      </tr>
                    ))
                  : []),
              ];
            })}
          </tbody>
        </table>
        <div className="border-t" style={{ borderColor: INK }} />
      </div>
    </details>
  );
}
