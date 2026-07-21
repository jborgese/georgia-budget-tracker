import type { Metadata } from "next";
import Link from "next/link";
import { GeolocateCounty } from "@/components/GeolocateCounty";
import { loadCountyMetrics } from "@/lib/data";
import { georgiaCountyFeatures } from "@/lib/geo";
import { loadStackIndex } from "@/lib/stack";
import { GOLD, INK, MUTED, PAPER, SPRUCE } from "@/lib/theme";

export const metadata: Metadata = {
  title: "The receipt — where your Georgia taxes go",
  description:
    "Enter a salary and pick a Georgia county to see your estimated state " +
    "and local taxes apportioned by what the money buys — schools, roads, " +
    "public safety — and by which government collects each dollar.",
};

export default function ReceiptIndexPage() {
  const { counties } = loadStackIndex();
  const metrics = loadCountyMetrics();
  const fipsByCounty = new Map(
    metrics.counties.map((entry) => [entry.county, entry.fips]),
  );
  const slugByFips = Object.fromEntries(
    counties.flatMap((county) => {
      const fips = fipsByCounty.get(county.name.toUpperCase());
      return fips ? [[fips, county.slug]] : [];
    }),
  );

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
          The receipt
        </p>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight"
          style={{ color: SPRUCE }}
        >
          Where your Georgia taxes go
        </h1>
        <p className="mt-4 max-w-prose text-sm leading-relaxed">
          Enter a salary and this view estimates your Georgia state income
          tax, then apportions it by what the state actually buys. Expand
          the estimate and it layers on local sales tax and property tax —
          each dollar routed to the county, city, and school district that
          collect it, by their own filed spending.
        </p>
        <p
          className="mt-3 max-w-prose text-xs leading-relaxed"
          style={{ color: MUTED }}
        >
          Every figure is computed in your browser from published data —
          nothing you enter leaves the page. Curious about the property-tax
          rates themselves? See{" "}
          <Link
            href="/stack/"
            className="underline underline-offset-4"
            style={{ color: SPRUCE }}
          >
            the stack
          </Link>
          .
        </p>

        <div className="mt-10">
          <GeolocateCounty
            features={georgiaCountyFeatures()}
            slugByFips={slugByFips}
          />
        </div>

        <nav aria-label="Counties" className="mt-6">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 md:grid-cols-4">
            {counties.map((county) => (
              <li key={county.slug}>
                <Link
                  href={`/receipt/${county.slug}/`}
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
