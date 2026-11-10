// The whole read path with sample rows in Google's own format: what the queries
// return must add up the same everywhere the numbers are shown.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionRow } from "./connection.server";

type Row = Record<string, unknown>;
const calls: string[] = [];
let failing: RegExp | null = null;

const metric = (cost: number, clicks: number, conversions = 0) => ({ impressions: String(clicks * 10), clicks: String(clicks), costMicros: String(cost * 1_000_000), conversions, conversionsValue: conversions * 20 });
const day = (date: string, id: string, cost: number, clicks: number, conversions = 0) => ({ campaign: { id }, segments: { date }, metrics: metric(cost, clicks, conversions) });

const CAMPAIGN_DAILY = [day("2026-10-01", "1", 10, 5, 1), day("2026-10-02", "1", 20, 10, 2), day("2026-10-01", "2", 5, 2), day("2026-10-02", "2", 15, 8, 1)];
// Campaign 3 was removed: Google's account total still counts its 30.
const ACCOUNT_DAILY = [
  { segments: { date: "2026-10-01" }, metrics: metric(45, 15, 1) },
  { segments: { date: "2026-10-02" }, metrics: metric(35, 15, 3) },
];

function answer(q: string): Row[] {
  if (q.includes("FROM customer LIMIT 1")) return [{ customer: { id: "111", descriptiveName: "Beirut Shop", currencyCode: "EUR", timeZone: "Asia/Beirut", optimizationScore: 0.72, autoTaggingEnabled: true } }];
  if (q.includes("FROM customer WHERE segments.date BETWEEN")) return ACCOUNT_DAILY;
  if (q.includes("segments.conversion_action")) return [{ segments: { conversionAction: "customers/111/conversionActions/5" }, metrics: { allConversions: 4 } }];
  if (q.includes("FROM campaign WHERE campaign.status != 'REMOVED' AND segments.date")) return CAMPAIGN_DAILY;
  if (q.includes("segments.device")) return [
    { campaign: { id: "1" }, segments: { device: "MOBILE" }, metrics: metric(20, 10, 2) },
    { campaign: { id: "1" }, segments: { device: "DESKTOP" }, metrics: metric(10, 5, 1) },
    { campaign: { id: "2" }, segments: { device: "MOBILE" }, metrics: metric(20, 10, 1) },
    { campaign: { id: "3" }, segments: { device: "TABLET" }, metrics: metric(30, 5) },
  ];
  if (q.includes("FROM geographic_view")) return [
    { campaign: { id: "1" }, geographicView: { countryCriterionId: "2422", locationType: "LOCATION_OF_PRESENCE" }, metrics: metric(30, 15, 3) },
    { campaign: { id: "2" }, geographicView: { countryCriterionId: "2682", locationType: "AREA_OF_INTEREST" }, metrics: metric(20, 10, 1) },
  ];
  if (q.includes("geo_target_constant.canonical_name")) return [
    { geoTargetConstant: { id: "2422", canonicalName: "Lebanon" } },
    { geoTargetConstant: { id: "2682", canonicalName: "Saudi Arabia" } },
  ];
  if (q.includes("FROM campaign WHERE campaign.status != 'REMOVED'")) return [
    { campaign: { id: "1", name: "Search LB", status: "ENABLED", advertisingChannelType: "SEARCH", biddingStrategyType: "MANUAL_CPC", campaignBudget: "customers/111/campaignBudgets/9", networkSettings: { targetGoogleSearch: true } } },
    { campaign: { id: "2", name: "Search KSA", status: "PAUSED", advertisingChannelType: "SEARCH", biddingStrategyType: "MANUAL_CPC", campaignBudget: "customers/111/campaignBudgets/9", networkSettings: { targetGoogleSearch: true } } },
  ];
  if (q.includes("'LOCATION', 'PROXIMITY'")) return [{ campaign: { id: "1" }, campaignCriterion: { criterionId: "2422", location: { geoTargetConstant: "geoTargetConstants/2422" } } }];
  if (q.includes("geo_target_constant.target_type")) return [{ geoTargetConstant: { id: "2422", name: "Lebanon", targetType: "Country" } }];
  if (q.includes("'LANGUAGE'")) return [{ campaign: { id: "1" }, campaignCriterion: { language: { languageConstant: "languageConstants/1019" } } }];
  if (q.includes("FROM language_constant")) return [{ languageConstant: { id: "1019", name: "Arabic" } }];
  if (q.includes("FROM conversion_action")) return [{ conversionAction: { id: "5", name: "Buy", category: "PURCHASE", status: "ENABLED", type: "WEBPAGE", primaryForGoal: true } }];
  if (q.includes("FROM recommendation")) return [{ recommendation: { resourceName: "customers/111/recommendations/r1", type: "KEYWORD", campaign: "customers/111/campaigns/1", impact: { baseMetrics: { clicks: 5 }, potentialMetrics: { clicks: 25 } } } }];
  return [];
}

vi.mock("./connection.server", () => {
  const searchGaql = vi.fn(async (_row: unknown, _customer: string, q: string) => {
    calls.push(q);
    if (failing?.test(q)) throw Object.assign(new Error("google refused"), { detail: "QUOTA" });
    return answer(q);
  });
  return {
    ConnectionHttpError: class extends Error {},
    searchGaql,
    searchGaqlAll: async (row: unknown, customer: string, q: string) => ({ rows: await searchGaql(row, customer, q), more: false }),
  };
});

const { forgetLiveAccount, loadLiveAccount } = await import("./live-report.server");
const { loadSegment } = await import("./live-segments.server");
const { rowsFromCells } = await import("./live-segments");
const { accountBase, accountTotal, addBase, EMPTY_BASE } = await import("./metrics");

const connection = { kind: "ads", workspace_id: "w1", account_id: "111", account_name: "Saved name", account_currency: null, account_time_zone: null, login_customer_id: null } as unknown as ConnectionRow;
const range = { start: "2026-10-01", end: "2026-10-02" };
const dateRange = { preset: "CUSTOM" as const, ...range };
const sum = (rows: { base: Parameters<typeof addBase>[0] }[]) => rows.reduce((s, r) => addBase(s, r.base), EMPTY_BASE);

beforeEach(() => {
  calls.length = 0;
  failing = null;
  forgetLiveAccount("w1");
});

describe("numbers agree across the live account", () => {
  it("every breakdown of the whole account adds up to Google's account total", async () => {
    const { data } = await loadLiveAccount(connection, range);
    const { cells } = await loadSegment(connection, "device", range);
    const devices = sum(rowsFromCells("device", cells));
    const total = accountTotal(data, dateRange);
    expect(total.cost).toBe(80);
    expect(devices.cost).toBe(total.cost);
    expect(devices.clicks).toBe(total.clicks);
    expect(devices.impressions).toBe(total.impressions);
    expect(devices.conversions).toBe(total.conversions);
  });

  it("the account total keeps a removed campaign that the campaign list leaves out", async () => {
    const { data } = await loadLiveAccount(connection, range);
    expect(data.campaigns.map((c) => c.id)).toEqual(["1", "2"]);
    expect(accountBase(data, dateRange).cost).toBe(50);
    expect(accountTotal(data, dateRange).cost).toBe(80);
  });

  it("a campaign's breakdown equals that campaign's own numbers", async () => {
    const { data } = await loadLiveAccount(connection, range);
    const { cells } = await loadSegment(connection, "device", range);
    expect(sum(rowsFromCells("device", cells, ["1"])).cost).toBe(accountBase(data, dateRange, ["1"]).cost);
    expect(sum(rowsFromCells("device", cells, ["2"])).cost).toBe(accountBase(data, dateRange, ["2"]).cost);
  });

  it("countries are named from Google and add up", async () => {
    const { cells } = await loadSegment(connection, "country", range);
    expect(rowsFromCells("country", cells).map((r) => [r.label, r.base.cost])).toEqual([["Lebanon", 30], ["Saudi Arabia", 20]]);
  });

  it("uses the account's real currency, time zone and targeting", async () => {
    const { data } = await loadLiveAccount(connection, range);
    expect(data.account).toMatchObject({ name: "Beirut Shop", currency: "EUR", timeZone: "Asia/Beirut", optimizationScore: 0.72 });
    expect(data.campaigns[0]).toMatchObject({ languages: ["Arabic"], locations: [{ name: "Lebanon", kind: "Country" }] });
    expect(data.campaigns[1]).toMatchObject({ languages: [], locations: [] });
    expect(data.conversions[0]).toMatchObject({ name: "Buy", status: "ACTIVE", conversions30d: 4 });
    expect(data.recommendations[0]).toMatchObject({ title: "Add new keywords", impact: "+20 clicks", campaignId: "1" });
  });
});

describe("when Google fails part of the way", () => {
  it("still shows the page, names what's missing, and asks again next time", async () => {
    failing = /FROM keyword_view/;
    const first = await loadLiveAccount(connection, range);
    expect(first.data.campaigns).toHaveLength(2);
    expect(first.data.unavailable).toEqual(expect.arrayContaining(["keywords", "keywordMetrics"]));
    failing = null;
    expect((await loadLiveAccount(connection, range)).data.unavailable).toBeUndefined();
  });

  it("doesn't claim 'All countries' silently when locations failed", async () => {
    failing = /'LOCATION', 'PROXIMITY'/;
    const { data } = await loadLiveAccount(connection, range);
    expect(data.campaigns[0].locations).toEqual([]);
    expect(data.unavailable).toContain("locations");
  });

  it("falls back to adding up campaigns, and says so, without Google's total", async () => {
    failing = /FROM customer WHERE segments.date BETWEEN/;
    const { data } = await loadLiveAccount(connection, range);
    expect(data.accountDaily).toBeUndefined();
    expect(data.unavailable).toContain("customerDaily");
    expect(accountTotal(data, dateRange).cost).toBe(50);
  });

  it("stops when there is nothing true to show", async () => {
    failing = /FROM customer LIMIT 1/;
    await expect(loadLiveAccount(connection, range)).rejects.toThrow("google refused");
  });
});

describe("Google quota", () => {
  it("changing the dates doesn't load the account's structure again", async () => {
    await loadLiveAccount(connection, range);
    const first = calls.length;
    calls.length = 0;
    await loadLiveAccount(connection, { start: "2026-10-03", end: "2026-10-04" });
    expect(calls.length).toBeLessThan(first / 2);
    expect(calls.some((q) => q.includes("FROM conversion_action"))).toBe(false);
  });

  it("opening the same breakdown twice asks Google once", async () => {
    await loadSegment(connection, "hour", range);
    await loadSegment(connection, "hour", range);
    expect(calls.filter((q) => q.includes("segments.hour"))).toHaveLength(1);
  });

  it("the Refresh button reads everything fresh, breakdowns included", async () => {
    await loadLiveAccount(connection, range);
    await loadSegment(connection, "hour", range);
    calls.length = 0;
    await loadLiveAccount(connection, range, { force: true });
    expect(calls.some((q) => q.includes("FROM conversion_action"))).toBe(true);
    await loadSegment(connection, "hour", range);
    expect(calls.some((q) => q.includes("segments.hour"))).toBe(true);
  });
});

describe("date ranges", () => {
  const dailyQuery = () => calls.find((q) => q.includes("FROM campaign WHERE campaign.status != 'REMOVED' AND segments.date"))!;

  it("loads the 180 days the presets need for a short range", async () => {
    await loadLiveAccount(connection, { start: "2026-10-25", end: "2026-10-31" });
    expect(dailyQuery()).toContain("BETWEEN '2026-05-05' AND '2026-10-31'");
  });

  it("loads a long range and the same length before it, with no gap", async () => {
    await loadLiveAccount(connection, { start: "2026-01-01", end: "2026-10-31" });
    expect(dailyQuery()).toContain("BETWEEN '2025-03-03' AND '2026-10-31'");
  });
});
