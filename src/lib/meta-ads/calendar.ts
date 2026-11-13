import { addDays } from "@/lib/google-ads/metrics";
import { OBJECTIVES } from "./constants";
import type { MetaAccountData, MetaBudget, MetaScope, MutateOp, NewAd, OrganicPost, ProposedChange } from "./types";

// The calendar lays campaigns, ad sets and experiments out as "flights": bars from a start date to an end date.
// Everything here is pure so the page only has to draw it.

export type FlightKind = "CAMPAIGN" | "AD_SET" | "AD" | "EXPERIMENT";

/** How a flight is drawn: running, approved but not started yet, paused, still waiting for approval, or over. */
export type FlightState = "ACTIVE" | "SCHEDULED" | "PAUSED" | "DRAFT" | "ENDED";

export type PreviewAd = NewAd & { key: string };

export type Flight = {
  id: string;
  kind: FlightKind;
  name: string;
  /** First day, YYYY-MM-DD. */
  start: string;
  /** Last day (inclusive). Missing means the flight has no end date. */
  end?: string;
  state: FlightState;
  /** Short line under the name: objective, experiment type, "New ad set". */
  detail: string;
  campaignId?: string;
  adSetId?: string;
  /** The ads to preview when the bar is opened. */
  ads: PreviewAd[];
};

const toPreview = (a: NewAd & { id?: string }, fallback: string): PreviewAd => ({ ...a, key: a.id ?? fallback });

const day = (iso: string | undefined) => (iso ? iso.slice(0, 10) : undefined);

const maxDay = (days: (string | undefined)[]): string | undefined => {
  const real = days.filter((d): d is string => !!d);
  return real.length ? real.reduce((a, b) => (a > b ? a : b)) : undefined;
};

function stateOf(status: string, start: string | undefined, end: string | undefined, today: string): FlightState {
  if (end && end < today) return "ENDED";
  if (status !== "ACTIVE") return "PAUSED";
  return start && start > today ? "SCHEDULED" : "ACTIVE";
}

/** Pending changes that would add something to the account: they show as dashed bars. */
function pendingOps(changes: ProposedChange[]): MutateOp[] {
  return changes.filter((c) => c.status === "PENDING").flatMap((c) => c.ops);
}

export function buildFlights(data: MetaAccountData, scope: MetaScope, pending: ProposedChange[], today: string): Flight[] {
  const flights: Flight[] = [];
  const ops = pendingOps(pending);
  const liveSets = data.adSets.filter((s) => s.status !== "ARCHIVED" && data.campaigns.find((c) => c.id === s.campaignId)?.status !== "ARCHIVED");
  const adsOfSet = (id: string) => data.ads.filter((a) => a.adSetId === id && a.status !== "ARCHIVED").map((a) => toPreview(a, a.id));

  if (scope.adSetId) {
    const s = data.adSets.find((x) => x.id === scope.adSetId);
    if (!s) return [];
    const end = day(s.endDate);
    flights.push({ id: s.id, kind: "AD_SET", name: s.name, start: day(s.startDate)!, end, state: stateOf(s.status, day(s.startDate), end, today), detail: "Ad set", campaignId: s.campaignId, adSetId: s.id, ads: adsOfSet(s.id) });
    for (const a of data.ads.filter((x) => x.adSetId === s.id && x.status !== "ARCHIVED")) {
      // An ad runs from the day it was made (or its ad set starts, when that is later) until its ad set ends.
      const start = maxDay([day(a.createdAt), day(s.startDate)])!;
      flights.push({ id: a.id, kind: "AD", name: a.name, start, end, state: stateOf(a.status, start, end, today), detail: "Ad", campaignId: s.campaignId, adSetId: s.id, ads: [toPreview(a, a.id)] });
    }
    for (const op of ops) {
      if (op.kind !== "ad.create") continue;
      for (const a of op.ads.filter((x) => x.adSetId === s.id)) flights.push({ id: a.id, kind: "AD", name: a.name, start: today, end, state: "DRAFT", detail: "New ad, waiting for approval", campaignId: s.campaignId, adSetId: s.id, ads: [toPreview(a, a.id)] });
    }
    return flights;
  }

  if (scope.campaignId) {
    const c = data.campaigns.find((x) => x.id === scope.campaignId);
    if (!c) return [];
    for (const s of liveSets.filter((x) => x.campaignId === c.id)) {
      const end = day(s.endDate) ?? day(c.stopDate);
      flights.push({ id: s.id, kind: "AD_SET", name: s.name, start: day(s.startDate)!, end, state: stateOf(s.status, day(s.startDate), end, today), detail: "Ad set", campaignId: c.id, adSetId: s.id, ads: adsOfSet(s.id) });
    }
    for (const op of ops) {
      if (op.kind === "adSet.create" && op.adSet.campaignId === c.id) {
        flights.push({ id: op.adSet.id, kind: "AD_SET", name: op.adSet.name, start: day(op.adSet.startDate)!, end: day(op.adSet.endDate), state: "DRAFT", detail: "New ad set, waiting for approval", campaignId: c.id, adSetId: op.adSet.id, ads: op.ads.map((a, i) => toPreview(a, `${op.adSet.id}_${i}`)) });
      }
    }
  } else {
    for (const c of data.campaigns.filter((x) => x.status !== "ARCHIVED")) {
      const sets = liveSets.filter((s) => s.campaignId === c.id);
      // A campaign with one open-ended ad set keeps running, so it only closes when it has a stop date or every ad set has an end.
      const end = day(c.stopDate) ?? (sets.length && sets.every((s) => s.endDate) ? maxDay(sets.map((s) => day(s.endDate))) : undefined);
      flights.push({
        id: c.id,
        kind: "CAMPAIGN",
        name: c.name,
        start: day(c.startDate)!,
        end,
        state: stateOf(c.status, day(c.startDate), end, today),
        detail: OBJECTIVES[c.objective].label,
        campaignId: c.id,
        ads: sets.flatMap((s) => adsOfSet(s.id)),
      });
    }
    for (const op of ops) {
      if (op.kind !== "campaign.create") continue;
      const b = op.bundle;
      flights.push({ id: `draft_${b.campaign.name}`, kind: "CAMPAIGN", name: b.campaign.name, start: day(b.campaign.startDate) ?? today, end: day(b.campaign.stopDate), state: "DRAFT", detail: `${OBJECTIVES[b.campaign.objective].label} · waiting for approval`, ads: b.adSets.flatMap((g, i) => g.ads.map((a, j) => toPreview(a, `draft_${i}_${j}`))) });
    }
  }

  // Experiments sit in their own lane. They follow the scope when they point at a campaign or ad set.
  const inScope = (campaignId?: string, adSetId?: string) => {
    if (scope.adSetId) return adSetId === scope.adSetId;
    if (scope.campaignId) return campaignId === scope.campaignId || (!!adSetId && data.adSets.find((s) => s.id === adSetId)?.campaignId === scope.campaignId);
    return true;
  };
  if (!scope.adSetId) {
    for (const t of data.abTests) {
      if (!t.cells.some((cell) => inScope(cell.campaignId, cell.adSetId))) continue;
      flights.push({ id: t.id, kind: "EXPERIMENT", name: t.name, start: day(t.startDate)!, end: day(t.endDate), state: t.status === "DRAFT" ? "DRAFT" : t.status === "RUNNING" ? "ACTIVE" : "ENDED", detail: "A/B test", ads: [] });
    }
    for (const l of data.liftStudies) {
      if (scope.campaignId ? !l.campaignIds.includes(scope.campaignId) : false) continue;
      flights.push({ id: l.id, kind: "EXPERIMENT", name: l.name, start: day(l.startDate)!, end: day(l.endDate), state: l.status === "PLANNED" ? "SCHEDULED" : l.status === "RUNNING" ? "ACTIVE" : "ENDED", detail: l.kind === "BRAND_LIFT" ? "Brand lift study" : "Conversion lift study", ads: [] });
    }
  }
  return flights;
}

// ─── Month layout ───────────────────────────────────────────────────────────

export type Bar = {
  flight: Flight;
  /** 0 to 6, Monday first. */
  col: number;
  span: number;
  lane: number;
  /** The flight carries on before / after this week. */
  fromPrev: boolean;
  toNext: boolean;
  /** No end date: draw the right edge faded. */
  open: boolean;
};

export type Week = { days: string[]; bars: Bar[]; lanes: number };

export const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;

export function shiftMonth(month: string, delta: number): string {
  const d = new Date(`${firstOfMonth(month)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

export const monthLabel = (month: string) => new Date(`${firstOfMonth(month)}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** Monday of the week that holds the day. */
export const weekStart = (iso: string) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));

const byDate = (a: Flight, b: Flight) => a.start.localeCompare(b.start) || (a.end ?? "9999").localeCompare(b.end ?? "9999") || a.name.localeCompare(b.name);

const STATE_RANK: Record<FlightState, number> = { DRAFT: 0, SCHEDULED: 1, ACTIVE: 2, PAUSED: 3, ENDED: 4 };

/** Lane order that keeps what needs attention on top: drafts, then scheduled, running, paused and ended. Experiments sit under ads in the same state. */
export const byPriority = (a: Flight, b: Flight) =>
  STATE_RANK[a.state] + (a.kind === "EXPERIMENT" ? 0.5 : 0) - (STATE_RANK[b.state] + (b.kind === "EXPERIMENT" ? 0.5 : 0)) || byDate(a, b);

/** Weeks (Monday to Sunday) that cover the month, each with its flight bars stacked in lanes. */
export function layoutMonth(flights: Flight[], month: string, order: (a: Flight, b: Flight) => number = byDate): Week[] {
  const first = firstOfMonth(month);
  const last = addDays(shiftMonth(first, 1), -1);
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  return layoutWeeks(flights, addDays(first, -lead), Math.ceil((lead + Number(last.slice(8, 10))) / 7), order);
}

/** `weekCount` weeks from a Monday, each with its flight bars stacked in lanes. */
export function layoutWeeks(flights: Flight[], gridStart: string, weekCount: number, order: (a: Flight, b: Flight) => number = byDate): Week[] {
  const sorted = [...flights].sort(order);
  return Array.from({ length: weekCount }, (_, w) => pack(sorted, Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i))));
}

/** Any run of days (the planner timeline) with its flight bars packed into lanes. */
export function layoutRange(flights: Flight[], from: string, dayCount: number, order: (a: Flight, b: Flight) => number = byDate): Week {
  return pack([...flights].sort(order), Array.from({ length: dayCount }, (_, i) => addDays(from, i)));
}

/** Greedy lane packing of already sorted flights over consecutive days: each bar takes the first lane that is free from its first day. */
function pack(sorted: Flight[], days: string[]): Week {
  const [from, to] = [days[0]!, days.at(-1)!];
  const last = days.length - 1;
  const laneEnds: number[] = [];
  const bars: Bar[] = [];
  for (const f of sorted) {
    const end = f.end ?? "9999-12-31";
    if (f.start > to || end < from) continue;
    const col = f.start > from ? days.indexOf(f.start) : 0;
    const endCol = end < to ? days.indexOf(end) : last;
    let lane = laneEnds.findIndex((e) => e < col);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = endCol;
    bars.push({ flight: f, col, span: endCol - col + 1, lane, fromPrev: f.start < from, toNext: end > to, open: !f.end });
  }
  return { days, bars, lanes: laneEnds.length };
}

/** What a flight spends: its own budget or, for a campaign without one, the sum of its ad sets. */
export function flightBudget(data: MetaAccountData, f: Flight): (MetaBudget & { fromAdSets?: boolean }) | undefined {
  const campaign = data.campaigns.find((c) => c.id === f.campaignId);
  const adSet = data.adSets.find((s) => s.id === f.adSetId);
  if (f.kind === "AD" || f.kind === "AD_SET") return adSet?.budget ?? campaign?.budget;
  if (f.kind !== "CAMPAIGN" || !campaign) return undefined;
  if (campaign.budget) return campaign.budget;
  const sets = data.adSets.filter((s) => s.campaignId === campaign.id && s.status !== "ARCHIVED" && s.budget);
  if (!sets.length) return undefined;
  const allDaily = sets.every((s) => s.budget!.kind === "DAILY");
  return { kind: allDaily ? "DAILY" : "LIFETIME", amount: sets.reduce((t, s) => t + s.budget!.amount, 0), fromAdSets: true };
}

/** How many days a flight runs in total, when it has an end. */
export const flightDays = (f: Pick<Flight, "start" | "end">) => (f.end ? Math.round((Date.parse(f.end) - Date.parse(f.start)) / 86_400_000) + 1 : undefined);

// ─── Organic posts ──────────────────────────────────────────────────────────

export const postDay = (p: Pick<OrganicPost, "publishAt">) => p.publishAt.slice(0, 10);
export const postTime = (p: Pick<OrganicPost, "publishAt">) => p.publishAt.slice(11, 16);

/** Posts between two days (inclusive), grouped by day and sorted by time. */
export function postsByDay(posts: OrganicPost[], from: string, to: string): Map<string, OrganicPost[]> {
  const out = new Map<string, OrganicPost[]>();
  for (const p of [...posts].sort((a, b) => a.publishAt.localeCompare(b.publishAt))) {
    const d = postDay(p);
    if (d < from || d > to) continue;
    out.set(d, [...(out.get(d) ?? []), p]);
  }
  return out;
}

export type AgendaDay = { day: string; posts: OrganicPost[]; starts: Flight[]; ends: Flight[] };

/** Day-by-day list of what happens: posts going out, and ads starting or ending. Empty days are left out. */
export function buildAgenda(flights: Flight[], posts: OrganicPost[], from: string, to: string): AgendaDay[] {
  const days = new Map<string, AgendaDay>();
  const at = (d: string) => {
    if (!days.has(d)) days.set(d, { day: d, posts: [], starts: [], ends: [] });
    return days.get(d)!;
  };
  for (const [d, list] of postsByDay(posts, from, to)) at(d).posts.push(...list);
  for (const f of [...flights].sort(byDate)) {
    if (f.start >= from && f.start <= to) at(f.start).starts.push(f);
    if (f.end && f.end >= from && f.end <= to) at(f.end).ends.push(f);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export type UpNextItem = { kind: "POST"; at: string; post: OrganicPost } | { kind: "START" | "END"; at: string; flight: Flight };

/** The next things on the calendar from today: posts waiting to go out, ads about to start and running ads about to end. */
export function upNext(flights: Flight[], posts: OrganicPost[], today: string, limit = 6): UpNextItem[] {
  const items: UpNextItem[] = [
    ...posts.filter((p) => (p.status === "SCHEDULED" || p.status === "DRAFT") && postDay(p) >= today).map((post) => ({ kind: "POST" as const, at: post.publishAt, post })),
    ...flights.filter((f) => f.start > today && f.state !== "ENDED").map((flight) => ({ kind: "START" as const, at: `${flight.start}T00:00`, flight })),
    ...flights.filter((f) => f.end && f.end >= today && f.state === "ACTIVE").map((flight) => ({ kind: "END" as const, at: `${flight.end}T23:59`, flight })),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at)).slice(0, limit);
}

/** "5 Oct → 24 Nov" style text for a flight. */
export function flightRange(f: Pick<Flight, "start" | "end">): string {
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${fmt(f.start)} → ${f.end ? fmt(f.end) : "no end date"}`;
}

// ─── Dates in plain words ───────────────────────────────────────────────────

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";

/** "2026-12-01", "20 Nov", "Nov 20", "tomorrow", "next week" or "next month" as a day. Past dates in words roll into next year. */
export function parseDateText(text: string, today: string): string | undefined {
  const t = text.toLowerCase();
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (iso) return iso;
  const dm = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b`));
  const md = t.match(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  const [d, mon] = dm ? [Number(dm[1]), dm[2]!] : md ? [Number(md[2]), md[1]!] : [0, ""];
  if (d >= 1 && d <= 31 && mon) {
    const month = String(MONTH_NAMES.indexOf(mon) + 1).padStart(2, "0");
    let year = Number(today.slice(0, 4));
    let out = `${year}-${month}-${String(d).padStart(2, "0")}`;
    if (out < today) out = `${++year}-${month}-${String(d).padStart(2, "0")}`;
    return out;
  }
  if (/\btomorrow\b/.test(t)) return addDays(today, 1);
  if (/\bnext week\b/.test(t)) return addDays(today, 7);
  if (/\bnext month\b/.test(t)) return addDays(today, 30);
  return undefined;
}

/** "by 2 weeks", "by 10 days" or "by a month" as a number of days. */
export function parseSpan(text: string): number | undefined {
  const m = text.toLowerCase().match(/\b(?:by|for|another)\s+(\d+|a|one|two|three|four)\s+(day|week|month)s?\b/);
  if (!m) return undefined;
  const n = ({ a: 1, one: 1, two: 2, three: 3, four: 4 } as Record<string, number>)[m[1]!] ?? Number(m[1]);
  return n * (m[2] === "day" ? 1 : m[2] === "week" ? 7 : 30);
}