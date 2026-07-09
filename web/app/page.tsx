const PAPER = "#F6F5F0";
const INK = "#1C1A16";
const SPRUCE = "#17402C";
const GOLD = "#96742A";
const RULE = "#D9D5CB";

const ledger = [
  { line: "State revenues & expenditures", source: "Open Georgia · GDAC", status: "Sourcing" },
  { line: "County finances (159 counties)", source: "DCA Report of Local Government Finances", status: "Sourcing" },
  { line: "Automated data refresh", source: "Scheduled change detection", status: "Live" },
  { line: "Charts & county map", source: "This site", status: "In progress" },
];

export default function Home() {
  return (
    <main
      className="flex-1 px-6 py-16 sm:py-24"
      style={{ backgroundColor: PAPER, color: INK }}
    >
      <div className="mx-auto w-full max-w-2xl">
        <p
          className="font-mono text-xs uppercase tracking-[0.25em]"
          style={{ color: GOLD }}
        >
          A public ledger for Georgia
        </p>

        <h1
          className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl"
          style={{ color: SPRUCE }}
        >
          Georgia State Budget Tracker
        </h1>

        <p className="mt-6 max-w-prose text-base leading-relaxed sm:text-lg">
          One place to see how the State of Georgia — down to each of its 159
          counties — apportions its finances. Every figure comes from publicly
          available data, and every revision of that data is kept in the open.
        </p>

        <section className="mt-12" aria-label="Build status">
          <div
            className="flex items-baseline justify-between border-t pb-2 pt-3 font-mono text-xs uppercase tracking-widest"
            style={{ borderColor: INK, color: SPRUCE }}
          >
            <span>Line item</span>
            <span>Status</span>
          </div>
          <ul>
            {ledger.map((row) => (
              <li
                key={row.line}
                className="flex items-baseline justify-between gap-6 border-t py-3"
                style={{ borderColor: RULE }}
              >
                <div>
                  <p className="text-sm sm:text-base">{row.line}</p>
                  <p className="mt-1 font-mono text-xs" style={{ color: "#6B6558" }}>
                    {row.source}
                  </p>
                </div>
                <span
                  className="shrink-0 font-mono text-xs uppercase tracking-widest"
                  style={{ color: row.status === "Live" ? GOLD : SPRUCE }}
                >
                  {row.status}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t" style={{ borderColor: INK }} />
        </section>

        <footer className="mt-10 font-mono text-xs leading-relaxed" style={{ color: "#6B6558" }}>
          Sources: Open Georgia · Georgia Data Analytics Center · Georgia DCA ·
          UGA Tax &amp; Expenditure Data Center. Open source under the MIT
          license.
        </footer>
      </div>
    </main>
  );
}
