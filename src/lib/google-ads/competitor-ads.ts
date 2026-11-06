// Competitor ads: the search keywords a competitor's site pays for in one
// country, with the ad it shows on each. The data is SE Ranking's paid keyword
// list (they watch Google's results and record who advertises where), bought
// with our own key and billed to the workspace at cost. Only that one report is
// ever requested. Pure: shared by the platform route, the page and the tests.

export class CompetitorInputError extends Error {}

/** One SE Ranking request for the paid keyword list costs 100 of their units. */
export const UNITS_PER_PAGE = 100;
/** Rows per page of the paid keyword list (SE Ranking's maximum). */
export const KEYWORDS_PAGE_SIZE = 1000;
/** Pages a single analysis can load (5,000 rows). */
export const MAX_PAGES = 5;

export type CompetitorTarget = {
  /** The registrable domain, subdomains included: lb.mikesport.com → mikesport.com. */
  domain: string;
  /** ISO code, upper case: LB. */
  country: string;
};

export type AdCopy = { title: string; description: string; displayUrl: string; url: string };

export type CompetitorKeyword = {
  keyword: string;
  /** Monthly searches in the country. */
  volume: number | null;
  /** Cost per click in USD (Google Ads data, through SE Ranking). */
  cpc: number | null;
  /** Ad position, 1 = first ad. */
  position: number | null;
  /** Ads at the top or bottom of the page; "shopping" for a product ad. */
  placement: "top" | "bottom" | "shopping" | null;
  /** Estimated monthly clicks and their cost (USD). */
  traffic: number | null;
  cost: number | null;
  /** The competitor's ads seen on this keyword (best position first, at most 3). */
  ads: AdCopy[];
  /** Landing pages its ads sent this keyword to. */
  landingPages: string[];
  /** Already a keyword in the customer's account, or blocked by one of its negatives. */
  inAccount?: boolean;
  blockedByNegative?: boolean;
};

export type Totals = {
  /** Paid keywords after free listings are removed (our count, not SE Ranking's headline). */
  keywords: number;
  /** Estimated monthly clicks and cost (USD) of those ads. */
  traffic: number;
  cost: number;
};

export type CompetitorAnalysis = CompetitorTarget & {
  id: string;
  /** The data month, "2026-11" (SE Ranking refreshes monthly). */
  month: string;
  keywords: CompetitorKeyword[];
  totals: Totals;
  /** Pages of the list loaded so far, and whether SE Ranking has more. */
  pages: number;
  hasMore: boolean;
  /** Rows SE Ranking filed as paid that were Google's free product listings (removed). */
  freeListingsRemoved: number;
  /** Whether the customer's Google Ads account could be compared. */
  comparedWithAccount: boolean;
  /** Credits this workspace paid for this site and country this month, all lookups together. */
  creditsCharged: number;
  /** Credits charged by this lookup alone (0 when everything was already here). */
  chargedNow: number;
  fetchedAt: string;
};

// ─── Input ────────────────────────────────────────────────────────────────

// Second-level labels used under country codes: example.com.lb, example.co.uk.
const SECOND_LEVEL = new Set(["com", "net", "org", "co", "gov", "edu", "ac", "gob", "nic", "or", "ne", "go", "mil", "info", "biz", "ltd", "plc"]);

/** "https://www.lb.mikesport.com/products/x" → "mikesport.com"; null when it is not a domain. */
export function normalizeDomain(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let host = input.trim().toLowerCase();
  if (!host) return null;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(host) ? host : `https://${host}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "");
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((l) => /^[a-z0-9-]{1,63}$/.test(l) && !l.startsWith("-") && !l.endsWith("-"))) return null;
  const tld = labels.at(-1)!;
  if (!/^[a-z]{2,}$/.test(tld) && !/^xn--/.test(tld)) return null;
  const keep = tld.length === 2 && labels.length >= 3 && SECOND_LEVEL.has(labels.at(-2)!) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

/** SE Ranking's database for a country: ISO lower case, except the United Kingdom ("uk"). */
export function sourceFor(country: string): string {
  const code = country.trim().toLowerCase();
  return code === "gb" ? "uk" : code;
}

export function parseTarget(raw: { domain?: unknown; country?: unknown }, nameToCode: (name: string) => string | undefined): CompetitorTarget {
  const domain = normalizeDomain(raw.domain);
  if (!domain) throw new CompetitorInputError("Give the competitor's website, e.g. competitor.com.");
  const asked = String(raw.country ?? "").trim();
  const country = /^[a-z]{2}$/i.test(asked) ? asked.toUpperCase() : asked ? nameToCode(asked) : undefined;
  if (!country) throw new CompetitorInputError(asked ? `"${asked}" is not a country we know. Use a name or a two-letter code, e.g. Lebanon or LB.` : "Pick the country to look at.");
  return { domain, country };
}

/** The data month, "2026-11". */
export function dataMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

// ─── Billing ──────────────────────────────────────────────────────────────

/**
 * Platform credits for SE Ranking units, at our cost and no margin:
 * 10 credits = $1, rounded up to 0.001 credit (the platform's rule).
 */
export function unitsToCredits(units: number, usdPerUnit: number): number {
  if (!(units > 0) || !(usdPerUnit > 0)) return 0;
  const milli = Math.round(units * usdPerUnit * 10 * 1000 * 1e6) / 1e6;
  return Math.ceil(milli) / 1000;
}

// ─── Cleaning SE Ranking's rows ───────────────────────────────────────────

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const s = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/**
 * Google's free product listings, which SE Ranking files as paid for Shopify
 * stores: their links carry utm_campaign=sag_organic ("Surfaces across Google").
 * Tests on five Lebanese stores: 66 of Decathlon's 89 rows and all 85 of Mike Sport's.
 */
export function isFreeListing(url: unknown): boolean {
  return typeof url === "string" && /[?&](utm_campaign|utm_content)=sag_organic\b/i.test(url);
}

/**
 * SE Ranking stores the ad headline with what Google printed after it: the site
 * name and the link ("Shop Now | AYOUB COMPUTERSAYOUB COMPUTERShttps://www…"),
 * sometimes after Google's "Ad" label. Keep the headline.
 */
export function cleanHeadline(raw: unknown, domain: string): string {
  let t = s(raw).replace(/^(sponsored|ad|إعلان|annonce|anzeige|anuncio)\s*[·:]?\s*(?=\S)/i, "");
  t = t.replace(/https?:\/\/\S*$/i, "").trim();
  // A trailing repeat: "…AYOUB COMPUTERSAYOUB COMPUTERS" → "…AYOUB COMPUTERS".
  for (let len = Math.floor(t.length / 2); len >= 3; len--) {
    if (t.slice(-len) === t.slice(-2 * len, -len)) {
      t = t.slice(0, -len);
      break;
    }
  }
  // A site name glued to the end: "Decathlon Lebanon OnlineDecathlon" → "Decathlon Lebanon Online".
  const brand = domain.split(".")[0]!.replace(/-/g, "");
  const glued = t.match(/^(.*[a-z0-9)\]!?.])([A-Z][\w .&'-]{1,40})$/);
  if (glued && glued[2]!.toLowerCase().replace(/[\s.&'-]/g, "").startsWith(brand.slice(0, Math.max(3, Math.min(brand.length, 6))))) t = glued[1]!;
  return t.replace(/[\s|·-]+$/, "").trim();
}

function placementOf(r: Record<string, unknown>): CompetitorKeyword["placement"] {
  if (/shopping/i.test(String(r.block_type ?? ""))) return "shopping";
  const block = String(r.block ?? "").toLowerCase();
  return block === "top" || block === "bottom" ? block : null;
}

/**
 * The paid keyword rows of one or more pages → one row per keyword (SE Ranking
 * lists a keyword once per ad/landing page), free listings removed, best ad first.
 */
export function cleanKeywords(raw: unknown[], domain: string): { rows: CompetitorKeyword[]; freeListingsRemoved: number } {
  const byKeyword = new Map<string, CompetitorKeyword>();
  let freeListingsRemoved = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const keyword = s(r.keyword).toLowerCase();
    if (!keyword) continue;
    if (isFreeListing(r.url)) {
      freeListingsRemoved++;
      continue;
    }
    const position = n(r.position);
    const ad: AdCopy = { title: cleanHeadline(r.snippet_title, domain), description: s(r.snippet_description), displayUrl: s(r.snippet_display_url), url: s(r.url) };
    const row = byKeyword.get(keyword);
    if (!row) {
      byKeyword.set(keyword, {
        keyword,
        volume: n(r.volume),
        cpc: n(r.cpc),
        position,
        placement: placementOf(r),
        traffic: n(r.traffic),
        cost: n(r.price),
        ads: ad.title || ad.description ? [ad] : [],
        landingPages: ad.url ? [ad.url] : [],
      });
      continue;
    }
    if (position !== null && (row.position === null || position < row.position)) {
      row.position = position;
      row.placement = placementOf(r);
    }
    row.traffic = Math.max(row.traffic ?? 0, n(r.traffic) ?? 0) || row.traffic;
    row.cost = Math.max(row.cost ?? 0, n(r.price) ?? 0) || row.cost;
    if ((ad.title || ad.description) && row.ads.length < 3 && !row.ads.some((a) => a.title === ad.title && a.description === ad.description)) row.ads.push(ad);
    if (ad.url && row.landingPages.length < 5 && !row.landingPages.includes(ad.url)) row.landingPages.push(ad.url);
  }
  const rows = [...byKeyword.values()].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || a.keyword.localeCompare(b.keyword));
  return { rows, freeListingsRemoved };
}

/** Our totals from the cleaned list (SE Ranking's own headline counts free listings too). */
export function totalsOf(rows: CompetitorKeyword[]): Totals {
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    keywords: rows.length,
    traffic: Math.round(rows.reduce((sum, r) => sum + (r.traffic ?? 0), 0)),
    cost: round(rows.reduce((sum, r) => sum + (r.cost ?? 0), 0)),
  };
}

/** Marks keywords the customer's account already has, or blocks with a negative. */
export function markAccount(rows: CompetitorKeyword[], terms: { keywords: Set<string>; negatives: Set<string> } | null): CompetitorKeyword[] {
  if (!terms) return rows;
  return rows.map((r) => ({
    ...r,
    ...(terms.keywords.has(r.keyword) ? { inAccount: true } : {}),
    ...(terms.negatives.has(r.keyword) ? { blockedByNegative: true } : {}),
  }));
}

/** What the agent reads: compact, with the estimates named as such. */
export function analysisForAgent(a: CompetitorAnalysis, maxKeywords = 300) {
  return {
    competitor: a.domain,
    country: a.country,
    dataMonth: a.month,
    source: "SE Ranking estimates from Google's search results (not the competitor's account data)",
    paidKeywords: a.totals.keywords,
    estimatedMonthlyClicks: a.totals.traffic,
    estimatedMonthlyCostUsd: a.totals.cost,
    ...(a.hasMore ? { moreKeywordsAvailable: true } : {}),
    ...(a.freeListingsRemoved ? { freeProductListingsRemoved: a.freeListingsRemoved } : {}),
    comparedWithAccount: a.comparedWithAccount,
    keywords: a.keywords.slice(0, maxKeywords).map((k) => ({
      keyword: k.keyword,
      searches: k.volume,
      cpcUsd: k.cpc,
      position: k.position,
      ...(k.placement ? { placement: k.placement } : {}),
      ...(k.ads[0] ? { ad: [k.ads[0].title, k.ads[0].description].filter(Boolean).join(" — ") } : {}),
      ...(k.landingPages[0] ? { landingPage: k.landingPages[0] } : {}),
      ...(k.inAccount ? { inAccount: true } : {}),
      ...(k.blockedByNegative ? { blockedByNegative: true } : {}),
    })),
    creditsChargedForThisLookup: a.chargedNow,
  };
}
