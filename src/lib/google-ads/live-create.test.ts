import { describe, expect, it } from "vitest";
import { inverseForCreated, LivePlanError, planLiveChange, type BeforeState } from "./live-mutate";
import { emptyCreateState, imageUrls } from "./live-create";
import { describeLiveChange } from "./agent-support";
import { planExperiment } from "./live-experiment";
import { googleMessage } from "./live-mutate.server";
import { isPrivateAddress } from "./image-fetch.server";
import type { MutateOp } from "./types";

const CID = "1234567890";
const IMG = "https://shop.example.com/a.png";

function before(extra: Partial<ReturnType<typeof emptyCreateState>> = {}): BeforeState {
  return {
    billableUnitMicros: 10_000,
    campaigns: {
      "11": { name: "Search LB", status: "ENABLED", budgetId: "5", biddingType: "TARGET_ROAS", targetRoas: 4 },
      "12": { name: "PMax", status: "ENABLED", budgetId: "6", biddingType: "MAXIMIZE_CONVERSION_VALUE" },
      "13": { name: "DG", status: "PAUSED", budgetId: "7", biddingType: "MAXIMIZE_CONVERSIONS" },
    },
    budgets: {},
    adGroups: { "21": { name: "Books", status: "ENABLED", campaignId: "11" }, "23": { name: "Readers", status: "ENABLED", campaignId: "13" } },
    criteria: {},
    ads: {},
    campaignNegatives: {},
    createdKeywordIds: new Set(),
    create: {
      ...emptyCreateState(),
      images: { [IMG]: "aW1hZ2U=" },
      campaignTypes: { "11": "SEARCH", "12": "PERFORMANCE_MAX", "13": "DEMAND_GEN" },
      assetGroups: { "31": { name: "All", campaignId: "12" } },
      assetGroupAssets: { "31~41~HEADLINE": { text: "Old headline" } },
      targeting: {
        "11~51": { type: "LOCATION", geoId: "2422" },
        "11~52": { type: "LANGUAGE", languageId: "1019" },
        "11~53": { type: "DEVICE", device: "TABLET", bidModifier: 1 },
        "11~54": { type: "AD_SCHEDULE", slot: { day: "MONDAY", startHour: 9, endHour: 17 } },
      },
      restrictions: { "CAMPAIGN:11": [], "AD_GROUP:21": [{ targetingDimension: "TOPIC", bidOnly: true }] },
      merchantLinks: ["777"],
      names: { "location:2422": "Lebanon", "language:1019": "Arabic" },
      ...extra,
    },
  };
}

const rsa = { type: "RSA" as const, finalUrl: "https://shop.example.com", headlines: ["One", "Two", "Three"], descriptions: ["First line.", "Second line."] };
const search = (extra: object = {}) =>
  ({ kind: "campaign.new", type: "SEARCH", name: "New Search", dailyBudget: 10, bidding: { strategy: "MAXIMIZE_CLICKS" }, locations: ["2422"], languages: ["1019"], adGroups: [{ name: "G", keywords: [{ text: "arabic books", matchType: "PHRASE" }], ads: [rsa] }], ...extra }) as unknown as MutateOp;
const plan = (ops: unknown[], b = before(), undo = false) => planLiveChange(CID, ops as MutateOp[], b, { undo });
const kinds = (p: ReturnType<typeof plan>) => p.operations.map((o) => Object.keys(o)[0]);
const created = (p: ReturnType<typeof plan>, family: string) => p.operations.filter((o) => (o as Record<string, { create?: Record<string, unknown> }>)[family]?.create).map((o) => (o as Record<string, { create: Record<string, unknown> }>)[family].create);

describe("new campaigns", () => {
  it("builds budget, campaign, targeting, ad group, keyword and ad in one request, always paused", () => {
    const p = plan([search()]);
    expect(kinds(p).slice(0, 2)).toEqual(["campaign_budget_operation", "campaign_operation"]);
    const [campaign] = created(p, "campaign_operation");
    expect(campaign).toMatchObject({ status: "PAUSED", advertisingChannelType: "SEARCH", networkSettings: { targetGoogleSearch: true, targetContentNetwork: false } });
    expect(created(p, "campaign_budget_operation")[0]).toMatchObject({ amountMicros: "10000000", explicitlyShared: false });
    expect(created(p, "ad_group_ad_operation")[0]).toMatchObject({ ad: { responsiveSearchAd: { headlines: [{ text: "One" }, { text: "Two" }, { text: "Three" }] } } });
    expect(p.warnings).toContain("The new campaign is created paused: it spends nothing until you turn it on.");
  });

  it("gives every new resource its own temporary id across the whole change", () => {
    const p = plan([search(), { kind: "asset.new", level: "ACCOUNT", assets: [{ type: "CALLOUT", text: "Free delivery" }, { type: "CALLOUT", text: "Cash on delivery" }] }]);
    const names = p.operations.flatMap((o) => Object.values(o).map((v) => (v as { create?: { resourceName?: string } }).create?.resourceName)).filter(Boolean);
    expect(new Set(names).size).toBe(names.length);
  });

  it("refuses Google's limits before anything is sent", () => {
    expect(() => plan([search({ adGroups: [{ name: "G", ads: [{ ...rsa, headlines: ["x".repeat(31), "b", "c"] }] }] })])).toThrow(/longer than 30/);
    expect(() => plan([search({ adGroups: [{ name: "G", ads: [{ ...rsa, headlines: ["a", "b"] }] }] })])).toThrow(/3 to 15/);
    expect(() => plan([search({ adGroups: [{ name: "G", ads: [{ ...rsa, headlines: ["a", "A", "c"] }] }] })])).toThrow(/same/);
    expect(() => plan([search({ bidding: { strategy: "MANUAL_CPC" }, type: "PERFORMANCE_MAX", assetGroups: [] })])).toThrow(/MAXIMIZE_CONVERSIONS/);
    expect(() => plan([search({ locations: ["Lebanon"] })])).toThrow(/valid location id/);
  });

  it("can't create Video campaigns, and says what to do instead", () => {
    expect(() => plan([search({ type: "VIDEO" })])).toThrow(/Demand Gen/);
  });

  it("keeps the monthly budget cap", () => {
    const b = before();
    b.spend = { monthlyCap: 300, budgets: {}, campaigns: {} };
    expect(() => plan([search({ dailyBudget: 20 })], b)).toThrow(/monthly budget cap of 300/);
  });

  it("checks the Merchant Center link for Shopping", () => {
    expect(() => plan([search({ type: "SHOPPING", bidding: { strategy: "MANUAL_CPC" } })])).toThrow(/Merchant Center id/);
    expect(() => plan([search({ type: "SHOPPING", merchantId: "999", bidding: { strategy: "MANUAL_CPC" }, adGroups: [{ name: "All" }] })])).toThrow(/isn't linked/);
    const p = plan([search({ type: "SHOPPING", merchantId: "777", bidding: { strategy: "MANUAL_CPC" }, adGroups: [{ name: "All", defaultCpcBid: 0.3 }] })]);
    expect(created(p, "ad_group_criterion_operation")).toContainEqual(expect.objectContaining({ listingGroup: { type: "UNIT" }, cpcBidMicros: "300000" }));
    expect(created(p, "ad_group_ad_operation")[0]).toMatchObject({ ad: { shoppingProductAd: {} } });
  });

  it("Performance Max: the brand on the campaign, assets before the group, links after it", () => {
    const p = plan([
      search({
        type: "PERFORMANCE_MAX",
        bidding: { strategy: "MAXIMIZE_CONVERSIONS" },
        adGroups: undefined,
        businessName: "Kalema",
        logo: IMG,
        assetGroups: [{ name: "Main", finalUrl: "https://shop.example.com", headlines: ["A", "B", "C"], longHeadlines: ["Long one"], descriptions: ["Short.", "Another."], images: { landscape: [IMG], square: [IMG] } }],
      }),
    ]);
    const k = kinds(p);
    const group = k.indexOf("asset_group_operation");
    expect(k.slice(group + 1).every((x) => x === "asset_group_asset_operation")).toBe(true);
    expect(k.slice(0, group).includes("asset_group_asset_operation")).toBe(false);
    expect(created(p, "campaign_asset_operation").map((c) => c.fieldType)).toEqual(["BUSINESS_NAME", "LOGO"]);
    // One image asset for the URL, however many places use it.
    expect(created(p, "asset_operation").filter((a) => a.type === "IMAGE")).toHaveLength(1);
  });

  it("Performance Max with a feed needs no assets, and includes every product", () => {
    const p = plan([search({ type: "PERFORMANCE_MAX", merchantId: "777", bidding: { strategy: "MAXIMIZE_CONVERSION_VALUE", targetRoas: 4 }, adGroups: undefined, businessName: "Kalema", logo: IMG, assetGroups: [{ name: "All products" }] })]);
    expect(created(p, "asset_group_listing_group_filter_operation")[0]).toMatchObject({ type: "UNIT_INCLUDED", listingSource: "SHOPPING" });
    expect(created(p, "campaign_operation")[0]).toMatchObject({ shoppingSetting: { merchantId: "777" }, maximizeConversionValue: { targetRoas: 4 } });
  });

  it("Demand Gen keeps locations and languages on each ad group", () => {
    const p = plan([
      search({ type: "DEMAND_GEN", bidding: { strategy: "MAXIMIZE_CONVERSIONS" }, adGroups: [{ name: "G", ads: [{ type: "DEMAND_GEN", finalUrl: "https://shop.example.com", headlines: ["Hi"], descriptions: ["There"], businessName: "Kalema", images: { landscape: [IMG], square: [IMG], logo: [IMG] } }] }] }),
    ]);
    expect(created(p, "campaign_criterion_operation")).toEqual([]);
    expect(created(p, "ad_group_criterion_operation").map((c) => Object.keys(c).find((k) => k === "location" || k === "language"))).toEqual(["location", "language"]);
  });

  it("names an image it couldn't download", () => {
    expect(() =>
      plan([{ kind: "ad.new", adGroupId: "23", ad: { type: "DEMAND_GEN", finalUrl: "https://shop.example.com", headlines: ["a"], descriptions: ["c"], businessName: "d", images: { landscape: ["https://x.example.com/missing.png"], square: [IMG], logo: [IMG] } } }])
    ).toThrow(/missing\.png couldn't be downloaded/);
  });

  it("lists every image a change uses, the campaign logo included", () => {
    expect(imageUrls([search({ logo: "https://l.example.com/logo.png", assetGroups: [{ name: "x", images: { square: [IMG] } }] }) as never]).sort()).toEqual(["https://l.example.com/logo.png", IMG]);
  });
});

describe("undo of what was created", () => {
  it("removes exactly the created roots, newest first", () => {
    const p = plan([search()]);
    const names = p.operations.map((_, i) => `customers/${CID}/x/${i}`);
    names[1] = `customers/${CID}/campaigns/900`;
    const { inverse, resources } = inverseForCreated(p.created, names);
    expect(resources).toEqual([`customers/${CID}/campaigns/900`]);
    expect(inverse).toEqual([{ kind: "created.remove", resources: [`customers/${CID}/campaigns/900`] }]);
  });

  it("only removes what this app created, in this account, and only as an undo", () => {
    const ours = `customers/${CID}/campaigns/900`;
    const b = before({ createdResources: new Set([ours]) });
    expect(plan([{ kind: "created.remove", resources: [ours] }], b, true).operations).toEqual([{ campaign_operation: { remove: ours } }]);
    expect(() => plan([{ kind: "created.remove", resources: [ours] }], b, false)).toThrow(/only used by Undo/);
    expect(() => plan([{ kind: "created.remove", resources: [`customers/${CID}/campaigns/901`] }], b, true)).toThrow(/only remove what Autommerce created/);
    expect(() => plan([{ kind: "created.remove", resources: [`customers/9999999999/campaigns/900`] }], b, true)).toThrow(/only remove/);
  });

  it("puts back targeting it removed and the device bid it changed", () => {
    const p = plan([{ kind: "targeting.remove", campaignId: "11", criterionIds: ["51", "52", "54"] }, { kind: "device.set", campaignId: "11", device: "TABLET", bidModifier: -1 }]);
    expect(p.inverse).toEqual(
      expect.arrayContaining([
        { kind: "device.set", campaignId: "11", device: "TABLET", bidModifier: 0 },
        { kind: "location.add", campaignId: "11", geoIds: ["2422"], exclude: false },
        { kind: "language.add", campaignId: "11", languageIds: ["1019"] },
        { kind: "schedule.add", campaignId: "11", slots: [{ day: "MONDAY", startHour: 9, endHour: 17 }] },
      ])
    );
    expect(p.warnings.join(" ")).toMatch(/every targeted location/);
    expect(() => plan([{ kind: "targeting.remove", campaignId: "11", criterionIds: ["53"] }])).toThrow(/device.set/);
  });

  it("restores the asset group links it removed", () => {
    const p = plan([{ kind: "assetGroupAsset.remove", ids: ["31~41~HEADLINE"] }]);
    expect(p.inverse).toEqual([{ kind: "assetGroupAsset.add", assetGroupId: "31", existing: [{ assetId: "41", fieldType: "HEADLINE" }] }]);
  });
});

describe("audiences", () => {
  it("observes by default, keeps other settings, and puts the old setting back on undo", () => {
    const p = plan([{ kind: "audience.add", level: "AD_GROUP", parentId: "21", userListIds: ["99"] }]);
    const update = p.operations.find((o) => "ad_group_operation" in o) as { ad_group_operation: { update: { targetingSetting: { targetRestrictions: unknown[] } } } };
    expect(update.ad_group_operation.update.targetingSetting.targetRestrictions).toEqual([{ targetingDimension: "TOPIC", bidOnly: true }, { targetingDimension: "AUDIENCE", bidOnly: true }]);
    expect(p.inverse).toContainEqual({ kind: "audienceSetting.set", level: "AD_GROUP", parentId: "21", restrictions: [{ targetingDimension: "TOPIC", bidOnly: true }] });
  });

  it("warns that Targeting limits who sees the ads", () => {
    const b = before();
    b.create!.restrictions["CAMPAIGN:11"] = [{ targetingDimension: "AUDIENCE", bidOnly: true }];
    expect(plan([{ kind: "audience.add", level: "CAMPAIGN", parentId: "11", userListIds: ["99"], mode: "TARGETING" }], b).warnings.join(" ")).toMatch(/only people in these lists/);
  });
});

describe("the approval card", () => {
  it("shows everything that will be made, with names instead of ids", () => {
    const items = describeLiveChange([search()], before(), "USD");
    const text = JSON.stringify(items);
    expect(text).toContain("PAUSED");
    expect(text).toContain("Lebanon");
    expect(text).toContain("Arabic");
    expect(text).toContain("arabic books (phrase)");
    expect(text).toContain("One · Two · Three");
  });
});

describe("experiments", () => {
  const micros = (n: number) => String(Math.round(n * 1_000_000));
  it("tests a new target on a share of traffic, with checked dates", () => {
    const p = planExperiment([{ kind: "experiment.new", campaignId: "11", name: "ROAS 450", change: { targetRoas: 4.5 } } as never], before(), { "11": "SEARCH" }, "2026-11-10", micros);
    expect(p).toMatchObject({ kind: "new", type: "SEARCH_CUSTOM", split: 50, startDate: "2026-11-11", endDate: "2026-12-08", trial: { fields: { targetRoas: { targetRoas: 4.5 } }, mask: "target_roas.target_roas" } });
  });

  it("refuses what Google or the campaign can't do", () => {
    const run = (op: object, types = { "11": "SEARCH" }) => () => planExperiment([op as never], before(), types, "2026-11-10", micros);
    expect(run({ kind: "experiment.new", campaignId: "11", name: "x", change: { targetCpa: 5 } })).toThrow(/no target CPA/);
    expect(run({ kind: "experiment.new", campaignId: "12", name: "x", change: { targetRoas: 5 } }, { "11": "SEARCH", "12": "PERFORMANCE_MAX" } as never)).toThrow(/Search and Display/);
    expect(run({ kind: "experiment.new", campaignId: "11", name: "x", split: 95, change: { targetRoas: 5 } })).toThrow(/10 to 90/);
    expect(run({ kind: "experiment.new", campaignId: "11", name: "x", startDate: "2026-11-10", change: { targetRoas: 5 } })).toThrow(/future date/);
    expect(() => planExperiment([{ kind: "experiment.end", experimentId: "1" }, { kind: "experiment.end", experimentId: "2" }] as never, before(), {}, "2026-11-10", micros)).toThrow(/its own change/);
  });

  it("is never part of a plan or a mixed change", () => {
    expect(() => plan([{ kind: "experiment.new", campaignId: "11", name: "x", change: { targetRoas: 5 } }])).toThrow(LivePlanError);
  });
});

describe("downloading images and Google's errors", () => {
  it("never reaches private, loopback or metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.3.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "142.250.1.1", "2a00:1450::1"]) expect(isPrivateAddress(ip)).toBe(false);
  });

  it("explains a Merchant Center link that isn't active", () => {
    const detail = '{"errorCode": {"mutateError": "RESOURCE_NOT_FOUND"}, "message": "Resource was not found.", "trigger": {"int64Value": "514945216"}}';
    expect(googleMessage(detail)).toMatch(/514945216.*isn't active/);
  });
});
