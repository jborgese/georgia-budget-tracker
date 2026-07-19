import type { Metadata } from "next";
import Link from "next/link";
import { loadStackIndex } from "@/lib/stack";
import { GOLD, INK, MUTED, PAPER, SPRUCE } from "@/lib/theme";

export const metadata: Metadata = {
  title: "The stack — every government that taxes one address",
  description:
    "Pick a Georgia county and city to stack every property-tax rate that " +
    "applies to one address — county, city, school district, and special " +
    "districts — with each government linked to its own ledger.",
};

export default function StackIndexPage() {
  const { taxYear, counties } = loadStackIndex();

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
          The stack · tax year {taxYear}
        </p>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight"
          style={{ color: SPRUCE }}
        >
          Every government that taxes one address
        </h1>
        <p className="mt-4 max-w-prose text-sm leading-relaxed">
          A Georgia property owner pays several governments at once: the
          county, sometimes a city, a school district, and any special
          districts that reach the parcel. Pick a county, then a city (or
          unincorporated), and this view stacks the {taxYear} digest rates
          that apply to that address — each line linked to that
          government&apos;s own ledger.
        </p>
        <p className="mt-3 max-w-prose text-xs leading-relaxed" style={{ color: MUTED }}>
          Rates come from the state&apos;s consolidated tax digest as
          compiled by the Department of Revenue. School districts are
          usually the largest line on the bill.
        </p>

        <nav aria-label="Counties" className="mt-10">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 md:grid-cols-4">
            {counties.map((county) => (
              <li key={county.slug}>
                <Link
                  href={`/stack/${county.slug}/`}
                  className="text-sm underline underline-offset-4"
                  style={{ color: SPRUCE }}
                >
                  {county.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <footer className="mt-14">
          <p className="mt-8">
            <Link
              href="/"
              className="font-mono text-xs uppercase tracking-widest underline underline-offset-4"
              style={{ color: SPRUCE }}
            >
              ← Back to the statewide ledger
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
