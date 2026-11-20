import type { AgentRegistry } from "../core/agents";
import { googleAds } from "./google-ads";
import { metaAds } from "./meta-ads";
import { storeAssistant } from "./store-assistant";

/**
 * Every agent the service runs, by the domain a chat carries. The only place
 * that knows all of them: core receives this list from server.ts and never
 * imports an agent. A new agent is a new folder plus one line here.
 */
export const AGENTS: AgentRegistry = {
  store: storeAssistant,
  google_ads: googleAds,
  meta_ads: metaAds,
};
