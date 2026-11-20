import type { AgentDefinition } from "../../core/agents";
import { STANDARD_CAPABILITIES } from "../../core/capabilities";
import { createReadSkillTool } from "../../core/guides";
import { createStoreAccessTool, describeAccess } from "../../core/store-access/access-request";
import { openStoreSession } from "../../core/store-access/store-session";
import { storeAssistantToolEvents } from "./events";
import { guidesFor } from "./guides";
import { createInlineImageTool } from "./guides/inline-image";
import { veraRule } from "./instructions";
import { loadStoreNotes } from "./notes";
import { createStoreAssistantTools, createStoreNoteTools } from "./tools";

/**
 * The Store Assistant: works inside the merchant's own store, with the store's
 * tools, standing notes and guides (website restructure today, growth research
 * later). It can change the store, on an approval card unless auto-run is on.
 */
export const storeAssistant: AgentDefinition = {
  id: "store",
  name: "Store Assistant",
  async prepare(env) {
    // Opens with or without a store: without one it keeps the shared capabilities and says a store is needed for store work.
    const store = await openStoreSession(env.db, env.workspaceId, "preferred", env.log);
    const guides = guidesFor(store.available);
    return {
      where: "store",
      changesLabel: "store",
      approvalOnly: false,
      usesCursorPlan: true,
      wantsFileLists: false,
      currency: "",
      store,
      capabilities: STANDARD_CAPABILITIES,
      toolEvents: storeAssistantToolEvents,
      rule: async (input) =>
        veraRule({
          businessProfile: input.business.filled ? input.business.brief : "",
          platform: store.platform,
          storeName: store.info.name,
          shopDomain: store.info.domain,
          noStore: !store.available,
          storeProblem: store.problem,
          mode: input.mode,
          autoRun: input.autoRun,
          autoRunBulk: input.autoRunBulk,
          notes: await loadStoreNotes(env.db, env.workspaceId),
          missingAccess: describeAccess(store.missing),
        }),
      tools: (ctx, { cwd, markWritten }) => ({
        ...(store.available ? createStoreAssistantTools(ctx) : createStoreNoteTools(ctx)),
        ...createStoreAccessTool(ctx, store),
        ...(guides.length ? createReadSkillTool(guides) : {}),
        // The logo helper belongs to the website guide, which needs a store.
        ...(store.available ? createInlineImageTool(cwd, markWritten) : {}),
      }),
    };
  },
};
