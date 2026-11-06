import { describe, expect, it } from "vitest";
import { regionNameIndex } from "./keyword-planner";
import {
  CompetitorInputError,
  analysisForAgent,
  cleanHeadline,
  cleanKeywords,
  isFreeListing,
  markAccount,
  normalizeDomain,
  parseTarget,
  sourceFor,
  totalsOf,
  unitsToCredits,
  type CompetitorAnalysis,
} from "./competitor-ads";

describe("normalizeDomain", () => {
  it("keeps the registrable domain, so subdomains are included", () => {
    expect(normalizeDomain("https://www.lb.mikesport.com/products/x?y=1")).toBe("mikesport.com");
    expect(normalizeDomain("Ayoubcomputers.com")).toBe("ayoubcomputers.com");
    expect(normalizeDomain("decathlon.com.lb")).toBe("decathlon.com.lb");
    expect(normalizeDomain("shop.decathlon.com.lb/en")).toBe("decathlon.com.lb");
    expect(normalizeDomain("www.argos.co.uk")).toBe("argos.co.uk");
    expect(normalizeDomain("ounass.ae")).toBe("ounass.ae");
  });

  it("refuses what is not a domain", () => {
    for (const bad of ["", "   ", "nike shoes", "localhost", "http://", "a..b.com", 42, null]) expect(normalizeDomain(bad)).toBeNull();
  });
});

describe("parseTarget", () => {
  const index = regionNameIndex();
  it("takes a country name or code", () => {
    expect(parseTarget({ domain: "mikesport.com", country: "Lebanon" }, index)).toEqual({ domain: "mikesport.com", country: "LB" });
    expect(parseTarget({ domain: "noon.com", country: "ae" }, index)).toEqual({ domain: "noon.com", country: "AE" });
    expect(parseTarget({ domain: "noon.com", country: "UAE" }, index)).toEqual({ domain: "noon.com", country: "AE" });
  });

  it("explains a bad site or country", () => {
    expect(() => parseTarget({ domain: "not a site", country: "LB" }, index)).toThrow(CompetitorInputError);
    expect(() => parseTarget({ domain: "noon.com", country: "Atlantis" }, index)).toThrow(/not a country/);
    expect(() => parseTarget({ domain: "noon.com" }, index)).toThrow(/Pick the country/);
  });
});

it("uses SE Ranking's code for the United Kingdom", () => {
  expect(sourceFor("GB")).toBe("uk");
  expect(sourceFor("LB")).toBe("lb");
});

describe("unitsToCredits", () => {
  it("charges our cost exactly, 10 credits = $1, rounded up to 0.001", () => {
    // Wallet: $50 for 250,000 units; one page is 100 units.
    expect(unitsToCredits(100, 50 / 250_000)).toBe(0.2);
    // Enterprise at $30 per million.
    expect(unitsToCredits(100, 30 / 1_000_000)).toBe(0.03);
    expect(unitsToCredits(1, 30 / 1_000_000)).toBe(0.001);
  });

  it("charges nothing for nothing", () => {
    expect(unitsToCredits(0, 0.0002)).toBe(0);
    expect(unitsToCredits(100, 0)).toBe(0);
  });
});

it("spots Shopify's free product listings filed as paid", () => {
  expect(isFreeListing("https://lb.mikesport.com/products/x?variant=1&utm_medium=product_sync&utm_source=google&utm_content=sag_organic&utm_campaign=sag_organic")).toBe(true);
  expect(isFreeListing("https://ayoubcomputers.com/samsung-65")).toBe(false);
  expect(isFreeListing(null)).toBe(false);
});

describe("cleanHeadline", () => {
  it("drops the site name and link Google printed after the headline", () => {
    expect(cleanHeadline("Shop Premium Beauty Products | AYOUB COMPUTERSAYOUB COMPUTERShttps://www.ayoubcomputers.com", "ayoubcomputers.com")).toBe(
      "Shop Premium Beauty Products | AYOUB COMPUTERS"
    );
    expect(cleanHeadline("Decathlon Lebanon OnlineDecathlonhttps://www.decathlon.com.lb", "decathlon.com.lb")).toBe("Decathlon Lebanon Online");
    expect(cleanHeadline("إعلانDecathlon Lebanon Online | Decathlon LebanonDecathlonhttps://www.decathlon.com.lb", "decathlon.com.lb")).toBe(
      "Decathlon Lebanon Online | Decathlon Lebanon"
    );
  });

  it("leaves a clean headline alone", () => {
    expect(cleanHeadline('Samsung 65" Qled 4K Q70D Tizen Os Smart Tv - Qa65Q70Dauxtw | Ayoub Computers', "ayoubcomputers.com")).toBe(
      'Samsung 65" Qled 4K Q70D Tizen Os Smart Tv - Qa65Q70Dauxtw | Ayoub Computers'
    );
    expect(cleanHeadline("70% Off on Selected Items | End of Season Sale is Live", "decathlon.com.lb")).toBe("70% Off on Selected Items | End of Season Sale is Live");
  });
});

describe("cleanKeywords", () => {
  const row = (over: Record<string, unknown>) => ({
    keyword: "samsung 65 inch tv",
    position: 1,
    volume: 110,
    cpc: 0.02,
    url: "https://ayoubcomputers.com/a",
    traffic: 0,
    price: 0,
    block: "top",
    block_type: "shopping_results",
    snippet_title: "Samsung A | Ayoub Computers",
    snippet_description: "",
    snippet_display_url: "ayoubcomputers.com/a",
    ...over,
  });

  it("merges a keyword's ads and landing pages into one row", () => {
    const { rows } = cleanKeywords(
      [row({}), row({ url: "https://ayoubcomputers.com/b", snippet_title: "Samsung B | Ayoub Computers", position: 2 }), row({ keyword: "ayoub", volume: 2900, block_type: null, url: "https://ayoubcomputers.com/" })],
      "ayoubcomputers.com"
    );
    expect(rows.map((r) => r.keyword)).toEqual(["ayoub", "samsung 65 inch tv"]);
    const tv = rows[1]!;
    expect(tv.ads.map((a) => a.title)).toEqual(["Samsung A | Ayoub Computers", "Samsung B | Ayoub Computers"]);
    expect(tv.landingPages).toHaveLength(2);
    expect(tv.position).toBe(1);
    expect(tv.placement).toBe("shopping");
    expect(rows[0]!.placement).toBe("top");
  });

  it("removes free product listings and counts them", () => {
    const { rows, freeListingsRemoved } = cleanKeywords(
      [row({ url: "https://lb.mikesport.com/products/x?utm_campaign=sag_organic" }), row({ keyword: "pilates ring", url: "https://lb.mikesport.com/products/y?utm_content=sag_organic" })],
      "mikesport.com"
    );
    expect(rows).toEqual([]);
    expect(freeListingsRemoved).toBe(2);
  });

  it("totals what is left, not SE Ranking's headline", () => {
    const { rows } = cleanKeywords(
      [
        row({ keyword: "ayoub computers", traffic: 1927, price: 38.54 }),
        row({ keyword: "ayoub", traffic: 120.4, price: 12.005 }),
        row({ keyword: "free one", traffic: 999, price: 99, url: "https://x.com/p?utm_campaign=sag_organic" }),
      ],
      "ayoubcomputers.com"
    );
    expect(totalsOf(rows)).toEqual({ keywords: 2, traffic: 2047, cost: 50.55 });
    expect(totalsOf([])).toEqual({ keywords: 0, traffic: 0, cost: 0 });
  });
});

it("marks keywords the account already has", () => {
  const rows = cleanKeywords([{ keyword: "ayoub", url: "https://ayoubcomputers.com" }, { keyword: "laptop price in lebanon", url: "https://ayoubcomputers.com" }], "ayoubcomputers.com").rows;
  const marked = markAccount(rows, { keywords: new Set(["laptop price in lebanon"]), negatives: new Set(["ayoub"]) });
  expect(marked.find((r) => r.keyword === "laptop price in lebanon")?.inAccount).toBe(true);
  expect(marked.find((r) => r.keyword === "ayoub")?.blockedByNegative).toBe(true);
  expect(markAccount(rows, null)).toBe(rows);
});

it("gives the agent a compact view that calls the numbers estimates", () => {
  const keywords = cleanKeywords([{ keyword: "ayoub", volume: 2900, cpc: 0.1, position: 1, url: "https://ayoubcomputers.com/", snippet_title: "AYOUB COMPUTERS" }], "ayoubcomputers.com").rows;
  const analysis: CompetitorAnalysis = {
    id: "a",
    domain: "ayoubcomputers.com",
    country: "LB",
    month: "2026-11",
    keywords,
    totals: totalsOf(keywords),
    pages: 1,
    hasMore: false,
    freeListingsRemoved: 0,
    comparedWithAccount: false,
    creditsCharged: 0.2,
    chargedNow: 0,
    fetchedAt: "2026-11-06T00:00:00Z",
  };
  const view = analysisForAgent(analysis);
  expect(view.source).toMatch(/estimates/);
  expect(view.keywords[0]).toEqual({ keyword: "ayoub", searches: 2900, cpcUsd: 0.1, position: 1, ad: "AYOUB COMPUTERS", landingPage: "https://ayoubcomputers.com/" });
  expect(view).not.toHaveProperty("freeProductListingsRemoved");
  expect(view).not.toHaveProperty("moreKeywordsAvailable");
  // What this lookup cost, not what the workspace paid earlier in the month.
  expect(view.creditsChargedForThisLookup).toBe(0);
});
