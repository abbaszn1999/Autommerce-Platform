import type { Skill } from "../../../core/guides";
import { WEBSITE_RESTRUCTURE_DESCRIPTION, WEBSITE_RESTRUCTURE_SKILL } from "./website-restructure";

export type StoreAssistantGuide = Skill & {
  /** Works on the store's data, so it is not offered when no store is connected. */
  needsStore?: boolean;
};

/** The Store Assistant's guides. Growth research joins this list when it is added. */
export const STORE_ASSISTANT_GUIDES: readonly StoreAssistantGuide[] = [
  { name: "website-restructure", description: WEBSITE_RESTRUCTURE_DESCRIPTION, body: WEBSITE_RESTRUCTURE_SKILL, needsStore: true },
];

/** The guides to offer: every one with a store, only those that need none without one. */
export const guidesFor = (hasStore: boolean): readonly Skill[] => STORE_ASSISTANT_GUIDES.filter((g) => hasStore || !g.needsStore);
