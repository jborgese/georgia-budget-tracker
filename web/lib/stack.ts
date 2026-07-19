import {
  consolidatedByCountyFips,
  countyDisplayName,
  entityDisplayName,
  formatVintage,
  loadCountyMetrics,
  loadEntityIndex,
  loadEntityMetrics,
  loadManifest,
  loadMillage,
  loadSchoolIndex,
} from "./data";
import { formatDollars } from "./format";
import type {
  CountyYearMetrics,
  EntityYearMetrics,
  MillageDistrictYear,
} from "./types";

export interface StackRate {
  mo: number | null;
  bond: number | null;
}

export interface StackLine {
  label: string;
  district: string;
  href: string | null;
  rate: StackRate;
  context: string | null;
}

export interface StackCityOption {
  key: string;
  name: string;
  city: StackLine;
  countyRate: StackRate | null;
  school: StackLine | null;
}

export interface StackSpecial {
  district: string;
  rate: StackRate;
  href: string | null;
}

export interface StackGovernment {
  label: string;
  href: string | null;
  incRate: StackRate | null;
  unincRate: StackRate | null;
  context: string | null;
}

export interface StackData {
  slug: string;
  countyName: string;
  fips: string;
  taxYear: number;
  kind: "county" | "consolidated";
  government: StackGovernment;
  countySchool: StackLine;
  cities: StackCityOption[];
  specials: StackSpecial[];
  provenance: string;
}

export interface StackCountyOption {
  slug: string;
  name: string;
}

const COUNTY_INC_ALIASES = new Set([
  "COUNTY INCORPORATED",
  "INCORPORATED",
  "COUNTY INC",
  "COUNTY - INC",
]);

const COUNTY_UNINC_ALIASES = new Set([
  "COUNTY UNINCORPORATED",
  "UNINCORPORATED",
  "COUNTY UNINC",
  "COUNTY - UNINC",
  "COUNTY UNICORPORATED",
  "COUNTY UNINCRPORATED",
]);

const DIGEST_CITY_ALIASES: Record<string, string> = {
  "MCRAE - HELENA": "MCRAE-HELENA",
  "MT ZION": "MOUNT ZION",
  MILLAN: "MILAN",
};

const CITIES_WITHOUT_LEDGERS = new Set([
  "SOUTH FULTON",
  "STONECREST",
  "PINE LAKE",
  "NEWTON",
  "ARAGON",
  "BRASWELL",
  "CECIL",
  "CRAWFORDVILLE",
  "EDGE HILL",
  "ENIGMA",
  "UVALDA",
  "SPRINGDALE/PINE MOUNTAIN",
]);

const COUNTY_INC_OVERRIDE = /^COUNTY INC(?:ORPORATED)? - (.+)$/;
const IND_SCHOOL = /^IND SCHOOL (.+?)(?: \d+%)?$/;
const INDEPENDENT_DISTRICT = /Independent School District|Public Schools|City Schools/;

interface DigestRow {
  name: string;
  district: string;
  code: number;
  rate: StackRate;
}

function normalizedName(county: string, district: string): string {
  const prefix = `${county} COUNTY - `;
  const stripped = district.startsWith(prefix)
    ? district.slice(prefix.length)
    : district;
  return stripped.replace(/\s+/g, " ").trim();
}

function cityVariants(name: string): string[] {
  const base = DIGEST_CITY_ALIASES[name] ?? name;
  const noPrefix = base.replace(/^CITY OF /, "");
  const noSuffix = noPrefix.replace(/ - .+$/, "");
  return [
    ...new Set([
      noPrefix,
      noSuffix,
      noPrefix.replace(/ \d+%$/, ""),
      noSuffix.replace(/ \d+%$/, ""),
    ]),
  ];
}

function resolveCity(
  name: string,
  citySlugs: Map<string, string>,
): string | null {
  return (
    cityVariants(name).find(
      (variant) => citySlugs.has(variant) || CITIES_WITHOUT_LEDGERS.has(variant),
    ) ?? null
  );
}

function cityDisplayName(city: string): string {
  return city
    .split("/")
    .map(entityDisplayName)
    .join("/");
}

function hasDigestData(rates: MillageDistrictYear | undefined): boolean {
  return (
    rates != null &&
    (rates.millage_mo != null ||
      rates.millage_bond != null ||
      Boolean(rates.tax_mo) ||
      Boolean(rates.tax_bond))
  );
}

function levies(rate: StackRate): boolean {
  return (rate.mo ?? 0) + (rate.bond ?? 0) > 0;
}

type MetricYears = Record<string, CountyYearMetrics | EntityYearMetrics | null>;

function perResidentContext(years: MetricYears | undefined): string | null {
  if (!years) return null;
  const latest = Object.entries(years)
    .filter(([, metric]) => metric?.expenditure_per_capita != null)
    .sort(([a], [b]) => Number(b) - Number(a))
    .at(0);
  if (!latest) return null;
  const [year, metric] = latest;
  const perCapita = (metric as EntityYearMetrics).expenditure_per_capita as number;
  return `spends ≈ ${formatDollars(perCapita)} per resident (FY${year})`;
}

function perStudentContext(
  district:
    | { per_pupil_current_spending: number | null; latest_fiscal_year: number }
    | undefined,
): string | null {
  if (district?.per_pupil_current_spending == null) return null;
  return (
    `spends ≈ ${formatDollars(district.per_pupil_current_spending)} ` +
    `per student (FY${district.latest_fiscal_year})`
  );
}

export function loadStackIndex(): {
  taxYear: number;
  counties: StackCountyOption[];
} {
  const millage = loadMillage();
  return {
    taxYear: millage.tax_years.at(-1) as number,
    counties: Object.entries(millage.counties)
      .map(([slug, entry]) => ({
        slug,
        name: countyDisplayName(entry.county),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function stackProvenance(taxYear: number): string {
  const manifest = loadManifest();
  const digestVintage = formatVintage(manifest, "dor_digest");
  return (
    `Rates: Georgia DOR consolidated tax digest, tax year ${taxYear}, as ` +
    `compiled by the state via GeorgiaData.org (${digestVintage}). DOR ` +
    `directs readers to county tax commissioners for authoritative ` +
    `figures; a rate shown as "not reported" is missing from the ` +
    `compilation, not necessarily zero. Spending context per line: RLGF ` +
    `filings via the UGA Tax & Expenditure Data Center and the US Census ` +
    `F-33 school finance survey. Spending figures are context for each ` +
    `government separately and are never summed across governments.`
  );
}

export function loadStackCounty(slug: string): StackData | null {
  const millage = loadMillage();
  const entry = millage.counties[slug];
  if (!entry) return null;

  const taxYear = millage.tax_years.at(-1) as number;
  const year = String(taxYear);
  const metricsEntry = loadCountyMetrics().counties.find(
    (candidate) => candidate.county === entry.county,
  );
  if (!metricsEntry) return null;
  const displayName = countyDisplayName(entry.county);
  const consolidated = consolidatedByCountyFips()[metricsEntry.fips] ?? null;
  const kind: StackData["kind"] = consolidated ? "consolidated" : "county";

  const citySlugs = new Map(
    loadEntityIndex("city").entities.map((city) => [city.entity, city.slug]),
  );
  const cityMetrics = loadEntityMetrics("city").entities;
  const schoolIndex = loadSchoolIndex();

  const rows: DigestRow[] = entry.districts.flatMap((district) => {
    const rates = district.years[year];
    if (!hasDigestData(rates)) return [];
    return [
      {
        name: normalizedName(entry.county, district.district),
        district: district.district,
        code: district.code,
        rate: { mo: rates.millage_mo, bond: rates.millage_bond },
      },
    ];
  });

  const schoolRows = rows.filter((row) => row.code === 2);
  const rest = rows.filter(
    (row) => row.code !== 2 && row.code !== 1 && row.name !== "STATE",
  );

  const incRow = rest.find((row) => COUNTY_INC_ALIASES.has(row.name)) ?? null;
  const unincRow =
    rest.find((row) => COUNTY_UNINC_ALIASES.has(row.name)) ?? null;

  const countyRateByCity = new Map<string, StackRate>();
  let countyRateOther: StackRate | null = null;
  const cityRows = new Map<string, DigestRow>();
  const indSchoolRows = new Map<string, DigestRow>();
  const specialRows: DigestRow[] = [];

  for (const row of rest) {
    if (COUNTY_INC_ALIASES.has(row.name) || COUNTY_UNINC_ALIASES.has(row.name)) {
      continue;
    }
    const override = row.name.match(COUNTY_INC_OVERRIDE);
    if (override) {
      const target =
        override[1] === "OTHER" ? null : resolveCity(override[1], citySlugs);
      if (override[1] === "OTHER") countyRateOther ??= row.rate;
      else if (target && !countyRateByCity.has(target)) {
        countyRateByCity.set(target, row.rate);
      } else specialRows.push(row);
      continue;
    }
    const indSchool = row.name.match(IND_SCHOOL);
    if (indSchool) {
      const target = resolveCity(indSchool[1], citySlugs) ?? indSchool[1];
      if (!indSchoolRows.has(target)) indSchoolRows.set(target, row);
      continue;
    }
    const city = resolveCity(row.name, citySlugs);
    if (city) {
      if (!cityRows.has(city)) cityRows.set(city, row);
      continue;
    }
    specialRows.push(row);
  }

  const independentSchoolLine = (city: string): StackLine | null => {
    const row = indSchoolRows.get(city);
    if (!row) return null;
    const cityName = cityDisplayName(city);
    const district = schoolIndex.districts.find(
      (candidate) =>
        INDEPENDENT_DISTRICT.test(candidate.display_name) &&
        candidate.display_name.startsWith(`${cityName} `),
    );
    return {
      label: district?.display_name ?? `${cityName} independent schools`,
      district: row.district,
      href: district ? `/school/${district.slug}/` : null,
      rate: row.rate,
      context: perStudentContext(district),
    };
  };

  const cityOption = (city: string, row: DigestRow | null): StackCityOption => {
    const cityName = cityDisplayName(city);
    const citySlug = citySlugs.get(city) ?? null;
    return {
      key: city,
      name: cityName,
      city: {
        label: `City of ${cityName}`,
        district: row?.district ?? "(no digest row)",
        href: citySlug ? `/city/${citySlug}/` : null,
        rate: row?.rate ?? { mo: null, bond: null },
        context: citySlug
          ? perResidentContext(cityMetrics[citySlug]?.years)
          : null,
      },
      countyRate: countyRateByCity.get(city) ?? countyRateOther,
      school: independentSchoolLine(city),
    };
  };

  const cityKeys = [
    ...new Set([...cityRows.keys(), ...indSchoolRows.keys()]),
  ];
  const cities =
    kind === "consolidated"
      ? []
      : cityKeys
          .map((city) => cityOption(city, cityRows.get(city) ?? null))
          .sort((a, b) => a.name.localeCompare(b.name));

  const consolidatedCitySpecials: StackSpecial[] =
    kind === "consolidated"
      ? [...cityRows.entries()]
          .filter(([, row]) => levies(row.rate))
          .map(([city, row]) => {
            const citySlug = citySlugs.get(city) ?? null;
            return {
              district: row.district,
              rate: row.rate,
              href: citySlug ? `/city/${citySlug}/` : null,
            };
          })
      : [];

  const specials: StackSpecial[] = [
    ...specialRows
      .filter((row) => levies(row.rate))
      .map((row) => ({ district: row.district, rate: row.rate, href: null })),
    ...consolidatedCitySpecials,
  ].sort((a, b) => a.district.localeCompare(b.district));

  const countySchoolDistrict = schoolIndex.districts.find(
    (candidate) =>
      candidate.county_fips === metricsEntry.fips &&
      !INDEPENDENT_DISTRICT.test(candidate.display_name),
  );
  const countySchool: StackLine = {
    label: countySchoolDistrict?.display_name ?? `${displayName} County schools`,
    district: schoolRows.at(0)?.district ?? "SCHOOL",
    href: countySchoolDistrict ? `/school/${countySchoolDistrict.slug}/` : null,
    rate: {
      mo: schoolRows.map((row) => row.rate.mo).find((v) => v != null) ?? null,
      bond:
        schoolRows.map((row) => row.rate.bond).find((v) => v != null) ?? null,
    },
    context: perStudentContext(countySchoolDistrict),
  };

  const government: StackGovernment = consolidated
    ? {
        label: `${consolidated.name} consolidated government`,
        href: `/consolidated/${consolidated.slug}/`,
        incRate: incRow?.rate ?? null,
        unincRate: unincRow?.rate ?? null,
        context: perResidentContext(
          loadEntityMetrics("consolidated").entities[consolidated.slug]?.years,
        ),
      }
    : {
        label: `${displayName} County government`,
        href: metricsEntry.included ? `/county/${slug}/` : null,
        incRate: incRow?.rate ?? null,
        unincRate: unincRow?.rate ?? null,
        context: metricsEntry.included
          ? perResidentContext(metricsEntry.years ?? undefined)
          : null,
      };

  return {
    slug,
    countyName: displayName,
    fips: metricsEntry.fips,
    taxYear,
    kind,
    government,
    countySchool,
    cities,
    specials,
    provenance: stackProvenance(taxYear),
  };
}
