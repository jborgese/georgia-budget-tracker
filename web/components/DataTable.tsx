import { INK, MUTED, RULE } from "@/lib/theme";

export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <details className="mt-3">
      <summary
        className="cursor-pointer font-mono text-xs uppercase tracking-widest"
        style={{ color: MUTED }}
      >
        View as table
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm" style={{ color: INK }}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr
              className="border-t font-mono text-xs uppercase tracking-widest"
              style={{ borderColor: INK }}
            >
              {columns.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={`py-2 pr-4 font-normal ${index === 0 ? "text-left" : "text-right"}`}
                  style={{ color: MUTED }}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-t" style={{ borderColor: RULE }}>
                {row.map((cell, index) => (
                  <td
                    key={`${row[0]}-${columns[index]}`}
                    className={
                      index === 0
                        ? "py-2 pr-4 text-left"
                        : "py-2 pr-4 text-right font-mono tabular-nums"
                    }
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
