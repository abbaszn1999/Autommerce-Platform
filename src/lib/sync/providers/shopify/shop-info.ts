import type { IntegrationRecord } from "@/lib/sync/core/types";
import { shopifyGraphQL } from "./graphql-client";

const SHOP_INFO_QUERY = /* GraphQL */ `
  query ShopInfo {
    shop {
      primaryDomain {
        url
      }
    }
  }
`;

/**
 * The store's customer-facing domain, which is what a storefront link must
 * point at — the admin `base_url` is not always the domain shoppers see.
 * Null when the store could not be asked.
 */
export async function fetchShopStoreUrl(params: {
  integration: IntegrationRecord;
}): Promise<string | null> {
  try {
    const res = await shopifyGraphQL<{
      shop: { primaryDomain: { url: string | null } | null };
    }>({
      integration: params.integration,
      query: SHOP_INFO_QUERY,
      variables: {},
      options: { estimatedCost: 2, tag: "shopInfo" },
    });
    return res.data?.shop?.primaryDomain?.url ?? null;
  } catch {
    return null;
  }
}
