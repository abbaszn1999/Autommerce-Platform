import { describe, expect, it } from "vitest";
import { BIDDING, buildLiveAccount, type LiveRows } from "./live-report";
import { mapAssetGroups, mapAssets, mapAudiences, mapContentTargets, mapExperiments, mapLibrary, mapLinks, mapListingGroups } from "./live-structure";
import { contentMetrics, groupMetrics } from "./analytics";
import { assetGroupBase } from "./metrics";

describe("asset groups", () => {
  const rows = {
    assetGroups: [{ assetGroup: { id: "7", name: "All products", status: "ENABLED", campaign: "customers/1/campaigns/5", finalUrls: ["https://shop.com"], adStrength: "GOOD" } }],
    assetGroupAssets: [
      { assetGroup: { id: "7" }, assetGroupAsset: { fieldType: "HEADLINE" }, asset: { textAsset: { text: "Shop now" } } },
      { assetGroup: { id: "7" }, assetGroupAsset: { fieldType: "LONG_HEADLINE" }, asset: { textAsset: { text: "Everything for your home" } } },
      { assetGroup: { id: "7" }, assetGroupAsset: { fieldType: "BUSINESS_NAME" }, asset: { textAsset: { text: "Shop" } } },
      { assetGroup: { id: "7" }, assetGroupAsset: { fieldType: "SQUARE_MARKETING_IMAGE" }, asset: { imageAsset: { fullSize: { url: "https://img/1.jpg" } } } },
      { assetGroup: { id: "7" }, assetGroupAsset: { fieldType: "YOUTUBE_VIDEO" }, asset: { youtubeVideoAsset: { youtubeVideoId: "abc" } } },
      { assetGroup: { id: "99" }, assetGroupAsset: { fieldType: "HEADLINE" }, asset: { textAsset: { text: "Other group" } } },
    ],
    assetGroupSignals: [
      { assetGroup: { id: "7" }, assetGroupSignal: { searchTheme: { text: "sofas" } } },
      { assetGroup: { id: "7" }, assetGroupSignal: { audience: { audience: "customers/1/audiences/3" } } },
    ],
    audienceNames: [{ audience: { resourceName: "customers/1/audiences/3", name: "Past buyers" } }],
    assetGroupListings: [
      { assetGroup: { id: "7" }, assetGroupListingGroupFilter: { type: "SUBDIVISION" } },
      { assetGroup: { id: "7" }, assetGroupListingGroupFilter: { type: "UNIT_INCLUDED", caseValue: { productBrand: { value: "Acme" } } } },
      { assetGroup: { id: "7" }, assetGroupListingGroupFilter: { type: "UNIT_EXCLUDED", caseValue: { productBrand: { value: "Old" } } } },
    ],
  };

  it("builds each group from its own assets, signals and products", () => {
    const [g] = mapAssetGroups(rows);
    expect(g).toMatchObject({
      id: "7",
      campaignId: "5",
      finalUrl: "https://shop.com",
      adStrength: "GOOD",
      headlines: ["Shop now"],
      longHeadlines: ["Everything for your home"],
      businessName: "Shop",
      imageUrls: ["https://img/1.jpg"],
      videoUrls: ["https://www.youtube.com/watch?v=abc"],
      searchThemes: ["sofas"],
      audienceSignal: "Past buyers",
      listingGroups: ["Brand: Acme"],
    });
    expect(g.assetPerformance).toBeUndefined();
  });

  it("uses Google's numbers for an asset group, not a share of the campaign", () => {
    const account = { customerId: "1", name: "A", currency: "USD", timeZone: "", isManager: false, optimizationScore: 0, autoTagging: false };
    const campaign = { campaign: { id: "5", name: "PMax", status: "ENABLED", advertisingChannelType: "PERFORMANCE_MAX", biddingStrategyType: "MAXIMIZE_CONVERSION_VALUE" } };
    const empty: LiveRows = { customer: [], campaigns: [campaign], budgets: [], campaignDaily: [], adGroups: [], adGroupMetrics: [], keywords: [], keywordMetrics: [], campaignNegatives: [], ads: [], adMetrics: [], searchTerms: [] };
    const range = { preset: "CUSTOM" as const, start: "2026-10-01", end: "2026-10-31" };
    const data = buildLiveAccount(account, { ...empty, ...rows, assetGroupMetrics: [{ assetGroup: { id: "7" }, metrics: { costMicros: "12500000", clicks: "9" } }] }, range);
    expect(assetGroupBase(data, "7", range)).toMatchObject({ cost: 12.5, clicks: 9 });
  });
});

describe("assets", () => {
  it("maps sitelinks, callouts and calls at each level with Google's approval", () => {
    const assets = mapAssets({
      customerAssets: [{ customerAsset: { fieldType: "CALLOUT", status: "ENABLED" }, asset: { id: "1", type: "CALLOUT", calloutAsset: { calloutText: "Free delivery" }, policySummary: { approvalStatus: "APPROVED" } } }],
      campaignAssets: [{ campaign: { id: "5" }, campaignAsset: { fieldType: "SITELINK", status: "PAUSED" }, asset: { id: "2", type: "SITELINK", sitelinkAsset: { linkText: "Sale", description1: "Up to 50%", description2: "" }, finalUrls: ["https://s.com/sale"], policySummary: { approvalStatus: "DISAPPROVED" } } }],
      adGroupAssets: [
        { adGroup: { id: "8" }, adGroupAsset: { fieldType: "CALL", status: "ENABLED" }, asset: { id: "3", type: "CALL", callAsset: { phoneNumber: "+961 1 234" } } },
        { adGroup: { id: "8" }, adGroupAsset: { fieldType: "HEADLINE", status: "ENABLED" }, asset: { id: "4", type: "TEXT", textAsset: { text: "x" } } },
      ],
    });
    expect(assets).toEqual([
      { id: "ACCOUNT-account-1", type: "CALLOUT", level: "ACCOUNT", parentId: undefined, status: "ENABLED", policy: "APPROVED", title: "Free delivery" },
      { id: "CAMPAIGN-5-2", type: "SITELINK", level: "CAMPAIGN", parentId: "5", status: "PAUSED", policy: "DISAPPROVED", title: "Sale", lines: ["Up to 50%"], finalUrl: "https://s.com/sale" },
      { id: "AD_GROUP-8-3", type: "CALL", level: "AD_GROUP", parentId: "8", status: "ENABLED", policy: "UNDER_REVIEW", title: "+961 1 234" },
    ]);
  });
});

describe("audiences", () => {
  it("reads lists, targets and whether each one narrows reach", () => {
    const { audiences, audienceTargets } = mapAudiences({
      userLists: [{ userList: { id: "10", name: "Buyers", type: "CRM_BASED", sizeForSearch: "1200", membershipLifeSpan: "10000" } }],
      campaignAudiences: [{ campaign: { id: "5", targetingSetting: { targetRestrictions: [{ targetingDimension: "AUDIENCE", bidOnly: true }] } }, campaignCriterion: { criterionId: "1", type: "USER_LIST", bidModifier: 1.3, userList: { userList: "customers/1/userLists/10" } } }],
      adGroupAudiences: [
        { adGroup: { id: "8" }, adGroupCriterion: { criterionId: "2", type: "USER_INTEREST", displayName: "Home & Garden" } },
        { adGroup: { id: "8" }, adGroupCriterion: { criterionId: "3", type: "CUSTOM_AUDIENCE", negative: true, displayName: "Job seekers" } },
      ],
    });
    expect(audiences).toEqual([
      { id: "10", name: "Buyers", kind: "CUSTOMER_MATCH", size: 1200, description: undefined, durationDays: undefined },
      { id: "criterion-2", name: "Home & Garden", kind: "INTEREST" },
      { id: "criterion-3", name: "Job seekers", kind: "CUSTOM" },
    ]);
    expect(audienceTargets.map((t) => [t.segmentId, t.level, t.mode, t.bidModifier])).toEqual([
      ["10", "CAMPAIGN", "OBSERVATION", 0.3],
      ["criterion-2", "AD_GROUP", "TARGETING", undefined],
      ["criterion-3", "AD_GROUP", "EXCLUSION", undefined],
    ]);
  });
});

describe("product groups and placements", () => {
  it("rebuilds the product group tree", () => {
    const groups = mapListingGroups({
      listingGroups: [
        { campaign: { id: "5" }, adGroupCriterion: { criterionId: "1", listingGroup: { type: "SUBDIVISION" } } },
        { campaign: { id: "5" }, adGroupCriterion: { criterionId: "2", cpcBidMicros: "450000", listingGroup: { type: "UNIT", parentAdGroupCriterion: "customers/1/adGroupCriteria/8~1", caseValue: { productBrand: { value: "Acme" } } } } },
        { campaign: { id: "5" }, adGroupCriterion: { criterionId: "3", negative: true, listingGroup: { type: "UNIT", parentAdGroupCriterion: "customers/1/adGroupCriteria/8~1", caseValue: { productBrand: {} } } } },
      ],
    });
    expect(groups).toEqual([
      { id: "1", campaignId: "5", dimension: "ALL", value: "All products" },
      { id: "2", campaignId: "5", parentId: "1", dimension: "BRAND", value: "Acme", bid: 0.45 },
      { id: "3", campaignId: "5", parentId: "1", dimension: "OTHERS", value: "Everything else", excluded: true },
    ]);
  });

  it("shows Google's numbers per placement and per product group, and zero for none", () => {
    const targets = mapContentTargets({ placements: [{ campaign: { id: "5" }, adGroup: { id: "8" }, adGroupCriterion: { criterionId: "4", type: "YOUTUBE_CHANNEL", displayName: "Cooking TV" } }] });
    expect(targets[0]).toMatchObject({ id: "8-4", kind: "YOUTUBE_CHANNEL", value: "Cooking TV", excluded: false });
    const data = { exact: { start: "a", end: "b", byId: { "8-4": { impressions: 100, clicks: 4, cost: 2, conversions: 1, conversionsValue: 30 }, "2": { impressions: 50, clicks: 5, cost: 3, conversions: 0, conversionsValue: 0 } } } } as never;
    expect(contentMetrics(data, { preset: "CUSTOM", start: "a", end: "b" }, targets).get("8-4")?.cost).toBe(2);
    expect(groupMetrics(data, "2", new Map()).clicks).toBe(5);
    expect(groupMetrics(data, "3", new Map()).clicks).toBe(0);
  });
});

describe("library, experiments and links", () => {
  it("reads labels, portfolio strategies and shared lists with their campaigns", () => {
    const lib = mapLibrary(
      {
        labels: [{ label: { id: "1", name: "Brand", textLabel: { backgroundColor: "#ff0000" } } }, { label: { id: "2", name: "Test" } }],
        bidStrategies: [{ biddingStrategy: { id: "9", name: "Main ROAS", type: "TARGET_ROAS", targetRoas: { targetRoas: 4 } } }, { biddingStrategy: { id: "10", type: "SOMETHING_NEW" } }],
        sharedSets: [{ sharedSet: { id: "20", name: "Brand negatives", type: "NEGATIVE_KEYWORDS" } }, { sharedSet: { id: "21", name: "Bad sites", type: "NEGATIVE_PLACEMENTS" } }],
        campaignSharedSets: [{ campaign: { id: "5" }, sharedSet: { id: "20" } }],
        sharedPlacements: [{ sharedSet: { id: "21" }, sharedCriterion: { placement: { url: "spam.com" } } }],
      },
      BIDDING
    );
    expect(lib.labelDefs).toEqual([{ id: "1", name: "Brand", color: "#ff0000" }, { id: "2", name: "Test", color: "#64748b" }]);
    expect(lib.bidStrategies).toEqual([{ id: "9", name: "Main ROAS", type: "TARGET_ROAS", targetRoas: 4 }]);
    expect(lib.negativeLists).toEqual([{ id: "20", name: "Brand negatives", campaignIds: ["5"] }]);
    expect(lib.placementLists).toEqual([{ id: "21", name: "Bad sites", campaignIds: [], placements: ["spam.com"] }]);
  });

  it("reads experiments with their base campaign and split", () => {
    const [e] = mapExperiments({
      experiments: [{ experiment: { experimentId: "3", name: "tROAS test", status: "ENABLED", startDate: "2026-10-01", endDate: "2026-10-29" } }],
      experimentArms: [
        { experimentArm: { experiment: "customers/1/experiments/3", control: true, trafficSplit: 50, campaigns: ["customers/1/campaigns/5"] } },
        { experimentArm: { experiment: "customers/1/experiments/3", control: false, name: "Trial", trafficSplit: 50, campaigns: ["customers/1/campaigns/6"] } },
      ],
    });
    expect(e).toMatchObject({ id: "3", baseCampaignId: "5", change: "Trial", split: 50, status: "RUNNING", ops: [] });
    expect(e.result).toBeUndefined();
  });

  it("lists only the links Google reports", () => {
    expect(mapLinks({ productLinks: [{ productLink: { productLinkId: "1", merchantCenter: { merchantCenterId: "514" } } }] })).toEqual([
      { id: "1", kind: "MERCHANT_CENTER", name: "Merchant Center", externalId: "514", status: "LINKED" },
    ]);
    expect(mapLinks({})).toEqual([]);
  });
});
