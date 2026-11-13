// Breakdowns, reach and frequency curves, creative fatigue, product metrics,
// forecasts and the learning-budget rule on the demo snapshot. The real
// versions come from the Insights API (breakdowns=age,gender,publisher_platform,
// platform_position,device_platform,hourly_stats…).

import { LIMITS, PLACEMENTS } from "./constants";
import { DEFAULT_PLACEMENTS } from "./mock-data";
import { EMPTY_BASE, addBase, addDays, adBase, adSetBase, campaignBase, dailySeries, daysIn, derive } from "./metrics";
import type { AdSet, BaseMetrics, BreakdownKey, DateRange, MetaAccountData, MetaAd, Metrics, MetaProduct, PlacementKey, PlatformKey } from "./types";

export type SegmentRow = { key: string; label: string; base: BaseMetrics; metrics: Metrics };

export const SEGMENTS: Record<BreakdownKey, { label: string; hint: string }> = {
  day: { label: "Day", hint: "Daily trend" },
  week: { label: "Week", hint: "Week by week" },
  dayOfWeek: { label: "Day of week", hint: "Which weekdays deliver" },
  hour: { label: "Hour of day", hint: "Best hours to show ads" },
  device: { label: "Device", hint: "iPhone, Android, desktop, iPad" },
  country: { label: "Country", hint: "Where results come from" },
  age: { label: "Age", hint: "Age ranges" },
  gender: { label: "Gender", hint: "Female, male, unknown" },
  ageGender: { label: "Age and gender", hint: "Age ranges split by gender" },
  platform: { label: "Platform", hint: "Facebook, Instagram, Messenger, Audience Network, Threads" },
  placement: { label: "Placement", hint: "Feed, Reels, Stories, Explore…" },
  objective: { label: "Objective", hint: "Sales vs Leads vs Traffic…" },
};

type Part = { key: string; share: number; efficiency: number };

const TRAFFIC_KEYS: (keyof BaseMetrics)[] = ["spend", "impressions", "reach", "linkClicks", "landingPageViews", "video3s", "thruPlays", "engagements"];

/** Split metrics by traffic share; conversions also by efficiency. */
export function splitBase(total: BaseMetrics, parts: Part[]): Record<string, BaseMetrics> {
  const s = parts.reduce((a, p) => a + p.share, 0) || 1;
  const e = parts.reduce((a, p) => a + p.share * p.efficiency, 0) || 1;
  const out: Record<string, BaseMetrics> = {};
  for (const p of parts) {
    const t = p.share / s;
    const c = (p.share * p.efficiency) / e;
    const row = { ...EMPTY_BASE };
    for (const k of Object.keys(EMPTY_BASE) as (keyof BaseMetrics)[]) row[k] = total[k] * (TRAFFIC_KEYS.includes(k) ? t : c);
    out[p.key] = row;
  }
  return out;
}

const HOUR_TRAFFIC = [0.7, 0.4, 0.25, 0.2, 0.2, 0.3, 0.6, 1, 1.3, 1.5, 1.6, 1.7, 1.8, 1.8, 1.7, 1.8, 2, 2.2, 2.5, 2.9, 3.2, 3.3, 2.7, 1.5];
const HOUR_EFF = [0.6, 0.5, 0.4, 0.4, 0.4, 0.5, 0.7, 0.8, 0.9, 1, 1, 1, 1.05, 1, 0.95, 1, 1.05, 1.1, 1.2, 1.3, 1.35, 1.3, 1.15, 0.85];

const PROFILES: Partial<Record<BreakdownKey, Part[]>> = {
  device: [
    { key: "iPhone", share: 41, efficiency: 1.2 },
    { key: "Android smartphone", share: 44, efficiency: 0.85 },
    { key: "Desktop", share: 10, efficiency: 1.1 },
    { key: "iPad", share: 3, efficiency: 0.95 },
    { key: "Other", share: 2, efficiency: 0.5 },
  ],
  age: [
    { key: "18–24", share: 18, efficiency: 0.75 },
    { key: "25–34", share: 36, efficiency: 1.25 },
    { key: "35–44", share: 24, efficiency: 1.15 },
    { key: "45–54", share: 12, efficiency: 0.9 },
    { key: "55–64", share: 6, efficiency: 0.55 },
    { key: "65+", share: 4, efficiency: 0.3 },
  ],
  gender: [
    { key: "Female", share: 52, efficiency: 1.2 },
    { key: "Male", share: 45, efficiency: 0.85 },
    { key: "Unknown", share: 3, efficiency: 0.6 },
  ],
};

const COUNTRY_EFF: Record<string, number> = { "Saudi Arabia": 1.02, "United Arab Emirates": 1.18, Kuwait: 0.9, Qatar: 1 };

/** Share and efficiency of each placement when Meta chooses (Advantage+) or the advertiser picks. */
const PLACEMENT_PROFILE: Record<PlacementKey, { share: number; efficiency: number }> = {
  FB_FEED: { share: 21, efficiency: 1 },
  FB_REELS: { share: 8, efficiency: 0.8 },
  FB_STORIES: { share: 6, efficiency: 0.8 },
  FB_MARKETPLACE: { share: 3, efficiency: 0.45 },
  FB_SEARCH: { share: 1, efficiency: 0.7 },
  FB_INSTREAM: { share: 2, efficiency: 0.5 },
  FB_RIGHT_COLUMN: { share: 1, efficiency: 0.4 },
  IG_FEED: { share: 17, efficiency: 1.1 },
  IG_REELS: { share: 17, efficiency: 1.15 },
  IG_STORIES: { share: 12, efficiency: 1 },
  IG_EXPLORE: { share: 5, efficiency: 0.9 },
  IG_SEARCH: { share: 1, efficiency: 0.8 },
  MESSENGER_INBOX: { share: 2, efficiency: 0.5 },
  MESSENGER_STORIES: { share: 1, efficiency: 0.4 },
  AN_NATIVE: { share: 3, efficiency: 0.3 },
  AN_REWARDED: { share: 1, efficiency: 0.3 },
  THREADS_FEED: { share: 2, efficiency: 0.5 },
};

const campaignIdsOf = (data: MetaAccountData, ids?: string[]) => ids ?? data.campaigns.filter((c) => c.status !== "ARCHIVED").map((c) => c.id);

/** The placements an ad set delivers on. */
export function placementsOf(set: AdSet): PlacementKey[] {
  return set.placements.advantage ? [...DEFAULT_PLACEMENTS, "FB_SEARCH", "IG_SEARCH", "THREADS_FEED", "AN_NATIVE"] : set.placements.manual;
}

function placementParts(data: MetaAccountData, campaignId: string): Part[] {
  const sets = data.adSets.filter((s) => s.campaignId === campaignId && s.status !== "ARCHIVED");
  const merged = new Map<string, number>();
  for (const s of sets) {
    const w = data.weights[s.id]?.share ?? 1;
    const keys = placementsOf(s);
    const total = keys.reduce((a, k) => a + PLACEMENT_PROFILE[k].share, 0) || 1;
    for (const k of keys) merged.set(k, (merged.get(k) ?? 0) + w * (PLACEMENT_PROFILE[k].share / total));
  }
  return [...merged.entries()].map(([key, share]) => ({ key, share, efficiency: PLACEMENT_PROFILE[key as PlacementKey].efficiency }));
}

function totalFor(data: MetaAccountData, range: DateRange, ids: string[]): BaseMetrics {
  return ids.reduce((s, id) => addBase(s, campaignBase(data, id, range)), EMPTY_BASE);
}

export function placementLabel(key: PlacementKey): string {
  const p = PLACEMENTS[key];
  const platform = p.platform === "FACEBOOK" ? "Facebook" : p.platform === "INSTAGRAM" ? "Instagram" : p.platform === "MESSENGER" ? "Messenger" : p.platform === "AUDIENCE_NETWORK" ? "Audience Network" : "Threads";
  return key === "THREADS_FEED" ? p.label : `${platform} ${p.label}`;
}

export function platformOf(key: PlacementKey): PlatformKey {
  return PLACEMENTS[key].platform;
}

const PLATFORM_LABEL: Record<PlatformKey, string> = { FACEBOOK: "Facebook", INSTAGRAM: "Instagram", MESSENGER: "Messenger", AUDIENCE_NETWORK: "Audience Network", THREADS: "Threads" };

export function segmentRows(data: MetaAccountData, range: DateRange, segment: BreakdownKey, campaignIds?: string[]): SegmentRow[] {
  const ids = campaignIdsOf(data, campaignIds);
  const make = (key: string, label: string, base: BaseMetrics): SegmentRow => ({ key, label, base, metrics: derive(base) });
  const total = totalFor(data, range, ids);

  switch (segment) {
    case "day":
      return dailySeries(data, range, ids).map((p) => make(p.date, new Date(`${p.date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }), p));
    case "week": {
      const weeks = new Map<string, BaseMetrics>();
      for (const p of dailySeries(data, range, ids)) {
        const d = new Date(`${p.date}T00:00:00Z`);
        const start = addDays(p.date, -((d.getUTCDay() + 6) % 7));
        weeks.set(start, addBase(weeks.get(start) ?? EMPTY_BASE, p));
      }
      return [...weeks.entries()].map(([k, b]) => make(k, `Week of ${new Date(`${k}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`, b));
    }
    case "dayOfWeek": {
      const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const days = names.map(() => EMPTY_BASE);
      for (const p of dailySeries(data, range, ids)) {
        const i = new Date(`${p.date}T00:00:00Z`).getUTCDay();
        days[i] = addBase(days[i], p);
      }
      return [1, 2, 3, 4, 5, 6, 0].map((i) => make(String(i), names[i], days[i]));
    }
    case "hour": {
      const parts = HOUR_TRAFFIC.map((share, h) => ({ key: String(h), share, efficiency: HOUR_EFF[h] }));
      const split = splitBase(total, parts);
      return parts.map((p) => make(p.key, `${p.key.padStart(2, "0")}:00`, split[p.key]));
    }
    case "country": {
      const byCountry = new Map<string, BaseMetrics>();
      for (const id of ids) {
        const sets = data.adSets.filter((s) => s.campaignId === id && s.status !== "ARCHIVED");
        const locs = new Map<string, number>();
        for (const s of sets) {
          const real = s.targeting.locations.filter((l) => !l.excluded && l.kind === "Country");
          real.forEach((l, i) => locs.set(l.name, (locs.get(l.name) ?? 0) + (data.weights[s.id]?.share ?? 1) * (i === 0 ? 62 : 38 / Math.max(1, real.length - 1))));
        }
        const parts = (locs.size ? [...locs.entries()] : [["All locations", 1] as [string, number]]).map(([key, share]) => ({ key, share, efficiency: COUNTRY_EFF[key] ?? 1 }));
        const split = splitBase(campaignBase(data, id, range), parts);
        for (const p of parts) byCountry.set(p.key, addBase(byCountry.get(p.key) ?? EMPTY_BASE, split[p.key]));
      }
      return [...byCountry.entries()].map(([k, b]) => make(k, k, b));
    }
    case "placement":
    case "platform": {
      const rows = new Map<string, BaseMetrics>();
      for (const id of ids) {
        const parts = placementParts(data, id);
        if (!parts.length) continue;
        const split = splitBase(campaignBase(data, id, range), parts);
        for (const p of parts) {
          const key = segment === "platform" ? PLATFORM_LABEL[platformOf(p.key as PlacementKey)] : p.key;
          rows.set(key, addBase(rows.get(key) ?? EMPTY_BASE, split[p.key]));
        }
      }
      return [...rows.entries()].map(([k, b]) => make(k, segment === "platform" ? k : placementLabel(k as PlacementKey), b)).sort((a, b) => b.base.spend - a.base.spend);
    }
    case "objective": {
      const rows = new Map<string, BaseMetrics>();
      for (const id of ids) {
        const c = data.campaigns.find((x) => x.id === id);
        if (!c) continue;
        rows.set(c.objective, addBase(rows.get(c.objective) ?? EMPTY_BASE, campaignBase(data, id, range)));
      }
      return [...rows.entries()].map(([k, b]) => make(k, k.charAt(0) + k.slice(1).toLowerCase().replace("_", " "), b));
    }
    case "ageGender":
      return ageGenderRows(total).map((r) => make(r.key, r.label, r.base));
    default: {
      const parts = PROFILES[segment] ?? [];
      const split = splitBase(total, parts);
      return parts.map((p) => make(p.key, p.key, split[p.key]));
    }
  }
}

/** Age by gender cells, shaped so the age and gender profiles still add up to the total. */
function ageGenderRows(total: BaseMetrics): { key: string; label: string; base: BaseMetrics }[] {
  const ages = PROFILES.age ?? [];
  const genders = (PROFILES.gender ?? []).filter((g) => g.key !== "Unknown");
  const parts: Part[] = [];
  for (const a of ages) for (const g of genders) parts.push({ key: `${a.key}|${g.key}`, share: a.share * g.share, efficiency: a.efficiency * g.efficiency });
  const split = splitBase(total, parts);
  return parts.map((p) => ({ key: p.key, label: p.key.replace("|", " · "), base: split[p.key] }));
}

/** Matrix for the demographics heat map: one row per age range, columns Female and Male. */
export function ageGenderMatrix(data: MetaAccountData, range: DateRange, campaignIds?: string[]) {
  const ids = campaignIdsOf(data, campaignIds);
  const rows = ageGenderRows(totalFor(data, range, ids));
  const ages = (PROFILES.age ?? []).map((a) => a.key);
  return ages.map((age) => ({
    age,
    female: derive(rows.find((r) => r.key === `${age}|Female`)?.base ?? EMPTY_BASE),
    male: derive(rows.find((r) => r.key === `${age}|Male`)?.base ?? EMPTY_BASE),
  }));
}

// ─── Reach and frequency ────────────────────────────────────────────────────

/** Share of people reached at least this many times. */
export type ReachCurvePoint = { frequency: number; reachShare: number };

/**
 * People are reached a geometric number of times around the average frequency.
 * The share reached k or more times falls off as q^(k - 1) with q = 1 - 1/avg.
 * Impressions delivered beyond a cap c are a share q^c of all impressions.
 */
export function reachFrequency(data: MetaAccountData, range: DateRange, campaignIds?: string[], capAt = 3) {
  const base = totalFor(data, range, campaignIdsOf(data, campaignIds));
  const avg = Math.max(1, derive(base).frequency || 1);
  const p = 1 / avg;
  const q = 1 - p;
  const curve: ReachCurvePoint[] = Array.from({ length: 10 }, (_, i) => ({ frequency: i + 1, reachShare: Math.pow(q, i) }));
  return {
    reach: base.reach,
    impressions: base.impressions,
    frequency: avg,
    curve,
    capAt,
    /** Share of impressions that go to people already reached `capAt` times. */
    overCapShare: Math.pow(q, capAt),
    /** Share of people reached exactly once. */
    reachedOnceShare: p,
  };
}

// ─── Creatives ──────────────────────────────────────────────────────────────

const hashOf = (s: string) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

export type CreativeRow = {
  ad: MetaAd;
  metrics: Metrics;
  ageDays: number;
  frequency: number;
  /** Link CTR in the first week of the range and now. */
  ctrStart: number;
  ctrNow: number;
  ctrDrop: number;
  fatigued: boolean;
  /** Fresh, worth watching, or fatigued (replace it). */
  health: CreativeHealth;
  /** The frequency above which this audience starts to tire: higher for warm (retargeting) audiences. */
  frequencyLimit: number;
};

export type CreativeHealth = "FRESH" | "WATCH" | "FATIGUED";

const RETARGETING_KINDS = new Set(["WEBSITE", "CATALOG", "CUSTOMER_LIST", "ENGAGEMENT"]);

/** Whether an ad set only reaches people who already know the brand, where a higher frequency is expected. */
export function isRetargeting(data: MetaAccountData, set: AdSet): boolean {
  const include = set.targeting.includeAudienceIds.map((id) => data.audiences.find((a) => a.id === id)).filter(Boolean);
  return include.length > 0 && include.every((a) => RETARGETING_KINDS.has(a!.kind));
}

/** Frequency climbs and link CTR decays as a creative ages: the two signs of fatigue. */
export function creativeRows(data: MetaAccountData, range: DateRange, adIds?: string[]): CreativeRow[] {
  const rows: CreativeRow[] = [];
  for (const ad of data.ads) {
    if (adIds && !adIds.includes(ad.id)) continue;
    if (ad.status === "ARCHIVED") continue;
    const set = data.adSets.find((s) => s.id === ad.adSetId);
    const base = adBase(data, ad.id, range);
    const m = derive(base);
    const ageDays = Math.max(0, Math.round((Date.parse(`${range.end}T00:00:00Z`) - Date.parse(ad.createdAt)) / 86_400_000));
    const frequency = m.frequency * (1 + ageDays / 130);
    const decay = Math.min(0.55, Math.max(0, (ageDays - 30) / 220)) * (0.85 + (hashOf(ad.id) % 30) / 100);
    const ctrNow = m.ctr;
    const ctrStart = ctrNow * (1 + decay);
    const ctrDrop = ctrStart ? 1 - ctrNow / ctrStart : 0;
    // 30-day frequency where people start to tire of one ad: warm audiences tolerate far more repeats.
    const frequencyLimit = set && isRetargeting(data, set) ? 7 : 3.5;
    // Fatigue is people tuning out: CTR falling while the same people keep seeing the ad. A high frequency
    // with a steady CTR is a well-targeted ad, not a tired one, so it only earns a "watch". A steep CTR fall
    // counts on its own.
    const fatigued = base.impressions > 0 && ((ctrDrop >= 0.2 && frequency > frequencyLimit * 0.8) || ctrDrop >= 0.3);
    const watch = !fatigued && base.impressions > 0 && (ctrDrop >= 0.08 || frequency > frequencyLimit * 2);
    rows.push({ ad, metrics: m, ageDays, frequency, ctrStart, ctrNow, ctrDrop, fatigued, health: fatigued ? "FATIGUED" : watch ? "WATCH" : "FRESH", frequencyLimit });
  }
  return rows;
}

// ─── Learning ───────────────────────────────────────────────────────────────

/**
 * Meta needs about 50 optimization events a week for stable delivery, so the
 * daily budget should buy at least 50 / 7 events per day at the current cost.
 */
export function learningBudget(costPerResult: number): number {
  return Math.ceil((costPerResult * LIMITS.learningEvents) / LIMITS.learningDays);
}

export function recentCostPerResult(data: MetaAccountData, adSetId: string, range: DateRange): number {
  return derive(adSetBase(data, adSetId, range)).costPerResult;
}

// ─── Catalog ────────────────────────────────────────────────────────────────

/** Dynamic-ad traffic: every catalog ad, plus a slice of Advantage+ Sales, which also uses the catalog. */
function catalogTraffic(data: MetaAccountData, range: DateRange): BaseMetrics {
  let total = EMPTY_BASE;
  for (const a of data.ads) if (a.format === "CATALOG") total = addBase(total, adBase(data, a.id, range));
  for (const c of data.campaigns) {
    if (c.advantageState === "ADVANTAGE_PLUS" && c.objective === "SALES") {
      const b = campaignBase(data, c.id, range);
      const k = 0.35;
      total = addBase(total, Object.fromEntries(Object.entries(b).map(([key, v]) => [key, v * k])) as BaseMetrics);
    }
  }
  return total;
}

export function productMetrics(data: MetaAccountData, range: DateRange): Map<string, Metrics> {
  const live = data.products.filter((p) => p.availability === "IN_STOCK" && p.status !== "REJECTED");
  const split = splitBase(catalogTraffic(data, range), live.map((p) => ({ key: p.id, share: p.share, efficiency: p.efficiency })));
  return new Map(data.products.map((p) => [p.id, derive(split[p.id] ?? EMPTY_BASE)]));
}

/** What fixing a product's issues changes: the patch the catalog feed would get. */
export function catalogFix(p: MetaProduct): MetaProduct {
  const fixable = p.issues.filter((i) => ["missing_category", "image_too_small", "missing_availability"].includes(i.code));
  if (!fixable.length) return p;
  const issues = p.issues.filter((i) => !fixable.includes(i));
  const next = { ...p, issues, availability: fixable.some((i) => i.code === "missing_availability") ? ("IN_STOCK" as const) : p.availability };
  return { ...next, status: issues.length ? ("ISSUES" as const) : ("ACTIVE" as const) };
}

// ─── Landing pages ──────────────────────────────────────────────────────────

export type LandingRow = { url: string; ads: number; base: BaseMetrics; metrics: Metrics; dropOff: number };

/** Link clicks that never became a landing page view, per destination. */
export function landingPageRows(data: MetaAccountData, range: DateRange, adSetIds?: string[], campaignId?: string): LandingRow[] {
  const byUrl = new Map<string, { ads: number; base: BaseMetrics }>();
  for (const ad of data.ads) {
    const set = data.adSets.find((s) => s.id === ad.adSetId);
    if (!set || ad.status === "ARCHIVED") continue;
    if (campaignId && set.campaignId !== campaignId) continue;
    if (adSetIds && !adSetIds.includes(set.id)) continue;
    const url = ad.link.replace(/\?.*$/, "");
    const cur = byUrl.get(url) ?? { ads: 0, base: EMPTY_BASE };
    byUrl.set(url, { ads: cur.ads + 1, base: addBase(cur.base, adBase(data, ad.id, range)) });
  }
  return [...byUrl.entries()]
    .map(([url, v]) => ({ url, ads: v.ads, base: v.base, metrics: derive(v.base), dropOff: v.base.linkClicks ? Math.max(0, 1 - v.base.landingPageViews / v.base.linkClicks) : 0 }))
    .sort((a, b) => b.base.spend - a.base.spend);
}

// ─── Forecast (budget planner) ──────────────────────────────────────────────

export type ForecastPoint = { budget: number; spend: number; results: number; value: number; reach: number };

/** Diminishing returns around the last 30 days. Learning-limited ad sets respond more to extra budget. */
export function forecastCampaign(data: MetaAccountData, campaignId: string, range: DateRange, dailyBudget: number): ForecastPoint {
  const base = campaignBase(data, campaignId, range);
  const days = Math.max(1, daysIn(range));
  const dailySpend = base.spend / days;
  const limited = data.adSets.some((s) => s.campaignId === campaignId && s.learning.phase === "LIMITED");
  const spend = Math.min(dailyBudget * 0.97, (limited ? 2.4 : 1.5) * Math.max(1, dailySpend));
  const ratio = spend / Math.max(1, dailySpend);
  const scale = Math.pow(ratio, limited ? 0.85 : 0.5);
  return {
    budget: dailyBudget,
    spend: spend * 30.4,
    results: (base.results / days) * scale * 30.4,
    value: (base.purchaseValue / days) * scale * 30.4,
    reach: (base.reach / days) * Math.pow(ratio, 0.7) * 30.4,
  };
}

/** Opportunity score: the account's base score plus the points of every applied opportunity. */
export function opportunityScore(data: MetaAccountData): number {
  const gained = data.opportunities.filter((o) => o.status === "APPLIED").reduce((s, o) => s + o.scoreGain, 0);
  return Math.min(100, data.account.opportunityScore + gained);
}

// --- Ad detail --------------------------------------------------------------

/** Per-placement results of one ad: the ad's traffic split by the placements of its ad set. */
export function adPlacementRows(data: MetaAccountData, adId: string, range: DateRange): SegmentRow[] {
  const ad = data.ads.find((a) => a.id === adId);
  const set = ad && data.adSets.find((s) => s.id === ad.adSetId);
  if (!ad || !set) return [];
  const keys = placementsOf(set);
  const parts: Part[] = keys.map((k) => ({ key: k, share: PLACEMENT_PROFILE[k].share, efficiency: PLACEMENT_PROFILE[k].efficiency }));
  const split = splitBase(adBase(data, adId, range), parts);
  return parts
    .map((p) => ({ key: p.key, label: placementLabel(p.key as PlacementKey), base: split[p.key], metrics: derive(split[p.key]) }))
    .sort((a, b) => b.base.spend - a.base.spend);
}

export type AssetRow = { key: string; kind: "Image" | "Video" | "Text" | "Headline"; label: string; base: BaseMetrics; metrics: Metrics; label2?: string };

/** Asset-level performance: each image, video, text and headline of the ad gets a share of its results. Mock-only split, stable per asset. */
export function adAssetRows(data: MetaAccountData, adId: string, range: DateRange): AssetRow[] {
  const ad = data.ads.find((a) => a.id === adId);
  if (!ad) return [];
  const total = adBase(data, adId, range);
  const items: { key: string; kind: AssetRow["kind"]; label: string }[] = [
    ...ad.mediaIds.map((id) => ({ key: id, kind: (data.creatives.find((c) => c.id === id)?.kind === "VIDEO" ? "Video" : "Image") as AssetRow["kind"], label: data.creatives.find((c) => c.id === id)?.name ?? id })),
    ...ad.primaryTexts.map((t, i) => ({ key: `t${i}`, kind: "Text" as const, label: t })),
    ...ad.headlines.map((t, i) => ({ key: `h${i}`, kind: "Headline" as const, label: t })),
  ];
  const out: AssetRow[] = [];
  for (const kind of ["Image", "Video", "Text", "Headline"] as const) {
    const group = items.filter((i) => i.kind === kind);
    if (!group.length) continue;
    const parts: Part[] = group.map((g) => {
      const h = hashOf(`${adId}:${g.key}`);
      return { key: g.key, share: 1 + (h % 70) / 100, efficiency: 0.7 + ((h >> 8) % 70) / 100 };
    });
    const split = splitBase(total, parts);
    for (const g of group) out.push({ key: g.key, kind, label: g.label, base: split[g.key], metrics: derive(split[g.key]) });
  }
  return out;
}


/** Per-placement results of one ad set. */
export function adPlacementRowsForSet(data: MetaAccountData, set: AdSet, range: DateRange): SegmentRow[] {
  const keys = placementsOf(set);
  const parts: Part[] = keys.map((k) => ({ key: k, share: PLACEMENT_PROFILE[k].share, efficiency: PLACEMENT_PROFILE[k].efficiency }));
  const split = splitBase(adSetBase(data, set.id, range), parts);
  return parts
    .map((p) => ({ key: p.key, label: placementLabel(p.key as PlacementKey), base: split[p.key], metrics: derive(split[p.key]) }))
    .sort((a, b) => b.base.spend - a.base.spend);
}
