// Shopify product fetching — GraphQL Admin API 2026-04 native.
// Three modes:
//   - page     : single `products(first, after, query)` page (default)
//   - bulk_query: `bulkOperationRunQuery` for large catalogs
//   - by_ids   : `nodes(ids: [...])` for continuation on remembered targets
//
// The legacy `fetchShopifyProductsSheet(integration, options)` entry point is
// retained for the SyncProvider registry; it now delegates to the page API and
// paginates if `limit <= 0`.

import type {
  ClientPredicate,
  FetchProductsOptions,
  IntegrationRecord,
  ShopifyServerFilter,
  SyncSheet,
} from "../../core/types";
import {
  buildDynamicColumnList,
  buildShopifyGqlProductsSheet,
  normalizeShopifyGqlProduct,
} from "./normalize";
import { shopifyGraphQL } from "./graphql-client";
import { applyClientPredicates, buildProductsQuery } from "./filter-builder";

// ─── GraphQL documents ────────────────────────────────────────────────────────

const PRODUCTS_PAGE_QUERY = /* GraphQL */ `
  query ProductsPage($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          title
          handle
          status
          vendor
          productType
          descriptionHtml
          tags
          totalInventory
          publishedAt
          createdAt
          updatedAt
          seo { title description }
          featuredMedia { id alt preview { image { url } } }
          media(first: 20) { nodes { id alt preview { image { url } } } }
          variantsCount { count }
          variants(first: 10) {
            nodes {
              id
              sku
              barcode
              price
              compareAtPrice
              inventoryQuantity
              inventoryPolicy
              inventoryItem { id }
            }
          }
          collections(first: 25) {
            nodes { id title handle }
          }
          metafields(first: 25) {
            nodes { id namespace key value type }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type FetchProductsPageResult = {
  sheet: SyncSheet;
  endCursor: string | null;
  hasNextPage: boolean;
};

// ─── Page-mode fetch ──────────────────────────────────────────────────────────

export async function fetchShopifyProductsPage(params: {
  integration: IntegrationRecord;
  serverFilter?: ShopifyServerFilter | null;
  clientPredicates?: ClientPredicate[] | null;
  cursor?: string | null;
  limit?: number;
}): Promise<FetchProductsPageResult> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 250);
  const query = buildProductsQuery(params.serverFilter) || null;

  const res = await shopifyGraphQL<{
    products: {
      edges: Array<{ cursor: string; node: unknown }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>({
    integration: params.integration,
    query: PRODUCTS_PAGE_QUERY,
    variables: { first: limit, after: params.cursor ?? null, query },
    options: { estimatedCost: 5 + limit * 2, tag: "productsPage" },
  });
  if (res.errors.length > 0) {
    throw new Error(`products query failed: ${res.errors[0].message}`);
  }
  const edges = res.data?.products?.edges ?? [];
  const pageInfo = res.data?.products?.pageInfo ?? { hasNextPage: false, endCursor: null };

  let products = edges.map((e) => e.node);
  if (params.clientPredicates && params.clientPredicates.length > 0) {
    const normalized = products.map((p) => normalizeShopifyGqlProduct(p as never));
    const keepIdx = new Set(applyClientPredicates(normalized, params.clientPredicates));
    products = products.filter((_, i) => keepIdx.has(i));
  }

  const sheet = buildShopifyGqlProductsSheet({
    integrationName: params.integration.integration_name,
    products: products as never,
  });

  return {
    sheet,
    endCursor: pageInfo.endCursor ?? null,
    hasNextPage: !!pageInfo.hasNextPage,
  };
}

// ─── By-IDs fetch ─────────────────────────────────────────────────────────────

// ─── Bulk-query fetch ─────────────────────────────────────────────────────────

// ─── Legacy registry entry-point (auto-paginated when limit <= 0) ─────────────

export async function fetchShopifyProductsSheet(
  integration: IntegrationRecord,
  options: FetchProductsOptions = {}
): Promise<SyncSheet> {
  if (integration.provider !== "shopify") {
    throw new Error(`Expected shopify provider, got ${integration.provider}`);
  }
  const limit = options.limit ?? 50;
  const shouldLoadAll = limit <= 0;

  if (!shouldLoadAll) {
    const { sheet } = await fetchShopifyProductsPage({
      integration,
      limit: Math.min(Math.max(limit, 1), 250),
    });
    return sheet;
  }

  // Load all pages. For very large catalogs (>1000) the agent should use bulk mode instead.
  const all: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page += 1) {
    const res = await fetchShopifyProductsPage({
      integration,
      limit: 250,
      cursor,
    });
    all.push(...(res.sheet.rows as Record<string, unknown>[]));
    if (!res.hasNextPage || !res.endCursor) break;
    cursor = res.endCursor;
  }
  return {
    title: `Products · ${integration.integration_name}`,
    columns: buildDynamicColumnList(all),
    rows: all,
  };
}
