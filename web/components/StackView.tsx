"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { describeTaxingDistrict, MILLAGE_RATE_NOTE } from "@/lib/glossary";
import { GOLD, INK, MUTED, PAPER, RULE, SPRUCE } from "@/lib/theme";
import type { StackData, StackLine, StackRate } from "@/lib/stack";
import { InfoTip } from "./InfoTip";
import { WarningTip } from "./WarningTip";

const UNINCORPORATED = "__unincorporated";

const SPECIALS_WARNING =
  "Sub-county districts — fire, hospital, improvement, and bond levies — " +
  "apply only inside their own boundaries, which this page cannot resolve " +
  "to an address. They are left out of the combined rate unless you add " +
  "the ones that apply where you live.";

function formatMills(value: number | null): string {
  return value != null ? value.toFixed(3) : "not reported";
}

function rateTotal(rate: StackRate | null): number | null {
  if (!rate || (rate.mo == null && rate.bond == null)) return null;
  return (rate.mo ?? 0) + (rate.bond ?? 0);
}

function LineLabel({ line }: { line: StackLine }) {
  return (
    <>
      {line.href ? (
        <Link
          href={line.href}
          className="underline underline-offset-4"
          style={{ color: SPRUCE }}
        >
          {line.label}
        </Link>
      ) : (
        line.label
      )}
      {line.context ? (
        <span className="mt-0.5 block text-xs" style={{ color: MUTED }}>
          {line.context}
        </span>
      ) : null}
    </>
  );
}

function RateCells({ rate }: { rate: StackRate | null }) {
  const total = rateTotal(rate);
  return (
    <>
      <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
        {formatMills(rate?.mo ?? null)}
      </td>
      <td className="py-1.5 pr-4 text-right font-mono tabular-nums">
        {formatMills(rate?.bond ?? null)}
      </td>
      <td className="py-1.5 text-right font-mono tabular-nums">
        {total != null ? total.toFixed(3) : "—"}
      </td>
    </>
  );
}

export function StackView({ data }: { data: StackData }) {
  const selectId = useId();
  const [selectedKey, setSelectedKey] = useState(UNINCORPORATED);
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());

  const selectedCity =
    data.kind === "county"
      ? (data.cities.find((city) => city.key === selectedKey) ?? null)
      : null;

  const governmentRate =
    data.kind === "consolidated"
      ? (data.government.incRate ?? data.government.unincRate)
      : selectedCity
        ? (selectedCity.countyRate ?? data.government.incRate)
        : data.government.unincRate;

  const governmentLine: StackLine = {
    label: data.government.label,
    district: "",
    href: data.government.href,
    rate: governmentRate ?? { mo: null, bond: null },
    context: data.government.context,
  };
  const schoolLine = selectedCity?.school ?? data.countySchool;
  const lines = [
    governmentLine,
    ...(selectedCity ? [selectedCity.city] : []),
    schoolLine,
  ];

  const addedSpecials = data.specials.filter((special) =>
    added.has(special.district),
  );
  const totals = [
    ...lines.map((line) => rateTotal(line.rate)),
    ...addedSpecials.map((special) => rateTotal(special.rate)),
  ];
  const combined = totals.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const hasUnreported = totals.some((value) => value == null);
  const marketShare = (combined * 0.04).toFixed(2);
  const governmentVaries =
    data.kind === "consolidated" &&
    data.government.incRate == null &&
    data.government.unincRate == null;
  const ratioNote = [
    ...lines.map((line) => line.district),
    ...addedSpecials.map((special) => special.district),
  ].some((district) => /\d+%/.test(district));

  return (
    <div>
      {data.kind === "county" ? (
        <div className="mt-8">
          <label
            htmlFor={selectId}
            className="block font-mono text-xs uppercase tracking-widest"
            style={{ color: MUTED }}
          >
            Where in {data.countyName} County?
          </label>
          <select
            id={selectId}
            value={selectedKey}
            onChange={(event) => setSelectedKey(event.target.value)}
            className="mt-1 border px-2 py-1 font-mono text-xs"
            style={{ borderColor: RULE, backgroundColor: PAPER, color: INK }}
          >
            <option value={UNINCORPORATED}>Unincorporated (no city)</option>
            {data.cities.map((city) => (
              <option key={city.key} value={city.key}>
                {city.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="mt-8 max-w-prose text-sm leading-relaxed">
          {data.government.label.replace(/ consolidated government$/, "")} is
          a consolidated government: one levy covers both county and
          municipal services, so there is no separate city line.
        </p>
      )}

      <section
        aria-label={`Combined property tax rate, ${data.taxYear}`}
        aria-live="polite"
        className="mt-8"
      >
        <p
          className="font-mono text-xs uppercase tracking-widest"
          style={{ color: MUTED }}
        >
          Combined rate, tax year {data.taxYear}
        </p>
        <p
          className="mt-1 font-mono text-4xl tabular-nums"
          style={{ color: SPRUCE }}
        >
          {combined.toFixed(3)}
          <span className="ml-2 text-base" style={{ color: MUTED }}>
            mills{hasUnreported ? "*" : ""}
          </span>
        </p>
        <p className="mt-1 text-sm" style={{ color: INK }}>
          ≈ {marketShare}% of market value per year
          <InfoTip text={MILLAGE_RATE_NOTE} subject="millage rates" />
        </p>
      </section>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm" style={{ color: INK }}>
          <caption className="sr-only">
            Property tax rates stacked on the selected address in{" "}
            {data.countyName} County, {data.taxYear}: maintenance and
            operations rate, bond rate, and line total in mills
          </caption>
          <thead>
            <tr
              className="border-t font-mono text-xs uppercase tracking-widest"
              style={{ borderColor: INK, color: MUTED }}
            >
              <th scope="col" className="py-2 pr-4 text-left font-normal">
                Government
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                M&amp;O (mills)
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                Bond
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Line total
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr
                key={line.label}
                className="border-t"
                style={{ borderColor: RULE }}
              >
                <td className="py-1.5 pr-4">
                  <LineLabel line={line} />
                  {line === governmentLine && governmentVaries ? (
                    <span className="mt-0.5 block text-xs" style={{ color: MUTED }}>
                      rate varies by service district — see the list below
                    </span>
                  ) : null}
                </td>
                <RateCells rate={line.rate} />
              </tr>
            ))}
            {addedSpecials.map((special) => (
              <tr
                key={special.district}
                className="border-t"
                style={{ borderColor: RULE }}
              >
                <td className="py-1.5 pr-4">{special.district}</td>
                <RateCells rate={special.rate} />
              </tr>
            ))}
            <tr className="border-t font-semibold" style={{ borderColor: INK }}>
              <td className="py-2 pr-4">Combined</td>
              <td className="py-2 pr-4" />
              <td className="py-2 pr-4" />
              <td className="py-2 text-right font-mono tabular-nums">
                {combined.toFixed(3)}
                {hasUnreported ? "*" : ""}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="border-t" style={{ borderColor: INK }} />
      </div>

      {hasUnreported ? (
        <p className="mt-2 text-xs leading-relaxed" style={{ color: MUTED }}>
          * A rate missing from the state compilation is shown as &ldquo;not
          reported&rdquo; and is left out of the combined rate — it is not
          necessarily zero.
        </p>
      ) : null}
      {ratioNote ? (
        <p className="mt-2 text-xs leading-relaxed" style={{ color: MUTED }}>
          A percentage in a district&apos;s name is that digest&apos;s
          assessment ratio, as filed. Most Georgia digests assess at 40% of
          market value, which the ≈% figure assumes.
        </p>
      ) : null}
      <p className="mt-2 text-xs leading-relaxed" style={{ color: MUTED }}>
        The State of Georgia levies no property tax — its statewide rate was
        phased out after 2015. The ≈% figure is before homestead and other
        exemptions.
      </p>

      {data.specials.length ? (
        <section
          aria-label="Special district rates that may also apply"
          className="mt-10"
        >
          <h2
            className="font-mono text-xs uppercase tracking-widest"
            style={{ color: GOLD }}
          >
            May also apply where you live
            <WarningTip text={SPECIALS_WARNING} subject="special districts" />
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm" style={{ color: INK }}>
              <caption className="sr-only">
                Special taxing districts in {data.countyName} County,{" "}
                {data.taxYear}, each with a checkbox to add it to the
                combined rate
              </caption>
              <thead>
                <tr
                  className="border-t font-mono text-xs uppercase tracking-widest"
                  style={{ borderColor: INK, color: MUTED }}
                >
                  <th scope="col" className="py-2 pr-3 text-left font-normal">
                    <span aria-hidden="true">Add</span>
                    <span className="sr-only">Add to combined rate</span>
                  </th>
                  <th scope="col" className="py-2 pr-4 text-left font-normal">
                    Taxing district
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">
                    M&amp;O (mills)
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">
                    Bond
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Line total
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.specials.map((special) => {
                  const note = describeTaxingDistrict(special.district);
                  return (
                    <tr
                      key={special.district}
                      className="border-t"
                      style={{ borderColor: RULE }}
                    >
                      <td className="py-1.5 pr-3">
                        <input
                          type="checkbox"
                          checked={added.has(special.district)}
                          aria-label={`Add ${special.district} to the combined rate`}
                          onChange={(event) =>
                            setAdded((current) => {
                              const next = new Set(current);
                              if (event.target.checked) {
                                next.add(special.district);
                              } else next.delete(special.district);
                              return next;
                            })
                          }
                          style={{ accentColor: SPRUCE }}
                        />
                      </td>
                      <td className="py-1.5 pr-4">
                        {special.href ? (
                          <Link
                            href={special.href}
                            className="underline underline-offset-4"
                            style={{ color: SPRUCE }}
                          >
                            {special.district}
                          </Link>
                        ) : (
                          special.district
                        )}
                        {note ? (
                          <InfoTip text={note} subject={special.district} />
                        ) : null}
                      </td>
                      <RateCells rate={special.rate} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t" style={{ borderColor: INK }} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
