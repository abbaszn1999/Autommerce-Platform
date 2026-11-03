// Turns Google Ads API rows (GAQL JSON, camelCase, int64 as strings) into the
// AccountData the workspace renders. Pure: no network, so it is unit tested
// with sample rows. Unknown or unsupported values are skipped, never guessed.

import { buildEmptyAccount } from "./mock-data";
import type {
  AccountData,
  Ad,
  AdGroup,
  AdGroupType,
  AdPolicyStatus,
  AdStrength,
  AdText,
  AdType,
  BaseMetrics,
  Bidding,
  BiddingStrategyType,
  Campaign,
  CampaignBudget,
  CampaignType,
  DailyPoint,
  EntityStatus,
  GoogleAccount,
  Keyword,
  KeywordPolicy,
  MatchType,
  NegativeKeyword,
  PinPosition,
  SearchTerm,
  ServingIssue,
} from "./types";

/** One GAQL result row: nested objects keyed by resource (campaign, adGroup, metrics...). */
export type GaqlRow = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type LiveRows = {
  customer: GaqlRow[];
  campaigns: GaqlRow[];
  budgets: GaqlRow[];
  campaignDaily: GaqlRow[];
  adGroups: GaqlRow[];
  adGroupMetrics: GaqlRow[];
  keywords: GaqlRow[];
  keywordMetrics: GaqlRow[];
  campaignNegatives: GaqlRow[];
  ads: GaqlRow[];
  adMetrics: GaqlRow[];
  searchTerms: GaqlRow[];
};

const micros = (v: unknown) => (v == null || v === "" ? 0 : Number(v) / 1_000_000);
const optMicros = (v: unknown) => (v == null || v === "" || Number(v) === 0 ? undefined : Number(v) / 1_000_000);
const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);
const str = (v: unknown) => (v == null ? "" : String(v));
/** "customers/1/campaignBudgets/42" → "42". */
const lastId = (resource: unknown) => str(resource).split("/").pop() ?? "";

function status(v: unknown): EntityStatus {
  return v === "PAUSED" ? "PAUSED" : v === "REMOVED" ? "REMOVED" : "ENABLED";
}

export function metricsOf(row: GaqlRow): BaseMetrics {
  const m = row.metrics ?? {};
  return { impressions: num(m.impressions), clicks: num(m.clicks), cost: micros(m.costMicros), conversions: num(m.conversions), conversionsValue: num(m.conversionsValue) };
}

const CAMPAIGN_TYPES: Record<string, CampaignType> = {
  SEARCH: "SEARCH",
  PERFORMANCE_MAX: "PERFORMANCE_MAX",
  SHOPPING: "SHOPPING",
  DISPLAY: "DISPLAY",
  VIDEO: "VIDEO",
  DEMAND_GEN: "DEMAND_GEN",
  DISCOVERY: "DEMAND_GEN",
};

const BIDDING: Record<string, BiddingStrategyType> = {
  MAXIMIZE_CONVERSIONS: "MAXIMIZE_CONVERSIONS",
  MAXIMIZE_CONVERSION_VALUE: "MAXIMIZE_CONVERSION_VALUE",
  TARGET_CPA: "TARGET_CPA",
  TARGET_ROAS: "TARGET_ROAS",
  TARGET_SPEND: "MAXIMIZE_CLICKS",
  TARGET_IMPRESSION_SHARE: "TARGET_IMPRESSION_SHARE",
  MANUAL_CPC: "MANUAL_CPC",
  ENHANCED_CPC: "MANUAL_CPC",
};

function servingIssues(primary: unknown, reasons: unknown): ServingIssue[] {
  const out = new Set<ServingIssue>();
  const list = Array.isArray(reasons) ? reasons.map(String) : [];
  if (list.some((r) => r.includes("BUDGET_CONSTRAINED"))) out.add("LIMITED_BY_BUDGET");
  if (primary === "LEARNING" || list.some((r) => r.includes("LEARNING"))) out.add("LEARNING");
  if (primary === "LIMITED") out.add("ELIGIBLE_LIMITED");
  if (primary === "PENDING") out.add("PENDING");
  if (primary === "ENDED") out.add("ENDED");
  if (primary === "NOT_ELIGIBLE") out.add("NOT_ELIGIBLE");
  return [...out];
}

export function mapCampaign(row: GaqlRow): Campaign | null {
  const c = row.campaign ?? {};
  const type = CAMPAIGN_TYPES[str(c.advertisingChannelType)];
  if (!c.id || !type) return null;
  const biddingType = BIDDING[str(c.biddingStrategyType)] ?? "MANUAL_CPC";
  const bidding: Bidding = {
    type: biddingType,
    targetCpa: optMicros(c.targetCpa?.targetCpaMicros ?? c.maximizeConversions?.targetCpaMicros),
    targetRoas: c.targetRoas?.targetRoas ?? c.maximizeConversionValue?.targetRoas ?? undefined,
    portfolioId: c.biddingStrategy ? lastId(c.biddingStrategy) : undefined,
  };
  const start = str(c.startDateTime).slice(0, 10);
  const end = str(c.endDateTime).slice(0, 10);
  return {
    id: str(c.id),
    name: str(c.name) || str(c.id),
    status: status(c.status),
    type,
    objective: "NONE",
    budgetId: lastId(c.campaignBudget),
    bidding,
    networks: {
      googleSearch: !!c.networkSettings?.targetGoogleSearch,
      searchPartners: !!c.networkSettings?.targetSearchNetwork,
      displayNetwork: !!c.networkSettings?.targetContentNetwork,
    },
    locations: [],
    languages: [],
    schedule: [],
    devices: { mobile: 0, desktop: 0, tablet: 0 },
    startDate: start,
    // Google uses 2037-12-30 for "no end date".
    endDate: end && !end.startsWith("2037-12-30") ? end : undefined,
    conversionActionIds: [],
    euPoliticalAds: false,
    servingIssues: servingIssues(c.primaryStatus, c.primaryStatusReasons),
    trackingTemplate: c.trackingUrlTemplate || undefined,
    finalUrlSuffix: c.finalUrlSuffix || undefined,
    labels: [],
    createdAt: start,
  };
}

export function mapBudget(row: GaqlRow): CampaignBudget | null {
  const b = row.campaignBudget ?? {};
  if (!b.id) return null;
  return {
    id: str(b.id),
    name: str(b.name) || `Budget ${b.id}`,
    amount: micros(b.amountMicros),
    shared: !!b.explicitlyShared,
    deliveryMethod: b.deliveryMethod === "ACCELERATED" ? "ACCELERATED" : "STANDARD",
  };
}

const AD_GROUP_TYPES: [RegExp, AdGroupType][] = [
  [/^SEARCH/, "SEARCH_STANDARD"],
  [/^DISPLAY/, "DISPLAY_STANDARD"],
  [/^SHOPPING/, "SHOPPING_PRODUCT_ADS"],
  [/^VIDEO/, "VIDEO"],
  [/^(DEMAND_GEN|DISCOVERY)/, "DEMAND_GEN"],
];

export function mapAdGroup(row: GaqlRow): AdGroup | null {
  const g = row.adGroup ?? {};
  if (!g.id || !row.campaign?.id) return null;
  const type = AD_GROUP_TYPES.find(([re]) => re.test(str(g.type)))?.[1] ?? "SEARCH_STANDARD";
  return {
    id: str(g.id),
    campaignId: str(row.campaign.id),
    name: str(g.name) || str(g.id),
    status: status(g.status),
    type,
    defaultCpcBid: optMicros(g.cpcBidMicros),
    targetCpa: optMicros(g.targetCpaMicros),
  };
}

const MATCH: Record<string, MatchType> = { BROAD: "BROAD", PHRASE: "PHRASE", EXACT: "EXACT" };
const QUALITY = (v: unknown) => (v === "ABOVE_AVERAGE" || v === "BELOW_AVERAGE" ? v : "AVERAGE") as "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE";

/** Keyword ids are only unique inside their ad group, so ours are "adGroupId~criterionId" (Google's own composite form). */
export const keywordId = (row: GaqlRow) => `${str(row.adGroup?.id)}~${str(row.adGroupCriterion?.criterionId)}`;

export function mapKeyword(row: GaqlRow): Keyword | NegativeKeyword | null {
  const k = row.adGroupCriterion ?? {};
  const matchType = MATCH[str(k.keyword?.matchType)];
  if (!k.criterionId || !row.adGroup?.id || !matchType || !k.keyword?.text) return null;
  if (k.negative) return { id: keywordId(row), text: str(k.keyword.text), matchType, level: "AD_GROUP", parentId: str(row.adGroup.id) };
  const q = k.qualityInfo ?? {};
  const policy: KeywordPolicy =
    k.approvalStatus === "DISAPPROVED" ? "DISAPPROVED" : k.approvalStatus === "APPROVED_LIMITED" ? "APPROVED_LIMITED" : k.approvalStatus === "UNDER_REVIEW" ? "UNDER_REVIEW" : "APPROVED";
  return {
    id: keywordId(row),
    adGroupId: str(row.adGroup.id),
    text: str(k.keyword.text),
    matchType,
    status: status(k.status),
    cpcBid: optMicros(k.cpcBidMicros),
    qualityScore: q.qualityScore ? num(q.qualityScore) : undefined,
    qualityParts: q.qualityScore
      ? { expectedCtr: QUALITY(q.searchPredictedCtr), adRelevance: QUALITY(q.creativeQualityScore), landingPage: QUALITY(q.postClickQualityScore) }
      : undefined,
    policy,
    firstPageBid: optMicros(k.positionEstimates?.firstPageCpcMicros),
    topOfPageBid: optMicros(k.positionEstimates?.topOfPageCpcMicros),
    finalUrl: Array.isArray(k.finalUrls) && k.finalUrls[0] ? str(k.finalUrls[0]) : undefined,
  };
}

export function mapCampaignNegative(row: GaqlRow): NegativeKeyword | null {
  const k = row.campaignCriterion ?? {};
  const matchType = MATCH[str(k.keyword?.matchType)];
  if (!k.criterionId || !row.campaign?.id || !matchType || !k.keyword?.text) return null;
  return { id: `${row.campaign.id}~${k.criterionId}`, text: str(k.keyword.text), matchType, level: "CAMPAIGN", parentId: str(row.campaign.id) };
}

const AD_TYPES: [RegExp, AdType][] = [
  [/^RESPONSIVE_SEARCH_AD$/, "RESPONSIVE_SEARCH_AD"],
  [/^RESPONSIVE_DISPLAY_AD$/, "RESPONSIVE_DISPLAY_AD"],
  [/^SHOPPING_PRODUCT_AD$/, "SHOPPING_PRODUCT_AD"],
  [/^(VIDEO|IN_FEED_VIDEO)/, "VIDEO_AD"],
  [/^(DEMAND_GEN|DISCOVERY)/, "DEMAND_GEN_AD"],
];

const PINS = new Set<PinPosition>(["HEADLINE_1", "HEADLINE_2", "HEADLINE_3", "DESCRIPTION_1", "DESCRIPTION_2"]);

function texts(list: unknown): AdText[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((t) => t && t.text)
    .map((t) => ({ text: str(t.text), ...(PINS.has(t.pinnedField) ? { pinned: t.pinnedField as PinPosition } : {}) }));
}

const STRENGTH: Record<string, AdStrength> = { POOR: "POOR", AVERAGE: "AVERAGE", GOOD: "GOOD", EXCELLENT: "EXCELLENT" };

export const adId = (row: GaqlRow) => `${str(row.adGroup?.id)}~${str(row.adGroupAd?.ad?.id)}`;

export function mapAd(row: GaqlRow): Ad | null {
  const aga = row.adGroupAd ?? {};
  const ad = aga.ad ?? {};
  const type = AD_TYPES.find(([re]) => re.test(str(ad.type)))?.[1];
  if (!ad.id || !row.adGroup?.id || !type) return null;
  const rsa = ad.responsiveSearchAd ?? {};
  const rda = ad.responsiveDisplayAd ?? {};
  const approval = str(aga.policySummary?.approvalStatus);
  const policy: AdPolicyStatus =
    aga.policySummary?.reviewStatus === "REVIEW_IN_PROGRESS"
      ? "UNDER_REVIEW"
      : approval === "DISAPPROVED"
        ? "DISAPPROVED"
        : approval === "APPROVED_LIMITED" || approval === "AREA_OF_INTEREST_ONLY"
          ? "APPROVED_LIMITED"
          : approval === "APPROVED"
            ? "APPROVED"
            : "UNDER_REVIEW";
  return {
    id: adId(row),
    adGroupId: str(row.adGroup.id),
    type,
    status: status(aga.status),
    headlines: type === "RESPONSIVE_DISPLAY_AD" ? texts(rda.headlines) : texts(rsa.headlines),
    descriptions: type === "RESPONSIVE_DISPLAY_AD" ? texts(rda.descriptions) : texts(rsa.descriptions),
    longHeadline: rda.longHeadline?.text ? str(rda.longHeadline.text) : undefined,
    businessName: rda.businessName || undefined,
    finalUrl: Array.isArray(ad.finalUrls) && ad.finalUrls[0] ? str(ad.finalUrls[0]) : "",
    path1: rsa.path1 || undefined,
    path2: rsa.path2 || undefined,
    adStrength: STRENGTH[str(aga.adStrength)] ?? "PENDING",
    policy,
  };
}

const TERM_MATCH: Record<string, SearchTerm["matchedVia"]> = {
  BROAD: "BROAD",
  PHRASE: "PHRASE",
  NEAR_PHRASE: "PHRASE",
  EXACT: "EXACT",
  NEAR_EXACT: "EXACT",
  PERFORMANCE_MAX: "PMAX",
};

export const searchTermId = (row: GaqlRow) =>
  `${str(row.adGroup?.id || row.campaign?.id)}~${str(row.segments?.searchTermMatchType)}~${str(row.searchTermView?.searchTerm)}`;

/**
 * Exact totals for the chosen range, plus traffic share / conversion efficiency
 * per child so other ranges can still be estimated from the campaign's daily data.
 */
function weightsFrom(children: { id: string; parent: string; m: BaseMetrics }[]) {
  const byParent = new Map<string, { cost: number; impressions: number; conversions: number }>();
  for (const c of children) {
    const t = byParent.get(c.parent) ?? { cost: 0, impressions: 0, conversions: 0 };
    t.cost += c.m.cost;
    t.impressions += c.m.impressions;
    t.conversions += c.m.conversions;
    byParent.set(c.parent, t);
  }
  const out: AccountData["weights"] = {};
  for (const c of children) {
    const t = byParent.get(c.parent)!;
    const share = t.cost > 0 ? c.m.cost / t.cost : t.impressions > 0 ? c.m.impressions / t.impressions : 0;
    const convShare = t.conversions > 0 ? c.m.conversions / t.conversions : 0;
    out[c.id] = { share, efficiency: share > 0 ? convShare / share : 0 };
  }
  return out;
}

/** Assemble the account snapshot. `range` is the period the child totals cover. */
export function buildLiveAccount(account: GoogleAccount, rows: LiveRows, range: { start: string; end: string }): AccountData {
  const customer = rows.customer[0]?.customer ?? {};
  const campaigns = rows.campaigns.map(mapCampaign).filter((c): c is Campaign => !!c);
  const campaignIds = new Set(campaigns.map((c) => c.id));
  const budgetIds = new Set(campaigns.map((c) => c.budgetId));
  const budgets = rows.budgets.map(mapBudget).filter((b): b is CampaignBudget => !!b && budgetIds.has(b.id));

  const daily: Record<string, DailyPoint[]> = {};
  for (const r of rows.campaignDaily) {
    const id = str(r.campaign?.id);
    const date = str(r.segments?.date);
    if (!campaignIds.has(id) || !date) continue;
    (daily[id] ??= []).push({ date, ...metricsOf(r) });
  }
  for (const points of Object.values(daily)) points.sort((a, b) => a.date.localeCompare(b.date));

  const adGroups = rows.adGroups.map(mapAdGroup).filter((g): g is AdGroup => !!g && campaignIds.has(g.campaignId));
  const adGroupIds = new Set(adGroups.map((g) => g.id));
  const campaignOfAdGroup = new Map(adGroups.map((g) => [g.id, g.campaignId]));

  const keywords: Keyword[] = [];
  const negatives: NegativeKeyword[] = [];
  for (const r of rows.keywords) {
    const k = mapKeyword(r);
    if (!k || !adGroupIds.has(str(r.adGroup?.id))) continue;
    if ("level" in k) negatives.push(k);
    else keywords.push(k);
  }
  for (const r of rows.campaignNegatives) {
    const n = mapCampaignNegative(r);
    if (n && campaignIds.has(n.parentId)) negatives.push(n);
  }
  const ads = rows.ads.map(mapAd).filter((a): a is Ad => !!a && adGroupIds.has(a.adGroupId));

  const exact: Record<string, BaseMetrics> = {};
  const adGroupChildren = rows.adGroupMetrics
    .filter((r) => adGroupIds.has(str(r.adGroup?.id)))
    .map((r) => ({ id: str(r.adGroup.id), parent: campaignOfAdGroup.get(str(r.adGroup.id))!, m: metricsOf(r) }));
  const keywordIds = new Set(keywords.map((k) => k.id));
  const keywordChildren = rows.keywordMetrics
    .filter((r) => keywordIds.has(keywordId(r)))
    .map((r) => ({ id: keywordId(r), parent: str(r.adGroup.id), m: metricsOf(r) }));
  const adIds = new Set(ads.map((a) => a.id));
  const adChildren = rows.adMetrics.filter((r) => adIds.has(adId(r))).map((r) => ({ id: adId(r), parent: str(r.adGroup.id), m: metricsOf(r) }));

  const searchTerms: SearchTerm[] = [];
  const termChildren: { id: string; parent: string; m: BaseMetrics }[] = [];
  for (const r of rows.searchTerms) {
    const campaignId = str(r.campaign?.id);
    const adGroupId = r.adGroup?.id ? str(r.adGroup.id) : "";
    const text = str(r.searchTermView?.searchTerm);
    if (!text || !campaignIds.has(campaignId)) continue;
    const id = searchTermId(r);
    if (searchTerms.some((t) => t.id === id)) continue;
    const viewStatus = str(r.searchTermView?.status);
    searchTerms.push({
      id,
      text,
      campaignId,
      adGroupId,
      matchedVia: TERM_MATCH[str(r.segments?.searchTermMatchType)] ?? "BROAD",
      status: viewStatus === "EXCLUDED" ? "EXCLUDED" : viewStatus.startsWith("ADDED") ? "ADDED" : "NONE",
      share: 0,
      efficiency: 0,
    });
    termChildren.push({ id, parent: adGroupId || campaignId, m: metricsOf(r) });
  }

  const all = [...adGroupChildren, ...keywordChildren, ...adChildren, ...termChildren];
  for (const c of all) exact[c.id] = c.m;
  const weights = { ...weightsFrom(adGroupChildren), ...weightsFrom(keywordChildren), ...weightsFrom(adChildren) };
  const termWeights = weightsFrom(termChildren);
  for (const t of searchTerms) Object.assign(t, termWeights[t.id] ?? { share: 0, efficiency: 0 });

  return {
    ...buildEmptyAccount(),
    account: {
      ...account,
      optimizationScore: customer.optimizationScore != null ? num(customer.optimizationScore) : account.optimizationScore,
      autoTagging: customer.autoTaggingEnabled ?? account.autoTagging,
    },
    campaigns,
    budgets,
    adGroups,
    keywords,
    negatives,
    ads,
    searchTerms,
    audiences: [],
    conversions: [],
    // Not loaded from Google yet: empty rather than the template's "not linked" placeholders.
    links: [],
    daily,
    weights,
    exact: { start: range.start, end: range.end, byId: exact },
  };
}
