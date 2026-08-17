"use client";

import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { INK, PAPER, RULE } from "@/lib/theme";

const EDGE_MARGIN = 8;
const GAP = 6;
const FLIP_THRESHOLD = 120;

interface TipPlacement {
  left: number;
  top: number;
  below: boolean;
}

function placeTip(anchor: DOMRect, maxWidth: number): TipPlacement {
  const width = Math.min(maxWidth, window.innerWidth - EDGE_MARGIN * 2);
  const left = Math.min(
    Math.max(anchor.left, EDGE_MARGIN),
    window.innerWidth - width - EDGE_MARGIN,
  );
  const below = anchor.top < FLIP_THRESHOLD;
  return { left, top: below ? anchor.bottom + GAP : anchor.top - GAP, below };
}

export function Tip({
  ariaLabel,
  text,
  buttonClassName,
  color,
  maxWidth,
  children,
}: {
  ariaLabel: string;
  text: string;
  buttonClassName: string;
  color: string;
  maxWidth: number;
  children: ReactNode;
}) {
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openedByFocusRef = useRef(false);
  const [placement, setPlacement] = useState<TipPlacement | null>(null);

  const open = () => {
    const anchor = buttonRef.current?.getBoundingClientRect();
    if (anchor) setPlacement(placeTip(anchor, maxWidth));
  };
  const close = () => setPlacement(null);
  const toggle = () => {
    if (openedByFocusRef.current) {
      openedByFocusRef.current = false;
      if (!placement) open();
      return;
    }
    if (placement) close();
    else open();
  };

  useEffect(() => {
    if (!placement) return;
    const dismiss = () => setPlacement(null);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [placement]);

  return (
    <span className="inline-block align-middle">
      <button
        type="button"
        ref={buttonRef}
        aria-label={ariaLabel}
        aria-describedby={placement ? tooltipId : undefined}
        aria-expanded={placement != null}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={() => {
          openedByFocusRef.current = true;
          open();
        }}
        onBlur={() => {
          openedByFocusRef.current = false;
          close();
        }}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
        className={buttonClassName}
        style={{ color }}
      >
        {children}
      </button>
      {placement ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="fixed z-20 block rounded-sm border px-2.5 py-1.5 text-left text-xs font-normal normal-case tracking-normal shadow-sm leading-snug"
          style={{
            backgroundColor: PAPER,
            borderColor: RULE,
            color: INK,
            left: placement.left,
            top: placement.top,
            maxWidth,
            width: "max-content",
            transform: placement.below ? undefined : "translateY(-100%)",
          }}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
