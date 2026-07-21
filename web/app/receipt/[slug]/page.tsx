import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReceiptView } from "@/components/ReceiptView";
import { loadReceiptCounty } from "@/lib/receiptData";
import { loadStackIndex } from "@/lib/stack";
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
  const data = loadReceiptCounty(slug);
  if (!data) return {};
  const title = `${data.countyName} County, GA — your taxpayer receipt`;
  const description =
    `Estimate the Georgia state and local taxes a resident of ` +
    `${data.countyName} County pays on a salary, apportioned by what the ` +
    `money buys and by which government — state, county, city, school ` +
    `district — collects each dollar.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary", title, description },
  };
}

function provenance(data: NonNullable<ReturnType<typeof loadReceiptCounty>>) {
  const sales = data.sales
    ? `Sales rates: Georgia DOR general rate chart, effective ` +
      `${data.sales.effectiveFrom} to ${data.sales.effectiveThrough}. `
    : "";
  return (
    `Income tax: Georgia's TY${data.taxParameters.income_tax.tax_year} ` +
    `flat rate and standard deduction (${data.taxParameters.income_tax.statute}) ` +
    `verified ${data.taxParameters.income_tax.verified}. ${sales}` +
    `Property rates: Georgia DOR consolidated tax digest, tax year ` +
    `${data.stack.taxYear}, via GeorgiaData.org. Spending mixes: state ` +
    `FY${data.stateMix.fiscalYear} budget actuals (OPB); county, city, and ` +
    `consolidated governments from RLGF filings via the UGA Tax & ` +
    `Expenditure Data Center; school districts from the US Census F-33 ` +
    `school finance survey. Consumption shares: BLS Consumer Expenditure ` +
    `Surveys, 2024 income quintiles. Estimates are illustrations, not tax ` +
    `advice; a rate shown as "not reported" is missing from the state's ` +
    `compilation, not necessarily zero.`
  );
}

export default async function ReceiptCountyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = loadReceiptCounty(slug);
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
          The receipt · {data.countyName} County
        </p>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight"
          style={{ color: SPRUCE }}
        >
          Your taxpayer receipt in {data.countyName} County
        </h1>
        <p className="mt-4 max-w-prose text-sm leading-relaxed">
          Enter a salary to estimate what you pay Georgia&apos;s state and
          local governments and what that money buys. The default is the
          state income tax alone — the one layer that follows from salary
          with no further assumptions. The expanded layers are estimates and
          say so.
        </p>

        <ReceiptView payload={data} />

        <footer className="mt-14">
          <div className="border-t pt-3" style={{ borderColor: INK }}>
            <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
              {provenance(data)}
            </p>
          </div>
          <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            <Link
              href="/receipt/"
              className="font-mono text-xs uppercase tracking-widest underline underline-offset-4"
              style={{ color: SPRUCE }}
            >
              ← All counties
            </Link>
            <Link
              href={`/stack/${data.slug}/`}
              className="font-mono text-xs uppercase tracking-widest underline underline-offset-4"
              style={{ color: SPRUCE }}
            >
              The property-tax stack for this county →
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
