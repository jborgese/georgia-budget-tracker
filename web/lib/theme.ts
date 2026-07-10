export const PAPER = "#F6F5F0";
export const INK = "#1C1A16";
export const SPRUCE = "#17402C";
export const GOLD = "#96742A";
export const RULE = "#D9D5CB";
export const MUTED = "#6B6558";

export const SERIES = {
  green: "#27794A",
  gold: "#A87B18",
  blue: "#3D6FA8",
  terracotta: "#B14E31",
  plum: "#8A4D7E",
} as const;

export const NEUTRAL_SERIES = "#8B8474";

export const SLOTS: string[] = [
  SERIES.green,
  SERIES.gold,
  SERIES.blue,
  SERIES.terracotta,
  SERIES.plum,
];

export function segmentColors(
  segments: { key: string }[],
): Record<string, string> {
  const colors: Record<string, string> = {};
  segments.forEach((segment, index) => {
    colors[segment.key] =
      segment.key === "__other" ? NEUTRAL_SERIES : SLOTS[index % SLOTS.length];
  });
  return colors;
}
