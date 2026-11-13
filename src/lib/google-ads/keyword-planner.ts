// Keyword Planner for a live account: ideas from keywords, a product page or a
// whole site (a competitor's included), search volumes for given keywords, and
// a forecast of what a set of keywords would bring for a budget. Google's own
// numbers, through the workspace's Google Ads connection. Pure: shared by the
// platform route, the page and the tests.

export type IdeaSeed =
  | { kind: "keywords"; keywords: string[] }
  | { kind: "url"; url: string }
  | { kind: "site"; site: string }
  | { kind: "keywords_and_url"; keywords: string[]; url: string };

export type Competition = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export type KeywordRow = {
  text: string;
  /** Average monthly searches over the last 12 months. */
  searches: number | null;
  competition: Competition;
  /** 0–100. */
  competitionIndex: number | null;
  /** Top-of-page bid range (20th and 80th percentile), in the account currency. */
  bidLow: number | null;
  bidHigh: number | null;
  /** Monthly searches, oldest first: [{ month: "2026-01", searches }]. */
  trend: { month: string; searches: number }[];
  /** Searches in the last 3 months against the 12-month average (0.2 = +20%). */
  recentChange: number | null;
  /** The month with the most searches, e.g. "December". */
  peakMonth: string | null;
  /** Already a keyword in the account (any match type), or blocked by a negative. */
  inAccount: boolean;
  blockedByNegative: boolean;
};

export type KeywordResearch = {
  mode: "ideas" | "metrics";
  seed?: IdeaSeed;
  countries: { code: string; name: string }[];
  language: { code: string; name: string } | null;
  currency: string;
  rows: KeywordRow[];
  /** Ideas Google had in total (it returns the best ones first). */
  totalIdeas: number | null;
  fetchedAt: string;
};

export type ForecastInput = {
  keywords: { text: string; matchType: "EXACT" | "PHRASE" | "BROAD" }[];
  dailyBudget: number;
  maxCpc?: number;
  countries: string[];
  language?: string;
  days: number;
};

export type Forecast = {
  keywords: number;
  dailyBudget: number;
  maxCpc: number | null;
  days: number;
  clicks: number | null;
  cost: number | null;
  averageCpc: number | null;
  conversions: number | null;
  averageCpa: number | null;
  currency: string;
  countries: { code: string; name: string }[];
};

export class KeywordInputError extends Error {}

export const MAX_SEED_KEYWORDS = 20;
export const MAX_METRIC_KEYWORDS = 1000;
export const MAX_IDEAS = 1000;
export const MAX_COUNTRIES = 10;

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

const cleanKeywords = (v: unknown, max: number) =>
  [...new Set((Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : []).map((k) => String(k ?? "").trim().toLowerCase().replace(/\s+/g, " ")).filter((k) => k && k.length <= 80))].slice(0, max);

/** "https://shop.com/x" or "shop.com/x" → a full URL; anything else → null. */
export function normalizeUrl(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return /\./.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** "https://www.shop.com/x" → "shop.com". */
export function normalizeSite(v: unknown): string | null {
  const url = normalizeUrl(v);
  return url ? new URL(url).hostname.replace(/^www\./, "") : null;
}

/** Exactly one seed: keywords, a page, a whole site, or keywords with a page. */
export function parseSeed(raw: Record<string, unknown>): IdeaSeed {
  const keywords = cleanKeywords(raw.keywords, MAX_SEED_KEYWORDS);
  const site = raw.site !== undefined && raw.site !== "" ? normalizeSite(raw.site) : null;
  const url = raw.url !== undefined && raw.url !== "" ? normalizeUrl(raw.url) : null;
  if (raw.site && !site) throw new KeywordInputError("That site is not a valid domain, e.g. competitor.com.");
  if (raw.url && !url) throw new KeywordInputError("That page is not a valid address.");
  if (site) return { kind: "site", site };
  if (url && keywords.length) return { kind: "keywords_and_url", keywords, url };
  if (url) return { kind: "url", url };
  if (keywords.length) return { kind: "keywords", keywords };
  throw new KeywordInputError("Give keywords (up to 20), a page address, or a site (yours or a competitor's).");
}

export function parseMetricKeywords(raw: unknown): string[] {
  const keywords = cleanKeywords(raw, MAX_METRIC_KEYWORDS);
  if (!keywords.length) throw new KeywordInputError("Give at least one keyword.");
  return keywords;
}

/** Country codes ("LB", "ae") or English names ("Lebanon") → ISO codes, unknown ones dropped. */
export function countryCodes(values: unknown, nameToCode: (name: string) => string | undefined): string[] {
  const list = Array.isArray(values) ? values : typeof values === "string" ? values.split(",") : [];
  const codes = list
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .map((v) => (/^[a-z]{2}$/i.test(v) ? v.toUpperCase() : nameToCode(v)))
    .filter((c): c is string => !!c && /^[A-Z]{2}$/.test(c));
  return [...new Set(codes)].slice(0, MAX_COUNTRIES);
}

/** An English region name → its ISO code, using the browser's/Node's region names. */
export function regionNameIndex(): (name: string) => string | undefined {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const index = new Map<string, string>();
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const a of letters)
    for (const b of letters) {
      const code = a + b;
      try {
        const name = names.of(code);
        if (name && name !== code) index.set(name.toLowerCase(), code);
      } catch {
        // Not a region code.
      }
    }
  // Common short forms.
  for (const [alias, code] of [["uae", "AE"], ["usa", "US"], ["uk", "GB"], ["ksa", "SA"], ["saudi", "SA"], ["emirates", "AE"]] as const) index.set(alias, code);
  return (name) => index.get(name.trim().toLowerCase());
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const micros = (v: unknown) => {
  const n = num(v);
  return n === null ? null : Math.round(n / 10_000) / 100;
};

type RawMetrics = {
  avg_monthly_searches?: unknown;
  avgMonthlySearches?: unknown;
  competition?: unknown;
  competition_index?: unknown;
  competitionIndex?: unknown;
  low_top_of_page_bid_micros?: unknown;
  lowTopOfPageBidMicros?: unknown;
  high_top_of_page_bid_micros?: unknown;
  highTopOfPageBidMicros?: unknown;
  monthly_search_volumes?: { year?: unknown; month?: unknown; monthly_searches?: unknown; monthlySearches?: unknown }[];
  monthlySearchVolumes?: { year?: unknown; month?: unknown; monthly_searches?: unknown; monthlySearches?: unknown }[];
};

/** One idea or metrics result from Google → a row (snake_case or camelCase). */
export function toRow(raw: Record<string, unknown>, account: { keywords: Set<string>; negatives: Set<string> }): KeywordRow | null {
  const text = String(raw.text ?? "").trim().toLowerCase();
  if (!text) return null;
  const m = (raw.keyword_idea_metrics ?? raw.keywordIdeaMetrics ?? raw.keyword_metrics ?? raw.keywordMetrics ?? {}) as RawMetrics;
  const volumes = m.monthly_search_volumes ?? m.monthlySearchVolumes ?? [];
  const trend = volumes
    .map((v) => {
      const month = MONTHS.indexOf(String(v.month)) + 1;
      const year = Number(v.year);
      const searches = num(v.monthly_searches ?? v.monthlySearches);
      return month > 0 && year && searches !== null ? { month: `${year}-${String(month).padStart(2, "0")}`, searches } : null;
    })
    .filter((v): v is { month: string; searches: number } => !!v)
    .sort((a, b) => a.month.localeCompare(b.month));
  const searches = num(m.avg_monthly_searches ?? m.avgMonthlySearches);
  const recent = trend.slice(-3);
  const recentAvg = recent.length ? recent.reduce((s, v) => s + v.searches, 0) / recent.length : null;
  const peak = trend.length ? trend.reduce((a, b) => (b.searches > a.searches ? b : a)) : null;
  const competition = String(m.competition ?? "UNKNOWN");
  return {
    text,
    searches,
    competition: (["LOW", "MEDIUM", "HIGH"].includes(competition) ? competition : "UNKNOWN") as Competition,
    competitionIndex: num(m.competition_index ?? m.competitionIndex),
    bidLow: micros(m.low_top_of_page_bid_micros ?? m.lowTopOfPageBidMicros),
    bidHigh: micros(m.high_top_of_page_bid_micros ?? m.highTopOfPageBidMicros),
    trend,
    recentChange: searches && recentAvg !== null ? Math.round((recentAvg / searches - 1) * 100) / 100 : null,
    // A flat year has no peak worth naming.
    peakMonth: peak && searches && peak.searches >= searches * 1.25 ? new Date(`${peak.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }) : null,
    inAccount: account.keywords.has(text),
    blockedByNegative: [...account.negatives].some((n) => n && (text === n || ` ${text} `.includes(` ${n} `))),
  };
}

/** Most searched first; rows without data last. */
export const sortRows = (rows: KeywordRow[]) => [...rows].sort((a, b) => (b.searches ?? -1) - (a.searches ?? -1) || a.text.localeCompare(b.text));

/** What the agent gets: compact rows, no monthly series (only the shape of the year). */
export function rowsForAgent(rows: KeywordRow[]) {
  return rows.map((r) => ({
    keyword: r.text,
    searches: r.searches,
    competition: r.competition === "UNKNOWN" ? null : r.competition.toLowerCase(),
    bid: r.bidLow !== null || r.bidHigh !== null ? [r.bidLow, r.bidHigh] : null,
    ...(r.recentChange !== null && Math.abs(r.recentChange) >= 0.15 ? { last3MonthsVsAverage: `${r.recentChange > 0 ? "+" : ""}${Math.round(r.recentChange * 100)}%` } : {}),
    ...(r.peakMonth ? { peak: r.peakMonth } : {}),
    ...(r.inAccount ? { inAccount: true } : {}),
    ...(r.blockedByNegative ? { blockedByNegative: true } : {}),
  }));
}

export function parseForecast(raw: Record<string, unknown>): Omit<ForecastInput, "countries" | "language"> {
  const list = Array.isArray(raw.keywords) ? raw.keywords : [];
  const keywords = list
    .map((k) => {
      const o = (typeof k === "string" ? { text: k } : k) as { text?: unknown; matchType?: unknown };
      const text = String(o.text ?? "").trim().toLowerCase();
      const matchType = (["EXACT", "PHRASE", "BROAD"].includes(String(o.matchType).toUpperCase()) ? String(o.matchType).toUpperCase() : "PHRASE") as ForecastInput["keywords"][number]["matchType"];
      return text && text.length <= 80 ? { text, matchType } : null;
    })
    .filter((k): k is ForecastInput["keywords"][number] => !!k)
    .slice(0, 200);
  if (!keywords.length) throw new KeywordInputError("Give at least one keyword to forecast.");
  const dailyBudget = Number(raw.dailyBudget);
  if (!Number.isFinite(dailyBudget) || dailyBudget <= 0) throw new KeywordInputError("Give a daily budget above zero, in the account currency.");
  const maxCpc = raw.maxCpc === undefined || raw.maxCpc === null || raw.maxCpc === "" ? undefined : Number(raw.maxCpc);
  if (maxCpc !== undefined && (!Number.isFinite(maxCpc) || maxCpc <= 0)) throw new KeywordInputError("The maximum cost per click must be above zero.");
  const days = Math.min(365, Math.max(7, Math.round(Number(raw.days) || 30)));
  return { keywords, dailyBudget, ...(maxCpc ? { maxCpc } : {}), days };
}

export const toMicros = (amount: number) => String(Math.round(amount * 1_000_000));
