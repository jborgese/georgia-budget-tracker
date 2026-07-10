import type { Metadata } from "next";
import Link from "next/link";
import { GOLD, INK, PAPER, SPRUCE } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <main
      className="flex-1 px-6 py-16 sm:py-24"
      style={{ backgroundColor: PAPER, color: INK }}
    >
      <div className="mx-auto w-full max-w-2xl">
        <p
          className="font-mono text-xs uppercase tracking-[0.25em]"
          style={{ color: GOLD }}
        >
          Line item not found
        </p>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight"
          style={{ color: SPRUCE }}
        >
          404 — no such page in this ledger
        </h1>
        <p className="mt-6 max-w-prose text-base leading-relaxed">
          The page you asked for is not on the books. If you were looking for a
          county, the search box above knows all 151 of them.
        </p>
        <p className="mt-8">
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-widest underline underline-offset-4"
            style={{ color: SPRUCE }}
          >
            ← Back to the statewide ledger
          </Link>
        </p>
      </div>
    </main>
  );
}
