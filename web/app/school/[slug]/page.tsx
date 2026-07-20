import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSchoolIndex, loadSchoolPage } from "@/lib/data";
import {
  fiscalYearLabel,
  formatCompactDollars,
  formatDollars,
} from "@/lib/format";
import { GOLD, INK, MUTED, PAPER, RULE, SPRUCE } from "@/lib/theme";
import type { SchoolPageData, SchoolYear } from "@/lib/types";
import { describeSchoolTerm } from "@/lib/glossary";
import { InfoTip } from "@/components/InfoTip";
import { DataTable } from "@/components/DataTable";
import { StatTile } from "@/components/StatTile";

export const dynamicParams = false;

export function generateStaticParams() {
  return loadSchoolIndex().districts.map((district) => ({
    slug: district.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = loadSchoolPage(slug);
  if (!data) return {};
  const latest = data.document.years[String(data.latestYear)];
  const fy = fiscalYearLabel(data.latestYear);
  const title = `${data.displayName}, GA — school finances ${fy}`;
  const description =
    `${data.displayName}, Georgia: ${fy} enrollment ` +
    `${latest.enrollment.toLocaleString("en-US")}, revenues ` +
    `${formatCompactDollars(latest.revenue.total)}, per-pupil spending ` +
    `${latest.per_pupil.current_spending != null ? formatDollars(latest.per_pupil.current_spending) : "n/a"}. ` +
    `Revenue sources, spending, and trends from the Census F-33 survey.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary", title, description },
  };
}

interface LabeledRow {
  label: string;
  amount: number;
}

function revenueRows(year: SchoolYear): LabeledRow[] {
  const otherLocal =
    year.revenue.local -
    year.revenue.property_tax -
    year.revenue.sales_tax -
    year.revenue.parent_government;
  return [
    { label: "Local property taxes", amount: year.revenue.property_tax },
    { label: "Local sales taxes (ESPLOST)", amount: year.revenue.sales_tax },
    ...(year.revenue.parent_government
      ? [{
          label: "Parent government contributions",
          amount: year.revenue.parent_government,
        }]
      : []),
    { label: "Other local revenue", amount: otherLocal },
    { label: "State aid", amount: year.revenue.state },
    { label: "Federal aid", amount: year.revenue.federal },
  ];
}

function spendingRows(year: SchoolYear): LabeledRow[] {
  const listed =
    year.expenditure.current +
    year.expenditure.capital +
    year.expenditure.interest_on_debt;
  return [
    { label: "Instruction", amount: year.expenditure.instruction },
    { label: "Support services", amount: year.expenditure.support_services },
    { label: "Other current spending", amount: year.expenditure.other_current },
    { label: "Capital projects", amount: year.expenditure.capital },
    { label: "Interest on debt", amount: year.expenditure.interest_on_debt },
    {
      label: "Payments to other governments & other",
      amount: year.expenditure.total - listed,
    },
  ];
}

function ShareTable({
  caption,
  rows,
  total,
  totalLabel,
}: {
  caption: string;
  rows: LabeledRow[];
  total: number;
  totalLabel: string;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm" style={{ color: INK }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr
            className="border-t font-mono text-xs uppercase tracking-widest"
            style={{ borderColor: INK, color: MUTED }}
          >
            <th scope="col" className="py-2 pr-4 text-left font-normal">
              Line
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">
              Amount
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t" style={{ borderColor: RULE }}>
              <td className="py-1.5 pr-4">
                {row.label}
                {describeSchoolTerm(row.label) ? (
                  <InfoTip
                    text={describeSchoolTerm(row.label) as string}
                    subject={row.label}
                  />
                ) : null}
              </td>
              <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                {formatDollars(row.amount)}
              </td>
              <td
                className="py-1.5 text-right font-mono tabular-nums text-xs"
                style={{ color: MUTED }}
              >
                {total ? `${((row.amount / total) * 100).toFixed(1)}%` : ""}
              </td>
            </tr>
          ))}
          <tr className="border-t font-semibold" style={{ borderColor: INK }}>
            <td className="py-1.5 pr-4">{totalLabel}</td>
            <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
              {formatDollars(total)}
            </td>
            <td />
          </tr>
        </tbody>
      </table>
      <div className="border-t" style={{ borderColor: INK }} />
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t pb-1 pt-3" style={{ borderColor: INK }}>
      <h2
        className="font-mono text-xs uppercase tracking-widest"
        style={{ color: SPRUCE }}
      >
        {children}
      </h2>
    </div>
  );
}

function trendsRows(data: SchoolPageData): string[][] {
  return data.filedYears.map((fiscalYear) => {
    const year = data.document.years[String(fiscalYear)];
    return [
      fiscalYearLabel(fiscalYear),
      year.enrollment.toLocaleString("en-US"),
      formatDollars(year.revenue.total),
      formatDollars(year.expenditure.total),
      year.per_pupil.current_spending != null
        ? formatDollars(year.per_pupil.current_spending)
        : "—",
    ];
  });
}

export default async function SchoolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = loadSchoolPage(slug);
  if (!data) notFound();

  const fy = fiscalYearLabel(data.latestYear);
  const latest = data.document.years[String(data.latestYear)];

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
          School district ledger
          {data.countyName ? (
            <>
              {" · in "}
              {data.countySlug ? (
                <Link
                  href={`/county/${data.countySlug}/`}
                  className="underline underline-offset-4"
                  style={{ color: GOLD }}
                >
                  {data.countyName} County
                </Link>
              ) : (
                `${data.countyName} County`
              )}
            </>
          ) : null}
        </p>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight"
          style={{ color: SPRUCE }}
        >
          {data.displayName}
        </h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed">
          School districts levy their own property tax and ESPLOST on top of
          county and city taxes — for most residents, the largest single line
          on the property tax bill.
        </p>

        <section
          aria-label={`Headline figures, ${fy}`}
          className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4"
        >
          <StatTile
            label={`${fy} enrollment`}
            value={latest.enrollment.toLocaleString("en-US")}
            detail="Fall membership"
          />
          <StatTile
            label="Per-pupil spending"
            value={
              latest.per_pupil.current_spending != null
                ? formatDollars(latest.per_pupil.current_spending)
                : "—"
            }
            detail="Current spending per student"
          />
          <StatTile
            label={`${fy} revenues`}
            value={formatCompactDollars(latest.revenue.total)}
            detail="All sources"
          />
          <StatTile
            label={`${fy} spending`}
            value={formatCompactDollars(latest.expenditure.total)}
            detail="All funds"
          />
        </section>

        {data.gadoe ? (
          <section
            aria-label={`Current-year figures, ${fiscalYearLabel(data.gadoe.fiscalYear)}, from GaDOE`}
            className="mt-14"
          >
            <SectionHeading>
              Ahead of the survey — {fiscalYearLabel(data.gadoe.fiscalYear)}
            </SectionHeading>
            <p className="mt-3 max-w-prose text-sm leading-relaxed">
              The Census survey behind the rest of this page runs about 18
              months behind, but the state&apos;s own collection already
              covers {fiscalYearLabel(data.gadoe.fiscalYear)}: the district
              reported {data.gadoe.year.fte.toLocaleString("en-US")} students
              (QBE full-time equivalents) and{" "}
              {formatCompactDollars(data.gadoe.year.revenue.total)} in
              operating revenue
              {data.gadoe.year.per_fte.total != null
                ? ` — ${formatDollars(data.gadoe.year.per_fte.total)} per student`
                : ""}
              . These figures exclude capital-projects and debt-service
              funds, so they run below the all-funds Census totals above.
            </p>
            <ShareTable
              caption={`${data.displayName} ${fiscalYearLabel(data.gadoe.fiscalYear)} operating revenue by source, from GaDOE's current-year collection`}
              rows={[
                { label: "Local revenue", amount: data.gadoe.year.revenue.local },
                { label: "State aid", amount: data.gadoe.year.revenue.state },
                { label: "Federal aid", amount: data.gadoe.year.revenue.federal },
              ]}
              total={data.gadoe.year.revenue.total}
              totalLabel="Total operating revenue"
            />
            <p
              className="mt-2 max-w-prose text-xs leading-relaxed"
              style={{ color: MUTED }}
            >
              {data.gadoe.note}
            </p>
          </section>
        ) : null}

        <section aria-label={`Where ${fy} money came from`} className="mt-14">
          <SectionHeading>Where the money came from</SectionHeading>
          <ShareTable
            caption={`${data.displayName} ${fy} revenue by source`}
            rows={revenueRows(latest)}
            total={latest.revenue.total}
            totalLabel="Total revenue"
          />
        </section>

        <section aria-label={`Where ${fy} money went`} className="mt-14">
          <SectionHeading>Where the money went</SectionHeading>
          <ShareTable
            caption={`${data.displayName} ${fy} spending by function`}
            rows={spendingRows(latest)}
            total={latest.expenditure.total}
            totalLabel="Total spending"
          />
        </section>

        <section aria-label="Debt" className="mt-14">
          <SectionHeading>Debt</SectionHeading>
          <DataTable
            caption={`${data.displayName} debt, ${fy}`}
            columns={["Owed at year end", "Borrowed", "Repaid"]}
            rows={[[
              formatDollars(latest.debt.outstanding),
              formatDollars(latest.debt.issued),
              formatDollars(latest.debt.retired),
            ]]}
          />
        </section>

        <section aria-label="Trends" className="mt-14">
          <SectionHeading>Year over year</SectionHeading>
          <DataTable
            caption={`${data.displayName} enrollment, revenues, spending, and per-pupil spending by fiscal year`}
            columns={[
              "Fiscal year",
              "Enrollment",
              "Revenues",
              "Spending",
              "Per-pupil",
            ]}
            rows={trendsRows(data)}
          />
        </section>

        <footer className="mt-14">
          <div className="border-t pt-3" style={{ borderColor: INK }}>
            <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
              {data.provenance}
            </p>
          </div>
          <p className="mt-8">
            <Link
              href="/schools/"
              className="font-mono text-xs uppercase tracking-widest underline underline-offset-4"
              style={{ color: SPRUCE }}
            >
              ← All school district ledgers
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
