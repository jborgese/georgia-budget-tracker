import { INK, MUTED, SPRUCE } from "@/lib/theme";

export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border-t pt-3" style={{ borderColor: INK }}>
      <p
        className="font-mono text-xs uppercase tracking-widest"
        style={{ color: MUTED }}
      >
        {label}
      </p>
      <p
        className="mt-2 font-mono text-2xl font-semibold sm:text-3xl"
        style={{ color: SPRUCE }}
      >
        {value}
      </p>
      <p className="mt-1 text-xs" style={{ color: MUTED }}>
        {detail}
      </p>
    </div>
  );
}
