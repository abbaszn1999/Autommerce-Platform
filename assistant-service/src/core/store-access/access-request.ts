import type { SDKCustomTool } from "@cursor/sdk";
import { missingShopifyScopes, scopeLabel } from "../../../../src/lib/integrations/shopify-access";
import type { StoreAgentRun } from "../run";
import { failure, text, type ToolContext } from "../tool-helpers";
import { grantedScopes, type ShopifyConnection } from "./shopify/client";
import { StoreNotConnectedError, storePlatform } from "./store-connection";
import type { StoreSession } from "./store-session";

const NOTE_MAX = 240;
const words = (scopes: readonly string[]) => scopes.map(scopeLabel).join(", ");

/** What the agent is told after the card went up: the card and Settings carry the steps, the agent carries on. */
const AFTER_CARD =
  "Tell the user in one or two lines what you need and what it lets you do for their request; do not list the steps (the card and Settings show them). " +
  "Then carry on with whatever does not need it. Do not call this again in this reply.";

/** Missing permissions as an agent's rule lists them: what each one is, and the name the tool takes. */
export const describeAccess = (scopes: readonly string[]): string[] => scopes.map((scope) => `${scopeLabel(scope)} (\`${scope}\`)`);

/** "Missing" is only believed from an answer Shopify gave this recently. */
const CONFIRM_MAX_AGE_MS = 10_000;

/**
 * Which of `required` the store's token lacks. The scopes are cached, so a scope the cache says is missing is
 * confirmed with Shopify first: access the owner granted a moment ago counts at once.
 */
export async function missingStoreAccess<S extends string>(conn: ShopifyConnection, required: readonly S[]): Promise<S[]> {
  const missing = missingShopifyScopes(await grantedScopes(conn), required);
  return missing.length ? missingShopifyScopes(await grantedScopes(conn, CONFIRM_MAX_AGE_MS), required) : missing;
}

/** Shows the card that asks for permissions a connected Shopify store has not given. */
export function emitMissingAccess(run: StoreAgentRun, scopes: readonly string[], note?: string): void {
  if (scopes.length) run.emit({ type: "access", reason: "missing_access", scopes: [...scopes], ...(note ? { note } : {}) });
}

/**
 * `request_store_access`: the agent asks for the store, or for a permission on it, with a card instead of a
 * paragraph. It never waits: the user connects or grants in Settings and then sends their request again.
 * Every agent that may use the store gets it, with or without a store connected.
 */
export function createStoreAccessTool(ctx: ToolContext, store: StoreSession): Record<string, SDKCustomTool> {
  return {
    request_store_access: {
      description:
        "Show the user a card asking for store access you do not have: to connect a store when none is connected, or to grant a permission the connected store has not given. " +
        "Call it once, as soon as their request needs that access, instead of only describing the problem. It does not wait for the user.",
      inputSchema: {
        type: "object",
        properties: {
          access: {
            type: "array",
            items: { type: "string", enum: [...store.scopes] },
            description: "The permissions the request needs, when a store is connected. Leave it out when no store is connected.",
          },
          reason: { type: "string", description: "One short sentence, in the user's language: what this access lets you do for them." },
        },
        required: ["reason"],
      },
      execute: async (args) => {
        const note = String(args.reason ?? "").trim().slice(0, NOTE_MAX) || undefined;

        if (!store.connected) {
          // A store that is there but could not be read: reconnecting is what fixes it.
          let unreadable = !!store.problem;
          if (!unreadable) {
            // No store when this reply started; it may have been connected since.
            const now = await storePlatform(ctx.db, ctx.run.workspaceId).catch((error: unknown) => (error instanceof StoreNotConnectedError ? null : undefined));
            if (now) return text("A store is connected now. Your store tools are loaded when a reply starts: ask the user to send their request again and you will have them.");
            unreadable = now === undefined;
          }
          ctx.run.emit({ type: "access", reason: unreadable ? "store_problem" : "no_store", scopes: [], ...(note ? { note } : {}) });
          return text(
            (unreadable
              ? "A card is on the user's screen saying the store's connection could not be read, with a button to reconnect it in Settings. "
              : "A card is on the user's screen with a button to connect their Shopify or WooCommerce store in Settings. ") + AFTER_CARD
          );
        }

        if (store.platform !== "shopify") {
          return text(
            "This store is WooCommerce: its access is not split into permissions, so there is nothing to grant from here and no card was shown. " +
              "If the store refused a call, tell the user that the WordPress user the store was connected with must be allowed to manage WooCommerce (an Administrator or a Shop manager), and that they can reconnect the store in Settings with such a user's application password."
          );
        }

        const asked = (Array.isArray(args.access) ? args.access.map(String) : []).filter((scope) => (store.scopes as readonly string[]).includes(scope));
        let missing: string[];
        try {
          missing = await missingStoreAccess(await store.getConnection(), asked.length ? asked : store.scopes);
        } catch (error) {
          return failure(`Could not check the store's permissions: ${(error as Error).message}`);
        }
        if (!missing.length) {
          return text(
            store.available
              ? "The store grants this access now: nothing is missing. Use your store tools."
              : "The store grants this access now. Your store tools are loaded when a reply starts: ask the user to send their request again and you will have them."
          );
        }
        emitMissingAccess(ctx.run, missing, note);
        return text(`A card is on the user's screen asking the store owner for permission to ${words(missing)}, with a button to the access settings. ${AFTER_CARD}`);
      },
    },
  };
}
