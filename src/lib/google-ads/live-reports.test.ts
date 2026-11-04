import { describe, expect, it } from "vitest";
import {
  conversionsReport,
  during,
  judgeRecommendation,
  productTier,
  productsReport,
  reachReport,
  recommendationsReport,
  reportQueries,
  REPORTS,
  shoppingPmaxReport,
  type CampaignFacts,
} from "./live-reports";

const campaign = (id: string, over: Record<string, unknown> = {}) => ({
  campaign: { id, name: `Campaign ${id}`, status: "ENABLED", advertisingChannelType: "SEARCH", biddingStrategyType: "MAXIMIZE_CONVERSIONS", ...over },
  campaignBudget: { amountMicros: "50000000" },
});
const perf = (id: string, cost: number, conversions: number, value = 0, extra: Record<string, unknown> = {}) => ({
  campaign: { id },
  metrics: { costMicros: String(cost * 1e6), conversions, conversionsValue: value, allConversions: conversions, ...extra },
});
const action = (id: string, over: Record<string, unknown> = {}) => ({
  conversionAction: {
    id,
    name: `Action ${id}`,
    status: "ENABLED",
    type: "WEBPAGE",
    category: "PURCHASE",
    primaryForGoal: true,
    includeInConversionsMetric: true,
    countingType: "MANY_PER_CLICK",
    attributionModelSettings: { attributionModel: "GOOGLE_SEARCH_ATTRIBUTION_DATA_DRIVEN" },
    valueSettings: { defaultValue: 0, alwaysUseDefaultValue: false },
    ...over,
  },
});
const byAction = (id: string, conversions: number, value: number) => ({
  segments: { conversionAction: `customers/1/conversionActions/${id}` },
  metrics: { conversions, conversionsValue: value, allConversions: conversions, allConversionsValue: value },
});
const tracked = [{ customer: { conversionTrackingSetting: { conversionTrackingStatus: "CONVERSION_TRACKING_MANAGED_BY_SELF" } } }];
const checks = (r: { findings: { check: string }[] }) => r.findings.map((f) => f.check);

describe("queries", () => {
  it("every report has queries and dates use Google's presets or a closed range", () => {
    for (const r of REPORTS) expect(Object.keys(reportQueries(r, 30)).length).toBeGreaterThan(1);
    expect(during(30)).toBe("segments.date DURING LAST_30_DAYS");
    expect(during(90, new Date("2026-11-04T10:00:00Z"))).toBe("segments.date BETWEEN '2026-08-06' AND '2026-11-03'");
  });
});

describe("conversionsReport", () => {
  it("passes a clean store: one primary purchase with values and data-driven attribution", () => {
    const r = conversionsReport({ settings: tracked, campaigns: [campaign("1")], campaignPerf: [perf("1", 1000, 40, 4000)], actions: [action("10")], byAction: [byAction("10", 40, 4000)] }, 30);
    expect(r.findings).toEqual([]);
    expect(r.actions[0]).toMatchObject({ primary: true, conversions: 40, value: 4000 });
  });

  it("flags double-counted purchases, missing values, one-per-click and micro conversions as primary", () => {
    const r = conversionsReport(
      {
        settings: tracked,
        campaigns: [campaign("1", { advertisingChannelType: "SHOPPING", shoppingSetting: { merchantId: "9" } })],
        campaignPerf: [perf("1", 1000, 40, 0)],
        actions: [
          action("10", { name: "Purchase tag" }),
          action("11", { name: "GA4 purchase", type: "GOOGLE_ANALYTICS_4_PURCHASE", countingType: "ONE_PER_CLICK" }),
          action("12", { name: "Add to cart", category: "ADD_TO_CART" }),
        ],
        byAction: [byAction("10", 20, 0), byAction("11", 20, 0), byAction("12", 50, 0)],
      },
      30
    );
    expect(checks(r)).toEqual(expect.arrayContaining(["Double counting", "Purchase value", "Counting", "Micro conversion as primary"]));
    expect(r.findings[0]!.severity).toBe("high");
  });

  it("flags no tracking, no primary action, and a store without purchase tracking", () => {
    const r = conversionsReport({ settings: [], campaigns: [campaign("1", { advertisingChannelType: "SHOPPING", shoppingSetting: { merchantId: "9" } })], actions: [], byAction: [] }, 30);
    expect(checks(r)).toEqual(expect.arrayContaining(["Conversion tracking", "Primary conversion", "Purchase tracking"]));
  });

  it("warns when a target is set with too little volume, scaled to a month", () => {
    const r = conversionsReport(
      {
        settings: tracked,
        campaigns: [campaign("1", { biddingStrategyType: "TARGET_ROAS", targetRoas: { targetRoas: 4 } })],
        campaignPerf: [perf("1", 500, 10, 2000)],
        actions: [action("10")],
        byAction: [byAction("10", 10, 2000)],
      },
      14
    );
    expect(r.findings.find((f) => f.check === "Bidding volume")?.detail).toMatch(/about 21 conversions a month/);
  });
});

describe("productTier", () => {
  const target = 4;
  it("follows the tier rules in order", () => {
    expect(productTier({ cost: 31, conversions: 0, value: 0 }, target, 10)).toBe("loser_exclude");
    expect(productTier({ cost: 21, conversions: 0, value: 0 }, target, 10)).toBe("loser_limit");
    expect(productTier({ cost: 15, conversions: 0, value: 0 }, target, 10)).toBe("too_early");
    expect(productTier({ cost: 100, conversions: 3, value: 600 }, target, 10)).toBe("star");
    expect(productTier({ cost: 100, conversions: 2, value: 600 }, target, 10)).toBe("on_target");
    expect(productTier({ cost: 100, conversions: 2, value: 200 }, target, 10)).toBe("below_target");
    expect(productTier({ cost: 15, conversions: 1, value: 20 }, target, 10)).toBe("too_early");
  });
});

describe("productsReport", () => {
  const prod = (id: string, cost: number, conversions: number, value: number, impressions = 500) => ({
    segments: { productItemId: id, productTitle: `Product ${id}`, productBrand: "Arzo", productTypeL1: "Rings" },
    campaign: { id: "1" },
    metrics: { costMicros: String(cost * 1e6), conversions, conversionsValue: value, impressions, clicks: 10 },
  });
  const sp = (id: string, over: Record<string, unknown> = {}) => ({ shoppingProduct: { itemId: id, title: `Product ${id}`, status: "ELIGIBLE", availability: "IN_STOCK", priceMicros: "100000000", ...over } });

  it("tiers products against the average ROAS and sizes the waste", () => {
    const r = productsReport(
      {
        campaigns: [campaign("1", { advertisingChannelType: "SHOPPING" })],
        performance: [prod("A", 100, 5, 1000), prod("B", 100, 0, 0), prod("C", 20, 1, 100)],
        catalog: [sp("A"), sp("B"), sp("C"), sp("D", { status: "NOT_ELIGIBLE", issues: [{ description: "Missing image" }] }), sp("E")],
      },
      30
    );
    expect(r.targetRoas).toBeCloseTo(1100 / 220, 2);
    expect(r.stars.map((p) => p.itemId)).toEqual(["a"]);
    expect(r.losers.map((p) => p.itemId)).toEqual(["b"]);
    expect(r.barelyServing).toMatchObject({ catalogProducts: 5, notEligible: 1, eligibleButQuiet: 1 });
    expect(r.barelyServing.notEligibleSample[0]!.reason).toBe("Missing image");
    expect(r.findings.find((f) => f.check === "Products spending without sales")?.severity).toBe("high");
  });

  it("uses a given target ROAS instead of the average", () => {
    const r = productsReport({ performance: [prod("A", 100, 5, 300)], catalog: [] }, 30, { targetRoas: 5 });
    expect(r.targetRoas).toBe(5);
    expect(r.targetSource).toBe("given");
  });
});

describe("judgeRecommendation", () => {
  const facts = (over: Partial<CampaignFacts> = {}): CampaignFacts => ({
    id: "1", name: "C", status: "ENABLED", type: "SEARCH", bidding: "MAXIMIZE_CONVERSIONS", targetCpa: 20, cost: 900, clicks: 0, impressions: 0, conversions: 60, value: 0, allConversions: 60, lostToBudget: 25, ...over,
  });
  const ctx = { accountCpa: 20, accountRoas: 0, valueBased: false, days: 30 };
  const impact = (extraCost: number, extraConv: number) => ({ base: { cost: 100, conversions: 10, value: 0 }, potential: { cost: 100 + extraCost, conversions: 10 + extraConv, value: 0 } });

  it("budget: accept, adapt or dismiss on CPA, lost share and the cost of the extra conversions", () => {
    expect(judgeRecommendation("CAMPAIGN_BUDGET", facts(), impact(100, 6), ctx).verdict).toBe("accept");
    expect(judgeRecommendation("CAMPAIGN_BUDGET", facts(), impact(100, 4), ctx).verdict).toBe("adapt");
    expect(judgeRecommendation("CAMPAIGN_BUDGET", facts(), impact(100, 2), ctx).verdict).toBe("dismiss");
    expect(judgeRecommendation("CAMPAIGN_BUDGET", facts({ lostToBudget: 5 }), impact(100, 6), ctx).verdict).toBe("dismiss");
    expect(judgeRecommendation("CAMPAIGN_BUDGET", facts({ cost: 1500 }), impact(100, 6), ctx).verdict).toBe("dismiss");
  });

  it("bidding targets need enough conversions", () => {
    expect(judgeRecommendation("TARGET_CPA_OPT_IN", facts({ conversions: 10 }), impact(0, 0), ctx).verdict).toBe("dismiss");
    expect(judgeRecommendation("TARGET_CPA_OPT_IN", facts(), impact(0, 0), ctx).verdict).toBe("adapt");
    expect(judgeRecommendation("TARGET_ROAS_OPT_IN", facts({ conversions: 40 }), impact(0, 0), ctx).verdict).toBe("dismiss");
  });

  it("broad match only with smart bidding, volume, on target and budget room", () => {
    expect(judgeRecommendation("USE_BROAD_MATCH_KEYWORD", facts({ lostToBudget: 0 }), impact(0, 0), ctx).verdict).toBe("accept");
    expect(judgeRecommendation("USE_BROAD_MATCH_KEYWORD", facts({ lostToBudget: 0, bidding: "MANUAL_CPC" }), impact(0, 0), ctx).verdict).toBe("dismiss");
    expect(judgeRecommendation("USE_BROAD_MATCH_KEYWORD", facts(), impact(0, 0), ctx).verdict).toBe("dismiss");
  });

  it("assets and measurement are accepted; click bidding is dismissed", () => {
    expect(judgeRecommendation("SITELINK_ASSET", facts(), impact(0, 0), ctx).verdict).toBe("accept");
    expect(judgeRecommendation("IMPROVE_GOOGLE_TAG_COVERAGE", facts(), impact(0, 0), ctx).verdict).toBe("accept");
    expect(judgeRecommendation("MAXIMIZE_CLICKS_OPT_IN", facts(), impact(0, 0), ctx).verdict).toBe("dismiss");
  });
});

describe("recommendationsReport", () => {
  it("reads budget details and flags auto-apply types that change spend", () => {
    const r = recommendationsReport({
      campaigns: [campaign("1")],
      campaignPerf: [perf("1", 900, 60, 0, { searchBudgetLostImpressionShare: 0.25 })],
      recommendations: [
        {
          recommendation: {
            type: "CAMPAIGN_BUDGET",
            campaign: "customers/1/campaigns/1",
            impact: { baseMetrics: { costMicros: "100000000", conversions: 10 }, potentialMetrics: { costMicros: "200000000", conversions: 17 } },
            campaignBudgetRecommendation: { currentBudgetAmountMicros: "30000000", recommendedBudgetAmountMicros: "60000000" },
          },
        },
      ],
      autoApply: [{ recommendationSubscription: { type: "USE_BROAD_MATCH_KEYWORD", status: "ENABLED" } }, { recommendationSubscription: { type: "OPTIMIZE_AD_ROTATION", status: "ENABLED" } }],
    });
    expect(r.recommendations[0]).toMatchObject({ verdict: "accept", detail: { currentBudget: 30, recommendedBudget: 60 }, campaign: { id: "1" } });
    expect(r.findings[0]).toMatchObject({ severity: "high", check: "Auto-apply" });
    expect(r.findings[0]!.detail).not.toMatch(/OPTIMIZE_AD_ROTATION/);
  });
});

describe("shoppingPmaxReport", () => {
  it("checks asset coverage, catch-all groups, overlap and brand-free search categories", () => {
    const r = shoppingPmaxReport(
      {
        campaigns: [campaign("5", { advertisingChannelType: "PERFORMANCE_MAX", biddingStrategyType: "MAXIMIZE_CONVERSION_VALUE", shoppingSetting: { merchantId: "9" } })],
        campaignPerf: [perf("5", 1000, 30, 3000)],
        assetGroups: [
          { assetGroup: { id: "a", name: "All", status: "ENABLED", adStrength: "POOR" }, campaign: { id: "5" } },
          { assetGroup: { id: "b", name: "Rings", status: "ENABLED", adStrength: "EXCELLENT" }, campaign: { id: "5" } },
        ],
        assetGroupPerf: [
          { assetGroup: { id: "a" }, metrics: { costMicros: "900000000", conversions: 28, conversionsValue: 2800 } },
          { assetGroup: { id: "b" }, metrics: { costMicros: "100000000", conversions: 2, conversionsValue: 200 } },
        ],
        assetGroupAssets: [{ assetGroup: { id: "a" }, assetGroupAsset: { fieldType: "HEADLINE" } }],
        listingGroups: [
          { assetGroup: { id: "a" }, assetGroupListingGroupFilter: { id: "1", type: "UNIT_INCLUDED" } },
          { assetGroup: { id: "b" }, assetGroupListingGroupFilter: { id: "2", type: "SUBDIVISION" } },
          { assetGroup: { id: "b" }, assetGroupListingGroupFilter: { id: "3", type: "UNIT_INCLUDED", parentListingGroupFilter: "x", caseValue: { productItemId: { value: "sku1" } } } },
        ],
        signals: [],
      },
      30,
      { "5": [{ campaignSearchTermInsight: { categoryLabel: "arzo rings" }, metrics: { impressions: 800 } }, { campaignSearchTermInsight: { categoryLabel: "silver rings" }, metrics: { impressions: 200 } }] }
    );
    expect(checks(r)).toEqual(expect.arrayContaining(["Missing assets", "Ad strength", "Catch-all", "Thin asset group", "Spend concentration", "Custom labels"]));
    expect(r.assetGroups.find((g) => g.id === "a")?.listingGroups).toMatchObject({ allProducts: true });
    expect(r.pmaxSearchCategories["5"]![0]).toMatchObject({ category: "arzo rings", sharePercent: 80 });
  });
});

describe("reachReport", () => {
  it("names countries, flags interest-only spend, all-countries targeting and missing assets", () => {
    const r = reachReport(
      {
        campaigns: [campaign("1")],
        devices: [
          { segments: { device: "MOBILE" }, metrics: { costMicros: "800000000", conversions: 40 } },
          { segments: { device: "TABLET" }, metrics: { costMicros: "200000000", conversions: 0 } },
        ],
        geo: [
          { geographicView: { countryCriterionId: "2840", locationType: "LOCATION_OF_PRESENCE" }, metrics: { costMicros: "700000000" } },
          { geographicView: { countryCriterionId: "2276", locationType: "AREA_OF_INTEREST" }, metrics: { costMicros: "300000000" } },
        ],
        locations: [],
        campaignAssets: [{ campaign: { id: "1" }, campaignAsset: { fieldType: "SITELINK" } }],
        accountAssets: [],
        changes: [],
      },
      30,
      { "2840": "United States", "2276": "Germany" }
    );
    expect(r.countries[0]).toMatchObject({ country: "United States", matchedBy: "physical location" });
    expect(checks(r)).toEqual(expect.arrayContaining(["Device", "Location option", "Locations", "Assets"]));
  });
});
