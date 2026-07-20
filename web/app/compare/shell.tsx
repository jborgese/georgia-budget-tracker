import { Suspense } from "react";
import Link from "next/link";
import type { CompareDataset, CompareKind } from "@/lib/compare";
import { GOLD, INK, MUTED, PAPER, SPRUCE } from "@/lib/theme";
import { CompareView } from "@/components/CompareView";

const MODES: { kind: CompareKind; href: string; label: string }[] = [
  { kind: "county", href: "/compare/", label: "Counties" },
  { kind: "city", href: "/compare/city/", label: "Cities" },
  { kind: "consolidated", href: "/compare/consolidated/", label: "Consolidated" },
  { kind: "school", href: "/compare/school/", label: "School districts" },
];

export function CompareShell({
  title,
  intro,
  note,
  data,
}: {
  title: string;
  intro: string;
  note?: string;
  data: CompareDataset;
}) {
  return (
    <main
      className="flex-1 px-6 py-16 sm:py-20"
      style={{ backgroundColor: PAPER, color: INK }}
    >
      <div className="mx-auto w-full max-w-4xl">
        <p
          className="font-mono text-xs uppercase tracking-[0.25em]"
          style={{ color: GOLD }}
        >
          Side by side
        </p>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight"
          style={{ color: SPRUCE }}
        >
          {title}
        </h1>
        <nav
          aria-label="Comparison level"
          className="mt-6 flex flex-wrap gap-x-5 gap-y-2"
        >
          {MODES.map((mode) => {
            const active = mode.kind === data.kind;
            return (
              <Link
                key={mode.kind}
                href={mode.href}
                aria-current={active ? "page" : undefined}
                className={`font-mono text-xs uppercase tracking-widest ${
                  active ? "underline underline-offset-4" : ""
                }`}
                style={{ color: active ? SPRUCE : GOLD }}
              >
                {mode.label}
              </Link>
            );
          })}
        </nav>
        <p className="mt-6 max-w-prose text-base leading-relaxed">{intro}</p>
        {note ? (
          <p
            className="mt-3 max-w-prose text-xs leading-relaxed"
            style={{ color: MUTED }}
          >
            {note}
          </p>
        ) : null}
        <div className="mt-10">
          <Suspense fallback={null}>
            <CompareView data={data} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
