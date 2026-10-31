import type { Campaign, CampaignType, GaScope, GaView } from "@/lib/google-ads/types";

/** Where the user is: drives which sidebar items and which tabs make sense. */
export type NavCtx = { campaignType?: CampaignType; inCampaign: boolean; inAdGroup: boolean };

export function navCtx(campaigns: Pick<Campaign, "id" | "type">[], scope: GaScope): NavCtx {
  const campaign = campaigns.find((c) => c.id === scope.campaignId);
  return { campaignType: campaign?.type, inCampaign: !!scope.campaignId, inAdGroup: !!scope.adGroupId };
}

const isVisual = (c: NavCtx) => !!c.campaignType && ["DISPLAY", "VIDEO", "DEMAND_GEN"].includes(c.campaignType);
const isPmaxOrShopping = (c: NavCtx) => c.campaignType === "PERFORMANCE_MAX" || c.campaignType === "SHOPPING";
export const isPmax = (c: NavCtx) => c.campaignType === "PERFORMANCE_MAX";

export type TabDef = { view: GaView; label: string; show?: (c: NavCtx) => boolean };

/**
 * Sidebar items that are one page with tabs, like Google Ads' own
 * Keywords section. Each tab is still its own view, so the agent can link
 * straight to one (for example, Search terms). A group with `show` only exists
 * where it returns true, so one view can sit in a different group per campaign type.
 */
export type TabGroup = { id: string; label: string; tabs: TabDef[]; show?: (c: NavCtx) => boolean };

export const TAB_GROUPS: TabGroup[] = [
  {
    id: "keywords",
    label: "Keywords",
    // Performance Max has no keywords to target: it gets "Search & exclusions" instead.
    show: (c) => !isPmax(c),
    tabs: [
      { view: "keywords", label: "Search keywords", show: (c) => !isPmaxOrShopping(c) && !isVisual(c) },
      { view: "negatives", label: "Negative keywords" },
      { view: "searchTerms", label: "Search terms", show: (c) => !isVisual(c) },
    ],
  },
  {
    id: "searches",
    label: "Search & exclusions",
    show: isPmax,
    tabs: [
      { view: "searchTerms", label: "Search terms" },
      { view: "negatives", label: "Negative keywords" },
      { view: "brandExclusions", label: "Brand exclusions" },
    ],
  },
  {
    id: "audiences",
    label: "Audiences",
    // Performance Max audience signals live inside each asset group, not on a page.
    show: (c) => !isPmax(c),
    tabs: [
      { view: "audiences", label: "Audiences" },
      { view: "demographics", label: "Demographics", show: (c) => !isPmaxOrShopping(c) && !c.inAdGroup },
    ],
  },
  {
    id: "locations",
    label: "Locations & schedule",
    show: (c) => !isPmax(c),
    tabs: [
      { view: "locations", label: "Locations" },
      { view: "schedule", label: "Ad schedule" },
      { view: "devices", label: "Devices" },
    ],
  },
  {
    // Performance Max: languages next to locations, and no device bid adjustments.
    id: "locationsPmax",
    label: "Locations & languages",
    show: isPmax,
    tabs: [
      { view: "locations", label: "Locations" },
      { view: "languages", label: "Languages" },
      { view: "schedule", label: "Ad schedule" },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    show: (c) => isPmax(c) && c.inCampaign,
    tabs: [
      { view: "channels", label: "Channels" },
      { view: "searchCategories", label: "Search categories" },
      { view: "assetCombinations", label: "Asset combinations" },
      { view: "placementsShown", label: "Where ads showed" },
    ],
  },
];

const active = (g: TabGroup, ctx?: NavCtx) => !ctx || !g.show || g.show(ctx);

/** The tab group a page belongs to in this context (a view can sit in a different group per campaign type). */
export const tabGroupOf = (view: GaView, ctx?: NavCtx) => TAB_GROUPS.find((g) => active(g, ctx) && g.tabs.some((t) => t.view === view));

export const groupActive = active;

export const visibleTabs = (group: TabGroup, ctx: NavCtx) => group.tabs.filter((t) => !t.show || t.show(ctx));
