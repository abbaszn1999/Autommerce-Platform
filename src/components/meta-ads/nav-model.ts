import type { AdvantageState, MetaCampaign, MetaScope, MetaView, Objective } from "@/lib/meta-ads/types";

/** Where the user is: drives which sidebar items and which tabs make sense. */
export type NavCtx = { objective?: Objective; advantage?: AdvantageState; inCampaign: boolean; inAdSet: boolean; hasCatalog: boolean };

export function navCtx(campaigns: Pick<MetaCampaign, "id" | "objective" | "advantageState">[], scope: MetaScope, hasCatalog = true): NavCtx {
  const campaign = campaigns.find((c) => c.id === scope.campaignId);
  return { objective: campaign?.objective, advantage: campaign?.advantageState, inCampaign: !!scope.campaignId, inAdSet: !!scope.adSetId, hasCatalog };
}

export const isAdvantagePlus = (c: NavCtx) => c.advantage === "ADVANTAGE_PLUS";

export type TabDef = { view: MetaView; label: string; show?: (c: NavCtx) => boolean };

/**
 * Sidebar items that are one page with tabs. Each tab is still its own view,
 * so the agent can link straight to one. A group with `show` only exists where
 * it returns true.
 */
export type TabGroup = { id: string; label: string; tabs: TabDef[]; show?: (c: NavCtx) => boolean };

export const TAB_GROUPS: TabGroup[] = [
  {
    // Inside an ad set the targeting lives on the ad set itself.
    id: "adSetTargeting",
    label: "Targeting",
    show: (c) => c.inAdSet,
    tabs: [
      { view: "adSetAudience", label: "Audience" },
      { view: "adSetPlacements", label: "Placements" },
    ],
  },
  {
    // Account and campaign level: how it performs, by place, people and time. Objective pages sit here too.
    id: "insights",
    label: "Insights",
    show: (c) => !c.inAdSet,
    tabs: [
      { view: "placements", label: "Placements & platforms" },
      { view: "demographics", label: "Demographics" },
      { view: "trends", label: "Trends", show: (c) => !c.inCampaign },
      { view: "reachFrequency", label: "Reach & frequency", show: (c) => !c.inCampaign || c.objective === "AWARENESS" },
      { view: "landingPages", label: "Landing pages", show: (c) => !c.inCampaign || c.objective === "TRAFFIC" },
      { view: "breakdowns", label: "Breakdowns" },
    ],
  },
  {
    id: "audiences",
    label: "Audiences & locations",
    show: (c) => !c.inAdSet,
    tabs: [
      { view: "audiences", label: "Audiences" },
      { view: "locations", label: "Locations & languages" },
    ],
  },
  {
    // Account level only: whether Meta lets the ads run (policy) and where they may appear (brand safety).
    id: "safety",
    label: "Quality & safety",
    show: (c) => !c.inCampaign,
    tabs: [
      { view: "accountQuality", label: "Account quality" },
      { view: "brandSafety", label: "Brand safety" },
    ],
  },
];

const active = (g: TabGroup, ctx?: NavCtx) => !ctx || !g.show || g.show(ctx);

/** The tab group a page belongs to in this context. */
export const tabGroupOf = (view: MetaView, ctx?: NavCtx) => TAB_GROUPS.find((g) => active(g, ctx) && g.tabs.some((t) => t.view === view));

export const groupActive = active;

export const visibleTabs = (group: TabGroup, ctx: NavCtx) => group.tabs.filter((t) => !t.show || t.show(ctx));
