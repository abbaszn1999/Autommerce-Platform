/**
 * Helpers for category (PLP) sessions: how stored categories are compared with
 * page rows when SEO text is written back, and which uploaded column names a page.
 */
import type { MatchingRule } from "@/lib/matching";

/** Trim + case-insensitive + drop a trailing slash, for matching URLs/paths. */
export const PLP_MATCHING_RULES: MatchingRule[] = [
  {
    type: "trim_whitespace",
    enabled: true,
    label: "Trim Whitespace",
    description: "Remove spaces from both sides",
  },
  {
    type: "case_insensitive",
    enabled: true,
    label: "Case Insensitive",
    description: "Compare as lowercase",
  },
  {
    type: "trim_trailing_slash",
    enabled: true,
    label: "Ignore Trailing Slash",
    description: "Treat /shoes and /shoes/ as the same page",
  },
];

/** Best-guess identity column in an uploaded categories file. */
export function guessPlpSourceColumn(columns: string[]): string {
  const lower = new Map(columns.map((c) => [c.trim().toLowerCase(), c]));
  for (const candidate of [
    "name",
    "category_name",
    "title",
    "slug",
    "handle",
    "url",
    "الاسم",
  ]) {
    const hit = lower.get(candidate);
    if (hit) return hit;
  }
  return columns[0] ?? "";
}
