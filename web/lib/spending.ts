import { CATEGORY_LABELS } from "./categories";
import type { CategoryNode, StateCategoriesDocument } from "./types";

export interface SpendingSlice {
  key: string;
  label: string;
  amount: number;
  share: number;
  subcategories: { label: string; amount: number }[];
}

const KEEP = 5;

function sortedEntries(record: Record<string, number>) {
  return Object.entries(record)
    .filter(([, amount]) => amount !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, amount]) => ({ label, amount }));
}

export function spendingSlices(
  nodes: Record<string, CategoryNode>,
): SpendingSlice[] {
  const total = Object.values(nodes).reduce((sum, node) => sum + node.total, 0);
  if (total <= 0) return [];
  const ranked = Object.entries(nodes).sort((a, b) => b[1].total - a[1].total);
  const kept = ranked.slice(0, KEEP).filter(([, node]) => node.total > 0);
  const folded = ranked.filter(
    ([key]) => !kept.some(([keptKey]) => keptKey === key),
  );
  const slices: SpendingSlice[] = kept.map(([key, node]) => ({
    key,
    label: CATEGORY_LABELS[key] ?? key,
    amount: node.total,
    share: node.total / total,
    subcategories: sortedEntries(node.subcategories),
  }));
  const otherAmount = total - kept.reduce((sum, [, node]) => sum + node.total, 0);
  if (otherAmount > 0.005) {
    slices.push({
      key: "__other",
      label: "Everything else",
      amount: otherAmount,
      share: otherAmount / total,
      subcategories: sortedEntries(
        Object.fromEntries(
          folded.map(([key, node]) => [CATEGORY_LABELS[key] ?? key, node.total]),
        ),
      ),
    });
  }
  return slices;
}

export function stateSpendingNodes(
  categories: StateCategoriesDocument,
  year: number,
): Record<string, CategoryNode> {
  const nodes: Record<string, CategoryNode> = {};
  for (const row of categories.rows) {
    if (row.side !== "expenditure" || row.fiscal_year !== year) continue;
    nodes[row.category] = {
      total: row.amount,
      subcategories: row.subcategories ?? {},
    };
  }
  return nodes;
}
