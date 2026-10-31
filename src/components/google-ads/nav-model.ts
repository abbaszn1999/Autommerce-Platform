import type { Campaign, CampaignType, GaScope, GaView } from "@/lib/google-ads/types";

/** Where the user is: drives which sidebar items and which tabs make sense. */
export type NavCtx = { campaignType?: CampaignType; inCampaign: boolean; inAdGroup: boolean; inAssetGroup?: boolean };

export function navCtx(campaigns: Pick<Campaign, "id" | "type">[], scope: GaScope): NavCtx {
  const campaign = campaigns.find((c) => c.id === scope.campaignId);
  return { campaignType: campaign?.type, inCampaign: !!scope.campaignId, inAdGroup: !!scope.adGroupId, inAssetGroup: !!scope.assetGroupId };
}

const isVisual = (c: NavCtx) => !!c.campaignType && ["DISPLAY", "VIDEO", "DEMAND_GEN"].includes(c.campaignType);
const isPmaxOrShopping = (c: NavCtx) => c.campaignType === "PERFORMANCE_MAX" || c.campaignType === "SHOPPING";
export const isPmax = (c: NavCtx) => c.campaignType === "PERFORMANCE_MAX";
export const isSearch = (c: NavCtx) => c.campaignType === "SEARCH";
export const isShopping = (c: NavCtx) => c.campaignType === "SHOPPING";
export const isDisplay = (c: NavCtx) => c.campaignType === "DISPLAY";
export const isDemandGen = (c: NavCtx) => c.campaignType === "DEMAND_GEN";

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
    // Inside a Performance Max asset group (listed first so Top combinations belongs here, not to the campaign Insights).
    id: "assetGroupAssets",
    label: "Assets",
    show: (c) => !!c.inAssetGroup,
    tabs: [
      { view: "assetGroupAssets", label: "Assets" },
      { view: "assetCombinations", label: "Top combinations" },
    ],
  },
  {
    id: "audienceSignalsPmax",
    label: "Audience signals",
    show: (c) => !!c.inAssetGroup,
    tabs: [
      { view: "audienceSignals", label: "Audience signals" },
      { view: "searchThemes", label: "Search themes" },
    ],
  },
  {
    id: "keywords",
    label: "Keywords",
    // Performance Max has no keywords to target (it gets "Search & exclusions"), Display only has negatives (under its content exclusions), and Demand Gen has none at campaign level.
    show: (c) => !isPmax(c) && !isDisplay(c) && !isDemandGen(c),
    tabs: [
      { view: "keywords", label: "Search keywords", show: (c) => !isPmaxOrShopping(c) && !isVisual(c) },
      { view: "negatives", label: "Negative keywords" },
      { view: "searchTerms", label: "Search terms", show: (c) => !isVisual(c) },
    ],
  },
  {
    id: "searches",
    label: "Search & exclusions",
    show: (c) => isPmax(c) && !c.inAssetGroup,
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
      // Age and gender are set per ad group, so Demographics stays inside Search and Demand Gen ad groups.
      { view: "demographics", label: "Demographics", show: (c) => !isPmaxOrShopping(c) },
    ],
  },
  {
    id: "locations",
    label: "Locations & languages",
    // Set on the campaign. Only Demand Gen also exposes locations and languages on its ad groups (Google's Demand Gen docs list them as ad group criteria).
    show: (c) => (!c.inAdGroup && !c.inAssetGroup) || isDemandGen(c),
    tabs: [
      { view: "locations", label: "Locations" },
      { view: "languages", label: "Languages" },
      { view: "schedule", label: "Ad schedule", show: (c) => !c.inAdGroup },
      // Performance Max has no device bid adjustments.
      { view: "devices", label: "Devices", show: (c) => !isPmax(c) && !c.inAdGroup },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    show: (c) => isPmax(c) && c.inCampaign && !c.inAdGroup,
    tabs: [
      { view: "channels", label: "Channels" },
      // Inside an asset group only Channels remains (Top combinations has its own tab group there).
      { view: "searchCategories", label: "Search categories", show: (c) => !c.inAssetGroup },
      { view: "assetCombinations", label: "Asset combinations", show: (c) => !c.inAssetGroup },
      { view: "placementsShown", label: "Where ads showed", show: (c) => !c.inAssetGroup },
    ],
  },
  {
    // Search and Shopping both report impression share; price competitiveness is a Shopping (feed) report.
    id: "insightsSearch",
    label: "Insights",
    show: (c) => (isSearch(c) || isShopping(c)) && c.inCampaign && !c.inAdGroup,
    tabs: [
      { view: "impressionShare", label: "Impression share" },
      { view: "priceCompetitiveness", label: "Price competitiveness", show: isShopping },
    ],
  },
  {
    // Demand Gen reports by surface (YouTube Shorts, in-feed, in-stream, Discover, Gmail, Display).
    id: "insightsDemandGen",
    label: "Insights",
    show: (c) => isDemandGen(c) && c.inCampaign && !c.inAdGroup,
    tabs: [{ view: "channels", label: "Channels" }],
  },
  {
    // Display: Google's Content section, with the negative keywords folded into the exclusions.
    id: "contentDisplay",
    label: "Placements & content",
    show: (c) => isDisplay(c) && c.inCampaign && !c.inAdGroup,
    tabs: [
      { view: "content", label: "Where ads showed" },
      { view: "contentExclusions", label: "Exclusions" },
      { view: "negatives", label: "Negative keywords" },
    ],
  },
];

const active = (g: TabGroup, ctx?: NavCtx) => !ctx || !g.show || g.show(ctx);

/** The tab group a page belongs to in this context (a view can sit in a different group per campaign type). */
export const tabGroupOf = (view: GaView, ctx?: NavCtx) => TAB_GROUPS.find((g) => active(g, ctx) && g.tabs.some((t) => t.view === view));

export const groupActive = active;

export const visibleTabs = (group: TabGroup, ctx: NavCtx) => group.tabs.filter((t) => !t.show || t.show(ctx));
