import { fiscalYearLabel, formatDollars } from "@/lib/format";
import { INK, MUTED, RULE, SPRUCE } from "@/lib/theme";
import type { SalesTaxLine } from "@/lib/types";
import { describeSalesTax } from "@/lib/glossary";
import { InfoTip } from "./InfoTip";

export function SalesTaxSection({
  lines,
  latestFiledYear,
  entityLabel,
  revenueTotal,
}: {
  lines: SalesTaxLine[];
  latestFiledYear: number;
  entityLabel: string;
  revenueTotal: number | null;
}) {
  if (!lines.length) return null;
  const fy = fiscalYearLabel(latestFiledYear);
  const year = String(latestFiledYear);

  return (
    <section aria-label={`Sales tax receipts, ${fy}`} className="mt-14">
      <div className="border-t pb-1 pt-3" style={{ borderColor: INK }}>
        <h2
          className="font-mono text-xs uppercase tracking-widest"
          style={{ color: SPRUCE }}
        >
          Sales tax layers
        </h2>
      </div>
      <p className="mt-3 max-w-prose text-sm leading-relaxed">
        Georgia layers several optional sales taxes on top of the state rate,
        each approved and spent separately. These are the sales-tax receipts
        {" "}{entityLabel} reported for {fy}.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm" style={{ color: INK }}>
          <caption className="sr-only">
            {entityLabel} sales-tax receipts by tax, {fy}
          </caption>
          <thead>
            <tr
              className="border-t font-mono text-xs uppercase tracking-widest"
              style={{ borderColor: INK, color: MUTED }}
            >
              <th scope="col" className="py-2 pr-4 text-left font-normal">
                Tax
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                {fy} receipts
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Share of revenue
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const amount = line.amounts[year] ?? null;
              const share =
                amount != null && revenueTotal
                  ? (amount / revenueTotal) * 100
                  : null;
              return (
                <tr
                  key={line.classification}
                  className="border-t"
                  style={{ borderColor: RULE }}
                >
                  <td className="py-1.5 pr-4">
                    {line.classification}
                    {describeSalesTax(line.classification) ? (
                      <InfoTip
                        text={describeSalesTax(line.classification) as string}
                        subject={line.classification}
                      />
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                    {amount != null ? formatDollars(amount) : "—"}
                  </td>
                  <td
                    className="py-1.5 text-right font-mono tabular-nums text-xs"
                    style={{ color: MUTED }}
                  >
                    {share != null ? `${share.toFixed(1)}%` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t" style={{ borderColor: INK }} />
      </div>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: MUTED }}>
        Receipts as filed in the RLGF revenue schedule. A tax that is not
        listed was not reported by this government in any year of the dataset.
        School districts&apos; education SPLOST is levied separately and does
        not appear in city or county filings.
      </p>
    </section>
  );
}
