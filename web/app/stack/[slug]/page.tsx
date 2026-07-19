import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StackView } from "@/components/StackView";
import { loadStackCounty, loadStackIndex } from "@/lib/stack";
import { GOLD, INK, MUTED, PAPER, SPRUCE } from "@/lib/theme";

export const dynamicParams = false;

export function generateStaticParams() {
  return loadStackIndex().counties.map((county) => ({ slug: county.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = loadStackCounty(slug);
  if (!data) return {};
  const title = `${data.countyName} County, GA — the property-tax stack, ${data.taxYear}`;
  const description =
    `Every property-tax rate that applies to an address in ` +
    `${data.countyName} County, Georgia — ` +
    `${data.kind === "consolidated" ? "consolidated government" : "county, city"}, ` +
    `school district, and special districts, from the ${data.taxYear} state ` +
    `tax digest, with each government linked to its own ledger.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary", title, description },
  };
}

export default async function StackCountyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = loadStackCounty(slug);
  if (!data) notFound();

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
          The stack · tax year {data.taxYear}
        </p>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight"
          style={{ color: SPRUCE }}
        >
          One address in {data.countyName} County
        </h1>
        <p className="mt-4 max-w-prose text-sm leading-relaxed">
          The property-tax rates that stack on a single address, as filed in
          the state&apos;s {data.taxYear} tax digest. Each line is a separate
          government with its own budget — follow the links to see how each
          one raises and spends its money.
        </p>

        <StackView data={data} />

        <footer className="mt-14">
          <div className="border-t pt-3" style={{ borderColor: INK }}>
            <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
              {data.provenance}
            </p>
          </div>
          <p className="mt-8">
            <Link
              href="/stack/"
              className="font-mono text-xs uppercase tracking-widest underline underline-offset-4"
              style={{ color: SPRUCE }}
            >
              ← All counties
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
