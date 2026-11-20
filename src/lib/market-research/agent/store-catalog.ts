import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntegrationRecord } from "@/lib/sync/core/types";
import { fetchAllShopifyCollections } from "@/lib/sync/providers/shopify/collections";
import { shopifyGraphQL } from "@/lib/sync/providers/shopify/graphql-client";
import { fetchWooCommerceCategories } from "@/lib/sync/providers/woocommerce/categories";
import { createWooClient } from "@/lib/sync/providers/woocommerce/client";
import { fetchShopifyVendorBrands, fetchWooBrandTaxonomy } from "@/lib/sync/brand-taxonomy";
import type { MarketResearchProduct } from "@/components/market-research/workspace-data";

// ─── Brand / vendor discovery ──────────────────────────────────────────────
//
// The actual Shopify/WooCommerce fetch logic lives in
// `@/lib/sync/brand-taxonomy`. Each vendor/brand becomes its own PLP-shaped item (`kind:
// "brand"`), treated by every downstream stage exactly like a normal
// collection/category.

async function fetchShopifyVendors(
  integration: IntegrationRecord
): Promise<StoreCollectionItem[]> {
  const brands = await fetchShopifyVendorBrands(integration);
  return brands.map((b) => ({
    id: b.id,
    name: b.name,
    handle: b.handle,
    description: "",
    productCount: b.productCount,
    plpPath: "",
    published: true,
    kind: "brand" as const,
  }));
}

/**
 * Every returned item is a full PLP-shaped `StoreCollectionItem` with a real
 * product count, treated identically to a category by every later stage.
 * Most brand-taxonomy plugins rewrite to /brand/<slug>/; `plpPath` is left
 * blank since there is no single standard archive route across stores.
 */
async function fetchWooBrands(
  integration: IntegrationRecord
): Promise<StoreCollectionItem[]> {
  const brands = await fetchWooBrandTaxonomy(integration);
  return brands.map((b) => ({
    id: b.id,
    name: b.name,
    handle: b.handle,
    description: "",
    productCount: b.productCount,
    plpPath: "",
    published: true,
    kind: "brand" as const,
  }));
}

/**
 * Derives each collection's hierarchy depth from its `parentId` chain and
 * writes it back onto the item in place. Top-level categories (parentId
 * missing or "0") are depth 0; every step down the parent chain adds 1.
 * Cycle-safe: a broken or circular parent chain resolves to 0 rather than
 * looping forever.
 */
function computeCollectionDepths(collections: StoreCollectionItem[]): void {
  const byId = new Map(collections.map((c) => [c.id, c]));
  const resolved = new Map<string, number>();

  function resolveDepth(id: string, guard: number): number {
    if (guard > 25) return 0;
    const cached = resolved.get(id);
    if (cached !== undefined) return cached;

    const item = byId.get(id);
    if (!item || !item.parentId || item.parentId === "0") {
      resolved.set(id, 0);
      return 0;
    }

    const depth = resolveDepth(item.parentId, guard + 1) + 1;
    resolved.set(id, depth);
    return depth;
  }

  for (const item of collections) {
    item.depth = resolveDepth(item.id, 0);
  }
}

export type StoreCollectionItem = {
  id: string;
  name: string;
  handle: string;
  description: string;
  productCount: number;
  plpPath: string;
  /**
   * False when the collection exists in the admin but is not on the storefront
   * sales channel, in which case its URL answers 404 and it must never be used
   * as an internal link target.
   */
  published?: boolean;
  /**
   * WooCommerce only. The parent category id ("0" = top-level). Shopify
   * collections are flat and never set this field.
   */
  parentId?: string;
  /**
   * WooCommerce only. 0 = top-level category, 1 = subcategory, 2 = sub-subcategory,
   * derived by walking the parentId chain. Shopify collections are always 0.
   */
  depth?: number;
  /**
   * "brand" marks a brand/vendor PLP (Shopify `vendor` filter page, or a
   * WooCommerce brand taxonomy/attribute archive) rather than a real
   * category or collection. Omitted (undefined) means "collection" — every
   * downstream stage treats a brand item exactly like any other collection
   * except for what its name is allowed to become (never a niche name).
   */
  kind?: "collection" | "brand";
};

export type StoreCatalogResult = {
  storeName: string;
  provider: string;
  baseUrl: string;
  isMock: boolean;
  collections: StoreCollectionItem[];
  /**
   * Every brand/vendor found on the store, each as a full PLP-shaped item
   * (`kind: "brand"`) with a real product count — the Shopify `vendor`
   * roster or the WooCommerce brand taxonomy/attribute terms. Not capped or
   * sampled. Empty array when the store has none. Callers typically merge
   * this straight into the `collections` list before niche discovery so
   * every stage treats a brand exactly like any other collection.
   */
  storeBrands: StoreCollectionItem[];
};

export type ScopeCollectionInput = {
  id: string;
  name: string;
  productCount?: number;
  parentNicheName?: string;
  description?: string;
};

function stripHtml(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchStoreCatalog(
  admin: SupabaseClient,
  workspaceId: string
): Promise<StoreCatalogResult> {
  const { data: integrationRow } = await admin
    .from("workspace_integrations")
    .select("provider, integration_name, base_url, config")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!integrationRow || !integrationRow.provider) {
    throw new Error(
      "No active store integration found for this workspace. Please connect Shopify or WooCommerce in Settings first."
    );
  }

  const integration = integrationRow as IntegrationRecord;
  const storeName = integration.integration_name || "Connected Store";
  const provider = String(integration.provider).toLowerCase();
  const baseUrl = integration.base_url || "";

  try {
    if (provider === "shopify") {
      const shopifyRows = await fetchAllShopifyCollections({ integration });
      const collections: StoreCollectionItem[] = shopifyRows.map((row) => {
        const id = String(row.id ?? "");
        const name = String(row.title ?? "");
        const handle = String(row.handle ?? "");
        const description = stripHtml(String(row.description ?? ""));
        const productCount = Number(row.products_count) || 0;
        const plpPath = handle ? `/collections/${handle}` : "";
        const publishedLabel = String(row.published ?? "");
        return {
          id: id || handle || name,
          name: name || handle,
          handle,
          description,
          productCount,
          plpPath,
          published:
            publishedLabel.length > 0 && publishedLabel !== "Not published",
        };
      });

      const storeBrands = await fetchShopifyVendors(integration).catch((error) => {
        console.error("[fetchStoreCatalog] Failed to fetch Shopify vendors:", error);
        return [] as StoreCollectionItem[];
      });
      return {
        storeName,
        provider: "shopify",
        baseUrl,
        isMock: false,
        collections,
        storeBrands,
      };
    }

    if (provider === "woocommerce" || provider === "wordpress") {
      const sheet = await fetchWooCommerceCategories({
        integration,
        limit: 5000,
      });
      const collections: StoreCollectionItem[] = sheet.rows.map((row) => {
        const id = String(row.id ?? "");
        const name = String(row.name ?? "");
        const handle = String(row.slug ?? "");
        const description = stripHtml(String(row.description ?? ""));
        const productCount = Number(row.count) || 0;
        const plpPath = handle ? `/product-category/${handle}` : "";
        const parentId = String(row.parent ?? 0);
        return {
          id: id || handle || name,
          name: name || handle,
          handle,
          description,
          productCount,
          plpPath,
          published: true,
          parentId,
        };
      });

      computeCollectionDepths(collections);

      const storeBrands = await fetchWooBrands(integration).catch((error) => {
        console.error("[fetchStoreCatalog] Failed to fetch WooCommerce brands:", error);
        return [] as StoreCollectionItem[];
      });
      return {
        storeName,
        provider: "woocommerce",
        baseUrl,
        isMock: false,
        collections,
        storeBrands,
      };
    }

    throw new Error(
      `Unsupported store provider "${provider}". Connect Shopify or WooCommerce in Settings.`
    );
  } catch (error) {
    console.error("[fetchStoreCatalog] Failed to fetch live collections:", error);
    throw error;
  }
}

const SHOPIFY_COLLECTION_PRODUCTS_PAGE_QUERY = /* GraphQL */ `
  query CollectionProductsPage($id: ID!, $first: Int!, $after: String) {
    collection(id: $id) {
      id
      title
      handle
      products(first: $first, after: $after) {
        edges {
          node {
            id
            title
            handle
            descriptionHtml
            vendor
            productType
            tags
            totalInventory
            featuredMedia {
              ... on MediaImage {
                image { url altText }
              }
              preview { image { url } }
            }
            media(first: 6) {
              nodes {
                preview { image { url } }
              }
            }
            variants(first: 5) {
              nodes {
                id
                price
                compareAtPrice
                title
                selectedOptions { name value }
              }
            }
            options { name values }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

// ─── Paginated, resumable product fetch ────────────────────────────────────
//
// A single GraphQL/REST page tops out at 250 (Shopify) / 100 (WooCommerce)
// products, and a store's selected collections can hold 20,000+ SKUs — far
// past what one request or one `maxDuration = 60` route call can pull. This
// walks collections in order, one page at a time, and returns a resumable
// cursor so the caller can drive it in a client-side loop (same pattern as
// the existing Apify extract poll) until every selected collection is fully
// paged or the global cap is hit.

/** Safety ceiling: no single project embeds/matches against more than this many SKUs. */
export const GLOBAL_PRODUCT_FETCH_CAP = 20_000;
const PRODUCT_FETCH_TIME_BUDGET_MS = 40_000;
const SHOPIFY_PRODUCTS_PAGE_SIZE = 250;
const WOO_PRODUCTS_PAGE_SIZE = 100;

export type ProductFetchCursorState = {
  /** Index into the caller's `selectedCollections` array of the collection currently paging. */
  collectionIndex: number;
  shopifyAfter: string | null;
  wooPage: number;
  totalFetched: number;
  perCollectionFetched: Record<string, number>;
  done: boolean;
};

export function initProductFetchCursor(): ProductFetchCursorState {
  return {
    collectionIndex: 0,
    shopifyAfter: null,
    wooPage: 1,
    totalFetched: 0,
    perCollectionFetched: {},
    done: false,
  };
}

type ShopifyProductNode = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  totalInventory?: number;
  featuredMedia?: {
    image?: { url: string };
    preview?: { image?: { url: string } };
  };
  media?: { nodes: Array<{ preview?: { image?: { url: string } } }> };
  variants?: {
    nodes: Array<{
      id: string;
      price: string;
      compareAtPrice?: string | null;
      title?: string;
    }>;
  };
  options?: Array<{ name: string; values: string[] }>;
};

function mapShopifyProductNode(
  p: ShopifyProductNode,
  col: ScopeCollectionInput,
  baseUrl: string
): MarketResearchProduct {
  const cleanDesc = stripHtml(p.descriptionHtml);
  const shortDesc =
    cleanDesc.length > 200 ? `${cleanDesc.slice(0, 197).trim()}...` : cleanDesc;

  const primaryImg =
    p.featuredMedia?.image?.url ||
    p.featuredMedia?.preview?.image?.url ||
    p.media?.nodes?.[0]?.preview?.image?.url ||
    "";

  const allImages: string[] = [];
  if (primaryImg) allImages.push(primaryImg);
  for (const m of p.media?.nodes ?? []) {
    const url = m.preview?.image?.url;
    if (url && !allImages.includes(url)) allImages.push(url);
  }

  const firstVar = p.variants?.nodes?.[0];
  const amount = Number(firstVar?.price) || 0;
  const compareAt = firstVar?.compareAtPrice
    ? Number(firstVar.compareAtPrice)
    : undefined;

  const attributes: Array<{ name: string; value: string }> = [];
  for (const opt of p.options ?? []) {
    if (opt.name && opt.values && opt.values.length > 0) {
      attributes.push({ name: opt.name, value: opt.values.join(", ") });
    }
  }

  return {
    id: p.id,
    title: p.title || "Untitled Product",
    handle: p.handle || "",
    url: p.handle ? `${baseUrl}/products/${p.handle}` : "",
    primaryImage: primaryImg,
    images: allImages,
    price: {
      amount,
      currency: "USD",
      compareAtPrice: compareAt,
      priceFormatted: `$${amount.toFixed(2)}`,
    },
    shortDescription: shortDesc,
    fullDescription: cleanDesc,
    vendor: p.vendor || "",
    productType: p.productType || "",
    tags: Array.isArray(p.tags) ? p.tags : [],
    attributes,
    collectionIds: [col.id],
    collectionNames: [col.name],
    inStock: (p.totalInventory ?? 1) > 0,
    totalInventory: p.totalInventory ?? undefined,
  };
}

function mapWooProductNode(
  p: Record<string, unknown>,
  col: ScopeCollectionInput,
  baseUrl: string
): MarketResearchProduct | null {
  const id = String(p.id ?? "");
  if (!id) return null;

  const cleanDesc = stripHtml(String(p.description ?? ""));
  const shortDesc =
    stripHtml(String(p.short_description ?? "")) || cleanDesc.slice(0, 180);

  const images = Array.isArray(p.images)
    ? (p.images as Array<{ src?: string }>).map((img) => img.src || "").filter(Boolean)
    : [];
  const primaryImg = images[0] || "";

  const amount = Number(p.price) || 0;
  const compareAt = p.regular_price ? Number(p.regular_price) : undefined;

  const attributes: Array<{ name: string; value: string }> = [];
  if (Array.isArray(p.attributes)) {
    for (const attr of p.attributes as Array<{ name?: string; options?: unknown }>) {
      if (attr.name) {
        const val = Array.isArray(attr.options)
          ? attr.options.join(", ")
          : String(attr.options ?? "");
        attributes.push({ name: attr.name, value: val });
      }
    }
  }

  const tags = Array.isArray(p.tags)
    ? (p.tags as Array<{ name?: string }>).map((t) => t.name || "").filter(Boolean)
    : [];

  return {
    id,
    title: String(p.name ?? "Untitled Product"),
    handle: String(p.slug ?? ""),
    url: String(p.permalink ?? (baseUrl ? `${baseUrl}/product/${p.slug}` : "")),
    primaryImage: primaryImg,
    images,
    price: {
      amount,
      currency: "USD",
      compareAtPrice: compareAt,
      priceFormatted: `$${amount.toFixed(2)}`,
    },
    shortDescription: shortDesc,
    fullDescription: cleanDesc,
    vendor: String(p.vendor ?? ""),
    productType: String(p.type ?? ""),
    tags,
    attributes,
    collectionIds: [col.id],
    collectionNames: [col.name],
    inStock: p.stock_status !== "outofstock",
    totalInventory: typeof p.stock_quantity === "number" ? p.stock_quantity : undefined,
  };
}

/**
 * Fetches one resumable "page" of products for the given cursor position —
 * as many pages as fit inside the time budget, advancing through
 * `selectedCollections` in order. Call again with the returned `cursor`
 * until `cursor.done` is true. Returns no products when the workspace has
 * no live store integration.
 */
export async function fetchStoreProductsPage(
  admin: SupabaseClient,
  workspaceId: string,
  selectedCollections: ScopeCollectionInput[],
  cursor: ProductFetchCursorState
): Promise<{ products: MarketResearchProduct[]; cursor: ProductFetchCursorState }> {
  if (!selectedCollections || selectedCollections.length === 0) {
    return { products: [], cursor: { ...cursor, done: true } };
  }

  const { data: integrationRow } = await admin
    .from("workspace_integrations")
    .select("provider, integration_name, base_url, config")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!integrationRow || !integrationRow.provider) {
    return { products: [], cursor: { ...cursor, done: true } };
  }

  const integration = integrationRow as IntegrationRecord;
  const provider = String(integration.provider).toLowerCase();
  const baseUrl = (integration.base_url || "").replace(/\/+$/, "");

  const next: ProductFetchCursorState = {
    ...cursor,
    perCollectionFetched: { ...cursor.perCollectionFetched },
  };
  const collected: MarketResearchProduct[] = [];
  const startedAt = Date.now();

  while (
    next.collectionIndex < selectedCollections.length &&
    next.totalFetched < GLOBAL_PRODUCT_FETCH_CAP &&
    Date.now() - startedAt < PRODUCT_FETCH_TIME_BUDGET_MS
  ) {
    const col = selectedCollections[next.collectionIndex];

    try {
      if (provider === "shopify") {
        const colGid = col.id.startsWith("gid://")
          ? col.id
          : `gid://shopify/Collection/${col.id}`;

        const res = await shopifyGraphQL<{
          collection: { products: { edges: Array<{ node: ShopifyProductNode }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null;
        }>({
          integration,
          query: SHOPIFY_COLLECTION_PRODUCTS_PAGE_QUERY,
          variables: { id: colGid, first: SHOPIFY_PRODUCTS_PAGE_SIZE, after: next.shopifyAfter },
          options: { estimatedCost: 35, tag: "collectionProducts" },
        });

        const edges = res.data?.collection?.products?.edges ?? [];
        for (const edge of edges) {
          if (edge.node?.id) collected.push(mapShopifyProductNode(edge.node, col, baseUrl));
        }
        next.totalFetched += edges.length;
        next.perCollectionFetched[col.id] = (next.perCollectionFetched[col.id] ?? 0) + edges.length;

        const pageInfo = res.data?.collection?.products?.pageInfo;
        if (pageInfo?.hasNextPage && edges.length > 0) {
          next.shopifyAfter = pageInfo.endCursor ?? null;
        } else {
          next.collectionIndex += 1;
          next.shopifyAfter = null;
        }
      } else if (provider === "woocommerce" || provider === "wordpress") {
        const client = createWooClient(integration);
        const resp = await client.requestRaw("/products", {
          method: "GET",
          query: { category: col.id, per_page: WOO_PRODUCTS_PAGE_SIZE, page: next.wooPage, status: "publish" },
        });
        const list = (await resp.json().catch(() => [])) as Array<Record<string, unknown>>;
        const rows = Array.isArray(list) ? list : [];
        for (const p of rows) {
          const mapped = mapWooProductNode(p, col, baseUrl);
          if (mapped) collected.push(mapped);
        }
        next.totalFetched += rows.length;
        next.perCollectionFetched[col.id] = (next.perCollectionFetched[col.id] ?? 0) + rows.length;

        if (rows.length < WOO_PRODUCTS_PAGE_SIZE) {
          next.collectionIndex += 1;
          next.wooPage = 1;
        } else {
          next.wooPage += 1;
        }
      } else {
        // Unknown provider: nothing more to page, close out this collection.
        next.collectionIndex += 1;
      }
    } catch (err) {
      console.error(
        `[fetchStoreProductsPage] Failed for collection ${col.id}, skipping it:`,
        err
      );
      next.collectionIndex += 1;
      next.shopifyAfter = null;
      next.wooPage = 1;
    }
  }

  next.done = next.collectionIndex >= selectedCollections.length || next.totalFetched >= GLOBAL_PRODUCT_FETCH_CAP;

  return { products: collected, cursor: next };
}

