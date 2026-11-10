// Targeting, conversion actions and recommendations of a live account, from
// Google's rows. Pure: no network, so it is unit tested with sample rows.
// A value Google doesn't send stays empty; nothing is guessed.

import type { GaqlRow } from "./live-report";
import type { AdScheduleSlot, Campaign, ConversionAction, ConversionCategory, LocationTarget, Recommendation, RecommendationCategory } from "./types";

export type TargetingRows = {
  locations?: GaqlRow[];
  languages?: GaqlRow[];
  schedule?: GaqlRow[];
  deviceBids?: GaqlRow[];
  geoConstants?: GaqlRow[];
  languageConstants?: GaqlRow[];
};

const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);
const lastId = (resource: unknown) => str(resource).split("/").pop() ?? "";
/** Google's multiplier (1.2 is +20%, 0 is excluded) as the change from normal. */
const bidChange = (v: unknown) => (v == null ? undefined : Math.round((Number(v) - 1) * 100) / 100);

const KIND: Record<string, LocationTarget["kind"]> = { Country: "Country", City: "City", Neighborhood: "City", District: "City", Municipality: "City", "Postal Code": "City" };
const DAYS = new Set<AdScheduleSlot["day"]>(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);

/** The ids that need a name from Google, so the follow-up query can be built. */
export function targetIds(rows: TargetingRows): { geo: string[]; languages: string[] } {
  const ids = (list: unknown[]) => [...new Set(list.map(lastId).filter((id) => /^\d+$/.test(id)))];
  return {
    geo: ids((rows.locations ?? []).map((r) => r.campaignCriterion?.location?.geoTargetConstant)),
    languages: ids((rows.languages ?? []).map((r) => r.campaignCriterion?.language?.languageConstant)),
  };
}

export function applyTargeting(campaigns: Campaign[], rows: TargetingRows): Campaign[] {
  const geo = new Map((rows.geoConstants ?? []).map((r) => [str(r.geoTargetConstant?.id), r.geoTargetConstant]));
  const languageName = new Map((rows.languageConstants ?? []).map((r) => [str(r.languageConstant?.id), str(r.languageConstant?.name)]));
  const byCampaign = new Map(campaigns.map((c) => [c.id, { ...c, locations: [] as LocationTarget[], languages: [] as string[], schedule: [] as AdScheduleSlot[], devices: { ...c.devices } }]));

  for (const r of rows.locations ?? []) {
    const c = byCampaign.get(str(r.campaign?.id));
    const cc = r.campaignCriterion ?? {};
    if (!c || !cc.criterionId) continue;
    const base = { id: str(cc.criterionId), excluded: !!cc.negative, bidModifier: cc.negative ? undefined : bidChange(cc.bidModifier) };
    if (cc.proximity) {
      const unit = cc.proximity.radiusUnits === "MILES" ? "mi" : "km";
      const around = str(cc.proximity.address?.cityName);
      c.locations.push({ ...base, kind: "City", name: `${num(cc.proximity.radius)} ${unit} around ${around || "a map point"}` });
      continue;
    }
    const id = lastId(cc.location?.geoTargetConstant);
    const constant = geo.get(id);
    c.locations.push({ ...base, kind: KIND[str(constant?.targetType)] ?? "Region", name: str(constant?.name) || `Location ${id}` });
  }

  for (const r of rows.languages ?? []) {
    const c = byCampaign.get(str(r.campaign?.id));
    const id = lastId(r.campaignCriterion?.language?.languageConstant);
    if (c && id) c.languages.push(languageName.get(id) || `Language ${id}`);
  }

  for (const r of rows.schedule ?? []) {
    const c = byCampaign.get(str(r.campaign?.id));
    const s = r.campaignCriterion?.adSchedule;
    if (!c || !s || !DAYS.has(s.dayOfWeek)) continue;
    c.schedule.push({ day: s.dayOfWeek, startHour: num(s.startHour), endHour: num(s.endHour), bidModifier: bidChange(r.campaignCriterion?.bidModifier) });
  }

  for (const r of rows.deviceBids ?? []) {
    const c = byCampaign.get(str(r.campaign?.id));
    const change = bidChange(r.campaignCriterion?.bidModifier) ?? 0;
    const device = str(r.campaignCriterion?.device?.type);
    if (!c) continue;
    if (device === "MOBILE") c.devices.mobile = change;
    if (device === "DESKTOP") c.devices.desktop = change;
    if (device === "TABLET") c.devices.tablet = change;
  }

  return campaigns.map((c) => byCampaign.get(c.id)!);
}

const CATEGORY: Record<string, ConversionCategory> = {
  PURCHASE: "PURCHASE",
  ADD_TO_CART: "ADD_TO_CART",
  BEGIN_CHECKOUT: "BEGIN_CHECKOUT",
  SUBMIT_LEAD_FORM: "SUBMIT_LEAD_FORM",
  SIGNUP: "SIGNUP",
  PHONE_CALL_LEAD: "PHONE_CALL_LEAD",
  PAGE_VIEW: "PAGE_VIEW",
  CONTACT: "CONTACT",
};

function conversionSource(type: string): ConversionAction["source"] {
  if (type.startsWith("GOOGLE_ANALYTICS") || type.startsWith("FIREBASE")) return "GOOGLE_ANALYTICS";
  if (type.startsWith("UPLOAD") || type.startsWith("SALESFORCE") || type.includes("IMPORT")) return "IMPORT";
  if (type.includes("CALL")) return "PHONE_CALLS";
  if (type === "WEBPAGE" || type.startsWith("WEBPAGE_") || type.startsWith("CLICK_TO")) return "WEBSITE";
  // Actions Google creates and counts itself (engagement, YouTube follow-on views).
  return "GOOGLE";
}

export function mapConversions(rows: GaqlRow[], counts: GaqlRow[]): ConversionAction[] {
  const last30 = new Map<string, number>();
  for (const r of counts) {
    const id = lastId(r.segments?.conversionAction);
    last30.set(id, (last30.get(id) ?? 0) + num(r.metrics?.allConversions));
  }
  const out: ConversionAction[] = [];
  for (const r of rows) {
    const a = r.conversionAction;
    if (!a?.id) continue;
    const conversions30d = last30.get(str(a.id)) ?? 0;
    const removed = a.status === "REMOVED" || a.status === "HIDDEN";
    out.push({
      id: str(a.id),
      name: str(a.name) || str(a.id),
      category: CATEGORY[str(a.category)] ?? "OTHER",
      categoryLabel: CATEGORY[str(a.category)] || a.category === "DEFAULT" || !a.category ? undefined : sentenceCase(str(a.category)),
      source: conversionSource(str(a.type)),
      status: removed ? "REMOVED" : conversions30d > 0 ? "ACTIVE" : "NO_RECENT_CONVERSIONS",
      primary: !!a.primaryForGoal,
      countingType: a.countingType === "ONE_PER_CLICK" ? "ONE_PER_CLICK" : "MANY_PER_CLICK",
      defaultValue: a.valueSettings?.defaultValue != null ? num(a.valueSettings.defaultValue) : undefined,
      useDynamicValue: a.valueSettings?.alwaysUseDefaultValue === false,
      clickThroughWindowDays: num(a.clickThroughLookbackWindowDays),
      attribution: a.attributionModelSettings?.attributionModel === "GOOGLE_SEARCH_ATTRIBUTION_DATA_DRIVEN" ? "DATA_DRIVEN" : "LAST_CLICK",
      conversions30d,
    });
  }
  return out;
}

const sentenceCase = (type: string) => {
  const words = type.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const RECOMMENDATION_TEXT: Record<string, string> = {
  CAMPAIGN_BUDGET: "Raise a budget that is limiting this campaign",
  FORECASTING_CAMPAIGN_BUDGET: "Raise this budget for an expected busy period",
  MARGINAL_ROI_CAMPAIGN_BUDGET: "Adjust this budget for better returns",
  KEYWORD: "Add new keywords",
  USE_BROAD_MATCH_KEYWORD: "Switch keywords to broad match",
  KEYWORD_MATCH_TYPE: "Change keyword match types",
  TARGET_CPA_OPT_IN: "Bid to a target cost per conversion",
  SET_TARGET_CPA: "Set a target cost per conversion",
  RAISE_TARGET_CPA: "Raise the target cost per conversion",
  TARGET_ROAS_OPT_IN: "Bid to a target return on ad spend",
  SET_TARGET_ROAS: "Set a target return on ad spend",
  LOWER_TARGET_ROAS: "Lower the target return on ad spend",
  MAXIMIZE_CONVERSIONS_OPT_IN: "Bid to get the most conversions",
  MAXIMIZE_CONVERSION_VALUE_OPT_IN: "Bid to get the most conversion value",
  MAXIMIZE_CLICKS_OPT_IN: "Bid to get the most clicks",
  SEARCH_PARTNERS_OPT_IN: "Show ads on search partner sites",
  RESPONSIVE_SEARCH_AD: "Add a responsive search ad",
  RESPONSIVE_SEARCH_AD_ASSET: "Add headlines or descriptions to your ads",
  RESPONSIVE_SEARCH_AD_IMPROVE_AD_STRENGTH: "Improve your ad strength",
  SITELINK_ASSET: "Add sitelinks",
  CALLOUT_ASSET: "Add callouts",
  CALL_ASSET: "Add a phone number",
  DYNAMIC_IMAGE_EXTENSION_OPT_IN: "Show images from your site in ads",
  IMPROVE_PERFORMANCE_MAX_AD_STRENGTH: "Improve your Performance Max ad strength",
  MOVE_UNUSED_BUDGET: "Move unused budget to a limited campaign",
  OPTIMIZE_AD_ROTATION: "Show your best ads more often",
};

function recommendationCategory(type: string): RecommendationCategory {
  if (/CONVERSION_TRACKING|ENHANCED_CONVERSIONS|UPGRADE_LOCAL/.test(type)) return "MEASUREMENT";
  if (/DISAPPROVED|REPAIR|FIX_/.test(type)) return "REPAIRS";
  if (/BUDGET|CPA|ROAS|MAXIMIZE|BID|CPC/.test(type)) return "BIDDING_BUDGETS";
  if (/KEYWORD|SEARCH_PARTNERS|DISPLAY_EXPANSION|AUDIENCE/.test(type)) return "KEYWORDS_TARGETING";
  if (/\bAD\b|_AD_|_AD$|^AD_|ASSET|SITELINK|CALLOUT|IMAGE/.test(type)) return "ADS_ASSETS";
  return "KEYWORDS_TARGETING";
}

function impactText(base: GaqlRow | undefined, potential: GaqlRow | undefined): string | undefined {
  const gain = (field: string) => num(potential?.[field]) - num(base?.[field]);
  const round = (v: number) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
  if (gain("conversions") > 0) return `+${round(gain("conversions"))} conversions`;
  if (gain("clicks") > 0) return `+${round(gain("clicks"))} clicks`;
  if (gain("impressions") > 0) return `+${round(gain("impressions"))} impressions`;
  return undefined;
}

export function mapRecommendations(rows: GaqlRow[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const r of rows) {
    const rec = r.recommendation;
    if (!rec?.resourceName || !rec.type) continue;
    const type = str(rec.type);
    const impact = impactText(rec.impact?.baseMetrics, rec.impact?.potentialMetrics);
    out.push({
      id: lastId(rec.resourceName),
      type,
      category: recommendationCategory(type),
      title: RECOMMENDATION_TEXT[type] ?? sentenceCase(type),
      description: impact ? `Google estimates ${impact} over a week if you apply this.` : "Google suggests this for your account.",
      // The API doesn't report how much one recommendation moves the score.
      scoreUplift: 0,
      campaignId: rec.campaign ? lastId(rec.campaign) : undefined,
      impact,
      status: "ACTIVE",
      ops: [],
    });
  }
  return out;
}

/** The parts of the page that depend on each query, for the notice when one fails. */
export const UNAVAILABLE_LABELS: Record<string, string> = {
  budgets: "budgets",
  adGroups: "ad groups",
  adGroupMetrics: "ad group numbers",
  keywords: "keywords",
  keywordMetrics: "keyword numbers",
  campaignNegatives: "negative keywords",
  ads: "ads",
  adMetrics: "ad numbers",
  searchTerms: "search terms",
  customerDaily: "account totals",
  locations: "locations",
  languages: "languages",
  schedule: "ad schedules",
  deviceBids: "device bids",
  conversions: "conversion actions",
  conversionCounts: "conversion counts",
  recommendations: "recommendations",
  assetGroups: "asset groups",
  assetGroupAssets: "asset group assets",
  assetGroupSignals: "audience signals and search themes",
  assetGroupListings: "asset group products",
  assetGroupMetrics: "asset group numbers",
  placementMetrics: "placement numbers",
  topicMetrics: "topic numbers",
  productGroupMetrics: "product group numbers",
  customerAssets: "account assets",
  campaignAssets: "campaign assets",
  adGroupAssets: "ad group assets",
  userLists: "audience lists",
  campaignAudiences: "campaign audiences",
  adGroupAudiences: "ad group audiences",
  audienceNames: "audience signal names",
  listingGroups: "product groups",
  placements: "placements",
  labels: "labels",
  bidStrategies: "portfolio bid strategies",
  sharedSets: "shared lists",
  campaignSharedSets: "shared list campaigns",
  sharedPlacements: "excluded placements",
  experiments: "experiments",
  experimentArms: "experiment campaigns",
  productLinks: "Merchant Center links",
};
