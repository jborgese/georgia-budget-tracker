"use client";

import { useId, useState } from "react";
import { GOLD, INK, PAPER, RULE } from "@/lib/theme";

export function WarningTip({ text, subject }: { text: string; subject: string }) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        aria-label={`Data availability: ${subject}`}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="ml-1.5 inline-flex h-4 w-4 items-center justify-center"
        style={{ color: GOLD }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path
            d="M7 1.2 13.2 12.3 H0.8 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <rect x="6.3" y="5" width="1.4" height="4" rx="0.7" fill="currentColor" />
          <circle cx="7" cy="10.6" r="0.85" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-0 z-20 mb-1.5 block w-max max-w-[280px] rounded-sm border px-2.5 py-1.5 text-xs font-normal normal-case leading-snug shadow-sm"
          style={{ backgroundColor: PAPER, borderColor: RULE, color: INK }}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
