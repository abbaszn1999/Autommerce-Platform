import { describe, expect, it } from "vitest";
import { accessCardState, type StoreAccessNow } from "./access-state";

const shopify = (scopes: string[] | null): StoreAccessNow => ({ hasStore: true, provider: "shopify", scopes });
const none: StoreAccessNow = { hasStore: false, provider: null, scopes: null };
const missing = (scopes: string[]) => ({ type: "access" as const, reason: "missing_access" as const, scopes });

describe("accessCardState", () => {
  it("asks to connect a store until one is connected", () => {
    const block = { type: "access" as const, reason: "no_store" as const, scopes: [] };
    expect(accessCardState(block, none).resolved).toBe(false);
    expect(accessCardState(block, shopify(null)).resolved).toBe(true);
    // A platform the agents do not work on is not a store for them.
    expect(accessCardState(block, { hasStore: false, provider: "wordpress", scopes: null }).resolved).toBe(false);
  });

  it("marks each permission, counting a write scope as its read scope", () => {
    const state = accessCardState(missing(["read_inventory", "write_inventory", "write_files"]), shopify(["write_inventory"]));
    expect(state.scopes).toEqual([
      { scope: "read_inventory", granted: true },
      { scope: "write_inventory", granted: true },
      { scope: "write_files", granted: false },
    ]);
    expect(state.resolved).toBe(false);
  });

  it("turns green once everything asked for is granted", () => {
    expect(accessCardState(missing(["write_inventory", "write_files"]), shopify(["write_inventory", "write_files", "read_products"])).resolved).toBe(true);
  });

  it("does not call unknown scopes granted", () => {
    // Shopify was never asked, or could not be.
    expect(accessCardState(missing(["write_files"]), shopify(null))).toEqual({ resolved: false, scopes: [{ scope: "write_files", granted: false }] });
    // The store was disconnected after the agent asked.
    expect(accessCardState(missing(["write_files"]), none).resolved).toBe(false);
  });

  it("has nothing left to grant on a platform without scopes", () => {
    expect(accessCardState(missing(["write_files"]), { hasStore: true, provider: "woocommerce", scopes: null })).toEqual({
      resolved: true,
      scopes: [{ scope: "write_files", granted: true }],
    });
  });

  it("keeps a connection problem open: the page cannot see whether it is fixed", () => {
    expect(accessCardState({ type: "access", reason: "store_problem", scopes: [] }, shopify(["read_products"])).resolved).toBe(false);
  });
});
