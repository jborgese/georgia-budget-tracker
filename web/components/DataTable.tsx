import { useId } from "react";
import { INK, MUTED, PAPER, RULE } from "@/lib/theme";

export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: string[][];
}) {
  const captionId = useId();
  return (
    <details className="mt-3">
      <summary
        className="cursor-pointer py-2 font-mono text-xs uppercase tracking-widest"
        style={{ color: MUTED }}
      >
        View as table
      </summary>
      <div
        className="mt-2 overflow-x-auto"
        role="region"
        aria-labelledby={captionId}
        tabIndex={0}
      >
        <table className="w-full text-sm" style={{ color: INK }}>
          <caption id={captionId} className="sr-only">
            {caption}
          </caption>
          <thead>
            <tr
              className="border-t font-mono text-xs uppercase tracking-widest"
              style={{ borderColor: INK }}
            >
              {columns.map((column, index) => (
                <th
                  key={`${column}-${index}`}
                  scope="col"
                  className={`py-2 pr-4 font-normal ${index === 0 ? "sticky left-0 text-left" : "text-right"}`}
                  style={
                    index === 0
                      ? {
                          color: MUTED,
                          backgroundColor: PAPER,
                          boxShadow: `inset -1px 0 0 ${RULE}`,
                        }
                      : { color: MUTED }
                  }
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={`${row[0]}-${rowIndex}`}
                className="border-t"
                style={{ borderColor: RULE }}
              >
                {row.map((cell, index) => (
                  <td
                    key={index}
                    className={
                      index === 0
                        ? "sticky left-0 py-2 pr-4 text-left"
                        : "py-2 pr-4 text-right font-mono tabular-nums"
                    }
                    style={
                      index === 0
                        ? {
                            backgroundColor: PAPER,
                            boxShadow: `inset -1px 0 0 ${RULE}`,
                          }
                        : undefined
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
