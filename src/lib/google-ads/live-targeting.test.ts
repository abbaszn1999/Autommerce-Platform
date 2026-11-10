import { describe, expect, it } from "vitest";
import { applyTargeting, mapConversions, mapRecommendations, targetIds } from "./live-targeting";
import type { Campaign } from "./types";

const campaign = (id: string) => ({ id, locations: [{ id: "old" }], languages: ["old"], schedule: [], devices: { mobile: 0, desktop: 0, tablet: 0 } }) as unknown as Campaign;

describe("applyTargeting", () => {
  const rows = {
    locations: [
      { campaign: { id: "1" }, campaignCriterion: { criterionId: "2422", negative: false, bidModifier: 1.2, location: { geoTargetConstant: "geoTargetConstants/2422" } } },
      { campaign: { id: "1" }, campaignCriterion: { criterionId: "9", negative: true, location: { geoTargetConstant: "geoTargetConstants/1001" } } },
      { campaign: { id: "1" }, campaignCriterion: { criterionId: "7", proximity: { radius: 5, radiusUnits: "KILOMETERS", address: { cityName: "Beirut" } } } },
    ],
    geoConstants: [
      { geoTargetConstant: { id: "2422", name: "Lebanon", targetType: "Country" } },
      { geoTargetConstant: { id: "1001", name: "Akkar", targetType: "Governorate" } },
    ],
    languages: [{ campaign: { id: "1" }, campaignCriterion: { language: { languageConstant: "languageConstants/1019" } } }],
    languageConstants: [{ languageConstant: { id: "1019", name: "Arabic" } }],
    schedule: [{ campaign: { id: "1" }, campaignCriterion: { bidModifier: 0.8, adSchedule: { dayOfWeek: "MONDAY", startHour: 9, endHour: 17 } } }],
    deviceBids: [
      { campaign: { id: "1" }, campaignCriterion: { bidModifier: 0, device: { type: "TABLET" } } },
      { campaign: { id: "1" }, campaignCriterion: { device: { type: "MOBILE" } } },
    ],
  };

  it("shows what the campaign really targets, in place of empty defaults", () => {
    const [c] = applyTargeting([campaign("1")], rows);
    expect(c.locations).toEqual([
      { id: "2422", name: "Lebanon", kind: "Country", excluded: false, bidModifier: 0.2 },
      { id: "9", name: "Akkar", kind: "Region", excluded: true, bidModifier: undefined },
      { id: "7", name: "5 km around Beirut", kind: "City", excluded: false, bidModifier: undefined },
    ]);
    expect(c.languages).toEqual(["Arabic"]);
    expect(c.schedule).toEqual([{ day: "MONDAY", startHour: 9, endHour: 17, bidModifier: -0.2 }]);
  });

  it("reads a device turned off as -100% and an unset one as no change", () => {
    expect(applyTargeting([campaign("1")], rows)[0].devices).toEqual({ mobile: 0, desktop: 0, tablet: -1 });
  });

  it("names a location by id when Google gave no name, and never invents one", () => {
    const [c] = applyTargeting([campaign("1")], { locations: rows.locations.slice(0, 1) });
    expect(c.locations[0].name).toBe("Location 2422");
  });

  it("ignores criteria for campaigns not in the account", () => {
    expect(applyTargeting([campaign("2")], rows)[0].locations).toEqual([]);
  });

  it("collects the ids to look up, once each", () => {
    expect(targetIds({ locations: [rows.locations[0], rows.locations[0], rows.locations[2]], languages: rows.languages })).toEqual({ geo: ["2422"], languages: ["1019"] });
  });
});

describe("mapConversions", () => {
  const row = (extra: object) => ({ conversionAction: { id: "5", name: "Buy", category: "PURCHASE", status: "ENABLED", type: "WEBPAGE", primaryForGoal: true, countingType: "ONE_PER_CLICK", clickThroughLookbackWindowDays: "30", attributionModelSettings: { attributionModel: "GOOGLE_SEARCH_ATTRIBUTION_DATA_DRIVEN" }, valueSettings: { defaultValue: 10, alwaysUseDefaultValue: false }, ...extra } });

  it("maps Google's fields and last-30-day count", () => {
    const [c] = mapConversions([row({})], [{ segments: { conversionAction: "customers/1/conversionActions/5" }, metrics: { allConversions: 7 } }]);
    expect(c).toMatchObject({ id: "5", category: "PURCHASE", source: "WEBSITE", status: "ACTIVE", primary: true, countingType: "ONE_PER_CLICK", useDynamicValue: true, clickThroughWindowDays: 30, attribution: "DATA_DRIVEN", conversions30d: 7 });
  });

  it("says when an action has had no conversions lately", () => {
    expect(mapConversions([row({})], [])[0].status).toBe("NO_RECENT_CONVERSIONS");
  });

  it("keeps Google's own category wording and doesn't pass it off as another", () => {
    const [c] = mapConversions([row({ category: "YOUTUBE_FOLLOW_ON_VIEWS", type: "UNKNOWN" })], []);
    expect(c).toMatchObject({ category: "OTHER", categoryLabel: "Youtube follow on views", source: "GOOGLE" });
    expect(mapConversions([row({ category: "DEFAULT" })], [])[0]).toMatchObject({ category: "OTHER", categoryLabel: undefined });
  });

  it("hides actions Google hides", () => {
    expect(mapConversions([row({ status: "HIDDEN" })], [])[0].status).toBe("REMOVED");
  });

  it("marks removed actions and recognises where others come from", () => {
    expect(mapConversions([row({ status: "REMOVED" })], [])[0].status).toBe("REMOVED");
    expect(mapConversions([row({ type: "GOOGLE_ANALYTICS_4_PURCHASE" })], [])[0].source).toBe("GOOGLE_ANALYTICS");
    expect(mapConversions([row({ type: "UPLOAD_CLICKS" })], [])[0].source).toBe("IMPORT");
  });
});

describe("mapRecommendations", () => {
  const rec = (type: string, impact?: object) => ({ recommendation: { resourceName: "customers/1/recommendations/abc", type, campaign: "customers/1/campaigns/42", impact } });

  it("uses Google's estimate and no invented score", () => {
    const [r] = mapRecommendations([rec("CAMPAIGN_BUDGET", { baseMetrics: { conversions: 2 }, potentialMetrics: { conversions: 5.5 } })]);
    expect(r).toMatchObject({ id: "abc", category: "BIDDING_BUDGETS", title: "Raise a budget that is limiting this campaign", campaignId: "42", impact: "+3.5 conversions", scoreUplift: 0, status: "ACTIVE" });
  });

  it("makes no claim when Google gives no gain", () => {
    const [r] = mapRecommendations([rec("KEYWORD", { baseMetrics: { clicks: 0 }, potentialMetrics: { clicks: 0 } })]);
    expect(r.impact).toBeUndefined();
    expect(r.description).toBe("Google suggests this for your account.");
  });

  it("reads a type it has no wording for", () => {
    expect(mapRecommendations([rec("SOME_NEW_THING")])[0].title).toBe("Some new thing");
  });

  it("groups by what the recommendation changes", () => {
    const category = (t: string) => mapRecommendations([rec(t)])[0].category;
    expect(category("RESPONSIVE_SEARCH_AD_ASSET")).toBe("ADS_ASSETS");
    expect(category("SITELINK_ASSET")).toBe("ADS_ASSETS");
    expect(category("USE_BROAD_MATCH_KEYWORD")).toBe("KEYWORDS_TARGETING");
    expect(category("TARGET_ROAS_OPT_IN")).toBe("BIDDING_BUDGETS");
    expect(category("CONVERSION_TRACKING")).toBe("MEASUREMENT");
  });
});
