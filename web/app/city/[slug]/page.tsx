import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadEntityListings, loadEntityPage } from "@/lib/data";
import { fiscalYearLabel, formatCompactDollars } from "@/lib/format";
import { EntityLedger } from "@/components/EntityLedger";

export const dynamicParams = false;

export function generateStaticParams() {
  return loadEntityListings("city")
    .filter((listing) => listing.latestFiledYear != null)
    .map((listing) => ({ slug: listing.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = loadEntityPage("city", slug);
  if (!data) return {};
  const latest = data.totalsByYear[String(data.latestFiledYear)];
  const fy = fiscalYearLabel(data.latestFiledYear);
  const title = `City of ${data.displayName}, GA — city finances ${fy}`;
  const description =
    `City of ${data.displayName}, Georgia government finances: ` +
    `${fy} revenues ${latest?.revenue != null ? formatCompactDollars(latest.revenue) : "n/a"}, ` +
    `expenditures ${latest?.expenditure != null ? formatCompactDollars(latest.expenditure) : "n/a"}. ` +
    `Multi-year trends and breakdowns from public RLGF filings.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary", title, description },
  };
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = loadEntityPage("city", slug);
  if (!data) notFound();
  return <EntityLedger data={data} />;
}
