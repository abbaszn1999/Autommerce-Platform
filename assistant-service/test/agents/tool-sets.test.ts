import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { AGENTS } from "../../src/agents";
import { STORE_AGENT_SCOPES } from "../../src/core/store-access/shopify/scopes";
import { capabilityBuiltinTools, capabilityTools } from "../../src/core/capabilities";
import type { AgentSession } from "../../src/core/agents";
import type { ToolContext } from "../../src/core/tool-helpers";

// The network and credential reads are the only things faked; everything else is the real agent definition.
vi.mock("../../src/core/store-access/shopify/client", async (original) => ({
  ...(await original<typeof import("../../src/core/store-access/shopify/client")>()),
  loadShopifyConnection: async () => ({ storeName: "Shop", shopDomain: "shop.myshopify.com" }),
  grantedScopes: async () => [...STORE_AGENT_SCOPES],
}));
vi.mock("../../src/core/store-access/woocommerce/client", async (original) => ({
  ...(await original<typeof import("../../src/core/store-access/woocommerce/client")>()),
  loadWooConnection: async () => ({ storeName: "Shop", domain: "shop.example.com" }),
}));
vi.mock("../../src/agents/meta-ads/tools", async (original) => ({
  ...(await original<typeof import("../../src/agents/meta-ads/tools")>()),
  loadMetaTools: async () => [],
}));

/**
 * Golden lists captured from the last release (before agents became separate):
 * what each agent could call, by name. A change here is a deliberate change to what an agent can do.
 */
const GOLDEN = JSON.parse(readFileSync(join(__dirname, "tool-sets.golden.json"), "utf8")) as Record<string, string[]>;

/** A database that answers each table with fixed rows, whatever the query chain. */
function fakeDb(tables: Record<string, unknown>): SupabaseClient {
  const chain = (table: string): unknown => {
    const rows = tables[table] ?? null;
    const first = Array.isArray(rows) ? (rows[0] ?? null) : rows;
    const query: unknown = new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === "then"
            ? (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
            : prop === "maybeSingle" || prop === "single"
              ? async () => ({ data: first, error: null })
              : () => query,
      }
    );
    return query;
  };
  return { from: chain } as unknown as SupabaseClient;
}

const ADS_ROWS = [{ kind: "ads", account_id: "123", account_name: "Acct", account_currency: "USD" }];
const META_ROW = { ad_account_id: "act_1", ad_account_name: "Acct", ad_account_currency: "USD" };

async function open(domain: "store" | "google_ads" | "meta_ads", tables: Record<string, unknown>): Promise<AgentSession> {
  return AGENTS[domain].prepare({
    db: fakeDb(tables),
    run: {} as never,
    workspaceId: "w1",
    platformUrl: "http://platform.test",
    secret: "s".repeat(40),
    log: () => undefined,
  });
}

/** Everything the runner would hand the model: the agent's tools, the shared capabilities, and Cursor's own. */
function toolNames(session: AgentSession) {
  const ctx = { platform: session.store.platform } as unknown as ToolContext;
  const helpers = { cwd: "/tmp/chat", markWritten: () => undefined, addCost: () => undefined, imageMade: () => undefined };
  const own = session.tools(ctx, { cwd: helpers.cwd, markWritten: helpers.markWritten });
  const shared = capabilityTools(session.capabilities, ctx, helpers);
  // The runner's own base tools, plus the ones the capabilities switch on.
  const builtin = [...new Set(["mcp", "updateTodos", "readTodos", ...capabilityBuiltinTools(session.capabilities)])].sort();
  return { tools: Object.keys({ ...own, ...shared }).sort(), builtin };
}

describe("each agent has exactly the tools it had before the split", () => {
  for (const platform of ["shopify", "woocommerce"] as const) {
    it(`Store Assistant with a ${platform} store`, async () => {
      const session = await open("store", { workspace_integrations: { provider: platform } });
      expect(session.store.available).toBe(true);
      const { tools, builtin } = toolNames(session);
      expect(tools).toEqual(GOLDEN[`store:${platform}`]);
      expect(builtin).toEqual(GOLDEN["builtin(all agents)"]);
    });

    it(`Google Ads with a ${platform} store`, async () => {
      const session = await open("google_ads", { workspace_integrations: { provider: platform }, google_ads_connections: ADS_ROWS });
      expect(session.store.available).toBe(true);
      const { tools, builtin } = toolNames(session);
      expect(tools).toEqual(GOLDEN[`google_ads:store-${platform}`]);
      expect(builtin).toEqual(GOLDEN["builtin(all agents)"]);
    });
  }

  it("Google Ads with no store", async () => {
    const session = await open("google_ads", { google_ads_connections: ADS_ROWS });
    expect(session.store.available).toBe(false);
    expect(toolNames(session).tools).toEqual(GOLDEN["google_ads:no-store"]);
  });

  it("Meta Ads, even when the workspace has a store", async () => {
    const session = await open("meta_ads", { workspace_integrations: { provider: "shopify" }, meta_ads_connections: META_ROW });
    expect(session.store.available).toBe(false);
    const { tools, builtin } = toolNames(session);
    expect(tools).toEqual(GOLDEN.meta_ads);
    expect(builtin).toEqual(GOLDEN["builtin(all agents)"]);
  });

  it("the Store Assistant with no store keeps what does not need one, and loses only the store's tools and guides", async () => {
    const session = await open("store", {});
    expect(session.store.available).toBe(false);
    const { tools } = toolNames(session);
    // The only guide today (website restructure) works on a store, so its reader and its logo helper go with it.
    const needsStore = ["shopify_admin", "shopify_bulk_export", "shopify_bulk_update", "shopify_schema", "shopify_upload_file", "inline_image", "read_skill"];
    expect(tools).toEqual(GOLDEN["store:shopify"]!.filter((name) => !needsStore.includes(name)));
  });
});
