import type { Metadata } from "next";
import {
  CATEGORY_LABELS,
  loadCrosswalk,
  loadManifest,
  loadSourceRegistry,
} from "@/lib/data";
import { GOLD, INK, MUTED, PAPER, RULE, SPRUCE } from "@/lib/theme";

export const metadata: Metadata = {
  title: "About & methodology",
  description:
    "How the Georgia State Budget Tracker works: every data source and its update cadence, the rolling RLGF filing caveat, and every category-crosswalk decision the pipeline makes.",
};

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-14 border-t pb-2 pt-3" style={{ borderColor: INK }}>
      <h2
        className="font-mono text-xs uppercase tracking-widest"
        style={{ color: SPRUCE }}
      >
        {children}
      </h2>
    </div>
  );
}

function MappingTable({
  caption,
  fromLabel,
  mapping,
}: {
  caption: string;
  fromLabel: string;
  mapping: Record<string, string>;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm" style={{ color: INK }}>
        <caption
          className="pb-2 text-left font-mono text-xs uppercase tracking-widest"
          style={{ color: MUTED }}
        >
          {caption}
        </caption>
        <thead>
          <tr
            className="border-t font-mono text-xs uppercase tracking-widest"
            style={{ borderColor: INK, color: MUTED }}
          >
            <th scope="col" className="py-2 pr-4 text-left font-normal">
              {fromLabel}
            </th>
            <th scope="col" className="py-2 text-left font-normal">
              Category
            </th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(mapping).map(([from, category]) => (
            <tr key={from} className="border-t" style={{ borderColor: RULE }}>
              <td className="py-1.5 pr-4">{from}</td>
              <td className="py-1.5 font-mono text-xs">
                {CATEGORY_LABELS[category] ?? category}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t" style={{ borderColor: INK }} />
    </div>
  );
}

export default function AboutPage() {
  const sources = loadSourceRegistry();
  const crosswalk = loadCrosswalk();
  const manifest = loadManifest();
  const reconciliation = manifest.normalized.reconciliation;

  return (
    <main
      className="flex-1 px-6 py-16 sm:py-20"
      style={{ backgroundColor: PAPER, color: INK }}
    >
      <div className="mx-auto w-full max-w-3xl">
        <p
          className="font-mono text-xs uppercase tracking-[0.25em]"
          style={{ color: GOLD }}
        >
          Methodology
        </p>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight"
          style={{ color: SPRUCE }}
        >
          How this ledger is kept
        </h1>
        <p className="mt-6 max-w-prose text-base leading-relaxed">
          Every number on this site comes from a public record, is transformed
          by open-source code, and is committed to a public git repository — so
          the revision history of the data is itself the audit trail. This page
          documents the sources, the update cadence, the caveats, and every
          judgment call the pipeline makes.
        </p>

        <SectionHead>The sources</SectionHead>
        <ul>
          {sources.map((source) => (
            <li
              key={source.id}
              className="border-t py-3"
              style={{ borderColor: RULE }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <a
                  href={source.url}
                  className="text-sm underline underline-offset-4"
                >
                  {source.name}
                </a>
                <span
                  className="shrink-0 font-mono text-xs"
                  style={{ color: GOLD }}
                >
                  {source.cadence}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: MUTED }}>
                {source.provides}
                {source.note ? ` — ${source.note}` : ""}
              </p>
            </li>
          ))}
        </ul>
        <div className="border-t" style={{ borderColor: INK }} />

        <SectionHead>How updates happen</SectionHead>
        <p className="max-w-prose text-sm leading-relaxed">
          A scheduled job checks every source once a day using cheap
          fingerprints — HTTP validators where the server provides them, a
          content hash otherwise, and for Open Georgia the list of fiscal years
          its search apps offer. Only when a source actually changes does the
          full pipeline re-download it, re-run the transform, validate the
          result against the data contract, and commit the refreshed data.
          Government finance data publishes on annual schedules, so most days
          nothing changes and nothing is committed.
        </p>

        <SectionHead>The rolling RLGF caveat</SectionHead>
        <p className="max-w-prose text-sm leading-relaxed">
          County figures come from the Report of Local Government Finances,
          a filing each government owes the Department of Community Affairs
          within six months of its own fiscal-year close. Because fiscal years
          end on different dates and filings arrive late, the most recent years
          are always incomplete: a county that has not yet filed simply has no
          data for that year. The upstream workbook represents those county-years
          as rows of zeros; this pipeline treats an all-zero year as{" "}
          <em>no filing</em> — a county government cannot truly collect and
          spend nothing — and shows it as an explicit gap, never as $0. The
          eight consolidated city-county governments (Athens-Clarke,
          Augusta-Richmond, Columbus-Muscogee, Macon-Bibb, and four others)
          file under a separate government type and are not in the county
          dataset; they appear as &ldquo;no data&rdquo; rather than being
          silently dropped.
        </p>

        <SectionHead>The data contract</SectionHead>
        <p className="max-w-prose text-sm leading-relaxed">
          Every transform output is validated before it can be committed: all
          159 counties must be present or explicitly accounted for, category
          totals must reconcile with the totals printed in the source documents
          (currently {reconciliation.totals_checked.toLocaleString()} entity-year
          totals reconcile with a maximum deviation of{" "}
          {(reconciliation.max_relative_deviation * 100).toFixed(4)}%), and
          negative amounts are rejected wherever they are impossible — state
          appropriations and county tax revenues, in particular. Where a source
          document is internally inconsistent — a parent line that does not
          equal the sum of its children, or a grand total that excludes a line
          the document itself prints — the gap is carried as an explicit
          &ldquo;unallocated&rdquo; or &ldquo;reconciliation adjustment&rdquo;
          row rather than silently absorbed.
        </p>

        <SectionHead>The category crosswalk</SectionHead>
        <p className="max-w-prose text-sm leading-relaxed">
          County filings and the state budget classify money differently, so
          the pipeline maps both onto one shared category vocabulary. The
          tables below are generated from the pipeline&apos;s own crosswalk
          file, so they cannot drift from what the code actually does. The
          revenue and expenditure vocabularies are deliberately disjoint (an
          &ldquo;enterprise&rdquo; revenue and an &ldquo;enterprise&rdquo;
          expense get different category names) so that every category
          unambiguously belongs to one side of the ledger.
        </p>
        <ul className="mt-4 max-w-prose list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            The Department of Transportation maps to{" "}
            <em>public works &amp; transportation</em> so state spending lines up
            with the county filings&apos; &ldquo;Public Works&rdquo; section,
            which includes roads.
          </li>
          <li>
            County capital expenditures are mapped by government function
            (a jail is public safety whether it is an operating or a capital
            dollar), not kept as a separate capital category.
          </li>
          <li>
            The retirement systems (Teachers, Employees&apos;), the Department
            of Revenue, and the regulatory commissions map to{" "}
            <em>general government</em>.
          </li>
          <li>
            The Georgia State Financing and Investment Commission maps to{" "}
            <em>other</em> — it finances capital across every function — while
            the General Obligation Debt Sinking Fund is <em>debt service</em>.
          </li>
          <li>
            Lottery proceeds, tobacco settlement funds, and the small trust
            funds map to <em>other revenue</em>; federal revenue is{" "}
            <em>intergovernmental</em>.
          </li>
          <li>
            Open Georgia&apos;s vendor payments are covered on this site but
            excluded from the cross-level category table: they are cash-basis
            payments that would double-count the budgetary expenditures the
            OPB report already provides.
          </li>
          <li>
            Per-capita figures divide by the US Census July&nbsp;1 population
            estimate of the fiscal year&apos;s calendar year.
          </li>
          <li>
            State figures carry their basis: reported or estimated for
            revenues; actual, amended budget, or budget for expenditures.
            Charts mark estimated and budgeted years explicitly.
          </li>
        </ul>

        <MappingTable
          caption="RLGF county revenues → category"
          fromLabel="RLGF classification"
          mapping={crosswalk.rlgf.revenues}
        />
        <MappingTable
          caption="RLGF county operating expenditures → category"
          fromLabel="RLGF classification"
          mapping={crosswalk.rlgf.operating}
        />
        <MappingTable
          caption="RLGF county capital expenditures → category (matched by prefix)"
          fromLabel="RLGF classification"
          mapping={crosswalk.rlgf.capital}
        />
        <MappingTable
          caption="OPB revenue groups → category"
          fromLabel="Budget report group"
          mapping={crosswalk.opb.revenue_groups}
        />
        <MappingTable
          caption="OPB agencies → category"
          fromLabel="Department / agency"
          mapping={crosswalk.opb.agencies}
        />

        <SectionHead>Corrections</SectionHead>
        <p className="max-w-prose text-sm leading-relaxed">
          Spotted a number that looks wrong, or a crosswalk call you would make
          differently? The entire pipeline — source registry, transforms,
          contract, and this page&apos;s crosswalk tables — is open source
          under the MIT license. Open an issue or a pull request.
        </p>
      </div>
    </main>
  );
}
