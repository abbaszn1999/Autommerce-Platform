import { describe, expect, it } from "vitest";
import { buildLiveAccount, mapAd, mapCampaign, mapKeyword, type LiveRows } from "./live-report";
import { LIVE_QUERIES, assertIsoDay } from "./live-queries";
import { accountBase, adBase, adGroupBase, campaignBase, keywordBase, searchTermBase } from "./metrics";
import type { DateRange, GoogleAccount, Keyword } from "./types";

// Rows shaped like Google Ads API JSON: camelCase, int64 as strings, money in micros.
const m = (impressions: number, clicks: number, cost: number, conversions: number, value: number) => ({
  metrics: { impressions: String(impressions), clicks: String(clicks), costMicros: String(cost * 1_000_000), conversions, conversionsValue: value },
});

const RANGE: DateRange = { preset: "LAST_7_DAYS", start: "2026-10-26", end: "2026-11-01" };

const rows: LiveRows = {
  customer: [{ customer: { id: "2046362164", optimizationScore: 0.72, autoTaggingEnabled: true } }],
  campaigns: [
    {
      campaign: {
        id: "111",
        name: "Brand – Search",
        status: "ENABLED",
        advertisingChannelType: "SEARCH",
        biddingStrategyType: "TARGET_CPA",
        campaignBudget: "customers/2046362164/campaignBudgets/900",
        startDateTime: "2026-01-05 00:00:00",
        endDateTime: "2037-12-30 23:59:59",
        networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false },
        targetCpa: { targetCpaMicros: "12500000" },
        primaryStatus: "LIMITED",
        primaryStatusReasons: ["BUDGET_CONSTRAINED"],
      },
    },
    {
      campaign: {
        id: "222",
        name: "PMax – All",
        status: "PAUSED",
        advertisingChannelType: "PERFORMANCE_MAX",
        biddingStrategyType: "MAXIMIZE_CONVERSION_VALUE",
        campaignBudget: "customers/2046362164/campaignBudgets/901",
        startDateTime: "2026-03-01 00:00:00",
        maximizeConversionValue: { targetRoas: 4 },
      },
    },
    // Local campaigns aren't supported by the workspace: skipped, not guessed.
    { campaign: { id: "333", name: "Local", status: "ENABLED", advertisingChannelType: "LOCAL", campaignBudget: "customers/1/campaignBudgets/902" } },
  ],
  budgets: [
    { campaignBudget: { id: "900", name: "Brand budget", amountMicros: "40000000", explicitlyShared: false, deliveryMethod: "STANDARD" } },
    { campaignBudget: { id: "901", name: "PMax budget", amountMicros: "80000000", explicitlyShared: true } },
    { campaignBudget: { id: "902", name: "Unused", amountMicros: "1000000" } },
  ],
  campaignDaily: [
    { campaign: { id: "111" }, segments: { date: "2026-10-31" }, ...m(100, 10, 5, 1, 50) },
    { campaign: { id: "111" }, segments: { date: "2026-10-30" }, ...m(200, 30, 15, 2, 100) },
    { campaign: { id: "222" }, segments: { date: "2026-10-31" }, ...m(1000, 20, 30, 3, 300) },
    { campaign: { id: "333" }, segments: { date: "2026-10-31" }, ...m(9, 9, 9, 9, 9) },
  ],
  adGroups: [
    { adGroup: { id: "10", name: "Brand terms", status: "ENABLED", type: "SEARCH_STANDARD", cpcBidMicros: "1500000" }, campaign: { id: "111" } },
    { adGroup: { id: "11", name: "Competitors", status: "PAUSED", type: "SEARCH_STANDARD" }, campaign: { id: "111" } },
  ],
  adGroupMetrics: [
    { adGroup: { id: "10" }, ...m(250, 35, 18, 3, 150) },
    { adGroup: { id: "11" }, ...m(50, 5, 2, 0, 0) },
  ],
  keywords: [
    {
      adGroup: { id: "10" },
      adGroupCriterion: {
        criterionId: "5001",
        keyword: { text: "stride shoes", matchType: "EXACT" },
        status: "ENABLED",
        negative: false,
        approvalStatus: "APPROVED",
        qualityInfo: { qualityScore: 8, creativeQualityScore: "ABOVE_AVERAGE", postClickQualityScore: "AVERAGE", searchPredictedCtr: "BELOW_AVERAGE" },
        positionEstimates: { firstPageCpcMicros: "900000", topOfPageCpcMicros: "2100000" },
        finalUrls: ["https://stride.example/"],
      },
    },
    { adGroup: { id: "10" }, adGroupCriterion: { criterionId: "5002", keyword: { text: "stride", matchType: "PHRASE" }, status: "PAUSED" } },
    { adGroup: { id: "10" }, adGroupCriterion: { criterionId: "5003", keyword: { text: "free", matchType: "BROAD" }, negative: true } },
  ],
  keywordMetrics: [
    { adGroup: { id: "10" }, adGroupCriterion: { criterionId: "5001" }, ...m(200, 30, 15, 3, 150) },
    { adGroup: { id: "10" }, adGroupCriterion: { criterionId: "5002" }, ...m(50, 5, 3, 0, 0) },
  ],
  campaignNegatives: [{ campaign: { id: "111" }, campaignCriterion: { criterionId: "7001", keyword: { text: "jobs", matchType: "PHRASE" } } }],
  ads: [
    {
      adGroup: { id: "10" },
      adGroupAd: {
        status: "ENABLED",
        adStrength: "GOOD",
        policySummary: { approvalStatus: "APPROVED", reviewStatus: "REVIEWED" },
        ad: {
          id: "8001",
          type: "RESPONSIVE_SEARCH_AD",
          finalUrls: ["https://stride.example/"],
          responsiveSearchAd: {
            headlines: [{ text: "Stride Official Store", pinnedField: "HEADLINE_1" }, { text: "Free Delivery" }],
            descriptions: [{ text: "Shop the new season." }],
            path1: "shoes",
          },
        },
      },
    },
    // Expanded text ads are retired: skipped.
    { adGroup: { id: "10" }, adGroupAd: { status: "ENABLED", ad: { id: "8002", type: "EXPANDED_TEXT_AD" } } },
  ],
  adMetrics: [{ adGroup: { id: "10" }, adGroupAd: { ad: { id: "8001" } }, ...m(250, 35, 18, 3, 150) }],
  searchTerms: [
    { campaign: { id: "111" }, adGroup: { id: "10" }, searchTermView: { searchTerm: "stride shoes", status: "ADDED" }, segments: { searchTermMatchType: "NEAR_EXACT" }, ...m(120, 20, 10, 2, 100) },
    { campaign: { id: "111" }, adGroup: { id: "10" }, searchTermView: { searchTerm: "stride jobs", status: "NONE" }, segments: { searchTermMatchType: "BROAD" }, ...m(30, 4, 2, 0, 0) },
    { campaign: { id: "222" }, searchTermView: { searchTerm: "running shoes", status: "NONE" }, segments: { searchTermMatchType: "PERFORMANCE_MAX" }, ...m(400, 8, 6, 1, 90) },
  ],
};

const account: GoogleAccount = { customerId: "2046362164", name: "Kalema", currency: "USD", timeZone: "Asia/Beirut", isManager: false, optimizationScore: 0, autoTagging: false };

describe("buildLiveAccount", () => {
  const data = buildLiveAccount(account, rows, RANGE);

  it("maps campaigns and skips types the workspace can't show", () => {
    expect(data.campaigns.map((c) => c.id)).toEqual(["111", "222"]);
    const brand = data.campaigns[0]!;
    expect(brand).toMatchObject({
      name: "Brand – Search",
      type: "SEARCH",
      status: "ENABLED",
      budgetId: "900",
      startDate: "2026-01-05",
      endDate: undefined,
      bidding: { type: "TARGET_CPA", targetCpa: 12.5 },
      networks: { googleSearch: true, searchPartners: false, displayNetwork: false },
    });
    expect(brand.servingIssues).toEqual(["LIMITED_BY_BUDGET", "ELIGIBLE_LIMITED"]);
    expect(data.campaigns[1]).toMatchObject({ type: "PERFORMANCE_MAX", status: "PAUSED", bidding: { type: "MAXIMIZE_CONVERSION_VALUE", targetRoas: 4 } });
  });

  it("keeps only budgets that campaigns use, in account currency units", () => {
    expect(data.budgets).toEqual([
      { id: "900", name: "Brand budget", amount: 40, shared: false, deliveryMethod: "STANDARD" },
      { id: "901", name: "PMax budget", amount: 80, shared: true, deliveryMethod: "STANDARD" },
    ]);
  });

  it("campaign numbers are exactly Google's daily rows", () => {
    expect(campaignBase(data, "111", RANGE)).toEqual({ impressions: 300, clicks: 40, cost: 20, conversions: 3, conversionsValue: 150 });
    // The skipped Local campaign's spend is not counted in the account total.
    expect(accountBase(data, RANGE).cost).toBe(50);
    expect(data.daily["111"]!.map((p) => p.date)).toEqual(["2026-10-30", "2026-10-31"]);
  });

  it("ad groups, keywords, ads and search terms show Google's exact totals for the loaded range", () => {
    expect(adGroupBase(data, "10", RANGE)).toEqual({ impressions: 250, clicks: 35, cost: 18, conversions: 3, conversionsValue: 150 });
    expect(keywordBase(data, "10~5001", RANGE).cost).toBe(15);
    expect(adBase(data, "10~8001", RANGE).clicks).toBe(35);
    expect(searchTermBase(data, "10~NEAR_EXACT~stride shoes", RANGE).conversions).toBe(2);
  });

  it("falls back to shares from the real data for another range", () => {
    const other: DateRange = { preset: "LAST_30_DAYS", start: "2026-10-03", end: "2026-11-01" };
    const g10 = adGroupBase(data, "10", other).cost;
    const g11 = adGroupBase(data, "11", other).cost;
    expect(g10 + g11).toBeCloseTo(campaignBase(data, "111", other).cost);
    expect(g10 / (g10 + g11)).toBeCloseTo(0.9);
  });

  it("maps keywords, negatives at both levels, and quality details", () => {
    const kw = data.keywords.find((k) => k.id === "10~5001") as Keyword;
    expect(kw).toMatchObject({ text: "stride shoes", matchType: "EXACT", qualityScore: 8, firstPageBid: 0.9, topOfPageBid: 2.1, finalUrl: "https://stride.example/" });
    expect(kw.qualityParts).toEqual({ expectedCtr: "BELOW_AVERAGE", adRelevance: "ABOVE_AVERAGE", landingPage: "AVERAGE" });
    expect(data.keywords.find((k) => k.id === "10~5002")?.status).toBe("PAUSED");
    expect(data.negatives).toEqual([
      { id: "10~5003", text: "free", matchType: "BROAD", level: "AD_GROUP", parentId: "10" },
      { id: "111~7001", text: "jobs", matchType: "PHRASE", level: "CAMPAIGN", parentId: "111" },
    ]);
  });

  it("maps responsive search ads with pins and skips retired ad types", () => {
    expect(data.ads).toHaveLength(1);
    expect(data.ads[0]).toMatchObject({
      id: "10~8001",
      type: "RESPONSIVE_SEARCH_AD",
      headlines: [{ text: "Stride Official Store", pinned: "HEADLINE_1" }, { text: "Free Delivery" }],
      path1: "shoes",
      adStrength: "GOOD",
      policy: "APPROVED",
    });
  });

  it("maps search terms, including Performance Max ones without an ad group", () => {
    const pmax = data.searchTerms.find((t) => t.text === "running shoes")!;
    expect(pmax).toMatchObject({ campaignId: "222", adGroupId: "", matchedVia: "PMAX", status: "NONE" });
    expect(data.searchTerms.find((t) => t.text === "stride shoes")).toMatchObject({ matchedVia: "EXACT", status: "ADDED" });
  });

  it("never mixes in demo content", () => {
    expect(data.links).toEqual([]);
    expect(data.audiences).toEqual([]);
    expect(data.conversions).toEqual([]);
    expect(data.recommendations).toEqual([]);
    expect(data.account).toMatchObject({ optimizationScore: 0.72, autoTagging: true, name: "Kalema" });
  });

  it("handles an empty account", () => {
    const empty = buildLiveAccount(account, { ...Object.fromEntries(Object.keys(rows).map((k) => [k, []])) } as unknown as LiveRows, RANGE);
    expect(empty.campaigns).toEqual([]);
    expect(accountBase(empty, RANGE).cost).toBe(0);
  });
});

describe("mappers reject incomplete rows", () => {
  it("returns null instead of guessing", () => {
    expect(mapCampaign({ campaign: { name: "no id", advertisingChannelType: "SEARCH" } })).toBeNull();
    expect(mapKeyword({ adGroup: { id: "1" }, adGroupCriterion: { criterionId: "2", keyword: { text: "x", matchType: "UNKNOWN" } } })).toBeNull();
    expect(mapAd({ adGroup: { id: "1" }, adGroupAd: { ad: { type: "RESPONSIVE_SEARCH_AD" } } })).toBeNull();
  });
});

describe("queries", () => {
  it("only accept ISO days", () => {
    expect(() => assertIsoDay("2026-10-01' OR 1=1 --")).toThrow();
    expect(LIVE_QUERIES.adGroupMetrics("2026-10-01", "2026-10-31")).toContain("segments.date BETWEEN '2026-10-01' AND '2026-10-31'");
  });
});
