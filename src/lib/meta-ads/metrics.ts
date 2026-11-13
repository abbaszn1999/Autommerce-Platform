import { ATTRIBUTION_FACTOR, DATE_PRESETS } from "./constants";
import type { AttributionSetting, BaseMetrics, DateRange, DateRangePreset, MetaAccountData, MetaDailyPoint, MetaCampaign, MetricKey, Metrics } from "./types";

// Formatting is the same as Google Ads.
export { money, num, pct, delta, isoDay, addDays } from "@/lib/google-ads/metrics";
import { addDays, isoDay, num, money, pct } from "@/lib/google-ads/metrics";

export const EMPTY_BASE: BaseMetrics = {
  spend: 0,
  impressions: 0,
  reach: 0,
  linkClicks: 0,
  landingPageViews: 0,
  results: 0,
  purchases: 0,
  purchaseValue: 0,
  leads: 0,
  addToCart: 0,
  video3s: 0,
  thruPlays: 0,
  engagements: 0,
};

const BASE_KEYS = Object.keys(EMPTY_BASE) as (keyof BaseMetrics)[];

/** Fields that follow traffic; the rest follow conversion efficiency. */
const CONVERSION_KEYS: (keyof BaseMetrics)[] = ["results", "purchases", "purchaseValue", "leads", "addToCart"];

export function addBase(a: BaseMetrics, b: BaseMetrics): BaseMetrics {
  const out = { ...EMPTY_BASE };
  for (const k of BASE_KEYS) out[k] = a[k] + b[k];
  return out;
}

export function scaleBase(b: BaseMetrics, factor: number): BaseMetrics {
  const out = { ...EMPTY_BASE };
  for (const k of BASE_KEYS) out[k] = b[k] * factor;
  return out;
}

export function derive(base: BaseMetrics): Metrics {
  return {
    ...base,
    cpm: base.impressions ? (base.spend / base.impressions) * 1000 : 0,
    frequency: base.reach ? base.impressions / base.reach : 0,
    ctr: base.impressions ? base.linkClicks / base.impressions : 0,
    cpc: base.linkClicks ? base.spend / base.linkClicks : 0,
    costPerResult: base.results ? base.spend / base.results : 0,
    roas: base.spend ? base.purchaseValue / base.spend : 0,
    cpl: base.leads ? base.spend / base.leads : 0,
    costPerLpv: base.landingPageViews ? base.spend / base.landingPageViews : 0,
    hookRate: base.impressions ? base.video3s / base.impressions : 0,
    holdRate: base.video3s ? base.thruPlays / base.video3s : 0,
  };
}

// ─── Dates ──────────────────────────────────────────────────────────────────

/** Reports end yesterday: today's data is incomplete. */
export function rangeFor(preset: DateRangePreset, today = isoDay(new Date()), attribution: AttributionSetting = "CLICK_7_VIEW_1"): DateRange {
  const end = addDays(today, -1);
  const start = addDays(end, -(DATE_PRESETS[preset].days - 1));
  return { preset, start, end, attribution };
}

export function previousRange(range: DateRange): DateRange {
  const days = DATE_PRESETS[range.preset].days;
  return { ...range, start: addDays(range.start, -days), end: addDays(range.start, -1) };
}

export function formatRange(range: DateRange): string {
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(range.start)} – ${fmt(range.end)}`;
}

export const daysIn = (range: DateRange) => Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86_400_000) + 1;

// ─── Aggregation ────────────────────────────────────────────────────────────

/** People reached overlap between days, so reach over a long range is less than the sum of daily reach. */
const reachOverlap = (days: number) => 1 / (1 + 0.04 * (days - 1));

function sumDaily(points: MetaDailyPoint[] | undefined, range: DateRange): BaseMetrics {
  if (!points) return EMPTY_BASE;
  let total = EMPTY_BASE;
  let days = 0;
  for (const p of points) {
    if (p.date >= range.start && p.date <= range.end) {
      total = addBase(total, p);
      if (p.impressions > 0) days++;
    }
  }
  return days > 1 ? { ...total, reach: total.reach * reachOverlap(days) } : total;
}

/** How much of the 7-day-click-1-day-view conversions the chosen attribution setting reports. */
export function attributionFactor(range: DateRange): number {
  return ATTRIBUTION_FACTOR[range.attribution ?? "CLICK_7_VIEW_1"];
}

/** Attribution only changes conversion fields, and only for campaigns that optimize for conversions. */
function attributed(base: BaseMetrics, campaign: MetaCampaign | undefined, range: DateRange): BaseMetrics {
  const f = attributionFactor(range);
  if (f === 1) return base;
  const out = { ...base };
  for (const k of CONVERSION_KEYS) {
    if (k === "results" && campaign?.objective !== "SALES") continue;
    if (k === "leads" && campaign?.objective === "LEADS") continue; // instant form leads are not attributed
    out[k] = base[k] * f;
  }
  return out;
}

export function campaignBase(data: MetaAccountData, campaignId: string, range: DateRange): BaseMetrics {
  const campaign = data.campaigns.find((c) => c.id === campaignId);
  return attributed(sumDaily(data.daily[campaignId], range), campaign, range);
}

/**
 * Split a parent's metrics across children by traffic share; conversions also
 * follow each child's efficiency so totals still add up to the parent.
 */
function split(parent: BaseMetrics, children: { id: string; share: number; efficiency: number }[], id: string): BaseMetrics {
  const totalShare = children.reduce((s, c) => s + c.share, 0) || 1;
  const totalConv = children.reduce((s, c) => s + c.share * c.efficiency, 0) || 1;
  const me = children.find((c) => c.id === id);
  if (!me) return EMPTY_BASE;
  const traffic = me.share / totalShare;
  const conv = (me.share * me.efficiency) / totalConv;
  const out = { ...EMPTY_BASE };
  for (const k of BASE_KEYS) out[k] = parent[k] * (CONVERSION_KEYS.includes(k) ? conv : traffic);
  return out;
}

function weightOf(data: MetaAccountData, id: string) {
  return { id, ...(data.weights[id] ?? { share: 1, efficiency: 1 }) };
}

/** Ad sets that deliver: not archived, and their campaign is not archived. */
function liveAdSets(data: MetaAccountData, campaignId: string) {
  return data.adSets.filter((s) => s.campaignId === campaignId && s.status !== "ARCHIVED");
}

export function adSetBase(data: MetaAccountData, adSetId: string, range: DateRange): BaseMetrics {
  const set = data.adSets.find((s) => s.id === adSetId);
  if (!set) return EMPTY_BASE;
  return split(campaignBase(data, set.campaignId, range), liveAdSets(data, set.campaignId).map((s) => weightOf(data, s.id)), adSetId);
}

export function adBase(data: MetaAccountData, adId: string, range: DateRange): BaseMetrics {
  const ad = data.ads.find((a) => a.id === adId);
  if (!ad || ad.status !== "ACTIVE" || ad.review === "REJECTED") return EMPTY_BASE;
  const siblings = data.ads.filter((a) => a.adSetId === ad.adSetId && a.status === "ACTIVE" && a.review !== "REJECTED");
  return split(adSetBase(data, ad.adSetId, range), siblings.map((a) => weightOf(data, a.id)), adId);
}

export function accountBase(data: MetaAccountData, range: DateRange, campaignIds?: string[]): BaseMetrics {
  const ids = campaignIds ?? data.campaigns.map((c) => c.id);
  return ids.reduce((sum, id) => addBase(sum, campaignBase(data, id, range)), EMPTY_BASE);
}

/** Daily totals across the given campaigns, for charts. */
export function dailySeries(data: MetaAccountData, range: DateRange, campaignIds?: string[]): (Metrics & { date: string })[] {
  const ids = campaignIds ?? data.campaigns.map((c) => c.id);
  const byDate = new Map<string, BaseMetrics>();
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) byDate.set(d, EMPTY_BASE);
  for (const id of ids) {
    const campaign = data.campaigns.find((c) => c.id === id);
    for (const p of data.daily[id] ?? []) {
      const cur = byDate.get(p.date);
      if (cur) byDate.set(p.date, addBase(cur, attributed(p, campaign, range)));
    }
  }
  return [...byDate.entries()].map(([date, base]) => ({ date, ...derive(base) }));
}

// ─── Metric catalogue ───────────────────────────────────────────────────────

export const METRICS: Record<
  MetricKey,
  { label: string; short: string; format: (v: number, currency: string) => string; higherIsBetter: boolean; color: string; conversion?: boolean }
> = {
  spend: { label: "Amount spent", short: "Spent", format: (v, c) => money(v, c, { compact: true }), higherIsBetter: false, color: "#dc2626" },
  impressions: { label: "Impressions", short: "Impr.", format: (v) => num(v, { compact: true }), higherIsBetter: true, color: "#0d9488" },
  reach: { label: "Reach", short: "Reach", format: (v) => num(v, { compact: true }), higherIsBetter: true, color: "#0891b2" },
  linkClicks: { label: "Link clicks", short: "Link clicks", format: (v) => num(v, { compact: true }), higherIsBetter: true, color: "#2563eb" },
  landingPageViews: { label: "Landing page views", short: "LPVs", format: (v) => num(v, { compact: true }), higherIsBetter: true, color: "#4f46e5" },
  results: { label: "Results", short: "Results", format: (v) => num(v, { compact: true }), higherIsBetter: true, color: "#400095" },
  purchases: { label: "Purchases", short: "Purchases", format: (v) => num(v, { compact: true }), higherIsBetter: true, color: "#7c3aed", conversion: true },
  purchaseValue: { label: "Purchase value", short: "Purchase value", format: (v, c) => money(v, c, { compact: true }), higherIsBetter: true, color: "#F76D01", conversion: true },
  leads: { label: "Leads", short: "Leads", format: (v) => num(v, { compact: true }), higherIsBetter: true, color: "#16a34a" },
  addToCart: { label: "Adds to cart", short: "ATC", format: (v) => num(v, { compact: true }), higherIsBetter: true, color: "#ca8a04", conversion: true },
  video3s: { label: "3-second plays", short: "3s plays", format: (v) => num(v, { compact: true }), higherIsBetter: true, color: "#db2777" },
  thruPlays: { label: "ThruPlays", short: "ThruPlays", format: (v) => num(v, { compact: true }), higherIsBetter: true, color: "#be185d" },
  engagements: { label: "Post engagements", short: "Engagements", format: (v) => num(v, { compact: true }), higherIsBetter: true, color: "#0ea5e9" },
  cpm: { label: "CPM", short: "CPM", format: (v, c) => money(v, c, { decimals: 2 }), higherIsBetter: false, color: "#ea580c" },
  frequency: { label: "Frequency", short: "Freq.", format: (v) => v.toFixed(2), higherIsBetter: false, color: "#f59e0b" },
  ctr: { label: "CTR (link)", short: "CTR", format: (v) => pct(v), higherIsBetter: true, color: "#7c3aed" },
  cpc: { label: "CPC (link)", short: "CPC", format: (v, c) => money(v, c, { decimals: 2 }), higherIsBetter: false, color: "#0891b2" },
  costPerResult: { label: "Cost per result", short: "Cost/result", format: (v, c) => money(v, c, { decimals: 2 }), higherIsBetter: false, color: "#c2410c" },
  roas: { label: "Purchase ROAS", short: "ROAS", format: (v) => `${v.toFixed(2)}x`, higherIsBetter: true, color: "#c026d3", conversion: true },
  cpl: { label: "Cost per lead", short: "CPL", format: (v, c) => money(v, c, { decimals: 2 }), higherIsBetter: false, color: "#15803d" },
  costPerLpv: { label: "Cost per LPV", short: "Cost/LPV", format: (v, c) => money(v, c, { decimals: 2 }), higherIsBetter: false, color: "#4338ca" },
  hookRate: { label: "Hook rate (3s plays / impr.)", short: "Hook rate", format: (v) => pct(v, 1), higherIsBetter: true, color: "#e11d48" },
  holdRate: { label: "Hold rate (ThruPlays / 3s plays)", short: "Hold rate", format: (v) => pct(v, 1), higherIsBetter: true, color: "#9d174d" },
};

export function formatMetric(key: MetricKey, value: number, currency: string): string {
  return METRICS[key].format(value, currency);
}