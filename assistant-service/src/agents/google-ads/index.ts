import type { AgentDefinition } from "../../core/agents";
import { STANDARD_CAPABILITIES } from "../../core/capabilities";
import { storeToolAccess } from "../../../../src/lib/integrations/shopify-access";
import { createStoreAccessTool, describeAccess } from "../../core/store-access/access-request";
import { createStoreCmsTools } from "../../core/store-access/store-tools";
import { openStoreSession } from "../../core/store-access/store-session";
import { loadAdsAccount } from "./account";
import { createCreativeTools } from "./creative-tools";
import { googleAdsToolEvents } from "./events";
import { veraAdsRule } from "./instructions";
import { createKeywordBatchTools } from "./keyword-batch";
import { createStoreSalesTools } from "./store-sales";
import { createGoogleAdsTools } from "./tools";

/**
 * The Google Ads agent: plans and manages the workspace's Google Ads account.
 * The store is optional: with a readable store it also gets the store's tools
 * (read the catalogue, fix product data); without one it plans from the feed
 * and the site. Every change waits for a person.
 */
export const googleAds: AgentDefinition = {
  id: "google_ads",
  name: "Google Ads",
  async prepare(env) {
    const store = await openStoreSession(env.db, env.workspaceId, "optional", env.log, storeToolAccess("google-ads-agent").scopes);
    if (!env.secret || !env.platformUrl) throw new Error("The Google Ads agent is not configured (PLATFORM_URL).");
    const platform = { url: env.platformUrl, secret: env.secret };
    const account = await loadAdsAccount(env.db, env.workspaceId);
    return {
      where: "Google Ads account",
      changesLabel: "Google Ads",
      approvalOnly: true,
      usesCursorPlan: false,
      wantsFileLists: true,
      currency: account.currency,
      store,
      capabilities: STANDARD_CAPABILITIES,
      toolEvents: googleAdsToolEvents,
      rule: async (input) =>
        veraAdsRule({
          ...account,
          profile: input.business.brief,
          onboarding: input.business.onboarding,
          storeCms: store.available ? { platform: store.platform, name: store.info.name, domain: store.info.domain, missingAccess: describeAccess(store.missing) } : null,
          lockedStore: !store.available && store.connected ? describeAccess(store.missing) : [],
          businessFiles: input.files?.businessFiles,
          chatFiles: input.files?.chatFiles,
          mode: input.mode,
        }),
      tools: (ctx) => ({
        ...createGoogleAdsTools(ctx, platform),
        ...createKeywordBatchTools(ctx, platform),
        ...createCreativeTools(ctx),
        ...(store.available ? { ...createStoreCmsTools(ctx), ...createStoreSalesTools(ctx) } : {}),
        ...createStoreAccessTool(ctx, store),
      }),
    };
  },
};
