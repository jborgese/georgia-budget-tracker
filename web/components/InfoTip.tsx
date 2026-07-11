"use client";

import { useId, useState } from "react";
import { INK, MUTED, PAPER, RULE } from "@/lib/theme";

export function InfoTip({ text, subject }: { text: string; subject: string }) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        aria-label={`What is ${subject}?`}
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
        className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full"
        style={{ color: MUTED }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="7" cy="4.2" r="0.9" fill="currentColor" />
          <rect x="6.25" y="6" width="1.5" height="4.5" rx="0.75" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-0 z-20 mb-1.5 block w-max max-w-[260px] rounded-sm border px-2.5 py-1.5 text-xs font-normal normal-case leading-snug shadow-sm"
          style={{ backgroundColor: PAPER, borderColor: RULE, color: INK }}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
