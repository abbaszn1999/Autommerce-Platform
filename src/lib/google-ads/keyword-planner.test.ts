import { describe, expect, it } from "vitest";
import { KeywordInputError, countryCodes, normalizeSite, parseForecast, parseSeed, regionNameIndex, rowsForAgent, sortRows, toRow } from "./keyword-planner";

const none = { keywords: new Set<string>(), negatives: new Set<string>() };
const months = (values: number[]) =>
  ["OCTOBER", "NOVEMBER", "DECEMBER", "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER"].map((month, i) => ({
    month,
    year: i < 3 ? "2025" : "2026",
    monthly_searches: String(values[i]),
  }));

describe("parseSeed", () => {
  it("takes exactly one seed: a site wins, then keywords with a page, a page, keywords", () => {
    expect(parseSeed({ site: "https://www.competitor.com/shop", keywords: ["x"] })).toEqual({ kind: "site", site: "competitor.com" });
    expect(parseSeed({ url: "store.com/cups", keywords: ["Glass  Cups"] })).toEqual({ kind: "keywords_and_url", keywords: ["glass cups"], url: "https://store.com/cups" });
    expect(parseSeed({ url: "https://store.com/cups" })).toEqual({ kind: "url", url: "https://store.com/cups" });
    expect(parseSeed({ keywords: "cups, cups, mugs" })).toEqual({ kind: "keywords", keywords: ["cups", "mugs"] });
  });

  it("refuses an empty or invalid seed", () => {
    expect(() => parseSeed({})).toThrow(KeywordInputError);
    expect(() => parseSeed({ site: "not a domain" })).toThrow(/domain/);
  });

  it("keeps at most 20 seed keywords", () => {
    const seed = parseSeed({ keywords: Array.from({ length: 30 }, (_, i) => `k${i}`) });
    expect(seed.kind === "keywords" && seed.keywords.length).toBe(20);
  });
});

describe("countries", () => {
  it("accepts codes and English names, drops unknown ones", () => {
    const index = regionNameIndex();
    expect(countryCodes(["lb", "United Arab Emirates", "UAE", "Atlantis"], index)).toEqual(["LB", "AE"]);
    expect(normalizeSite("WWW.Shop.com")).toBe("shop.com");
  });
});

describe("toRow", () => {
  it("reads Google's idea, with the trend, the peak month and the bid range", () => {
    const row = toRow(
      {
        text: "Wool Throw",
        keyword_idea_metrics: {
          avg_monthly_searches: "100",
          competition: "HIGH",
          competition_index: "96",
          low_top_of_page_bid_micros: "447654",
          high_top_of_page_bid_micros: "2132926",
          monthly_search_volumes: months([170, 210, 320, 170, 60, 40, 30, 30, 40, 60, 80, 110]),
        },
      },
      { keywords: new Set(["wool throw"]), negatives: new Set() }
    )!;
    expect(row).toMatchObject({ text: "wool throw", searches: 100, competition: "HIGH", competitionIndex: 96, bidLow: 0.45, bidHigh: 2.13, peakMonth: "December", inAccount: true });
    expect(row.trend[0]).toEqual({ month: "2025-10", searches: 170 });
    expect(row.trend.at(-1)).toEqual({ month: "2026-09", searches: 110 });
    // Last 3 months (Jul–Sep) average 83.3 against 100.
    expect(row.recentChange).toBe(-0.17);
  });

  it("reads historical metrics too, and marks a keyword a negative blocks", () => {
    const row = toRow({ text: "free glass cups", keyword_metrics: { avg_monthly_searches: "50", competition: "LOW" } }, { keywords: new Set(), negatives: new Set(["free"]) })!;
    expect(row).toMatchObject({ searches: 50, competition: "LOW", blockedByNegative: true, peakMonth: null, recentChange: null });
  });

  it("has no peak month for a flat year", () => {
    const row = toRow({ text: "cups", keyword_idea_metrics: { avg_monthly_searches: "880", monthly_search_volumes: months([880, 880, 720, 880, 880, 720, 1000, 880, 880, 880, 880, 1000]) } }, none)!;
    expect(row.peakMonth).toBeNull();
  });
});

describe("rows for the agent", () => {
  it("sorts by searches and keeps only what helps a decision", () => {
    const rows = sortRows([
      toRow({ text: "b", keyword_idea_metrics: { avg_monthly_searches: "10", competition: "LOW" } }, none)!,
      toRow({ text: "a", keyword_idea_metrics: {} }, none)!,
      toRow({ text: "c", keyword_idea_metrics: { avg_monthly_searches: "500", competition: "MEDIUM", low_top_of_page_bid_micros: "1000000" } }, { keywords: new Set(["c"]), negatives: new Set() })!,
    ]);
    expect(rows.map((r) => r.text)).toEqual(["c", "b", "a"]);
    expect(rowsForAgent(rows)[0]).toEqual({ keyword: "c", searches: 500, competition: "medium", bid: [1, null], inAccount: true });
  });
});

describe("parseForecast", () => {
  it("needs keywords and a budget; match type defaults to phrase; days are bounded", () => {
    expect(parseForecast({ keywords: ["cups", { text: "mugs", matchType: "exact" }], dailyBudget: 20, days: 2 })).toEqual({
      keywords: [
        { text: "cups", matchType: "PHRASE" },
        { text: "mugs", matchType: "EXACT" },
      ],
      dailyBudget: 20,
      days: 7,
    });
    expect(() => parseForecast({ keywords: [], dailyBudget: 20 })).toThrow(KeywordInputError);
    expect(() => parseForecast({ keywords: ["x"], dailyBudget: 0 })).toThrow(/budget/);
  });
});
