"use client";

import { useState } from "react";
import type { SpendingSlice } from "@/lib/spending";
import { INK, MUTED, RULE } from "@/lib/theme";
import { formatDollars } from "@/lib/format";

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
}: {
  caption: string;
  slices: SpendingSlice[];
  total: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
        className="cursor-pointer font-mono text-xs uppercase tracking-widest"
        style={{ color: MUTED }}
      >
        View as table
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm" style={{ color: INK }}>
          <caption className="sr-only">{caption}</caption>
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
              return [
                <tr key={slice.key} className="border-t" style={{ borderColor: RULE }}>
                  <td className="py-2 pr-4">
                    {expandable ? (
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => toggle(slice.key)}
                        className="flex items-center gap-2 text-left"
                        style={{ color: INK }}
                      >
                        <Chevron open={open} />
                        {slice.label}
                      </button>
                    ) : (
                      <span className="pl-[18px]">{slice.label}</span>
                    )}
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
