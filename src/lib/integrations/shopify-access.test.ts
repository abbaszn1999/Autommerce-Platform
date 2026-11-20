import { describe, expect, it } from "vitest";
import {
  ALL_SHOPIFY_SCOPES,
  SHOPIFY_TOOL_ACCESS,
  STORE_ACCESS_AREAS,
  STORE_ASSISTANT_SCOPES,
  hasShopifyScope,
  missingShopifyScopes,
  requiredShopifyScopes,
  scopeLabel,
  storeToolAccess,
  toolsUsingScope,
} from "./shopify-access";

describe("shopify access", () => {
  it("counts a write scope as its read scope too", () => {
    const granted = new Set(["write_products"]);
    expect(hasShopifyScope(granted, "read_products")).toBe(true);
    expect(hasShopifyScope(granted, "write_products")).toBe(true);
    expect(hasShopifyScope(granted, "write_inventory")).toBe(false);
    expect(hasShopifyScope(new Set(["read_products"]), "write_products")).toBe(false);
  });

  it("lists what each tool is missing", () => {
    const granted = ["write_products"];
    const missing = Object.fromEntries(SHOPIFY_TOOL_ACCESS.map((t) => [t.id, missingShopifyScopes(granted, t.scopes)]));
    expect(missing["growth-sync"]).toEqual([]);
    expect(missing["market-research"]).toEqual(["read_publications", "write_publications", "read_content", "write_content"]);
    expect(missing["store-assistant"]).toContain("write_inventory");
  });

  it("takes the granted scopes as a list or as a set", () => {
    expect(missingShopifyScopes(new Set(["write_products"]), ["read_products", "write_inventory"])).toEqual(["write_inventory"]);
    expect(missingShopifyScopes(["read_files"], ["read_files"])).toEqual([]);
  });

  it("gives every scope once, and a full grant makes every tool ready", () => {
    expect(new Set(ALL_SHOPIFY_SCOPES).size).toBe(ALL_SHOPIFY_SCOPES.length);
    for (const tool of SHOPIFY_TOOL_ACCESS) expect(missingShopifyScopes(ALL_SHOPIFY_SCOPES, tool.scopes)).toEqual([]);
  });

  it("shows every scope a tool uses in an area of the access panel, with words for it", () => {
    const inAreas = new Set<string>(STORE_ACCESS_AREAS.flatMap((area) => (area.edit ? [area.read, area.edit] : [area.read])));
    for (const tool of SHOPIFY_TOOL_ACCESS) {
      for (const scope of tool.scopes) {
        expect(inAreas.has(scope), `${tool.id}: ${scope}`).toBe(true);
        expect(scopeLabel(scope)).not.toBe(scope);
        expect(toolsUsingScope(scope).map((t) => t.id)).toContain(tool.id);
      }
    }
    // A scope this file does not know is shown as it is.
    expect(scopeLabel("read_orders")).toBe("read_orders");
  });

  it("gives the Store Assistant exactly the scopes its agent works with", () => {
    expect(storeToolAccess("store-assistant").scopes).toBe(STORE_ASSISTANT_SCOPES);
  });

  it("needs no scope to open the Store Assistant, so Settings shows it limited and never locked", () => {
    const assistant = storeToolAccess("store-assistant");
    expect(requiredShopifyScopes(assistant)).toEqual([]);
    expect(missingShopifyScopes([], requiredShopifyScopes(assistant))).toEqual([]);
    // The ads agent still needs the catalogue before its store side opens.
    expect(requiredShopifyScopes(storeToolAccess("google-ads-agent"))).toEqual(["read_products"]);
  });
});
