// Loads a live account snapshot from Google Ads (through Composio) and keeps it
// for a short while so opening the page again doesn't spend the daily API quota.

import { addDays, rangeDays } from "./metrics";
import { ConnectionHttpError, searchGaql, searchGaqlAll, type ConnectionRow } from "./connection.server";
import { LIVE_QUERIES } from "./live-queries";
import { buildLiveAccount, type GaqlRow, type LiveRows } from "./live-report";
import { forgetSegments } from "./live-segments.server";
import { targetIds } from "./live-targeting";
import { STRUCTURE_QUERIES } from "./live-structure-queries";
import type { AccountData } from "./types";

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 100;
/**
 * Memory the cached accounts may use, counted in rows (a big account is ~400,000).
 * The server has little memory: a few big accounts, or many small ones, never more.
 */
// 200,000 suits the 512 MB server (a big account is then read fresh, not kept); raise it with GOOGLE_ADS_CACHE_ROWS on a bigger server.
const CACHE_ROWS = Number(process.env.GOOGLE_ADS_CACHE_ROWS) > 0 ? Number(process.env.GOOGLE_ADS_CACHE_ROWS) : 200_000;

type Weighted = { at: number; weight: number };
/** Keeps a cache under CACHE_ROWS rows in total, dropping the oldest entries first. */
function fit<T extends Weighted>(cache: Map<string, T>, key: string, entry: T, others: Map<string, Weighted>) {
  cache.delete(key);
  const total = () => [...cache.values(), ...others.values()].reduce((n, e) => n + e.weight, 0);
  while (cache.size && (cache.size >= CACHE_MAX || total() + entry.weight > CACHE_ROWS)) cache.delete(cache.keys().next().value!);
  // One account bigger than the whole budget is served, not kept.
  if (entry.weight <= CACHE_ROWS) cache.set(key, entry);
}
const rowsIn = (rows: Record<string, unknown[] | undefined>) => Object.values(rows).reduce((n, r) => n + (Array.isArray(r) ? r.length : 0), 0);
/** Campaign days always kept: the longest preset (90) plus the period it is compared with. */
const DAILY_DAYS = 180;

const cache = new Map<string, { at: number; data: AccountData; weight: number }>();
/** What doesn't depend on dates: kept separately, so changing the range doesn't load it again. */
const structureCache = new Map<string, { at: number; rows: Partial<LiveRows>; weight: number }>();

/** Without these the page has nothing true to show, so a failure stops the load. */
const REQUIRED = new Set<string>(["customer", "campaigns", "campaignDaily"]);

/** Google refuses bursts: at most this many queries of one account at a time. */
const PARALLEL = 6;

async function inBatches<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await run(items[i]).then((value) => ({ status: "fulfilled" as const, value }), (reason: unknown) => ({ status: "rejected" as const, reason }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
  return results;
}

/** Runs the queries together. An optional one that fails is listed and comes back empty. */
async function runQueries(row: ConnectionRow, customerId: string, queries: Record<string, string>) {
  const names = Object.keys(queries);
  const settled = await inBatches(names, (n) => searchGaqlAll<GaqlRow>(row, customerId, queries[n]));
  const rows: Record<string, GaqlRow[]> = {};
  const failed: string[] = [];
  const tooLong: string[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      rows[names[i]] = result.value.rows;
      if (result.value.more) tooLong.push(names[i]);
    }
    else if (REQUIRED.has(names[i])) throw result.reason;
    else {
      console.error("[google-ads/data] query failed:", names[i], (result.reason as { detail?: string }).detail ?? (result.reason as Error).message);
      rows[names[i]] = [];
      failed.push(names[i]);
    }
  });
  return { rows, failed, tooLong };
}

/** Names for the locations and languages campaigns target. */
async function targetNames(row: ConnectionRow, customerId: string, rows: Partial<LiveRows>) {
  const { geo, languages } = targetIds(rows);
  const queries: Record<string, string> = {};
  if (geo.length) queries.geoConstants = `SELECT geo_target_constant.id, geo_target_constant.name, geo_target_constant.target_type FROM geo_target_constant WHERE geo_target_constant.id IN (${geo.slice(0, 500).join(", ")})`;
  if (languages.length) queries.languageConstants = `SELECT language_constant.id, language_constant.name FROM language_constant WHERE language_constant.id IN (${languages.join(", ")})`;
  return queries;
}

async function loadStructure(row: ConnectionRow, customerId: string, force?: boolean) {
  const key = `${row.workspace_id}:${customerId}`;
  const hit = structureCache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return { rows: hit.rows, failed: [] as string[], tooLong: [] as string[] };
  const { rows, failed, tooLong } = await runQueries(row, customerId, {
    customer: LIVE_QUERIES.customer(),
    campaigns: LIVE_QUERIES.campaigns(),
    budgets: LIVE_QUERIES.budgets(),
    adGroups: LIVE_QUERIES.adGroups(),
    keywords: LIVE_QUERIES.keywords(),
    campaignNegatives: LIVE_QUERIES.campaignNegatives(),
    ads: LIVE_QUERIES.ads(),
    locations: LIVE_QUERIES.locations(),
    languages: LIVE_QUERIES.languages(),
    schedule: LIVE_QUERIES.schedule(),
    deviceBids: LIVE_QUERIES.deviceBids(),
    conversions: LIVE_QUERIES.conversions(),
    conversionCounts: LIVE_QUERIES.conversionCounts(),
    recommendations: LIVE_QUERIES.recommendations(),
    ...Object.fromEntries(Object.entries(STRUCTURE_QUERIES).map(([name, query]) => [name, query()])),
  });
  const names = await runQueries(row, customerId, await targetNames(row, customerId, rows));
  const all = { ...rows, ...names.rows } as Partial<LiveRows>;
  const allFailed = [...failed, ...names.failed];
  if (!allFailed.length) fit(structureCache, key, { at: Date.now(), rows: all, weight: rowsIn(all as Record<string, unknown[]>) }, cache);
  return { rows: all, failed: allFailed, tooLong };
}

export type LiveRange = { start: string; end: string };

export async function loadLiveAccount(row: ConnectionRow, range: LiveRange, opts: { force?: boolean } = {}): Promise<{ data: AccountData; fetchedAt: string }> {
  const customerId = row.account_id;
  if (row.kind !== "ads" || !customerId) throw new ConnectionHttpError(409, "no_account");
  const key = `${row.workspace_id}:${customerId}:${range.start}:${range.end}`;
  if (opts.force) forgetSegments(row.workspace_id);
  const hit = cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < CACHE_TTL_MS) return { data: hit.data, fetchedAt: new Date(hit.at).toISOString() };

  // The chosen period and the one before it, however long; never less than the presets need.
  const comparedFrom = addDays(range.start, -rangeDays(range));
  const usualFrom = addDays(range.end, -(DAILY_DAYS - 1));
  const dailyStart = comparedFrom < usualFrom ? comparedFrom : usualFrom;
  const [structure, dated] = await Promise.all([
    loadStructure(row, customerId, opts.force),
    runQueries(row, customerId, {
      campaignDaily: LIVE_QUERIES.campaignDaily(dailyStart, range.end),
      customerDaily: LIVE_QUERIES.customerDaily(dailyStart, range.end),
      adGroupMetrics: LIVE_QUERIES.adGroupMetrics(range.start, range.end),
      keywordMetrics: LIVE_QUERIES.keywordMetrics(range.start, range.end),
      adMetrics: LIVE_QUERIES.adMetrics(range.start, range.end),
      assetGroupMetrics: LIVE_QUERIES.assetGroupMetrics(range.start, range.end),
      placementMetrics: LIVE_QUERIES.placementMetrics(range.start, range.end),
      topicMetrics: LIVE_QUERIES.topicMetrics(range.start, range.end),
      productGroupMetrics: LIVE_QUERIES.productGroupMetrics(range.start, range.end),
      searchTerms: LIVE_QUERIES.searchTerms(range.start, range.end),
    }),
  ]);
  const failed = [...structure.failed, ...dated.failed];
  const rows = { ...structure.rows, ...dated.rows } as LiveRows;
  // Without Google's totals the page falls back to adding up the campaigns.
  if (failed.includes("customerDaily")) delete rows.customerDaily;

  const data = buildLiveAccount(
    {
      customerId,
      name: row.account_name ?? customerId,
      currency: row.account_currency ?? "USD",
      timeZone: row.account_time_zone ?? "",
      isManager: false,
      managerCustomerId: row.login_customer_id && row.login_customer_id !== customerId ? row.login_customer_id : undefined,
      optimizationScore: 0,
      autoTagging: false,
    },
    rows,
    range
  );
  if (failed.length) data.unavailable = failed;
  const tooLong = [...structure.tooLong, ...dated.tooLong];
  if (tooLong.length) data.listsCapped = { ...data.listsCapped, queries: tooLong };

  const at = Date.now();
  // A partial answer is shown once, then asked for again.
  if (!failed.length) fit(cache, key, { at, data, weight: data.keywords.length + data.ads.length + data.adGroups.length + Object.keys(data.exact?.byId ?? {}).length + Object.values(data.daily).reduce((n, d) => n + d.length, 0) }, structureCache);
  return { data, fetchedAt: new Date(at).toISOString() };
}

/** Drop cached snapshots for a workspace (after disconnecting or picking another account). */
export function forgetLiveAccount(workspaceId: string) {
  forgetSegments(workspaceId);
  for (const key of structureCache.keys()) if (key.startsWith(`${workspaceId}:`)) structureCache.delete(key);
  for (const key of cache.keys()) if (key.startsWith(`${workspaceId}:`)) cache.delete(key);
}
