/**
 * Canonical identifiers for merchant-facing modules.
 * URLs, credit ledger operations and job labels
 * must import from here rather than restating the strings.
 */
export const CATALOG_INTELLIGENCE = {
  id: "catalog_intelligence",
  label: "Catalog Intelligence",
  table: "catalog_sessions",
  routeSegment: "catalog-intelligence",
  apiBase: "/api/catalog-intelligence",
  creditOperation: "catalog_intelligence",
  jobKind: "catalog",
} as const;

export const STORE_ASSISTANT = {
  id: "store_assistant",
  label: "Store Assistant",
  routeSegment: "store-assistant",
  apiBase: "/api/store-agent",
  creditOperation: "store_assistant",
  creditEntityType: "store_assistant",
} as const;

export function catalogIntelligencePath(
  slug: string,
  sessionId?: string,
  step?: "new" | "rules" | "review"
): string {
  const base = `/w/${slug}/${CATALOG_INTELLIGENCE.routeSegment}`;
  if (step === "new") return `${base}/new`;
  if (!sessionId) return base;
  if (step === "rules" || step === "review") return `${base}/${sessionId}/${step}`;
  return `${base}/${sessionId}`;
}
