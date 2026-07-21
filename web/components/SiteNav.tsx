"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SearchOption } from "@/lib/data";
import { GOLD, INK, MUTED, PAPER, RULE, SPRUCE } from "@/lib/theme";

const KIND_LABELS: Record<SearchOption["kind"], string> = {
  county: "County",
  city: "City",
  consolidated: "Consolidated",
  school: "District",
};

const KIND_ROUTES: Record<SearchOption["kind"], string> = {
  county: "/county",
  city: "/city",
  consolidated: "/consolidated",
  school: "/school",
};

function optionLabel(option: SearchOption): string {
  if (option.kind === "county") return `${option.name} County`;
  if (option.kind === "city") return `City of ${option.name}`;
  return option.name;
}

export function SiteNav({ options }: { options: SearchOption[] }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const matches = query.trim()
    ? options
        .filter((option) =>
          option.name.toLowerCase().startsWith(query.trim().toLowerCase()),
        )
        .slice(0, 8)
    : [];

  function go(option: SearchOption) {
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
    router.push(`${KIND_ROUTES[option.kind]}/${option.slug}/`);
  }

  return (
    <header
      className="border-b px-6 py-3"
      style={{ backgroundColor: PAPER, borderColor: RULE }}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-6 gap-y-2">
        <Link
          href="/"
          className="font-mono text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ color: SPRUCE }}
        >
          GA Budget Tracker
        </Link>
        <nav aria-label="Site" className="flex items-center gap-4">
          <Link
            href="/city/"
            className="font-mono text-xs uppercase tracking-widest"
            style={{ color: GOLD }}
          >
            Cities
          </Link>
          <Link
            href="/schools/"
            className="font-mono text-xs uppercase tracking-widest"
            style={{ color: GOLD }}
          >
            Schools
          </Link>
          <Link
            href="/stack/"
            className="font-mono text-xs uppercase tracking-widest"
            style={{ color: GOLD }}
          >
            Stack
          </Link>
          <Link
            href="/receipt/"
            className="font-mono text-xs uppercase tracking-widest"
            style={{ color: GOLD }}
          >
            Receipt
          </Link>
          <Link
            href="/compare/"
            className="font-mono text-xs uppercase tracking-widest"
            style={{ color: GOLD }}
          >
            Compare
          </Link>
          <Link
            href="/about/"
            className="font-mono text-xs uppercase tracking-widest"
            style={{ color: GOLD }}
          >
            About
          </Link>
        </nav>

        <div className="relative ml-auto">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open && matches.length > 0}
            aria-controls={listId}
            aria-activedescendant={
              open && matches[active]
                ? `${listId}-${matches[active].kind}-${matches[active].slug}`
                : undefined
            }
            aria-label="Find a county, city, or school district"
            placeholder="Find a government…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(event) => {
              if (!matches.length) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((current) => Math.min(current + 1, matches.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((current) => Math.max(current - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                go(matches[active]);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
            className="w-44 border px-2 py-1 font-mono text-xs sm:w-52"
            style={{ borderColor: RULE, backgroundColor: PAPER, color: INK }}
          />
          {open && matches.length ? (
            <ul
              id={listId}
              role="listbox"
              aria-label="Counties, cities, and school districts"
              className="absolute right-0 z-20 mt-1 w-60 border shadow-sm"
              style={{ backgroundColor: PAPER, borderColor: RULE }}
            >
              {matches.map((option, index) => (
                <li
                  key={`${option.kind}-${option.slug}`}
                  id={`${listId}-${option.kind}-${option.slug}`}
                  role="option"
                  aria-selected={index === active}
                  className="flex cursor-pointer items-baseline justify-between gap-2 px-2 py-1.5 text-sm"
                  style={{
                    backgroundColor: index === active ? RULE : PAPER,
                    color: INK,
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    go(option);
                  }}
                  onMouseEnter={() => setActive(index)}
                >
                  <span>{optionLabel(option)}</span>
                  <span
                    className="font-mono text-[10px] uppercase tracking-widest"
                    style={{ color: MUTED }}
                  >
                    {KIND_LABELS[option.kind]}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </header>
  );
}
