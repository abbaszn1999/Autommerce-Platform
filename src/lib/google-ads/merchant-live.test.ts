import { describe, expect, it } from "vitest";
import { MerchantPlanError, mapProduct, merchantOverview, planMerchantChange, productStatus, toApiAttributes, validGtin, type ApiProduct, type MerchantProduct } from "./merchant-live";

// Shaped like Composio's GOOGLE_MERCHANT_LIST_PRODUCTS rows (snake_case, with the odd camelCase field).
const apiProduct = (over: Partial<ApiProduct> = {}): ApiProduct => ({
  name: "accounts/1/products/en~US~MUG-1",
  offer_id: "MUG-1",
  content_language: "en",
  feed_label: "US",
  product_attributes: {
    title: "Ceramic Mug",
    description: "A mug.",
    brand: "Kalema",
    gtins: ["0012345678905"],
    image_link: "https://img.example/mug.jpg",
    googleProductCategory: "Mugs",
    price: { amount_micros: "24000000", currency_code: "USD" },
    sale_price: null,
    availability: "IN_STOCK",
    condition: "NEW",
    link: "https://shop.example/mug",
  },
  product_status: {
    destination_statuses: [{ reporting_context: "FREE_LISTINGS", approved_countries: [], disapproved_countries: ["US"], pending_countries: [] }],
    item_level_issues: [
      { code: "missing_shipping", severity: "DISAPPROVED", attribute: "shipping", description: "Missing shipping", resolution: "merchant_action", reporting_context: "FREE_LISTINGS" },
      { code: "missing_shipping", severity: "DISAPPROVED", attribute: "shipping", description: "Missing shipping", resolution: "merchant_action", reporting_context: "SHOPPING_ADS" },
    ],
    last_update_date: "2026-11-03T14:28:06Z",
  },
  ...over,
});

const product = (over: Partial<MerchantProduct> = {}): MerchantProduct => ({ ...mapProduct(apiProduct())!, ...over });

describe("mapProduct", () => {
  it("reads Merchant API products, including camelCase fields and prices in micros", () => {
    const p = mapProduct(apiProduct())!;
    expect(p).toMatchObject({ id: "en~US~MUG-1", offerId: "MUG-1", gtin: "0012345678905", imageLink: "https://img.example/mug.jpg", googleProductCategory: "Mugs", price: 24, currency: "USD", status: "DISAPPROVED" });
    expect(p.salePrice).toBeUndefined();
  });

  it("merges one issue reported for several destinations", () => {
    const p = mapProduct(apiProduct())!;
    expect(p.issues).toHaveLength(1);
    expect(p.issues[0]!.destinations).toEqual(["FREE_LISTINGS", "SHOPPING_ADS"]);
  });

  it("skips rows without a product name", () => {
    expect(mapProduct({ ...apiProduct(), name: undefined })).toBeNull();
  });
});

describe("productStatus", () => {
  const issue = (severity: "DISAPPROVED" | "DEMOTED" | "NOT_IMPACTED") => [{ code: "x", severity, description: "x", destinations: [] }];
  it("approved somewhere is approved, or limited when an issue demotes it", () => {
    expect(productStatus([{ approved_countries: ["US"] }], [])).toBe("APPROVED");
    expect(productStatus([{ approved_countries: ["US"] }], issue("DEMOTED"))).toBe("LIMITED");
    expect(productStatus([{ approved_countries: ["US"] }], issue("NOT_IMPACTED"))).toBe("APPROVED");
  });
  it("refused everywhere is disapproved; nothing decided yet is pending", () => {
    expect(productStatus([{ disapproved_countries: ["US"] }], [])).toBe("DISAPPROVED");
    expect(productStatus([{ pending_countries: ["US"] }], [])).toBe("PENDING");
    expect(productStatus([], [])).toBe("PENDING");
  });
});

describe("validGtin", () => {
  it("checks length and check digit", () => {
    expect(validGtin("0012345678905")).toBe(true);
    expect(validGtin("4006381333931")).toBe(true);
    expect(validGtin("96385074")).toBe(true);
    expect(validGtin("1234567890123")).toBe(false);
    expect(validGtin("12345")).toBe(false);
    expect(validGtin("00123456789O5")).toBe(false);
  });
});

describe("planMerchantChange", () => {
  const products = new Map([[product().id, product()]]);
  const none = new Map();

  it("writes the new value over what Autommerce supplied before, and keeps that for undo", () => {
    const overrides = new Map([[product().id, { brand: "Kalema Home" }]]);
    const plan = planMerchantChange([{ kind: "product.update", productId: "en~US~MUG-1", set: { title: "Handmade Ceramic Mug 350 ml" } }], products, overrides);
    expect(plan.writes).toEqual([{ productId: "en~US~MUG-1", offerId: "MUG-1", contentLanguage: "en", feedLabel: "US", attributes: { brand: "Kalema Home", title: "Handmade Ceramic Mug 350 ml" } }]);
    expect(plan.inverse).toEqual([{ kind: "product.restore", productId: "en~US~MUG-1", offerId: "MUG-1", contentLanguage: "en", feedLabel: "US", attributes: { brand: "Kalema Home" } }]);
    expect(plan.items[0]!.changes).toEqual([{ field: "Title", before: "Ceramic Mug", after: "Handmade Ceramic Mug 350 ml" }]);
  });

  it("undo of a first fix removes Autommerce's values (attributes null)", () => {
    const plan = planMerchantChange([{ kind: "product.update", productId: "en~US~MUG-1", set: { description: "Stoneware mug, 350 ml." } }], products, none);
    expect(plan.inverse[0]).toMatchObject({ kind: "product.restore", attributes: null });
    const undo = planMerchantChange(plan.inverse, new Map(), none);
    expect(undo.writes).toEqual([{ productId: "en~US~MUG-1", offerId: "MUG-1", contentLanguage: "en", feedLabel: "US", attributes: null }]);
    expect(undo.inverse).toEqual([]);
  });

  it("refuses prices, availability and unknown fields", () => {
    for (const set of [{ price: "10" }, { salePrice: "9" }, { availability: "IN_STOCK" }, { link: "https://x" }])
      expect(() => planMerchantChange([{ kind: "product.update", productId: "en~US~MUG-1", set: set as never }], products, none)).toThrow(MerchantPlanError);
    expect(() => planMerchantChange([{ kind: "product.update", productId: "en~US~MUG-1", set: { price: "1" } as never }], products, none)).toThrow(/store itself/);
  });

  it("refuses products from elsewhere, bad values, no-ops and duplicates", () => {
    const run = (ops: unknown[]) => () => planMerchantChange(ops as never, products, none);
    expect(run([{ kind: "product.update", productId: "en~US~OTHER", set: { title: "x" } }])).toThrow(/isn't in this Merchant Center account/);
    expect(run([{ kind: "product.update", productId: "en~US~MUG-1", set: { gtin: "1234567890123" } }])).toThrow(/valid GTIN/);
    expect(run([{ kind: "product.update", productId: "en~US~MUG-1", set: { title: "x".repeat(151) } }])).toThrow(/150/);
    expect(run([{ kind: "product.update", productId: "en~US~MUG-1", set: { imageLink: "ftp://x/y.jpg" } }])).toThrow(/https/);
    expect(run([{ kind: "product.update", productId: "en~US~MUG-1", set: { title: "   " } }])).toThrow(/empty/);
    expect(run([{ kind: "product.update", productId: "en~US~MUG-1", set: { title: "Ceramic Mug" } }])).toThrow(/already has/);
    expect(run([{ kind: "product.update", productId: "en~US~MUG-1", set: {} }])).toThrow(/No new values/);
    expect(
      run([
        { kind: "product.update", productId: "en~US~MUG-1", set: { title: "A" } },
        { kind: "product.update", productId: "en~US~MUG-1", set: { brand: "B" } },
      ])
    ).toThrow(/once/);
    expect(run([])).toThrow(MerchantPlanError);
  });

  it("collapses whitespace in one-line fields but keeps line breaks in descriptions", () => {
    const plan = planMerchantChange([{ kind: "product.update", productId: "en~US~MUG-1", set: { title: "  Big   Mug ", description: "Line one.\nLine two." } }], products, none);
    expect(plan.writes[0]!.attributes).toEqual({ title: "Big Mug", description: "Line one.\nLine two." });
  });
});

describe("toApiAttributes", () => {
  it("uses the Merchant API's names and a GTIN list", () => {
    expect(toApiAttributes({ title: "T", gtin: "0012345678905", imageLink: "https://i", googleProductCategory: "Mugs" })).toEqual({ title: "T", gtins: ["0012345678905"], image_link: "https://i", google_product_category: "Mugs" });
  });
});

describe("merchantOverview", () => {
  it("counts statuses and issues across products", () => {
    const o = merchantOverview({ merchantId: "1", products: [product(), product({ id: "en~US~MUG-2", status: "APPROVED", issues: [] })], accountIssues: [], truncated: false, fetchedAt: "" });
    expect(o.status).toEqual({ approved: 1, limited: 0, disapproved: 1, pending: 0 });
    expect(o.issues).toEqual([expect.objectContaining({ code: "missing_shipping", products: 1 })]);
    expect(o.productList[0]!.issues[0]).toBe("DISAPPROVED: Missing shipping (shipping)");
  });
});
