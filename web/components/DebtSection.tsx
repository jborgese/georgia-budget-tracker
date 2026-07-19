import { fiscalYearLabel, formatDollars } from "@/lib/format";
import { INK, MUTED, RULE, SPRUCE } from "@/lib/theme";
import type { CountyDocument } from "@/lib/types";
import { describeDebtType } from "@/lib/glossary";
import { InfoTip } from "./InfoTip";

const MEASURE_FIELDS: Record<string, keyof DebtTypeRow> = {
  "Ending Amount Outstanding": "outstanding",
  "New Issued Amount": "issued",
  "Amount Retired": "retired",
  "Interest Paid": "interest",
};

interface DebtTypeRow {
  outstanding: number;
  issued: number;
  retired: number;
  interest: number;
}

function debtRows(
  breakdown: CountyDocument["breakdown"],
  year: string,
): Map<string, DebtTypeRow> {
  const types = new Map<string, DebtTypeRow>();
  for (const row of breakdown) {
    if (row.section !== "debt" || row.depth !== 2) continue;
    const suffix = Object.keys(MEASURE_FIELDS).find((candidate) =>
      row.classification.endsWith(candidate),
    );
    if (!suffix) continue;
    const debtType = row.classification.slice(0, -suffix.length).trim();
    const entry = types.get(debtType) ?? {
      outstanding: 0,
      issued: 0,
      retired: 0,
      interest: 0,
    };
    entry[MEASURE_FIELDS[suffix]] = row.amounts[year] ?? 0;
    types.set(debtType, entry);
  }
  return types;
}

function hasActivity(row: DebtTypeRow): boolean {
  return (
    row.outstanding !== 0 || row.issued !== 0 || row.retired !== 0 ||
    row.interest !== 0
  );
}

export function DebtSection({
  breakdown,
  latestFiledYear,
  entityLabel,
}: {
  breakdown: CountyDocument["breakdown"];
  latestFiledYear: number;
  entityLabel: string;
}) {
  const fy = fiscalYearLabel(latestFiledYear);
  const rows = [...debtRows(breakdown, String(latestFiledYear))].filter(
    ([, row]) => hasActivity(row),
  );
  const total = rows.reduce(
    (sum, [, row]) => ({
      outstanding: sum.outstanding + row.outstanding,
      issued: sum.issued + row.issued,
      retired: sum.retired + row.retired,
      interest: sum.interest + row.interest,
    }),
    { outstanding: 0, issued: 0, retired: 0, interest: 0 },
  );

  return (
    <section aria-label={`Debt, ${fy}`} className="mt-14">
      <div className="border-t pb-1 pt-3" style={{ borderColor: INK }}>
        <h2
          className="font-mono text-xs uppercase tracking-widest"
          style={{ color: SPRUCE }}
        >
          Debt
        </h2>
      </div>
      {rows.length ? (
        <>
          <p className="mt-3 max-w-prose text-sm leading-relaxed">
            What {entityLabel} owed at the end of {fy}, and what it borrowed,
            repaid, and paid in interest during the year, as filed.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm" style={{ color: INK }}>
              <caption className="sr-only">
                {entityLabel} debt by type, {fy}: outstanding at year end,
                issued, retired, and interest paid
              </caption>
              <thead>
                <tr
                  className="border-t font-mono text-xs uppercase tracking-widest"
                  style={{ borderColor: INK, color: MUTED }}
                >
                  <th scope="col" className="py-2 pr-4 text-left font-normal">
                    Debt type
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">
                    Owed at year end
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">
                    Borrowed
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">
                    Repaid
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Interest paid
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([debtType, row]) => (
                  <tr
                    key={debtType}
                    className="border-t"
                    style={{ borderColor: RULE }}
                  >
                    <td className="py-1.5 pr-4">
                      {debtType}
                      {describeDebtType(debtType) ? (
                        <InfoTip
                          text={describeDebtType(debtType) as string}
                          subject={debtType}
                        />
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                      {formatDollars(row.outstanding)}
                    </td>
                    <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                      {formatDollars(row.issued)}
                    </td>
                    <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                      {formatDollars(row.retired)}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {formatDollars(row.interest)}
                    </td>
                  </tr>
                ))}
                {rows.length > 1 ? (
                  <tr className="border-t font-semibold" style={{ borderColor: INK }}>
                    <td className="py-1.5 pr-4">All debt types</td>
                    <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                      {formatDollars(total.outstanding)}
                    </td>
                    <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                      {formatDollars(total.issued)}
                    </td>
                    <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                      {formatDollars(total.retired)}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {formatDollars(total.interest)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <div className="border-t" style={{ borderColor: INK }} />
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: MUTED }}>
            From RLGF Part XI, as filed. Outstanding balances are a snapshot at
            fiscal year end; borrowed, repaid, and interest are activity during
            the year. Filings occasionally contain inconsistencies, which are
            shown unaltered.
          </p>
        </>
      ) : (
        <p className="mt-3 max-w-prose text-sm leading-relaxed">
          {entityLabel} reported no debt outstanding, issued, or retired for {fy}.
        </p>
      )}
    </section>
  );
}
