/**
 * A store's public link shapes, built from its real base address. Every URL is
 * absolute, so it never resolves against the wrong origin.
 */
export type StoreLinks = {
  provider: string;
  /** Absolute, e.g. "https://mystore.myshopify.com". */
  baseUrl: string;
  /** e.g. "https://mystore.myshopify.com/collections/{handle}"; the caller fills in `{handle}`. */
  collectionUrlPattern: string;
};

export function buildStoreLinks(provider: string, baseUrl: string): StoreLinks {
  const origin = normalizeBaseUrl(baseUrl);

  if (provider === "woocommerce") {
    return { provider, baseUrl: origin, collectionUrlPattern: `${origin}/product-category/{handle}` };
  }
  // Shopify's convention is also the safe fallback for an unrecognized provider.
  return { provider: provider || "shopify", baseUrl: origin, collectionUrlPattern: `${origin}/collections/{handle}` };
}

/** Strips a trailing slash and guards against a missing or malformed base address. */
function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
