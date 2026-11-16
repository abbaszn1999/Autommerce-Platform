import { describe, expect, it } from "vitest";
import { veraAdsRule } from "../../src/store-agent/google-ads/instructions";

const base = { accountName: "Kalema", customerId: "123", currency: "USD", profile: "- Business name: Kalema", mode: "agent" as const };

describe("Vera's store access (rules)", () => {
  it("has no store section when no store is connected, and tells the owner to connect one during onboarding", () => {
    const rule = veraAdsRule({ ...base, onboarding: "interview" });
    expect(rule).not.toContain("## The store behind these ads");
    expect(rule).toContain("Their store is not connected");
  });

  it("describes the Shopify store, its tools and the limits when one is connected", () => {
    const rule = veraAdsRule({ ...base, storeCms: { platform: "shopify", name: "Kalema", domain: "kalema.myshopify.com", missingAccess: [] } });
    expect(rule).toContain("## The store behind these ads (Shopify: Kalema)");
    expect(rule).toContain("shopify_admin");
    expect(rule).toContain("approval card");
    expect(rule).toContain("only when the owner explicitly asks");
    expect(rule).toContain("The theme, pages, navigation, checkout, orders and customers are out of your reach");
    expect(rule).not.toContain("Their store is not connected");
  });

  it("uses WooCommerce text for a Woo store and lists missing access", () => {
    const rule = veraAdsRule({ ...base, storeCms: { platform: "woocommerce", name: "Shop", domain: "shop.example", missingAccess: ["read sales channels"] } });
    expect(rule).toContain("WooCommerce");
    expect(rule).toContain("woo_api");
    expect(rule).toContain("read sales channels");
  });
});