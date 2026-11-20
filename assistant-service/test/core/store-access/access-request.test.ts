import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StartRunRequest, StoreAgentEvent } from "../../../../src/lib/store-agent/protocol";
import { StoreAgentRun } from "../../../src/core/run";
import { createStoreAccessTool, describeAccess, missingStoreAccess } from "../../../src/core/store-access/access-request";
import type { ShopifyConnection } from "../../../src/core/store-access/shopify/client";
import { STORE_AGENT_SCOPES } from "../../../src/core/store-access/shopify/scopes";
import type { StoreSession } from "../../../src/core/store-access/store-session";
import type { ToolContext } from "../../../src/core/tool-helpers";

// What Shopify answers: `cached` to an ordinary read, `live` when a recent answer is asked for.
const shopify = vi.hoisted(() => ({ cached: [] as string[], live: [] as string[], calls: [] as Array<number | undefined> }));
vi.mock("../../../src/core/store-access/shopify/client", async (original) => ({
  ...(await original<typeof import("../../../src/core/store-access/shopify/client")>()),
  grantedScopes: async (_conn: unknown, maxAgeMs?: number) => {
    shopify.calls.push(maxAgeMs);
    return new Set(maxAgeMs === undefined ? shopify.cached : shopify.live);
  },
}));

const ALL = [...STORE_AGENT_SCOPES];
const without = (...scopes: string[]) => ALL.filter((scope) => !scopes.includes(scope));
const conn = { workspaceId: "w1" } as ShopifyConnection;

/** A database whose store lookup answers with `provider` (null: none connected), or fails. */
const dbWith = (provider: string | null, error: { message: string } | null = null) =>
  ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: provider ? { provider } : null, error }) }) }) }),
  }) as unknown as SupabaseClient;

const session = (over: Partial<StoreSession> = {}): StoreSession => ({
  available: true,
  connected: true,
  platform: "shopify",
  info: { name: "Shop", domain: "shop.myshopify.com" },
  scopes: STORE_AGENT_SCOPES,
  missing: [],
  problem: null,
  getConnection: async () => conn,
  getWoo: async () => {
    throw new Error("not a WooCommerce store");
  },
  ...over,
});
const noStore = (over: Partial<StoreSession> = {}) => session({ available: false, connected: false, ...over });

function setup(store: StoreSession, db = dbWith(null)) {
  const run = new StoreAgentRun({
    runId: randomUUID(),
    chatId: randomUUID(),
    workspaceId: "11111111-1111-4111-8111-111111111111",
    userId: randomUUID(),
    message: "hi",
    attachments: [],
    model: { id: "composer-2.5", params: [] },
    mode: "agent",
    autoRun: false,
    autoRunBulk: false,
    billing: { ownerUserId: randomUUID(), remainingCredits: 10 },
  } satisfies StartRunRequest);
  const cards: Array<Extract<StoreAgentEvent, { type: "access" }>> = [];
  run.subscribe((event) => {
    if (event.type === "access") cards.push(event);
  });
  const tool = createStoreAccessTool({ db, run } as unknown as ToolContext, store).request_store_access!;
  const call = async (args: Record<string, unknown>) => (await tool.execute(args as never, {} as never)) as { content: Array<{ text: string }>; isError?: boolean };
  return { cards, call, tool };
}

beforeEach(() => {
  shopify.cached = ALL;
  shopify.live = ALL;
  shopify.calls = [];
});

describe("request_store_access", () => {
  it("asks to connect a store when none is connected", async () => {
    const { cards, call } = setup(noStore());
    const result = await call({ reason: "I need your products to write the titles." });
    expect(cards).toEqual([expect.objectContaining({ type: "access", reason: "no_store", scopes: [], note: "I need your products to write the titles." })]);
    expect(result.content[0]!.text).toContain("connect their Shopify or WooCommerce store");
    expect(result.isError).toBeUndefined();
  });

  it("shows no card when a store was connected since the reply started", async () => {
    const { cards, call } = setup(noStore(), dbWith("shopify"));
    const result = await call({ reason: "x" });
    expect(cards).toEqual([]);
    expect(result.content[0]!.text).toContain("A store is connected now");
  });

  it("asks to reconnect a store that is there but could not be read", async () => {
    const known = setup(noStore({ problem: "Reconnect your Shopify store." }), dbWith("shopify"));
    await known.call({ reason: "x" });
    expect(known.cards.map((c) => c.reason)).toEqual(["store_problem"]);

    const lookupFails = setup(noStore(), dbWith(null, { message: "timeout" }));
    await lookupFails.call({ reason: "x" });
    expect(lookupFails.cards.map((c) => c.reason)).toEqual(["store_problem"]);
  });

  it("asks for exactly the permissions that are missing, of the ones the agent named", async () => {
    shopify.cached = shopify.live = without("write_inventory", "write_files");
    const { cards, call } = setup(session());
    const result = await call({ access: ["read_inventory", "write_inventory", "read_orders"], reason: "To set the stock." });
    expect(cards).toEqual([expect.objectContaining({ reason: "missing_access", scopes: ["write_inventory"], note: "To set the stock." })]);
    expect(result.content[0]!.text).toContain("edit inventory");
  });

  it("checks everything the agent works with when no permission is named", async () => {
    shopify.cached = shopify.live = without("write_inventory", "write_files");
    const { cards, call } = setup(session());
    await call({ reason: "x" });
    expect(cards[0]!.scopes).toEqual(["write_inventory", "write_files"]);
  });

  it("shows no card when the store grants it, and believes a permission granted a moment ago", async () => {
    const granted = setup(session());
    expect((await granted.call({ access: ["write_products"], reason: "x" })).content[0]!.text).toContain("nothing is missing");
    expect(granted.cards).toEqual([]);

    // The cache still says it is missing; Shopify, asked again, says it is there.
    shopify.cached = without("write_products");
    const justGranted = setup(session());
    await justGranted.call({ access: ["write_products"], reason: "x" });
    expect(justGranted.cards).toEqual([]);
  });

  it("tells an agent that opened without store tools to wait for the next message", async () => {
    const { call } = setup(session({ available: false }));
    expect((await call({ reason: "x" })).content[0]!.text).toContain("send their request again");
  });

  it("has nothing to grant on WooCommerce, and shows no card", async () => {
    const { cards, call } = setup(session({ platform: "woocommerce" }));
    const result = await call({ reason: "x" });
    expect(cards).toEqual([]);
    expect(result.content[0]!.text).toContain("not split into permissions");
    expect(shopify.calls).toEqual([]);
  });

  it("offers the agent only its own scopes", () => {
    const { tool } = setup(session({ scopes: ["read_products", "read_reports"] }));
    const schema = tool.inputSchema as { properties: { access: { items: { enum: string[] } } }; required: string[] };
    expect(schema.properties.access.items.enum).toEqual(["read_products", "read_reports"]);
    expect(schema.required).toEqual(["reason"]);
  });
});

describe("missingStoreAccess", () => {
  it("asks Shopify again only when the cache says something is missing", async () => {
    expect(await missingStoreAccess(conn, ["read_products"])).toEqual([]);
    expect(shopify.calls).toEqual([undefined]);

    shopify.calls = [];
    shopify.cached = shopify.live = without("read_products", "write_products");
    expect(await missingStoreAccess(conn, ["read_products", "read_files"])).toEqual(["read_products"]);
    expect(shopify.calls).toHaveLength(2);
    expect(shopify.calls[1]).toBeLessThan(60_000);
  });
});

describe("describeAccess", () => {
  it("gives each permission in words with the name the tool takes", () => {
    expect(describeAccess(["read_reports", "write_inventory"])).toEqual(["read sales totals (`read_reports`)", "edit inventory (`write_inventory`)"]);
  });
});
