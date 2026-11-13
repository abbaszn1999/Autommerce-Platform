// Organic (unpaid) performance of Page and Instagram posts over a date range. The real numbers come
// from the Page and Instagram Insights APIs; the shape stays the same.

import { addDays } from "./metrics";
import type { DateRange, OrganicPost, PostFormat } from "./types";

export type OrganicTotals = {
  posts: number;
  reach: number;
  impressions: number;
  plays: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  /** Likes, comments, shares and saves. */
  interactions: number;
  /** Interactions per person reached. */
  engagementRate: number;
};

export const interactionsOf = (p: OrganicPost) => (p.metrics ? p.metrics.likes + p.metrics.comments + p.metrics.shares + p.metrics.saves : 0);

/** Published posts whose publish day falls inside the range. */
export function publishedIn(posts: OrganicPost[], range: Pick<DateRange, "start" | "end">): OrganicPost[] {
  return posts.filter((p) => p.status === "PUBLISHED" && p.metrics && p.publishAt.slice(0, 10) >= range.start && p.publishAt.slice(0, 10) <= range.end);
}

export function organicTotals(posts: OrganicPost[], range: Pick<DateRange, "start" | "end">): OrganicTotals {
  const list = publishedIn(posts, range);
  const sum = (f: (p: OrganicPost) => number) => list.reduce((t, p) => t + f(p), 0);
  const reach = sum((p) => p.metrics!.reach);
  const interactions = sum(interactionsOf);
  return {
    posts: list.length,
    reach,
    impressions: sum((p) => p.metrics!.impressions),
    plays: sum((p) => p.metrics!.plays ?? 0),
    likes: sum((p) => p.metrics!.likes),
    comments: sum((p) => p.metrics!.comments),
    shares: sum((p) => p.metrics!.shares),
    saves: sum((p) => p.metrics!.saves),
    interactions,
    engagementRate: reach ? interactions / reach : 0,
  };
}

/** One value per day of the range (zero on days without a post), for sparklines. */
export function organicDaily(posts: OrganicPost[], range: Pick<DateRange, "start" | "end">, pick: (p: OrganicPost) => number): { date: string; value: number }[] {
  const byDay = new Map<string, number>();
  for (const p of publishedIn(posts, range)) byDay.set(p.publishAt.slice(0, 10), (byDay.get(p.publishAt.slice(0, 10)) ?? 0) + pick(p));
  const out: { date: string; value: number }[] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push({ date: d, value: byDay.get(d) ?? 0 });
  return out;
}

export type FormatStat = { format: PostFormat; posts: number; avgReach: number; engagementRate: number };

/** How each format performs on average: reach per post and engagement rate. Best reach first. */
export function formatStats(posts: OrganicPost[], range: Pick<DateRange, "start" | "end">): FormatStat[] {
  const groups = new Map<PostFormat, OrganicPost[]>();
  for (const p of publishedIn(posts, range)) groups.set(p.format, [...(groups.get(p.format) ?? []), p]);
  return [...groups.entries()]
    .map(([format, list]) => {
      const reach = list.reduce((t, p) => t + p.metrics!.reach, 0);
      return { format, posts: list.length, avgReach: reach / list.length, engagementRate: reach ? list.reduce((t, p) => t + interactionsOf(p), 0) / reach : 0 };
    })
    .sort((a, b) => b.avgReach - a.avgReach);
}

/** Posts that earned the most interactions in the range. */
export function topPosts(posts: OrganicPost[], range: Pick<DateRange, "start" | "end">, limit = 5): OrganicPost[] {
  return [...publishedIn(posts, range)].sort((a, b) => interactionsOf(b) - interactionsOf(a)).slice(0, limit);
}
