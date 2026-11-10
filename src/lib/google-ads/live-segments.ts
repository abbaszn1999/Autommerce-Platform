// Breakdowns of a live account (device, hour, network, age, gender, location,
// landing pages) as Google reports them. Pure: no network, so it is unit tested
// with sample rows. Each is its own query, loaded when a page first needs it.

import { addDays, EMPTY_BASE, addBase, derive, isoDay } from "./metrics";
import { assertIsoDay } from "./live-queries";
import type { GaqlRow } from "./live-report";
import type { BaseMetrics, SegmentKey } from "./types";

export const LIVE_SEGMENTS = ["device", "hour", "network", "age", "gender", "country", "landing"] as const;
export type LiveSegment = (typeof LIVE_SEGMENTS)[number];

export const isLiveSegment = (value: string): value is LiveSegment => (LIVE_SEGMENTS as readonly string[]).includes(value);

/** One value of a breakdown within one campaign. */
export type SegmentCell = {
  campaignId: string;
  key: string;
  label: string;
  base: BaseMetrics;
  /** Landing pages: Google's mobile speed score, 1 (slow) to 10 (fast). */
  speed?: number;
};

const METRICS = "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value";

/** Removed campaigns are included: their spend is part of the account's real total. */
export function segmentQuery(segment: LiveSegment, start: string, end: string): string {
  const when = `segments.date BETWEEN '${assertIsoDay(start)}' AND '${assertIsoDay(end)}'`;
  switch (segment) {
    case "device":
      return `SELECT campaign.id, segments.device, ${METRICS} FROM campaign WHERE ${when}`;
    case "hour":
      return `SELECT campaign.id, segments.hour, ${METRICS} FROM campaign WHERE ${when}`;
    case "network":
      return `SELECT campaign.id, segments.ad_network_type, ${METRICS} FROM campaign WHERE ${when}`;
    case "age":
      return `SELECT campaign.id, ad_group_criterion.age_range.type, ${METRICS} FROM age_range_view WHERE ${when}`;
    case "gender":
      return `SELECT campaign.id, ad_group_criterion.gender.type, ${METRICS} FROM gender_view WHERE ${when}`;
    case "country":
      return `SELECT campaign.id, geographic_view.country_criterion_id, geographic_view.location_type, ${METRICS} FROM geographic_view WHERE ${when}`;
    case "landing":
      return `SELECT campaign.id, landing_page_view.unexpanded_final_url, metrics.speed_score, ${METRICS} FROM landing_page_view WHERE ${when}`;
  }
}

const DEVICES: Record<string, string> = { MOBILE: "Mobile phones", DESKTOP: "Computers", TABLET: "Tablets", CONNECTED_TV: "TV screens", OTHER: "Other" };
const AGES: Record<string, string> = {
  AGE_RANGE_18_24: "18–24",
  AGE_RANGE_25_34: "25–34",
  AGE_RANGE_35_44: "35–44",
  AGE_RANGE_45_54: "45–54",
  AGE_RANGE_55_64: "55–64",
  AGE_RANGE_65_UP: "65+",
  AGE_RANGE_UNDETERMINED: "Unknown",
};
const GENDERS: Record<string, string> = { FEMALE: "Female", MALE: "Male", UNDETERMINED: "Unknown" };
const NETWORKS: Record<string, string> = {
  SEARCH: "Google Search",
  SEARCH_PARTNERS: "Search partners",
  CONTENT: "Display Network",
  YOUTUBE: "YouTube",
  DISCOVER: "Discover",
  GMAIL: "Gmail",
  MAPS: "Google Maps",
  GOOGLE_TV: "Google TV",
  GOOGLE_OWNED_CHANNELS: "Google owned channels",
  MIXED: "Mixed (not split by Google)",
};

const FIXED_ORDER: Partial<Record<LiveSegment, string[]>> = {
  device: Object.values(DEVICES),
  age: Object.values(AGES),
  gender: Object.values(GENDERS),
};

const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);

function baseOf(row: GaqlRow): BaseMetrics {
  const m = row.metrics ?? {};
  return { impressions: num(m.impressions), clicks: num(m.clicks), cost: num(m.costMicros) / 1_000_000, conversions: num(m.conversions), conversionsValue: num(m.conversionsValue) };
}

function identify(segment: LiveSegment, row: GaqlRow, names: Record<string, string>): { key: string; label: string } {
  const named = (value: unknown, labels: Record<string, string>, otherwise: string) => {
    const label = labels[String(value)] ?? otherwise;
    return { key: label, label };
  };
  switch (segment) {
    case "device":
      return named(row.segments?.device, DEVICES, "Other");
    case "hour": {
      const hour = String(num(row.segments?.hour));
      return { key: hour, label: `${hour.padStart(2, "0")}:00` };
    }
    case "network":
      return named(row.segments?.adNetworkType, NETWORKS, "Other");
    case "age":
      return named(row.adGroupCriterion?.ageRange?.type, AGES, "Unknown");
    case "gender":
      return named(row.adGroupCriterion?.gender?.type, GENDERS, "Unknown");
    case "country": {
      const id = String(row.geographicView?.countryCriterionId ?? "");
      return id && names[id] ? { key: id, label: names[id] } : { key: "unknown", label: "Unknown location" };
    }
    case "landing": {
      const url = String(row.landingPageView?.unexpandedFinalUrl ?? "");
      return { key: url, label: url };
    }
  }
}

/** Google's rows, one cell per campaign and value (a report can return several rows for one). */
export function cellsFromRows(segment: LiveSegment, rows: GaqlRow[], names: Record<string, string> = {}): SegmentCell[] {
  const cells = new Map<string, SegmentCell>();
  for (const row of rows) {
    const campaignId = String(row.campaign?.id ?? "");
    const { key, label } = identify(segment, row, names);
    if (!campaignId || !key) continue;
    const id = `${campaignId}~${key}`;
    const cell = cells.get(id) ?? { campaignId, key, label, base: EMPTY_BASE };
    const speed = num(row.metrics?.speedScore);
    cells.set(id, { ...cell, base: addBase(cell.base, baseOf(row)), ...(speed > 0 ? { speed } : {}) });
  }
  return [...cells.values()];
}

export type LiveSegmentRow = { key: string; label: string; base: BaseMetrics; metrics: ReturnType<typeof derive>; speed?: number };

/**
 * One row per value for the chosen campaigns (all of them when none are given).
 * Every hour of the day is listed, so a quiet hour shows as zero, not as missing.
 */
export function rowsFromCells(segment: LiveSegment, cells: SegmentCell[], campaignIds?: readonly string[]): LiveSegmentRow[] {
  const wanted = campaignIds ? new Set(campaignIds) : null;
  const rows = new Map<string, { label: string; base: BaseMetrics; speed?: number }>();
  if (segment === "hour") for (let h = 0; h < 24; h++) rows.set(String(h), { label: `${String(h).padStart(2, "0")}:00`, base: EMPTY_BASE });
  for (const cell of cells) {
    if (wanted && !wanted.has(cell.campaignId)) continue;
    const row = rows.get(cell.key) ?? { label: cell.label, base: EMPTY_BASE };
    rows.set(cell.key, { label: row.label, base: addBase(row.base, cell.base), speed: cell.speed ?? row.speed });
  }
  const list = [...rows.entries()].map(([key, r]) => ({ key, label: r.label, base: r.base, metrics: derive(r.base), ...(r.speed ? { speed: r.speed } : {}) }));
  if (segment === "hour") return list.sort((a, b) => Number(a.key) - Number(b.key));
  const order = FIXED_ORDER[segment];
  if (order) return list.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  return list.sort((a, b) => b.base.cost - a.base.cost);
}

/** Dates a live report may ask for. The account's day can be ahead of the server's. */
export function isValidLiveRange(start: string, end: string, now = new Date()): boolean {
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  return DAY.test(start) && DAY.test(end) && start <= end && end <= addDays(isoDay(now), 1) && start >= addDays(end, -365);
}

/** The breakdowns the page draws from Google rather than from daily totals. */
export const isGoogleBreakdown = (segment: SegmentKey): segment is SegmentKey & LiveSegment => isLiveSegment(segment);
