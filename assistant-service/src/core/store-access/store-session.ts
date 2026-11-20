import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreScope } from "../../../../src/lib/integrations/shopify-access";
import { missingStoreAccess } from "./access-request";
import { grantedScopes, loadShopifyConnection, type ShopifyConnection } from "./shopify/client";
import { STORE_AGENT_SCOPES } from "./shopify/scopes";
import { StoreNotConnectedError, storePlatform, type StorePlatform } from "./store-connection";
import { loadWooConnection, type WooConnection } from "./woocommerce/client";

/**
 * How an agent relates to the workspace's store.
 * - required: no store means no run; every failure is raised. (No agent uses it today.)
 * - preferred: the Store Assistant. Works with a store, and without one it still opens: it keeps its web, file and
 *   image capabilities and asks for a store when the work needs one. A connected store is used even when its token
 *   lacks some access: the agent is told what is missing and asks the user for it.
 * - optional: Google Ads. With a readable store it also gets store tools; without one, or without the catalogue,
 *   it plans from the feed and the site.
 * - none: Meta Ads. The store is never opened.
 */
export type StorePolicy = "required" | "preferred" | "optional" | "none";

export type StoreSession = {
  /** The agent has a store it can use. Always true for "required"; false for "none". */
  available: boolean;
  /** A store is connected and its connection could be read, whether or not the agent can use it. */
  connected: boolean;
  platform: StorePlatform;
  info: { name: string; domain: string };
  /** The access this agent works with on a Shopify store (WooCommerce has no scopes). */
  scopes: readonly StoreScope[];
  /** Which of `scopes` the store's token does not have, told to the agent up front. */
  missing: StoreScope[];
  /** A store is connected but could not be read (why), so the agent can tell the user instead of saying none is connected. */
  problem: string | null;
  getConnection: () => Promise<ShopifyConnection>;
  getWoo: () => Promise<WooConnection>;
};

/**
 * Opens the workspace's store for one agent run, and records what the store's token may do.
 * `scopes` is the access the agent works with (its entry in src/lib/integrations/shopify-access).
 */
export async function openStoreSession(
  db: SupabaseClient,
  workspaceId: string,
  policy: StorePolicy,
  log: (message: string, extra?: unknown) => void,
  scopes: readonly StoreScope[] = STORE_AGENT_SCOPES
): Promise<StoreSession> {
  let problem: string | null = null;
  const lenient = policy === "optional" || policy === "preferred";
  const found =
    policy === "none"
      ? null
      : lenient
        ? await storePlatform(db, workspaceId).catch((error: unknown) => {
            // "No store" is normal for these agents; anything else is a store we could not look at.
            if (!(error instanceof StoreNotConnectedError)) problem = (error as Error).message;
            return null;
          })
        : await storePlatform(db, workspaceId);
  const platform: StorePlatform = found ?? "shopify";

  let connection: ShopifyConnection | null = null;
  const getConnection = async () => (connection ??= await loadShopifyConnection(db, workspaceId));
  let wooConnection: WooConnection | null = null;
  const getWoo = async () => (wooConnection ??= await loadWooConnection(db, workspaceId));
  const loadInfo = () =>
    platform === "woocommerce"
      ? getWoo().then((c) => ({ name: c.storeName, domain: c.domain }))
      : getConnection().then((c) => ({ name: c.storeName || c.shopDomain, domain: c.shopDomain }));

  // A store whose connection cannot be read counts as not connected for the agents that can work without one.
  let connected = found !== null;
  let info = { name: "", domain: "" };
  if (found) {
    try {
      info = await loadInfo();
    } catch (error) {
      if (policy === "required") throw error;
      log("reading the store connection failed", error);
      problem = (error as Error).message;
      connected = false;
    }
  }

  // What this store's token may do: told to the agent up front, and kept for the sidebar's locks.
  let available = connected;
  let missing: StoreScope[] = [];
  if ((policy === "required" || connected) && platform === "shopify") {
    try {
      const conn = await getConnection();
      missing = await missingStoreAccess(conn, scopes);
      const granted = await grantedScopes(conn);
      // Without even the catalogue, an optional store gives no store tools. A preferred store stays: the agent is told what is missing.
      if (policy === "optional" && missing.includes("read_products")) available = false;
      const { error } = await db
        .from("workspace_integrations")
        .update({ granted_scopes: [...granted], scopes_checked_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId);
      if (error) log("saving the store's scopes failed", error.message);
    } catch (error) {
      log("reading the store's scopes failed", error);
    }
  }

  return { available, connected, platform, info, scopes, missing, problem, getConnection, getWoo };
}
