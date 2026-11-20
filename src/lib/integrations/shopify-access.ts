/**
 * What a Shopify store can let Autommerce do, declared once and read by
 * everything that needs it: the "Autommerce access" panel in Settings, the
 * locks on the sidebar and on the tool routes, the agents' own checks in the
 * Store Agent service, and the "needs access" card in a chat.
 *
 * No imports: the Store Agent service reads this file too.
 */

/**
 * The parts of a store, as a merchant thinks of them. Each has a scope to read
 * it and, except sales totals, a scope to change it.
 */
export const STORE_ACCESS_AREAS = [
  { id: "products", name: "Products and collections", read: "read_products", edit: "write_products" },
  { id: "inventory", name: "Inventory", read: "read_inventory", edit: "write_inventory" },
  { id: "locations", name: "Locations", read: "read_locations", edit: "write_locations" },
  { id: "files", name: "Files and images", read: "read_files", edit: "write_files" },
  { id: "publications", name: "Sales channels", read: "read_publications", edit: "write_publications" },
  { id: "content", name: "Blog articles", read: "read_content", edit: "write_content" },
  { id: "reports", name: "Sales totals", read: "read_reports", edit: null },
] as const;

type StoreAccessArea = (typeof STORE_ACCESS_AREAS)[number];
/** A Shopify Admin API access scope Autommerce uses. */
export type StoreScope = StoreAccessArea["read"] | NonNullable<StoreAccessArea["edit"]>;

/** Each scope in words, for messages a merchant can act on ("permission to …"). */
const SCOPE_LABELS: Record<StoreScope, string> = {
  read_products: "read products and collections",
  write_products: "edit products and collections",
  read_inventory: "read inventory",
  write_inventory: "edit inventory",
  read_locations: "read locations",
  write_locations: "edit locations",
  read_files: "read files",
  write_files: "upload and edit files",
  read_publications: "read sales channels",
  write_publications: "publish to sales channels",
  read_content: "read blog articles",
  write_content: "write blog articles",
  read_reports: "read sales totals",
};

/** A scope in words; a scope this file does not know reads as itself. */
export const scopeLabel = (scope: string): string => SCOPE_LABELS[scope as StoreScope] ?? scope;

export type StoreToolId = "store-assistant" | "growth-sync" | "market-research" | "google-ads-agent";

export type ShopifyToolAccess = {
  id: StoreToolId;
  name: string;
  /** What the tool does on the store, in a sentence. */
  summary: string;
  scopes: readonly StoreScope[];
  /**
   * What it needs to open, when less than all of `scopes`: the Store Assistant
   * needs nothing (it asks for what is missing), the Google Ads agent the catalogue;
   * each other scope adds what the tool can do.
   * Without this, every scope is needed (the tool runs fixed steps that use them all).
   */
  required?: readonly StoreScope[];
};

/**
 * The Store Assistant works with exactly these scopes. Anything outside them
 * (orders, customers, discounts, themes, …) is refused, even when the store's
 * token would allow it.
 */
export const STORE_ASSISTANT_SCOPES = [
  "read_products",
  "write_products",
  "read_inventory",
  "write_inventory",
  "read_locations",
  "write_locations",
  "read_files",
  "write_files",
  "read_publications",
  "write_publications",
] as const satisfies readonly StoreScope[];

export const SHOPIFY_TOOL_ACCESS: readonly ShopifyToolAccess[] = [
  {
    id: "store-assistant",
    name: "Store Assistant",
    summary: "Reads and edits products, variants, collections, inventory, images and where products are published.",
    // Opens with whatever the store gave: each scope adds what it can do, and it asks for what is missing.
    required: [],
    scopes: STORE_ASSISTANT_SCOPES,
  },
  {
    id: "google-ads-agent",
    name: "Google Ads agent",
    summary:
      "Reads your catalogue and sales totals (no customer data) to plan campaigns, and can fix product data that breaks Merchant Center, always on an approval card.",
    // Opens with the catalogue; each other scope adds one thing: fixing products, inventory, images, channels, sales totals.
    required: ["read_products"],
    scopes: [
      "read_products",
      "write_products",
      "read_inventory",
      "write_inventory",
      "read_files",
      "write_files",
      "read_publications",
      "write_publications",
      "read_reports",
    ],
  },
  {
    id: "growth-sync",
    name: "Growth Sync",
    summary: "Finds new products, creates collections, adds and removes products, and deletes collections it made.",
    scopes: ["read_products", "write_products"],
  },
  {
    id: "market-research",
    name: "Market Research",
    summary: "Reads products, collections and brands, creates collections with SEO and publishes them, and writes blog articles.",
    scopes: ["read_products", "write_products", "read_publications", "write_publications", "read_content", "write_content"],
  },
];

/** One tool's entry. */
export const storeToolAccess = (id: StoreToolId): ShopifyToolAccess => SHOPIFY_TOOL_ACCESS.find((tool) => tool.id === id)!;

/** The tools that use a scope, for "needed by". */
export const toolsUsingScope = (scope: StoreScope): ShopifyToolAccess[] => SHOPIFY_TOOL_ACCESS.filter((tool) => tool.scopes.includes(scope));

/** Every scope the tools use, in the order of the areas, for "copy all". */
export const ALL_SHOPIFY_SCOPES: readonly StoreScope[] = STORE_ACCESS_AREAS.flatMap((area) => (area.edit ? [area.read, area.edit] : [area.read])).filter(
  (scope) => toolsUsingScope(scope).length > 0
);

/** Shopify grants read access with every write scope. */
export function hasShopifyScope(granted: ReadonlySet<string>, scope: string): boolean {
  return granted.has(scope) || (scope.startsWith("read_") && granted.has(scope.replace(/^read_/, "write_")));
}

/** The scopes of a list the store has not granted. */
export function missingShopifyScopes<S extends string>(granted: Iterable<string>, scopes: readonly S[]): S[] {
  const set = granted instanceof Set ? (granted as ReadonlySet<string>) : new Set(granted);
  return scopes.filter((s) => !hasShopifyScope(set, s));
}

/** The scopes a tool cannot open without. */
export const requiredShopifyScopes = (tool: ShopifyToolAccess): readonly StoreScope[] => tool.required ?? tool.scopes;

/** Why a tool is locked, or null when it opens. */
export type ToolLock = { reason: "no-store" } | { reason: "missing-scopes"; missing: string[] } | null;

/**
 * Which store tools open for this workspace. The Store Assistant always opens.
 * The other tools need a store, and on Shopify the scopes they cannot open
 * without; when the scopes are not known yet (null), nothing is locked for
 * them: the tools still say what is missing when they run. WooCommerce has no
 * scopes: its tools open.
 */
export function storeToolLocks(provider: string | null | undefined, grantedScopes: readonly string[] | null | undefined): Record<StoreToolId, ToolLock> {
  const locks = {} as Record<StoreToolId, ToolLock>;
  for (const tool of SHOPIFY_TOOL_ACCESS) {
    // The Store Assistant opens with or without a store, and with whatever access it has: it asks for what is missing.
    if (tool.id === "store-assistant") locks[tool.id] = null;
    else if (!provider) locks[tool.id] = { reason: "no-store" };
    else if (provider === "shopify" && Array.isArray(grantedScopes)) {
      const missing = missingShopifyScopes(grantedScopes, requiredShopifyScopes(tool));
      locks[tool.id] = missing.length ? { reason: "missing-scopes", missing } : null;
    } else locks[tool.id] = null;
  }
  return locks;
}
