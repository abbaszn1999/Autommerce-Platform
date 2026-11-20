import { describe, expect, it } from "vitest";
import { veraAdsRule } from "../../../src/agents/google-ads/instructions";

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

  it("asks for missing store access with the card, in each state of the store", () => {
    const connected = veraAdsRule({ ...base, storeCms: { platform: "shopify", name: "Kalema", domain: "kalema.myshopify.com", missingAccess: ["read sales totals (`read_reports`)"] } });
    expect(connected).toContain("has NOT given the app permission to: read sales totals (`read_reports`)");
    expect(connected).toContain("call `request_store_access` once with those permissions");
    expect(connected).not.toContain("Settings > Integrations > Google Ads agent");

    // Connected, but the catalogue cannot be read: no store tools, and she says what is missing instead of "not connected".
    const locked = veraAdsRule({ ...base, onboarding: "interview", lockedStore: ["read products and collections (`read_products`)"] });
    expect(locked).not.toContain("## The store behind these ads");
    expect(locked).toContain("store is connected, but it has NOT given the app permission to: read products and collections (`read_products`)");
    expect(locked).toContain("Their store is connected but has not given the app permission to read its catalogue");
    expect(locked).not.toContain("Their store is not connected");

    const none = veraAdsRule({ ...base });
    expect(none).toContain("No store is connected, so you have no store tools");
    expect(none).toContain("- `request_store_access`: a card asking the user to connect their store");
  });
});