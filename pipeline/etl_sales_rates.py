"""Transform the DOR sales and use tax general rate chart into rate data.

The Georgia Department of Revenue publishes a quarterly "General Rate Chart"
PDF (source ids ``dor_sales_rates_YYYYqQ`` in pipeline/sources.json) listing
every sales-tax jurisdiction: a three-digit county code (or a suffixed /
800-series code for the handful of city-level jurisdictions), the
jurisdiction name, the combined rate, and a string of type letters naming
the levies inside that rate.

Rate arithmetic the parser enforces:
- The state levies 4 cents everywhere.
- Standard letters are one cent each: M (MARTA), L (LOST), E (ESPLOST),
  S (SPLOST), H (HOST), T and T2 (TSPLOST), P.
- Fractional letters: Tf is 0.75, Ta is 0.4, m (Atlanta's "More MARTA"
  half-penny) is 0.5, and O is either 0.5 or 1 — solved from the residual
  after the state's 4 cents and the fixed letters are removed. A residual
  that no assignment matches, or that more than one assignment matches,
  fails loudly.
- Letters are matched longest-first and case-sensitively (T2/Tf/Ta before
  T; m and M are different levies). An unknown letter fails loudly.
- Central Yards (803) is the one row whose printed rate excludes the
  state's 4 cents (the chart's header note); its registry entry carries
  ``state_included: False`` and its state cents are recorded as 0.

Each cent is classified for the receipt view: E is education (school
district ESPLOST), M/m and the T-family are transit/transportation, and
L/S/H/O/P are county-and-city shared cents. LOST distribution
certificates (the county/city split) are not machine-readable, so the
shared cents stay one bucket.

Jurisdiction naming:
- A plain three-digit code whose name resolves against the Census county
  roster (after stripping "(Not ...)" parentheticals and footnote marks)
  is that county's default rate row. All 159 counties must appear exactly
  once.
- Every other code must be listed in SPECIAL_JURISDICTIONS (city-level
  jurisdictions like Atlanta's 060A/044A rows), and every registry entry
  must appear in the chart — the registry and the chart validate each
  other in both directions. Central Yards (803) is kept in the data but
  excluded from the county resolution map: it is a stadium-area district,
  not a residential city rate.

Outputs:
- data/processed/sales_rates.parquet  one row per (edition, jurisdiction)
- data/processed/sales_rates.json     the latest edition's jurisdictions
  plus a per-county-slug resolution map (default code + city overrides)
  for the /receipt pages

Usage: etl_sales_rates.py [dor_sales_rates_YYYYqQ ...]
With no arguments every registered edition is refreshed; with source-id
arguments only those files are re-downloaded (others reuse the committed
raw PDF, downloading it first if absent).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import duckdb
import pandas as pd
import pdfplumber

import runlog
from fetching import download_file_stdlib

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "pipeline" / "sources.json"
COUNTY_FIPS = json.loads(
    (Path(__file__).resolve().parent / "ga_counties.json").read_text())
COUNTY_ROSTER = set(COUNTY_FIPS)
RAW_DIR = ROOT / "data" / "raw"
PARQUET_FILE = ROOT / "data" / "processed" / "sales_rates.parquet"
JSON_FILE = ROOT / "data" / "processed" / "sales_rates.json"
SOURCE_PREFIX = "dor_sales_rates_"
REQUEST_HEADERS = {
    "User-Agent": ("Mozilla/5.0 (compatible; georgia-budget-tracker/0.1; "
                   "+https://github.com/jborgese/georgia-budget-tracker)"),
}

STATE_TWENTIETHS = 80  # 4 cents, in twentieths of a cent
# One-cent letters. T2 sorts before T in the tokenizer (longest match).
STANDARD_LETTERS = ("M", "L", "E", "S", "H", "T", "T2", "P")
FIXED_FRACTIONAL = {"Tf": 15, "Ta": 8, "m": 10}  # twentieths: 0.75, 0.4, 0.5
VARIABLE_FRACTIONAL = {"O": (10, 20)}  # 0.5 or 1 cent
LETTER_TOKENS = sorted(
    [*STANDARD_LETTERS, *FIXED_FRACTIONAL, *VARIABLE_FRACTIONAL],
    key=len, reverse=True)
CLASSIFY = {
    "E": "education",
    "M": "transit", "m": "transit", "T": "transit", "T2": "transit",
    "Tf": "transit", "Ta": "transit",
    "L": "local_shared", "S": "local_shared", "H": "local_shared",
    "O": "local_shared", "P": "local_shared",
}
CENT_GROUPS = ("education", "transit", "local_shared")

# City-level jurisdictions: every parsed code that is not a county row must
# be here, and every code here must be parsed — validated both directions.
# city=None keeps a jurisdiction in the data but out of the per-county
# city resolution map.
SPECIAL_JURISDICTIONS = {
    "060A": {"name": "FULTON (ATLANTA)", "county": "FULTON",
             "city": "ATLANTA"},
    "044A": {"name": "DEKALB (ATLANTA)", "county": "DEKALB",
             "city": "ATLANTA"},
    "800": {"name": "FULTON (HAPEVILLE)", "county": "FULTON",
            "city": "HAPEVILLE"},
    "801": {"name": "FULTON (COLLEGE PRK)", "county": "FULTON",
            "city": "COLLEGE PARK"},
    "802": {"name": "FULTON (EAST POINT)", "county": "FULTON",
            "city": "EAST POINT"},
    "803": {"name": "FULTON (CENT. YARDS)", "county": "FULTON", "city": None,
            "state_included": False},
    "804": {"name": "CLAYTON (COLLEGE PRK)", "county": "CLAYTON",
            "city": "COLLEGE PARK"},
}

CODE_RE = re.compile(r"^\d{3}[A-Z]?$")
RATE_RE = re.compile(r"^\d+(?:\.\d+)?%?$")
QUARTER_STARTS = {"1": ("01-01", "03-31"), "2": ("04-01", "06-30"),
                  "3": ("07-01", "09-30"), "4": ("10-01", "12-31")}


def tokenize_types(letters: str) -> list[str]:
    """Split a type string like ``ELST2`` into letters, longest-first."""
    compact = letters.replace(" ", "")
    tokens: list[str] = []
    position = 0
    while position < len(compact):
        token = next((candidate for candidate in LETTER_TOKENS
                      if compact.startswith(candidate, position)), None)
        if token is None:
            raise SystemExit(
                f"Unknown levy letter at {compact[position:]!r} in "
                f"{letters!r} — the chart's type vocabulary changed.")
        tokens.append(token)
        position += len(token)
    return tokens


def decompose(total: float, tokens: list[str], label: str,
              state_twentieths: int = STATE_TWENTIETHS) -> list[tuple[str, int]]:
    """Assign twentieths-of-a-cent to each letter; fail on any mismatch."""
    total_twentieths = round(total * 20)
    if abs(total * 20 - total_twentieths) > 1e-6:
        raise SystemExit(f"{label}: rate {total} is not a whole number of "
                         "twentieths of a cent.")
    residual = total_twentieths - state_twentieths
    fixed: list[tuple[str, int]] = []
    variables: list[str] = []
    for token in tokens:
        if token in FIXED_FRACTIONAL:
            fixed.append((token, FIXED_FRACTIONAL[token]))
        elif token in VARIABLE_FRACTIONAL:
            variables.append(token)
        else:
            fixed.append((token, 20))
    residual -= sum(amount for _, amount in fixed)
    if not variables:
        if residual != 0:
            raise SystemExit(
                f"{label}: letters {tokens} sum to "
                f"{(total_twentieths - residual) / 20} cents but the chart "
                f"says {total} — mismatch of {residual / 20} cents.")
        return fixed
    solutions = []
    for mask in range(2 ** len(variables)):
        amounts = [VARIABLE_FRACTIONAL[letter][(mask >> index) & 1]
                   for index, letter in enumerate(variables)]
        if sum(amounts) == residual:
            solutions.append(list(zip(variables, amounts)))
    if not solutions:
        raise SystemExit(
            f"{label}: no assignment of {variables} (each 0.5 or 1 cent) "
            f"matches the residual {residual / 20} cents.")
    if len(solutions) > 1:
        distinct = {tuple(sorted(s)) for s in solutions}
        if len(distinct) > 1:
            raise SystemExit(
                f"{label}: residual {residual / 20} cents is ambiguous "
                f"across {variables}.")
    return fixed + solutions[0]


def classify(pairs: list[tuple[str, int]]) -> dict[str, float]:
    """Sum a decomposition into the receipt's cent groups, in cents."""
    cents = dict.fromkeys(CENT_GROUPS, 0)
    for letter, twentieths in pairs:
        cents[CLASSIFY[letter]] += twentieths
    return {group: value / 20 for group, value in cents.items()}


def canonical_county_name(name: str) -> str | None:
    """Resolve a chart jurisdiction name to a roster county, or None."""
    cleaned = re.sub(r"\([^)]*\)", " ", name.upper())
    cleaned = re.sub(r"[*†#]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = cleaned.removesuffix(" COUNTY").strip()
    return cleaned if cleaned in COUNTY_ROSTER else None


def county_slug(county: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", county.lower()).strip("-")


def parse_entry(tokens: list[str], label: str) -> dict:
    """Parse one chart entry: CODE, name words, rate, type letters."""
    if len(tokens) < 3 or not CODE_RE.fullmatch(tokens[0]):
        raise SystemExit(f"{label}: unparseable entry {tokens!r}.")
    code = tokens[0]
    rate_positions = [index for index, token in enumerate(tokens[1:], 1)
                      if RATE_RE.fullmatch(token.rstrip("*"))]
    if not rate_positions:
        raise SystemExit(f"{label}: no rate found in entry {tokens!r}.")
    rate_at = rate_positions[-1]
    name = " ".join(tokens[1:rate_at]).strip()
    if not name:
        raise SystemExit(f"{label}: entry {tokens!r} has no name.")
    total = float(tokens[rate_at].rstrip("*").rstrip("%"))
    letters = "".join(tokens[rate_at + 1:]).replace("*", "")
    return {"code": code, "name": name, "total": total, "letters": letters}


GLUED_CODE_RE = re.compile(r"^(\d{3}[A-Z]?)([A-Z(].*)$")
GLUED_RATE_RE = re.compile(r"^(.+\))(\d+(?:\.\d+)?)$")


def split_glued_tokens(tokens: list[str]) -> list[str]:
    """Split words the extractor merged across cell boundaries.

    Tight spacing can fuse a jurisdiction code with the next column's
    name into one word (``060AFulton``), or a parenthesised name with
    its rate (``Prk)8``); the pieces must be restored as separate
    tokens or the row split and rate scan miss them.
    """
    split: list[str] = []
    for token in tokens:
        glued = (None if CODE_RE.fullmatch(token)
                 else GLUED_CODE_RE.fullmatch(token)
                 or GLUED_RATE_RE.fullmatch(token))
        split.extend(glued.groups() if glued else (token,))
    return split


def group_lines(words: list[dict]) -> list[list[dict]]:
    """Cluster words into visual lines by vertical proximity.

    Fixed-width bucketing tears rows apart when a cell's baseline sits a
    point or two off its neighbours (the chart renders some rate digits
    that way), so lines grow greedily while tops stay within tolerance
    of the line's first word.
    """
    lines: list[list[dict]] = []
    for word in sorted(words, key=lambda w: (w["page"], w["top"], w["x0"])):
        if (lines and lines[-1][0]["page"] == word["page"]
                and abs(word["top"] - lines[-1][0]["top"]) <= 3):
            lines[-1].append(word)
        else:
            lines.append([word])
    return lines


def extract_entries(path: Path) -> list[dict]:
    """Read the chart PDF into entries by splitting rows at code tokens.

    The chart lays jurisdictions out in columns; words are regrouped into
    visual lines by their vertical position, and each line is split at
    every code-shaped token so column neighbours become separate entries.
    """
    words: list[dict] = []
    with pdfplumber.open(path) as pdf:
        for page_number, page in enumerate(pdf.pages):
            for word in page.extract_words():
                words.append({"page": page_number, "top": word["top"],
                              "x0": word["x0"], "text": word["text"]})
    entries: list[dict] = []
    for line in group_lines(words):
        tokens = split_glued_tokens(
            [w["text"] for w in sorted(line, key=lambda w: w["x0"])])
        starts = [index for index, token in enumerate(tokens)
                  if CODE_RE.fullmatch(token)]
        for position, start in enumerate(starts):
            end = starts[position + 1] if position + 1 < len(starts) else None
            entry_tokens = tokens[start:end]
            if len(entry_tokens) >= 3 and any(
                    RATE_RE.fullmatch(t.rstrip("*"))
                    for t in entry_tokens[1:]):
                entries.append(parse_entry(entry_tokens, path.name))
    return entries


def enrich(entries: list[dict], source_id: str) -> list[dict]:
    """Attach county, cents, and validation to raw entries."""
    enriched = []
    for entry in entries:
        label = f"{source_id} {entry['code']} {entry['name']}"
        special = SPECIAL_JURISDICTIONS.get(entry["code"])
        county = (canonical_county_name(entry["name"])
                  if special is None and re.fullmatch(r"\d{3}", entry["code"])
                  else None)
        if county is None and special is None:
            raise SystemExit(
                f"{label}: neither a roster county nor a registered "
                "special jurisdiction — extend SPECIAL_JURISDICTIONS "
                "deliberately if the chart added a jurisdiction.")
        if special is not None and special["county"] not in entry["name"].upper():
            raise SystemExit(
                f"{label}: registered county {special['county']} does not "
                "appear in the chart row name — re-check "
                "SPECIAL_JURISDICTIONS against the chart.")
        state_included = special.get("state_included", True) if special else True
        floor = 4 if state_included else 0
        if not floor <= entry["total"] <= 10:
            raise SystemExit(f"{label}: rate {entry['total']} outside the "
                             f"plausible {floor}-10 range.")
        pairs = decompose(entry["total"], tokenize_types(entry["letters"]),
                          label,
                          state_twentieths=STATE_TWENTIETHS
                          if state_included else 0)
        enriched.append({
            **entry,
            "county": county if county else special["county"],
            "is_county_default": county is not None,
            "state_cents": 4.0 if state_included else 0.0,
            "cents": classify(pairs),
        })
    return enriched


def validate(entries: list[dict], source_id: str) -> None:
    codes = [entry["code"] for entry in entries]
    duplicate_codes = {code for code in codes if codes.count(code) > 1}
    if duplicate_codes:
        raise SystemExit(f"{source_id}: duplicate jurisdiction codes "
                         f"{sorted(duplicate_codes)}.")
    counties = [entry["county"] for entry in entries
                if entry["is_county_default"]]
    duplicates = {county for county in counties if counties.count(county) > 1}
    if duplicates:
        raise SystemExit(f"{source_id}: counties appear more than once: "
                         f"{sorted(duplicates)}.")
    missing = COUNTY_ROSTER - set(counties)
    if missing:
        raise SystemExit(f"{source_id}: counties missing from the chart: "
                         f"{sorted(missing)}.")
    parsed_specials = {entry["code"] for entry in entries
                       if not entry["is_county_default"]}
    unparsed = set(SPECIAL_JURISDICTIONS) - parsed_specials
    if unparsed:
        raise SystemExit(
            f"{source_id}: registered special jurisdictions absent from "
            f"the chart: {sorted(unparsed)} — prune SPECIAL_JURISDICTIONS "
            "deliberately if the chart dropped them.")


def build_resolution(entries: list[dict]) -> dict:
    """Map county slug -> default jurisdiction code + city overrides."""
    resolution = {
        county_slug(entry["county"]): {
            "county": entry["county"],
            "fips": COUNTY_FIPS[entry["county"]],
            "default": entry["code"],
            "cities": {},
        }
        for entry in entries if entry["is_county_default"]
    }
    for entry in entries:
        if entry["is_county_default"]:
            continue
        special = SPECIAL_JURISDICTIONS[entry["code"]]
        if special["city"] is None:
            continue
        slug = county_slug(special["county"])
        if slug not in resolution:
            raise SystemExit(f"Special jurisdiction {entry['code']} names "
                             f"county {special['county']} with no county "
                             "row in the chart.")
        resolution[slug]["cities"][special["city"]] = entry["code"]
    return {slug: {**entry, "cities": dict(sorted(entry["cities"].items()))}
            for slug, entry in sorted(resolution.items())}


def rate_sources() -> dict[str, dict]:
    sources = json.loads(SOURCES_FILE.read_text())["sources"]
    return {s["id"]: s for s in sources if s["id"].startswith(SOURCE_PREFIX)}


def edition_dates(source_id: str) -> tuple[str, str]:
    match = re.fullmatch(rf"{SOURCE_PREFIX}(\d{{4}})q([1-4])", source_id)
    if not match:
        raise SystemExit(f"Source id {source_id!r} is not of the form "
                         f"{SOURCE_PREFIX}YYYYqQ.")
    year, quarter = match.groups()
    start, end = QUARTER_STARTS[quarter]
    return f"{year}-{start}", f"{year}-{end}"


def raw_file(source_id: str) -> Path:
    return RAW_DIR / f"{source_id}.pdf"


def ensure_raw(source: dict, refresh: bool) -> Path:
    target = raw_file(source["id"])
    if refresh or not target.exists():
        try:
            download_file_stdlib(source["url"], target, source=source["id"],
                                 headers=REQUEST_HEADERS)
            print(f"Downloaded {source['url']} -> {target} "
                  f"({target.stat().st_size:,} bytes)")
        except (Exception, SystemExit):
            if not target.exists():
                raise
            runlog.log_event("fallback", source["id"],
                             reason="using committed raw file")
    return target


def write_parquet(rows: list[dict]) -> None:
    frame = pd.DataFrame.from_records(rows)
    PARQUET_FILE.parent.mkdir(parents=True, exist_ok=True)
    connection = duckdb.connect()
    connection.register("rates", frame)
    connection.execute(
        f"""
        COPY (SELECT * FROM rates ORDER BY source, code)
        TO '{PARQUET_FILE}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )


def parquet_rows(entries: list[dict], source_id: str) -> list[dict]:
    effective_from, effective_through = edition_dates(source_id)
    return [
        {
            "source": source_id,
            "effective_from": effective_from,
            "effective_through": effective_through,
            "code": entry["code"],
            "name": entry["name"],
            "county": entry["county"],
            "is_county_default": entry["is_county_default"],
            "total": entry["total"],
            "letters": entry["letters"],
            "cents_state": entry["state_cents"],
            **{f"cents_{group}": entry["cents"][group]
               for group in CENT_GROUPS},
        }
        for entry in sorted(entries, key=lambda e: e["code"])
    ]


def write_json(entries: list[dict], source_id: str) -> None:
    effective_from, effective_through = edition_dates(source_id)
    document = {
        "source": source_id,
        "effective_from": effective_from,
        "effective_through": effective_through,
        "state_cents": 4,
        "jurisdictions": {
            entry["code"]: {
                "name": entry["name"],
                "county": entry["county"],
                "total": entry["total"],
                "letters": entry["letters"],
                "state_cents": entry["state_cents"],
                "cents": {group: entry["cents"][group]
                          for group in CENT_GROUPS},
            }
            for entry in sorted(entries, key=lambda e: e["code"])
        },
        "resolution": build_resolution(entries),
    }
    JSON_FILE.parent.mkdir(parents=True, exist_ok=True)
    JSON_FILE.write_text(json.dumps(document, indent=1) + "\n")


def main() -> int:
    requested = set(sys.argv[1:])
    sources = rate_sources()
    refresh = set(sources) & requested if requested else set(sources)
    if requested and not refresh:
        print(f"No rate-chart sources among {sorted(requested)}; "
              "nothing to do.")
        return 0

    editions: dict[str, list[dict]] = {}
    any_failed = False
    for source_id, source in sorted(sources.items()):
        try:
            path = ensure_raw(source, refresh=source_id in refresh)
            entries = enrich(extract_entries(path), source_id)
            validate(entries, source_id)
            editions[source_id] = entries
        except (Exception, SystemExit) as exc:
            failures = runlog.record_outcome(source_id, ok=False,
                                             error=str(exc))
            runlog.log_event("transform_failed", source_id,
                             consecutive_failures=failures,
                             error=str(exc)[:300])
            print(f"ERROR {source_id}: {exc}", file=sys.stderr)
            any_failed = True
            continue
        if source_id in refresh:
            runlog.record_outcome(source_id, ok=True)

    if not editions:
        print("No rate charts parsed; existing outputs left untouched.",
              file=sys.stderr)
        return 1

    write_parquet([row for source_id, entries in sorted(editions.items())
                   for row in parquet_rows(entries, source_id)])
    latest = max(editions)
    write_json(editions[latest], latest)
    runlog.log_event("transformed", "dor_sales_rates",
                     jurisdictions=len(editions[latest]),
                     editions=len(editions))
    print(f"Wrote {sum(len(e) for e in editions.values()):,} jurisdiction "
          f"rows across {len(editions)} edition(s) to "
          f"{PARQUET_FILE.relative_to(ROOT)}; latest edition {latest} "
          f"({len(editions[latest])} jurisdictions) to "
          f"{JSON_FILE.relative_to(ROOT)}")
    return 1 if any_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
