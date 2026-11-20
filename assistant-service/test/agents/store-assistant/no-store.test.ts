import { describe, expect, it } from "vitest";
import { guidesFor } from "../../../src/agents/store-assistant/guides";
import { veraRule } from "../../../src/agents/store-assistant/instructions";

const base = { storeName: "Kalema", shopDomain: "kalema.myshopify.com", mode: "agent" as const, autoRun: false };

describe("the Store Assistant without a store", () => {
  it("keeps its store rules when a store is connected", () => {
    const rule = veraRule({ ...base, platform: "shopify" });
    expect(rule).toContain('"Kalema" (kalema.myshopify.com)');
    expect(rule).toContain("## Store changes");
    expect(rule).toContain("shopify_admin");
    expect(rule).toContain("`website-restructure`");
    expect(rule).toContain("Large store results are saved under");
  });

  it("drops the store's tools and rules, and says how to connect one", () => {
    const rule = veraRule({ ...base, noStore: true });
    expect(rule).toContain("no store is connected to this workspace yet");
    expect(rule).toContain("connect their Shopify or WooCommerce store in Settings");
    // It asks with a card instead of a paragraph of steps.
    expect(rule).toContain("call `request_store_access` once");
    expect(rule).toContain("- `request_store_access`: a card asking the user to connect their store");
    expect(rule).not.toContain("kalema.myshopify.com");
    expect(rule).not.toContain("shopify_admin");
    expect(rule).not.toContain("## Store changes");
    expect(rule).not.toContain("`website-restructure`");
    expect(rule).not.toContain("Large store results are saved under");
    // What works without a store stays.
    for (const kept of ["`generate_image`", "`webSearch`", "`make_excel`", "`run_script`", "`save_store_note`", "## Safety"]) expect(rule).toContain(kept);
  });

  it("tells the user when a store is connected but could not be read, instead of saying there is none", () => {
    const rule = veraRule({ ...base, noStore: true, storeProblem: "Reconnect your Shopify store." });
    expect(rule).toContain("A store IS connected but could not be read");
    expect(rule).toContain("Reconnect your Shopify store.");
  });

  it("names what a connected store has not granted, and asks for it with the card", () => {
    const rule = veraRule({ ...base, platform: "shopify", missingAccess: ["edit inventory (`write_inventory`)"] });
    expect(rule).toContain("has NOT given the app permission to: edit inventory (`write_inventory`)");
    expect(rule).toContain("call `request_store_access` once with those permissions");
    expect(rule).toContain("- `request_store_access`: a card asking the user for a store permission");
    // The steps live in Settings, not in the agent's words.
    expect(rule).not.toMatch(/Develop apps|app's configuration/);
    expect(veraRule({ ...base, platform: "shopify" })).not.toContain("has NOT given the app permission");
  });

  it("offers a guide that needs the store only with a store", () => {
    expect(guidesFor(true).map((g) => g.name)).toContain("website-restructure");
    expect(guidesFor(false)).toEqual([]);
  });
});
