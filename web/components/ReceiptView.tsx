"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { formatDollars } from "@/lib/format";
import {
  categoryNodes,
  consumptionBases,
  incomeTax,
  levelSlices,
  propertyLine,
  salesTax,
  TRANSIT_MIX,
  type ApportionedLayer,
  type FilingStatus,
  type LevelKey,
} from "@/lib/receipt";
import type { ReceiptMixWithBasis, ReceiptPayload } from "@/lib/receiptData";
import { spendingSlices } from "@/lib/spending";
import type { StackLine, StackRate } from "@/lib/stack";
import { RECEIPT_DATA_GAPS } from "@/lib/dataGaps";
import {
  describeSalesLetter,
  RECEIPT_INCOME_NOTE,
  RECEIPT_LOST_SPLIT_NOTE,
  RECEIPT_PROPERTY_NOTE,
  RECEIPT_SALES_NOTE,
} from "@/lib/glossary";
import { GOLD, INK, MUTED, PAPER, RULE, SPRUCE } from "@/lib/theme";
import { LEVEL_COLORS } from "@/lib/receipt";
import { DataTable } from "./DataTable";
import { InfoTip } from "./InfoTip";
import { LevelBar } from "./LevelBar";
import { SpendingPie } from "./SpendingPie";
import { SpendingTable } from "./SpendingTable";
import { WarningTip } from "./WarningTip";

const UNINCORPORATED = "__unincorporated";
const STORAGE_KEY = "ga-receipt-v1";

interface StoredState {
  salary?: string;
  status?: FilingStatus;
  homeValue?: string;
  expanded?: boolean;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function tokenizeLetters(letters: string): string[] {
  return letters.match(/T2|Tf|Ta|[MLESHOTPm]/g) ?? [];
}

interface ReceiptLine {
  label: string;
  sublabel?: string;
  amount: number | null;
  note?: string;
  tip?: { text: string; subject: string };
  href?: string | null;
}

interface Unapportioned {
  label: string;
  amount: number;
  reason: string;
}

export function ReceiptView({ payload }: { payload: ReceiptPayload }) {
  const salaryId = useId();
  const cityId = useId();
  const homeId = useId();
  const statusName = useId();

  const [loaded, setLoaded] = useState(false);
  const [salaryInput, setSalaryInput] = useState("");
  const [status, setStatus] = useState<FilingStatus>("single");
  const [cityKey, setCityKey] = useState(UNINCORPORATED);
  const [expanded, setExpanded] = useState(false);
  const [homeInput, setHomeInput] = useState("");

  // One-shot hydration from localStorage: the statically exported HTML must
  // render the deterministic empty form, so stored values can only be
  // applied after mount — which is exactly a setState-in-effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredState;
        if (typeof parsed.salary === "string") setSalaryInput(parsed.salary);
        if (parsed.status === "single" ||
            parsed.status === "married_filing_jointly") {
          setStatus(parsed.status);
        }
        if (typeof parsed.homeValue === "string") {
          setHomeInput(parsed.homeValue);
        }
        if (typeof parsed.expanded === "boolean") setExpanded(parsed.expanded);
      }
    } catch {
      // Ignore unreadable storage; the form just starts empty.
    }
    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          salary: salaryInput,
          status,
          homeValue: homeInput,
          expanded,
        } satisfies StoredState),
      );
    } catch {
      // Storage full or blocked; nothing to persist.
    }
  }, [loaded, salaryInput, status, homeInput, expanded]);

  const { stack, taxParameters, sales } = payload;
  const salary = parseAmount(salaryInput);
  const homeValue = parseAmount(homeInput);
  const deduction = taxParameters.income_tax.standard_deduction[status];

  const selectedCity =
    stack.kind === "county"
      ? (stack.cities.find((city) => city.key === cityKey) ?? null)
      : null;

  // --- income tax ---------------------------------------------------------
  const income =
    salary != null
      ? incomeTax(salary, status, taxParameters.income_tax)
      : null;

  // --- sales tax (estimate layer) -----------------------------------------
  const jurisdiction = sales
    ? selectedCity
      ? (sales.byCity[selectedCity.key] ?? sales.county)
      : sales.county
    : null;
  const salesEstimate =
    expanded && salary != null && sales && jurisdiction
      ? salesTax(
          consumptionBases(salary, taxParameters.consumption_model),
          jurisdiction,
          sales.stateCents,
        )
      : null;

  // --- property tax (estimate layer) --------------------------------------
  const governmentRate: StackRate | null =
    stack.kind === "consolidated"
      ? (stack.government.incRate ?? stack.government.unincRate)
      : selectedCity
        ? (selectedCity.countyRate ?? stack.government.incRate)
        : stack.government.unincRate;
  const governmentVaries =
    stack.kind === "consolidated" &&
    stack.government.incRate == null &&
    stack.government.unincRate == null;
  const schoolLine: StackLine = selectedCity?.school ?? stack.countySchool;
  const wantsProperty = expanded && homeValue != null;
  const propertyGovernment = wantsProperty
    ? propertyLine(homeValue, governmentRate)
    : null;
  const propertyCity =
    wantsProperty && selectedCity
      ? propertyLine(homeValue, selectedCity.city.rate)
      : null;
  const propertySchool = wantsProperty
    ? propertyLine(homeValue, schoolLine.rate)
    : null;

  // --- apportionment ------------------------------------------------------
  const schoolMix: ReceiptMixWithBasis | null = selectedCity?.school
    ? (payload.citySchoolMixes[selectedCity.key] ?? null)
    : payload.countySchoolMix;
  const cityMix = selectedCity
    ? (payload.cityMixes[selectedCity.key] ?? null)
    : null;
  const governmentLabel =
    stack.kind === "consolidated"
      ? stack.government.label
      : `${payload.countyName} County government`;

  const layers: ApportionedLayer[] = [];
  const unapportioned: Unapportioned[] = [];
  const levels: Partial<Record<LevelKey, number>> = {};

  function addLayer(
    dollars: number | null | undefined,
    mix: ReceiptMixWithBasis | null,
    prefix: string,
    level: LevelKey,
    label: string,
    reason: string,
  ) {
    if (dollars == null || dollars <= 0) return;
    levels[level] = (levels[level] ?? 0) + dollars;
    if (mix) {
      layers.push({ dollars, mix: mix.mix, prefix });
    } else {
      unapportioned.push({ label, amount: dollars, reason });
    }
  }

  if (income != null && income > 0) {
    addLayer(income, payload.stateMix, "State: ", "state",
      "Georgia income tax", "");
  }
  if (salesEstimate) {
    addLayer(salesEstimate.groups.state, payload.stateMix, "State: ",
      "state", "State sales tax", "");
    addLayer(
      salesEstimate.groups.education, schoolMix, "Schools: ", "schools",
      `${schoolLine.label} — ESPLOST`,
      "this district is absent from the Census school-finance survey");
    addLayer(salesEstimate.groups.transit, { fiscalYear: 0,
      mix: TRANSIT_MIX }, "", "transit", "Transit sales taxes", "");
    addLayer(
      salesEstimate.groups.local_shared, payload.localMix, "County: ",
      "shared", "Shared local sales cents",
      "this government has no filed ledger to apportion by");
  }
  if (propertyGovernment) {
    addLayer(propertyGovernment.dollars, payload.localMix, "County: ",
      "county", `${governmentLabel} property tax`,
      "this government has no filed ledger to apportion by");
  }
  if (propertyCity && selectedCity) {
    addLayer(propertyCity.dollars, cityMix, "City: ", "city",
      `${selectedCity.city.label} property tax`,
      "this city has no filed RLGF ledger to apportion by");
  }
  if (propertySchool) {
    addLayer(propertySchool.dollars, schoolMix, "Schools: ", "schools",
      `${schoolLine.label} property tax`,
      "this district is absent from the Census school-finance survey");
  }

  const nodes = categoryNodes(layers);
  const slices = spendingSlices(nodes);
  const apportionedTotal = layers.reduce(
    (sum, layer) => sum + layer.dollars, 0);
  const unapportionedTotal = unapportioned.reduce(
    (sum, entry) => sum + entry.amount, 0);
  const grandTotal = apportionedTotal + unapportionedTotal;

  const countyLevelLabel =
    stack.kind === "consolidated" ? "Consolidated government" : "County";
  const levelRows = levelSlices(levels, { county: countyLevelLabel });

  // --- receipt lines ------------------------------------------------------
  const lines: ReceiptLine[] = [];
  if (salary != null) {
    lines.push({
      label: `Georgia income tax, TY${taxParameters.income_tax.tax_year}`,
      sublabel: `flat ${(taxParameters.income_tax.rate * 100).toFixed(2)}% after the ${formatDollars(deduction)} standard deduction`,
      amount: income,
      note:
        income === 0
          ? `$0 — a ${formatDollars(salary)} salary is below the ${formatDollars(deduction)} standard deduction`
          : undefined,
      tip: { text: RECEIPT_INCOME_NOTE, subject: "the income-tax estimate" },
    });
  }
  if (expanded && salary != null) {
    if (salesEstimate && jurisdiction && sales) {
      lines.push({
        label: `Local & state sales tax — ${jurisdiction.name}`,
        sublabel: `${jurisdiction.total}% rate, ${sales.effectiveFrom} to ${sales.effectiveThrough}`,
        amount: salesEstimate.total,
        tip: { text: RECEIPT_SALES_NOTE, subject: "the sales-tax estimate" },
      });
    } else if (!sales) {
      lines.push({
        label: "Local & state sales tax",
        amount: null,
        note:
          "rates not yet ingested — this layer appears once the quarterly " +
          "DOR rate chart lands in the data pipeline",
      });
    }
  }
  if (wantsProperty) {
    if (governmentVaries) {
      lines.push({
        label: `${governmentLabel} property tax`,
        amount: null,
        note: "rate varies by service district — see the stack for the list",
        href: `/stack/${payload.slug}/`,
      });
    } else {
      lines.push({
        label: `${governmentLabel} property tax`,
        amount: propertyGovernment?.dollars ?? null,
        note:
          propertyGovernment == null
            ? "rate not reported in the digest — excluded, not zero"
            : propertyGovernment.partial
              ? "one of the two rates is not reported — an underestimate"
              : undefined,
        tip: {
          text: RECEIPT_PROPERTY_NOTE,
          subject: "the property-tax estimate",
        },
        href: stack.government.href,
      });
    }
    if (selectedCity) {
      lines.push({
        label: `${selectedCity.city.label} property tax`,
        amount: propertyCity?.dollars ?? null,
        note:
          propertyCity == null
            ? "rate not reported in the digest — excluded, not zero"
            : propertyCity.partial
              ? "one of the two rates is not reported — an underestimate"
              : undefined,
        href: selectedCity.city.href,
      });
    }
    lines.push({
      label: `${schoolLine.label} property tax`,
      amount: propertySchool?.dollars ?? null,
      note:
        propertySchool == null
          ? "rate not reported in the digest — excluded, not zero"
          : propertySchool.partial
            ? "one of the two rates is not reported — an underestimate"
            : undefined,
      href: schoolLine.href,
    });
  }

  const letters = jurisdiction ? tokenizeLetters(jurisdiction.letters) : [];

  return (
    <div>
      {/* ---- inputs ---- */}
      <section aria-label="Your profile" className="mt-8">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <label
              htmlFor={salaryId}
              className="block font-mono text-xs uppercase tracking-widest"
              style={{ color: MUTED }}
            >
              Annual salary
            </label>
            <input
              id={salaryId}
              type="text"
              inputMode="numeric"
              placeholder="$65,000"
              value={salaryInput}
              onChange={(event) => setSalaryInput(event.target.value)}
              className="mt-1 w-36 border px-2 py-1 font-mono text-sm"
              style={{ borderColor: RULE, backgroundColor: PAPER, color: INK }}
            />
          </div>
          <fieldset>
            <legend
              className="font-mono text-xs uppercase tracking-widest"
              style={{ color: MUTED }}
            >
              Filing status
            </legend>
            <div className="mt-1 flex gap-4 text-sm">
              {(
                [
                  ["single", "Single"],
                  ["married_filing_jointly", "Married filing jointly"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={statusName}
                    checked={status === value}
                    onChange={() => setStatus(value)}
                    style={{ accentColor: SPRUCE }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {stack.kind === "county" ? (
            <div>
              <label
                htmlFor={cityId}
                className="block font-mono text-xs uppercase tracking-widest"
                style={{ color: MUTED }}
              >
                Where in {payload.countyName} County?
              </label>
              <select
                id={cityId}
                value={cityKey}
                onChange={(event) => setCityKey(event.target.value)}
                className="mt-1 border px-2 py-1 font-mono text-xs"
                style={{ borderColor: RULE, backgroundColor: PAPER, color: INK }}
              >
                <option value={UNINCORPORATED}>Unincorporated (no city)</option>
                {stack.cities.map((city) => (
                  <option key={city.key} value={city.key}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        {stack.kind === "consolidated" ? (
          <p className="mt-4 max-w-prose text-sm leading-relaxed">
            {stack.government.label.replace(/ consolidated government$/, "")}{" "}
            is a consolidated government: one levy covers both county and
            municipal services, so there is no separate city line.
          </p>
        ) : null}

        <div className="mt-5">
          <label className="flex max-w-prose items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={expanded}
              onChange={(event) => setExpanded(event.target.checked)}
              className="mt-0.5"
              style={{ accentColor: SPRUCE }}
            />
            <span>
              Expand the estimate
              <span className="block text-xs" style={{ color: MUTED }}>
                adds two estimated layers — local sales tax from a
                consumption model, and property tax from your home&apos;s
                value — each flagged where it leans on assumptions
              </span>
            </span>
          </label>
          {expanded ? (
            <div className="mt-3">
              <label
                htmlFor={homeId}
                className="block font-mono text-xs uppercase tracking-widest"
                style={{ color: MUTED }}
              >
                Home market value (optional)
              </label>
              <input
                id={homeId}
                type="text"
                inputMode="numeric"
                placeholder="$300,000"
                value={homeInput}
                onChange={(event) => setHomeInput(event.target.value)}
                className="mt-1 w-36 border px-2 py-1 font-mono text-sm"
                style={{ borderColor: RULE, backgroundColor: PAPER, color: INK }}
              />
              <p className="mt-1 max-w-prose text-xs" style={{ color: MUTED }}>
                Renters can leave this blank — landlords pay property tax on
                rentals, but how much reaches your rent isn&apos;t knowable
                from public data.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {salary == null ? (
        <p className="mt-10 max-w-prose text-sm leading-relaxed">
          Enter a salary to build your receipt. Every figure that follows is
          computed in your browser — nothing you type leaves this page.
        </p>
      ) : (
        <>
          {/* ---- the receipt ---- */}
          <section
            aria-label="Your estimated taxes"
            aria-live="polite"
            className="mt-10"
          >
            <div className="border-t pb-1 pt-3" style={{ borderColor: INK }}>
              <h2
                className="font-mono text-xs uppercase tracking-widest"
                style={{ color: SPRUCE }}
              >
                Your receipt
              </h2>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm" style={{ color: INK }}>
                <caption className="sr-only">
                  Estimated Georgia state and local taxes for the entered
                  salary
                  {expanded ? ", including the expanded estimate layers" : ""}
                </caption>
                <thead>
                  <tr
                    className="border-t font-mono text-xs uppercase tracking-widest"
                    style={{ borderColor: INK, color: MUTED }}
                  >
                    <th scope="col" className="py-2 pr-4 text-left font-normal">
                      Tax
                    </th>
                    <th scope="col" className="py-2 text-right font-normal">
                      Estimated amount
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
                        {line.tip ? (
                          <WarningTip
                            text={line.tip.text}
                            subject={line.tip.subject}
                          />
                        ) : null}
                        {line.sublabel ? (
                          <span
                            className="mt-0.5 block text-xs"
                            style={{ color: MUTED }}
                          >
                            {line.sublabel}
                          </span>
                        ) : null}
                        {line.note ? (
                          <span
                            className="mt-0.5 block text-xs"
                            style={{ color: GOLD }}
                          >
                            {line.note}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-1.5 text-right align-top font-mono tabular-nums">
                        {line.amount != null
                          ? formatDollars(line.amount)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  <tr
                    className="border-t font-semibold"
                    style={{ borderColor: INK }}
                  >
                    <td className="py-2 pr-4">Estimated total</td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {formatDollars(grandTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="border-t" style={{ borderColor: INK }} />
            </div>
            {letters.length && expanded && salesEstimate ? (
              <p className="mt-2 text-xs leading-relaxed" style={{ color: MUTED }}>
                Inside the {jurisdiction?.total}% sales rate:{" "}
                {letters.map((letter, index) => (
                  <span key={`${letter}-${index}`}>
                    {index > 0 ? ", " : ""}
                    <span className="font-mono">{letter}</span>
                    {describeSalesLetter(letter) ? (
                      <InfoTip
                        text={describeSalesLetter(letter) as string}
                        subject={`the ${letter} sales tax`}
                      />
                    ) : null}
                  </span>
                ))}{" "}
                on top of the state&apos;s 4%.
              </p>
            ) : null}
          </section>

          {/* ---- by category ---- */}
          {slices.length ? (
            <section
              aria-label="Your receipt by spending category"
              className="mt-14"
            >
              <div className="border-t pb-1 pt-3" style={{ borderColor: INK }}>
                <h2
                  className="font-mono text-xs uppercase tracking-widest"
                  style={{ color: SPRUCE }}
                >
                  What your dollars buy
                </h2>
              </div>
              <p className="mt-3 max-w-prose text-sm leading-relaxed">
                Each tax dollar above, apportioned by how the government that
                collects it actually spends — state dollars by the state
                budget, local dollars by each government&apos;s own filings.
              </p>
              <SpendingPie
                slices={slices}
                total={apportionedTotal}
                centerLabel="your receipt"
                ariaLabel="Pie chart of your estimated taxes by spending category; exact values are in the table below."
              />
              <SpendingTable
                caption="Your estimated taxes by spending category, expandable to line items"
                slices={slices}
                total={apportionedTotal}
              />
              {unapportioned.length ? (
                <div className="mt-4">
                  {unapportioned.map((entry) => (
                    <p
                      key={entry.label}
                      className="text-xs leading-relaxed"
                      style={{ color: GOLD }}
                    >
                      Not apportioned: {entry.label},{" "}
                      <span className="font-mono">
                        {formatDollars(entry.amount)}
                      </span>{" "}
                      — {entry.reason}. Counted in the total, left out of the
                      chart — never folded into &ldquo;everything else.&rdquo;
                    </p>
                  ))}
                </div>
              ) : null}
              {salesEstimate && payload.localMix ? (
                <p className="mt-3 max-w-prose text-xs leading-relaxed" style={{ color: MUTED }}>
                  {RECEIPT_LOST_SPLIT_NOTE}
                </p>
              ) : null}
            </section>
          ) : null}

          {/* ---- by level ---- */}
          <section
            aria-label="Your receipt by level of government"
            className="mt-14"
          >
            <div className="border-t pb-1 pt-3" style={{ borderColor: INK }}>
              <h2
                className="font-mono text-xs uppercase tracking-widest"
                style={{ color: SPRUCE }}
              >
                Which governments collect
              </h2>
            </div>
            {!expanded ? (
              <div className="mt-3">
                <div
                  role="img"
                  aria-label="All of the default estimate goes to the State of Georgia"
                  className="flex h-8 w-full items-center px-3 font-mono text-xs uppercase tracking-widest"
                  style={{
                    backgroundColor: LEVEL_COLORS.state,
                    color: PAPER,
                  }}
                >
                  State of Georgia — 100%
                </div>
                <p className="mt-2 max-w-prose text-xs leading-relaxed" style={{ color: MUTED }}>
                  The default estimate is income tax only, which is all
                  state. Expand the estimate above to see the local layers —
                  sales and property taxes are where counties, cities, and
                  school districts collect.
                </p>
              </div>
            ) : (
              <div className="mt-3">
                <LevelBar
                  slices={levelRows}
                  ariaLabel="Stacked bar of your estimated taxes by level of government; exact values are in the table below."
                />
                <DataTable
                  caption="Your estimated taxes by level of government"
                  columns={["Level", "Amount", "Share"]}
                  rows={levelRows.map((row) => [
                    row.label,
                    formatDollars(row.amount),
                    `${Math.round(row.share * 100)}%`,
                  ])}
                />
              </div>
            )}
          </section>

          {/* ---- basis notes ---- */}
          <section aria-label="How this is computed" className="mt-14">
            <div className="border-t pb-1 pt-3" style={{ borderColor: INK }}>
              <h2
                className="font-mono text-xs uppercase tracking-widest"
                style={{ color: SPRUCE }}
              >
                Fiscal years, mixed deliberately
              </h2>
            </div>
            <ul className="mt-3 max-w-prose space-y-1.5 text-xs leading-relaxed" style={{ color: MUTED }}>
              <li>
                Income tax uses tax year{" "}
                {taxParameters.income_tax.tax_year} law; its dollars are
                apportioned by the state&apos;s FY
                {payload.stateMix.fiscalYear} actual spending mix.
              </li>
              {expanded && sales ? (
                <li>
                  Sales rates are the DOR chart effective{" "}
                  {sales.effectiveFrom} to {sales.effectiveThrough}; education
                  cents follow the district&apos;s FY
                  {schoolMix?.fiscalYear ?? "—"} Census school-finance mix,
                  and shared local cents follow the county government&apos;s
                  FY{payload.localMix?.fiscalYear ?? "—"} filing.
                </li>
              ) : null}
              {expanded ? (
                <li>
                  Property rates are the {stack.taxYear} state tax digest;
                  dollars are apportioned by each government&apos;s latest
                  filed spending mix
                  {payload.localMix?.staleNote
                    ? ` (${governmentLabel}: ${payload.localMix.staleNote})`
                    : ""}
                  {selectedCity && cityMix?.staleNote
                    ? ` (${selectedCity.city.label}: ${cityMix.staleNote})`
                    : ""}
                  .
                </li>
              ) : null}
              <li>{taxParameters.income_tax.note}</li>
            </ul>
          </section>

          {/* ---- what's left out ---- */}
          <section aria-label="What this receipt leaves out" className="mt-14">
            <div className="border-t pb-1 pt-3" style={{ borderColor: INK }}>
              <h2
                className="font-mono text-xs uppercase tracking-widest"
                style={{ color: SPRUCE }}
              >
                Not on this receipt
              </h2>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {RECEIPT_DATA_GAPS.map((gap) => (
                <li
                  key={gap.id}
                  className="border-t pt-2"
                  style={{ borderColor: RULE }}
                >
                  {gap.title}
                  <WarningTip text={gap.explanation} subject={gap.title} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
