import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storeToolAccess } from "../../../../src/lib/integrations/shopify-access";
import { STORE_AGENT_SCOPES } from "../../../src/core/store-access/shopify/scopes";
import { openStoreSession } from "../../../src/core/store-access/store-session";

// The store's answers are the only thing faked: its connection and the scopes its token has.
const shopify = vi.hoisted(() => ({ granted: [] as string[] }));
vi.mock("../../../src/core/store-access/shopify/client", async (original) => ({
  ...(await original<typeof import("../../../src/core/store-access/shopify/client")>()),
  loadShopifyConnection: async () => ({ workspaceId: "w1", storeName: "Shop", shopDomain: "shop.myshopify.com" }),
  grantedScopes: async () => new Set(shopify.granted),
}));

/** A database whose integration lookup answers with `result`, and which records what is saved to it. */
function dbWith(result: { data: unknown; error: { message: string } | null }) {
  const saved: Array<Record<string, unknown>> = [];
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => result }) }),
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          saved.push(values);
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { db, saved };
}

const log = () => undefined;
const none = dbWith({ data: null, error: null }).db;
const shopifyStore = () => dbWith({ data: { provider: "shopify" }, error: null });
const ADS_SCOPES = storeToolAccess("google-ads-agent").scopes;

beforeEach(() => {
  shopify.granted = [...STORE_AGENT_SCOPES];
});

describe("openStoreSession with no store connected", () => {
  it("opens for the Store Assistant (preferred), with no store and no problem", async () => {
    const session = await openStoreSession(none, "w1", "preferred", log);
    expect(session.available).toBe(false);
    expect(session.connected).toBe(false);
    expect(session.problem).toBeNull();
    expect(session.missing).toEqual([]);
  });

  it("opens for Google Ads (optional) and Meta Ads (none) too", async () => {
    expect((await openStoreSession(none, "w1", "optional", log)).available).toBe(false);
    expect((await openStoreSession(none, "w1", "none", log)).available).toBe(false);
  });

  it("still refuses when a store is required", async () => {
    await expect(openStoreSession(none, "w1", "required", log)).rejects.toThrow(/No Shopify or WooCommerce store/);
  });

  it("reports a store it could not look up, instead of calling it not connected", async () => {
    const broken = dbWith({ data: null, error: { message: "timeout" } }).db;
    const session = await openStoreSession(broken, "w1", "preferred", log);
    expect(session.available).toBe(false);
    expect(session.problem).toContain("timeout");
  });

  it("never opens the store for an agent that has none", async () => {
    const session = await openStoreSession(shopifyStore().db, "w1", "none", log);
    expect(session.available).toBe(false);
    expect(session.connected).toBe(false);
  });
});

describe("openStoreSession with a Shopify store", () => {
  it("opens with everything granted, and saves what the store granted for the sidebar's locks", async () => {
    const { db, saved } = shopifyStore();
    const session = await openStoreSession(db, "w1", "preferred", log);
    expect(session).toMatchObject({ available: true, connected: true, platform: "shopify", missing: [], scopes: STORE_AGENT_SCOPES });
    expect(saved).toHaveLength(1);
    expect(saved[0]!.granted_scopes).toEqual([...STORE_AGENT_SCOPES]);
  });

  it("keeps the Store Assistant open with whatever the store gave, and names what is missing", async () => {
    shopify.granted = ["read_products"];
    const session = await openStoreSession(shopifyStore().db, "w1", "preferred", log);
    expect(session.available).toBe(true);
    expect(session.missing).toContain("write_products");
    expect(session.missing).not.toContain("read_products");
  });

  it("checks each agent against its own scopes: sales totals for Google Ads, not for the Store Assistant", async () => {
    const assistant = await openStoreSession(shopifyStore().db, "w1", "preferred", log);
    expect(assistant.missing).toEqual([]);
    const ads = await openStoreSession(shopifyStore().db, "w1", "optional", log, ADS_SCOPES);
    expect(ads.available).toBe(true);
    expect(ads.missing).toEqual(["read_reports"]);
  });

  it("gives Google Ads no store tools without the catalogue, but knows the store is connected and what it lacks", async () => {
    shopify.granted = ["read_inventory"];
    const session = await openStoreSession(shopifyStore().db, "w1", "optional", log, ADS_SCOPES);
    expect(session.available).toBe(false);
    expect(session.connected).toBe(true);
    expect(session.missing).toContain("read_products");
  });
});
