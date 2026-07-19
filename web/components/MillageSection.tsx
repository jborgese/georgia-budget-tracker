import { formatCompactDollars, formatDollars } from "@/lib/format";
import { INK, MUTED, RULE, SPRUCE } from "@/lib/theme";
import type { MillageCountyEntry } from "@/lib/types";
import { describeTaxingDistrict, MILLAGE_RATE_NOTE } from "@/lib/glossary";
import { InfoTip } from "./InfoTip";

function formatMills(rate: number | null): string {
  return rate != null ? rate.toFixed(3) : "not reported";
}

export function MillageSection({
  millage,
  taxYears,
  countyName,
}: {
  millage: MillageCountyEntry | null;
  taxYears: number[];
  countyName: string;
}) {
  if (!millage) return null;
  const latestYear = String(taxYears.at(-1));
  const rows = millage.districts.filter((district) => {
    const year = district.years[latestYear];
    return (
      year &&
      (year.millage_mo != null || year.millage_bond != null ||
        year.tax_mo || year.tax_bond)
    );
  });
  if (!rows.length) return null;
  const total = millage.county_total[latestYear];

  return (
    <section aria-label={`Property tax rates, ${latestYear}`} className="mt-14">
      <div className="border-t pb-1 pt-3" style={{ borderColor: INK }}>
        <h2
          className="font-mono text-xs uppercase tracking-widest"
          style={{ color: SPRUCE }}
        >
          Property tax rates in {countyName} County
        </h2>
      </div>
      <p className="mt-3 max-w-prose text-sm leading-relaxed">
        Every taxing district that levies on {countyName} County property, as
        compiled in the state&apos;s {latestYear} tax digest. A property owner
        pays the sum of the rates that apply where the property sits.
        <InfoTip text={MILLAGE_RATE_NOTE} subject="millage rates" />
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm" style={{ color: INK }}>
          <caption className="sr-only">
            {countyName} County taxing districts, {latestYear}: maintenance and
            operations rate, bond rate, and total levy in mills and dollars
          </caption>
          <thead>
            <tr
              className="border-t font-mono text-xs uppercase tracking-widest"
              style={{ borderColor: INK, color: MUTED }}
            >
              <th scope="col" className="py-2 pr-4 text-left font-normal">
                Taxing district
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                M&amp;O rate (mills)
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                Bond rate
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                {latestYear} levy
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((district) => {
              const year = district.years[latestYear];
              const levy = (year.tax_mo ?? 0) + (year.tax_bond ?? 0);
              return (
                <tr
                  key={`${district.code}-${district.district}`}
                  className="border-t"
                  style={{ borderColor: RULE }}
                >
                  <td className="py-1.5 pr-4">
                    {district.district}
                    {describeTaxingDistrict(district.district) ? (
                      <InfoTip
                        text={describeTaxingDistrict(district.district) as string}
                        subject={district.district}
                      />
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                    {formatMills(year.millage_mo)}
                  </td>
                  <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
                    {formatMills(year.millage_bond)}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {levy ? formatDollars(levy) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t" style={{ borderColor: INK }} />
      </div>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: MUTED }}>
        {total?.assessed_mo != null ? (
          <>
            Countywide taxable value (M&amp;O digest):{" "}
            {formatCompactDollars(total.assessed_mo)}
            {total.parcels != null
              ? ` across ${total.parcels.toLocaleString("en-US")} parcels. `
              : ". "}
          </>
        ) : null}
        City and county rates apply only inside their boundaries; special
        district rates apply only in the areas they serve. From the DOR
        consolidated digest as compiled by the state — DOR directs readers to
        county tax commissioners for authoritative figures. A rate shown as
        &ldquo;not reported&rdquo; is missing from the state compilation, not
        necessarily zero.
      </p>
    </section>
  );
}
