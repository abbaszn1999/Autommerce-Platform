import type { AgentDefinition } from "../../core/agents";
import { STANDARD_CAPABILITIES } from "../../core/capabilities";
import { openStoreSession } from "../../core/store-access/store-session";
import { loadMetaAccount } from "./account";
import { veraMetaRule } from "./instructions";
import { createMetaAdsTools, loadMetaTools } from "./tools";

/**
 * The Meta Ads agent: works on the workspace's Meta ad account only, with the
 * tools Meta's server offers through the site. No store connection, store
 * rules or store tools. Every change waits for a person.
 */
export const metaAds: AgentDefinition = {
  id: "meta_ads",
  name: "Meta Ads",
  async prepare(env) {
    const store = await openStoreSession(env.db, env.workspaceId, "none", env.log);
    if (!env.secret || !env.platformUrl) throw new Error("The Meta Ads agent is not configured (PLATFORM_URL).");
    const platform = { url: env.platformUrl, secret: env.secret };
    const account = await loadMetaAccount(env.db, env.workspaceId);
    // Meta's tools come from Meta's server through the site; the rules list them and the tools use them.
    const metaTools = await loadMetaTools(platform, { run: env.run });
    return {
      where: "Meta ad account",
      changesLabel: "Meta Ads",
      approvalOnly: true,
      usesCursorPlan: false,
      wantsFileLists: false,
      currency: account.currency,
      store,
      capabilities: STANDARD_CAPABILITIES,
      rule: async (input) => veraMetaRule({ account, tools: metaTools, profile: input.business.brief, mode: input.mode }),
      tools: (ctx) => createMetaAdsTools(ctx, platform, metaTools),
    };
  },
};
