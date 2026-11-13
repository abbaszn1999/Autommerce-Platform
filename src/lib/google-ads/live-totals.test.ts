import { describe, expect, it } from "vitest";
import { accountSeries, accountTotal, addDays, rangeFor, todayIn } from "./metrics";
import { buildLiveAccount, type LiveRows } from "./live-report";
import type { AccountData, DateRange } from "./types";

const point = (date: string, cost: number) => ({ date, impressions: 10, clicks: 1, cost, conversions: 0, conversionsValue: 0 });
const range: DateRange = { preset: "CUSTOM", start: "2026-10-01", end: "2026-10-02" };

describe("todayIn", () => {
  const now = new Date("2026-11-09T22:30:00Z");

  it("follows the account's clock on both sides of UTC", () => {
    expect(todayIn("Asia/Beirut", now)).toBe("2026-11-10");
    expect(todayIn("America/Los_Angeles", new Date("2026-11-09T02:00:00Z"))).toBe("2026-11-08");
  });

  it("falls back to UTC when the time zone is missing or unknown", () => {
    expect(todayIn(null, now)).toBe("2026-11-09");
    expect(todayIn("Not/AZone", now)).toBe("2026-11-09");
  });

  it("makes ranges end on the account's yesterday", () => {
    expect(rangeFor("LAST_7_DAYS", todayIn("Asia/Beirut", now)).end).toBe("2026-11-09");
    expect(addDays("2026-11-10", -1)).toBe("2026-11-09");
  });
});

describe("account totals", () => {
  const data = {
    campaigns: [{ id: "1", status: "ENABLED" }],
    daily: { "1": [point("2026-10-01", 5), point("2026-10-02", 5)] },
    accountDaily: [point("2026-10-01", 7), point("2026-10-02", 8), point("2026-10-03", 100)],
  } as unknown as AccountData;

  it("uses Google's account total, which includes removed campaigns", () => {
    expect(accountTotal(data, range).cost).toBe(15);
  });

  it("adds up the campaigns only when Google's total couldn't be read", () => {
    expect(accountTotal({ ...data, accountDaily: undefined }, range).cost).toBe(10);
  });

  it("charts every day of the range on the same basis, quiet days at zero", () => {
    const series = accountSeries({ ...data, accountDaily: [point("2026-10-02", 8)] }, range);
    expect(series.map((p) => [p.date, p.cost])).toEqual([["2026-10-01", 0], ["2026-10-02", 8]]);
  });
});

describe("buildLiveAccount", () => {
  const empty: LiveRows = { customer: [], campaigns: [], budgets: [], campaignDaily: [], adGroups: [], adGroupMetrics: [], keywords: [], keywordMetrics: [], campaignNegatives: [], ads: [], adMetrics: [], searchTerms: [] };
  const account = { customerId: "1", name: "Saved", currency: "USD", timeZone: "", isManager: false, optimizationScore: 0, autoTagging: false };

  it("takes the currency and time zone from Google, not the blank saved ones", () => {
    const data = buildLiveAccount(account, { ...empty, customer: [{ customer: { descriptiveName: "Shop", currencyCode: "LBP", timeZone: "Asia/Beirut" } }] }, range);
    expect(data.account).toMatchObject({ name: "Shop", currency: "LBP", timeZone: "Asia/Beirut" });
  });

  it("keeps what is saved when Google sends nothing", () => {
    expect(buildLiveAccount(account, empty, range).account.currency).toBe("USD");
  });

  it("says when the search terms were cut off at the limit", () => {
    const row = (i: number) => ({ campaign: { id: "9" }, searchTermView: { searchTerm: `t${i}` } });
    expect(buildLiveAccount(account, { ...empty, searchTerms: Array.from({ length: 500 }, (_, i) => row(i)) }, range).searchTermsCapped).toBe(true);
    expect(buildLiveAccount(account, { ...empty, searchTerms: [row(1)] }, range).searchTermsCapped).toBe(false);
  });

  it("leaves the account total out when Google's wasn't read", () => {
    expect(buildLiveAccount(account, empty, range).accountDaily).toBeUndefined();
    expect(buildLiveAccount(account, { ...empty, customerDaily: [{ segments: { date: "2026-10-01" }, metrics: { costMicros: "3000000" } }] }, range).accountDaily?.[0].cost).toBe(3);
  });
});
