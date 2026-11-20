// Provider-agnostic core types for Sync engine.
// All providers (Shopify, WooCommerce, future CMSes) implement these interfaces.

export type SyncSheetRow = Record<string, unknown>;

export type SyncSheet = {
  title: string;
  columns: string[];
  rows: SyncSheetRow[];
  /** Set when a fetch stopped early (budget/ceiling) and more rows exist. */
  truncated?: boolean;
};

export type SyncProviderId = "shopify" | "woocommerce" | string;

export type IntegrationRecord = {
  provider: SyncProviderId;
  integration_name: string;
  base_url?: string | null;
  config?: Record<string, unknown> | null;
};

export type ProviderTestResult = {
  provider: SyncProviderId;
  accountLabel: string;
  baseUrl: string;
  metadata?: Record<string, unknown>;
};

export type ApplyUpdate = {
  productId: string;
  row: SyncSheetRow;
  changedColumns: string[];
};

export type ApplyChangesInput = {
  integration: IntegrationRecord;
  creates: SyncSheetRow[];
  updates: ApplyUpdate[];
};

export type ApplyChangesResult = {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: string[];
  /** Non-fatal notes: the row was applied, but something needs the user's eye
   *  (e.g. gallery images can be added via API but not removed). */
  warnings?: string[];
};

export type FetchProductsOptions = {
  limit?: number; // 0 or negative = load all
};

export type ProviderCapabilities = {
  hasVariants: boolean;
  hasInventoryLevels: boolean;
  supportsBatch: boolean;
  batchLimit: number;
  supportsBidirectionalSync: boolean;
};

export type ProviderConfigField = {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder?: string;
  required?: boolean;
  helpText?: string;
};

/**
 * Provider-specific vocabulary that the agent loop, tool catalog, and UI must
 * read from the *connected* provider rather than hardcoding Shopify constants.
 *
 * This is the contract that lets a new CMS plug in without touching the agent
 * or the UI: each provider declares its own writable columns, column profiles
 * (UI tabs), server-side filter keys, and client-side predicate kinds.
 */
export type ProviderSchema = {
  /** Canonical column names this provider returns by default. */
  coreColumns: readonly string[];
  /** Columns the AI is allowed to write into via sync_columns_write_with_ai. */
  writableColumns: readonly string[];
  /** UI tab → column list. Keys should be a subset of ColumnProfileKey. */
  columnProfiles: Record<string, string[]>;
  /** Keys the provider can filter server-side. Empty array = no API filtering. */
  serverFilterKeys: readonly string[];
  /** Predicate kinds applied client-side after fetch. */
  clientPredicateKinds: readonly string[];
  /** Human label for the taxonomy entity ("Collections" | "Categories" | …). */
  taxonomyLabel: string;
};

/** A resolved taxonomy group (Shopify collection / WooCommerce category / …). */
export type ResolvedTaxonomy = {
  id: string;
  handle?: string;
  title?: string;
};

/** A taxonomy group as listed for selection, with the facts a caller needs to
 *  decide whether it can be written to. */
export type TaxonomySummary = {
  id: string;
  title: string;
  handle?: string;
  productCount: number;
  /**
   * Whether membership can be edited through `assign`/`unassign`.
   *
   * False means the provider derives membership from rules and rejects manual
   * changes (a Shopify smart collection). Providers with no such concept
   * report `true`. Callers gate on this flag rather than on any
   * provider-shaped field, so a new CMS needs no special case.
   */
  manual: boolean;
  /** Parent taxonomy id, when the provider models a hierarchy (WooCommerce
   *  categories). Absent on flat taxonomies (Shopify collections). */
  parent?: string;
  /** Customer-facing URL, when the provider exposes one directly. */
  url?: string;
  /** "brand" marks a brand/vendor PLP (Shopify `vendor` filter page, or a
   *  WooCommerce brand taxonomy/attribute archive) synthesized alongside the
   *  real taxonomy list, rather than a real category/collection. Omitted
   *  means "collection" — every consumer treats a brand item exactly like
   *  any other taxonomy group except for what its name is allowed to become. */
  kind?: "collection" | "brand";
};

/** A product discovered by `detectNewProducts`, flattened to what the
 *  classification pipeline actually reads. */
export type DetectedProduct = {
  /** Provider-native reference: a Shopify GID, a WooCommerce numeric id, … */
  id: string;
  title: string;
  /** ISO 8601 creation timestamp. Drives the watermark. */
  createdAt: string;
  /** Customer-facing URL, when the provider exposes one. */
  url?: string;
  imageUrl?: string;
  productType?: string;
  vendor?: string;
  tags?: string[];
  description?: string;
};

/**
 * Provider-agnostic taxonomy operations. A provider implements only what it
 * supports; the agent gates each tool on the presence of the method, surfacing
 * a clear "not supported on {provider}" message otherwise instead of silently
 * doing the wrong thing.
 */
export interface ProviderTaxonomy {
  /** Find a taxonomy group by name/handle. Returns null if none match. */
  resolve(input: {
    integration: IntegrationRecord;
    name: string;
  }): Promise<ResolvedTaxonomy | null>;
  /** Add products to a taxonomy group (additive — never removes existing). */
  assign(input: {
    integration: IntegrationRecord;
    taxonomyId: string;
    productIds: string[];
  }): Promise<{ assignedCount: number; newTotal?: number }>;
  /** Permanently delete taxonomy groups by id. Aggregates per-id outcomes. */
  delete(input: {
    integration: IntegrationRecord;
    ids: string[];
  }): Promise<{ deletedIds: string[]; failed: Array<{ id: string; error: string }> }>;
  /** Every taxonomy group in the store, for pickers. Walks all pages. */
  list?(input: {
    integration: IntegrationRecord;
    /** Safety valve so a pathological catalog can't spin forever. */
    max?: number;
  }): Promise<TaxonomySummary[]>;
  /**
   * Remove products from a taxonomy group — the inverse of `assign`.
   *
   * `pendingJobRef` is set when the provider queues the removal instead of
   * applying it inline, so a caller can report "removing" rather than claiming
   * a completion it hasn't observed.
   */
  unassign?(input: {
    integration: IntegrationRecord;
    taxonomyId: string;
    productIds: string[];
  }): Promise<{ removedCount: number; pendingJobRef?: string }>;
}

/**
 * Detection of newly created products inside one taxonomy group, for the
 * Growth Sync engine.
 *
 * Every provider answers the same question — "what appeared here after this
 * moment?" — but the cheapest route differs sharply: WooCommerce filters by
 * date server-side, while Shopify's collection connection accepts no query
 * argument and must be walked newest-first until the watermark is crossed.
 * Keeping that difference behind this method is what lets the engine stay
 * provider-agnostic.
 */
export interface ProviderGrowthSync {
  detectNewProducts(input: {
    integration: IntegrationRecord;
    taxonomyId: string;
    /** ISO 8601 watermark. `null` means "first run" and detects nothing. */
    since: string | null;
    /** Page ceiling for providers that must paginate. */
    maxPages?: number;
  }): Promise<{
    /** Newest first. Empty when nothing was created after `since`. */
    products: DetectedProduct[];
    /** `createdAt` of the newest product seen, for advancing the watermark. */
    newestCreatedAt: string | null;
    /** True when the page ceiling cut the walk short. */
    truncated?: boolean;
  }>;
}

export interface SyncProvider {
  id: SyncProviderId;
  label: string;
  capabilities: ProviderCapabilities;
  /** Provider-specific column/filter/profile vocabulary. Drives the agent
   *  prompt, tool validation, and UI tabs without Shopify-hardcoding. */
  schema: ProviderSchema;
  /** Optional taxonomy CRUD. Absent methods → tool reports "not supported". */
  taxonomy?: ProviderTaxonomy;
  /** Optional new-product detection. Absent → Growth Sync rules are refused
   *  for this provider with a clear message instead of silently idling. */
  growthSync?: ProviderGrowthSync;
  /** Fields the user enters when connecting this provider. */
  configFields: ProviderConfigField[];
  /** Save: returns `{ baseUrl, config }` to persist after a successful test. */
  buildSavePayload(input: {
    config: Record<string, any>;
    testResult: ProviderTestResult;
  }): { baseUrl: string; config: Record<string, unknown> };
  /** Test connection. Throws on failure with a user-friendly message. */
  testConnection(config: Record<string, any>): Promise<ProviderTestResult>;
  /** Fetch products into a normalized SyncSheet. */
  fetchProductsSheet(
    integration: IntegrationRecord,
    options?: FetchProductsOptions
  ): Promise<SyncSheet>;
  /** Apply create/update changes back to the provider. */
  applyChanges(input: ApplyChangesInput): Promise<ApplyChangesResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// v3 Agent types (orchestrator + workers + evaluator)
// ─────────────────────────────────────────────────────────────────────────────

/** Dynamic column profile — replaces static SHEET_VIEWS. */
export type ColumnProfileKey =
  | "core"
  | "pricing"
  | "seo"
  | "content"
  | "imagery"
  | "inventory"
  | "collections"
  | "publishing"
  | "taxonomy"
  | "translations"
  | "variants"
  | "metafields"
  | "all";

/** Server-side Shopify filter — only fields Shopify supports natively. */
export type ShopifyServerFilter = {
  status?: "ACTIVE" | "ARCHIVED" | "DRAFT";
  vendor?: string;
  productType?: string;
  tag?: string | string[];
  collectionId?: string;
  priceRange?: { min?: number; max?: number };
  inventoryRange?: { min?: number; max?: number };
  outOfStockSomewhere?: boolean;
  isPriceReduced?: boolean;
  giftCard?: boolean;
  createdAfter?: string;
  updatedAfter?: string;
  handle?: string;
  sku?: string;
  barcode?: string;
  metafield?: { namespace: string; key: string; value: string };
  publishedStatus?: "published" | "unpublished" | "any";
  freeText?: string;
};

/** Client-side predicate — applied after fetch. */
export type ClientPredicate =
  | { kind: "missing_image" }
  | { kind: "image_count_lt"; n: number }
  | { kind: "description_shorter_than"; chars: number }
  | { kind: "missing_seo_title" }
  | { kind: "missing_seo_description" }
  | { kind: "missing_alt_text" }
  | { kind: "title_matches"; regex: string }
  | { kind: "no_collections" }
  | { kind: "body_html_empty" };

/** Shopify GraphQL cost info parsed from response extensions. */
export type ShopifyCostInfo = {
  requestedQueryCost: number;
  actualQueryCost: number | null;
  throttleStatus: {
    maximumAvailable: number;
    currentlyAvailable: number;
    restoreRate: number;
  };
};

/** Result of a single Shopify GraphQL call. */
export type ShopifyGraphQLResult<T> = {
  data: T | null;
  errors: Array<{ message: string; extensions?: Record<string, unknown> }>;
  userErrors: Array<{ field: string[] | null; message: string; code?: string }>;
  cost: ShopifyCostInfo | null;
};
