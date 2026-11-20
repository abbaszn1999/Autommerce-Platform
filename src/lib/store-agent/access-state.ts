import { hasShopifyScope } from "../integrations/shopify-access";
import type { MessageBlock } from "./blocks";

/** The workspace's store as the page knows it now. */
export type StoreAccessNow = {
  /** A store the agents work on is connected. */
  hasStore: boolean;
  provider: string | null;
  /** The scopes a Shopify store's token has; null when not known, or on a platform without scopes. */
  scopes: readonly string[] | null;
};

/**
 * What an access card shows: whether what the agent asked for is there now,
 * and each permission it asked for. The card reads the present, not the moment
 * the agent asked, so a card in an older reply turns green once access is given.
 */
export function accessCardState(
  block: Extract<MessageBlock, { type: "access" }>,
  now: StoreAccessNow
): { resolved: boolean; scopes: Array<{ scope: string; granted: boolean }> } {
  if (block.reason === "no_store") return { resolved: now.hasStore, scopes: [] };
  // A connection that could not be read cannot be seen from here: the card stays until a reply works again.
  if (block.reason === "store_problem") return { resolved: false, scopes: [] };

  // A platform without scopes has nothing left to grant. Unknown scopes (never checked, or the store is gone) count as not granted.
  const noScopes = !!now.provider && now.provider !== "shopify";
  const granted = new Set(now.provider === "shopify" ? (now.scopes ?? []) : []);
  const scopes = block.scopes.map((scope) => ({ scope, granted: noScopes || hasShopifyScope(granted, scope) }));
  return { resolved: noScopes || (now.provider === "shopify" && scopes.every((s) => s.granted)), scopes };
}
