import Link from "next/link";
import { INK, MUTED, RULE, SPRUCE } from "@/lib/theme";
import { LEDGER_DATA_GAPS } from "@/lib/dataGaps";
import { WarningTip } from "./WarningTip";

export function DataGapsSection({ entityLabel }: { entityLabel: string }) {
  return (
    <section aria-label="What is not in this ledger" className="mt-14">
      <div className="border-t pb-1 pt-3" style={{ borderColor: INK }}>
        <h2
          className="font-mono text-xs uppercase tracking-widest"
          style={{ color: SPRUCE }}
        >
          Not in this ledger
        </h2>
      </div>
      <p className="mt-3 max-w-prose text-sm leading-relaxed">
        A resident of {entityLabel} also pays into governments and districts
        that publish separately — or not at all. Each entry explains why it is
        missing.
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {LEDGER_DATA_GAPS.map((gap) => (
          <li
            key={gap.id}
            className="border-t pt-2"
            style={{ borderColor: RULE }}
          >
            {gap.href ? (
              <Link
                href={gap.href}
                className="underline underline-offset-4"
                style={{ color: SPRUCE }}
              >
                {gap.title}
              </Link>
            ) : (
              gap.title
            )}
            <WarningTip text={gap.explanation} subject={gap.title} />
            <span className="ml-2 text-xs" style={{ color: MUTED }}>
              {gap.href ? "published separately" : "no public machine-readable source"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
