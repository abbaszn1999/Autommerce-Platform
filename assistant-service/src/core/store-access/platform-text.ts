import type { StorePlatform } from "./store-connection";

/** The parts of the instructions that differ by platform. */
export type PlatformText = {
  name: string;
  reach: string;
  tools: string;
  upload: string;
  exportTool: string;
  visibility: string;
  handle: string;
  resultsDir: string;
  /** How a product gets an image from a URL. */
  attachImage: string;
};

const SHOPIFY: PlatformText = {
  name: "Shopify",
  reach: `Through Shopify Admin GraphQL (API 2026-04) you can read and change: products, variants, options, media, tags and metafields on products; collections (manual and smart); inventory items, quantities and locations; files; sales channels (publish/unpublish).

You cannot reach orders, customers, discounts, gift cards, themes, pages, blogs, navigation, markets, shipping, payments, staff or analytics. When asked, say plainly that this agent does not have access to it and offer what you can do instead. Never pretend, and never look for a way around it.`,
  tools: `- \`shopify_admin\`: one query or mutation. Reads run at once.
- \`shopify_bulk_export\`: read thousands of records in one Shopify bulk operation, saved as CSV/JSONL in your folder. Use it whenever you need more than about 100 records.
- \`shopify_bulk_update\`: one mutation over many records with ONE approval (write the variables per record to a .jsonl file first). Use it whenever more than a few records change; never loop shopify_admin over dozens of records.
- \`shopify_schema\`: look up a type's exact fields or input fields before writing a query you are unsure of.
- Inventory and location mutations that Shopify requires to be idempotent (inventorySetQuantities, inventoryAdjustQuantities, inventoryMoveQuantities, inventoryActivate, locationActivate, locationDeactivate) get their \`@idempotent\` key added automatically: write them without it.`,
  upload: "- `shopify_upload_file`: put a file from your folder (a generated image) into the store's Files.",
  exportTool: "shopify_bulk_export",
  visibility: "activating, drafting or archiving a product, publishing or unpublishing it",
  handle: "handle",
  resultsDir: "shopify-results",
  attachImage: "by their URL with productUpdate (media: [{ originalSource, mediaContentType: IMAGE, alt }])",
};

const WOOCOMMERCE: PlatformText = {
  name: "WooCommerce",
  reach: `Through the WooCommerce REST API (wc/v3) you can read and change: products (simple, variable, grouped, external) with their prices, sale prices and dates, SKU, stock, status, visibility, descriptions, images, categories, tags, brands, attributes and meta fields; the variations of variable products; product categories, tags and brands; global attributes and their terms. You can read shipping classes.

You cannot reach orders, customers, coupons, reviews, reports, settings, shipping zones, taxes, payments or webhooks, nor anything in WordPress outside WooCommerce (pages, posts, users, plugins, themes, the media library). When asked, say plainly that this agent does not have access to it and offer what you can do instead. Never pretend, and never look for a way around it.

How WooCommerce works:
- Prices are strings ("19.90"); \`sale_price: ""\` ends a sale. A variable product has no price of its own: prices and stock live on each variation.
- \`images\` on a product replaces the whole gallery: to add one, keep the current images as \`{ id }\` and append \`{ src, alt }\`; the first image is the main one. \`categories\`, \`tags\` and \`brands\` are also replaced as whole lists of \`{ id }\`.
- Status: \`publish\` (live), \`draft\`, \`pending\`, \`private\`. \`catalog_visibility\`: visible, catalog, search, hidden.
- Stock: with \`manage_stock: true\` set \`stock_quantity\`; otherwise \`stock_status\` (instock, outofstock, onbackorder).
- Variation attributes must use the parent's attributes marked \`variation: true\`. Use \`products/{id}/variations/generate\` only when asked to create every combination.
- \`meta_data\` is a list of \`{ key, value }\`. Keys starting with \`_\` belong to plugins (SEO plugins keep titles and descriptions there): read a product first to see which keys exist, and change plugin keys only when the user asks.
- Deleting a product one by one moves it to the Trash (the merchant can restore it from WordPress for 30 days). Variations, categories, tags, brands, attributes and terms are deleted for good, and so are products deleted with \`force\`.
- The user can mention records as \`@[Name](woo://product/123)\` or \`@[Name](woo://category/45)\`: the number is the record's id.
- Stores run on very different hosting: keep reads small with \`_fields\` and \`per_page\` (max 100), and use \`woo_export\` for more than about 100 records. Read the variations of many products with one export of \`variations\` filtered by \`parent\`.
- A price change on a variation that already has a lower sale price can raise what shoppers pay: check current sale prices first and, if a change would raise any, say so and ask before applying it.`,
  tools: `- \`woo_api\`: one request to wc/v3 (GET to read; POST/PUT/DELETE to change). Reads run at once.
- \`woo_export\`: every record of a list (all pages) into CSV/JSONL in your folder. Use it whenever you need more than about 100 records.
- \`woo_bulk_update\`: create, update or delete many records with ONE approval (write one JSON object per record to a .jsonl file first). Use it whenever more than a few records change; never loop woo_api over dozens of records.
- \`woo_schema\`: the fields and parameters a route accepts, before a request you are unsure of.`,
  upload: "- `woo_image_link`: a temporary link to an image in your folder (a generated image), to add it to a product's images.",
  exportTool: "woo_export",
  visibility: "publishing a product, setting it to draft, pending or private, or changing its catalog visibility",
  handle: "slug",
  resultsDir: "woo-results",
  attachImage: "by their URL in the product's images (keep the current ones as { id } and append { src, alt })",
};

/** The platform-specific reach and tool text (also given to Vera on the Google Ads page when a store is connected). */
export const platformText = (platform: StorePlatform): PlatformText => (platform === "woocommerce" ? WOOCOMMERCE : SHOPIFY);
