// Loads a live account snapshot from Google Ads (through Composio) and keeps it
// for a short while so opening the page again doesn't spend the daily API quota.

import { addDays } from "./metrics";
import { ConnectionHttpError, searchGaql, type ConnectionRow } from "./connection.server";
import { LIVE_QUERIES, type LiveQueryName } from "./live-queries";
import { buildLiveAccount, type GaqlRow, type LiveRows } from "./live-report";
import type { AccountData } from "./types";

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 100;
/** Campaign days kept: the longest preset (90) plus the period it is compared with. */
const DAILY_DAYS = 180;

const cache = new Map<string, { at: number; data: AccountData }>();

export type LiveRange = { start: string; end: string };

export async function loadLiveAccount(row: ConnectionRow, range: LiveRange, opts: { force?: boolean } = {}): Promise<{ data: AccountData; fetchedAt: string }> {
  const customerId = row.account_id;
  if (row.kind !== "ads" || !customerId) throw new ConnectionHttpError(409, "no_account");
  const key = `${row.workspace_id}:${customerId}:${range.start}:${range.end}`;
  const hit = cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < CACHE_TTL_MS) return { data: hit.data, fetchedAt: new Date(hit.at).toISOString() };

  const dailyStart = addDays(range.end, -(DAILY_DAYS - 1));
  const build: Record<LiveQueryName, string> = {
    customer: LIVE_QUERIES.customer(),
    campaigns: LIVE_QUERIES.campaigns(),
    budgets: LIVE_QUERIES.budgets(),
    campaignDaily: LIVE_QUERIES.campaignDaily(dailyStart, range.end),
    adGroups: LIVE_QUERIES.adGroups(),
    adGroupMetrics: LIVE_QUERIES.adGroupMetrics(range.start, range.end),
    keywords: LIVE_QUERIES.keywords(),
    keywordMetrics: LIVE_QUERIES.keywordMetrics(range.start, range.end),
    campaignNegatives: LIVE_QUERIES.campaignNegatives(),
    ads: LIVE_QUERIES.ads(),
    adMetrics: LIVE_QUERIES.adMetrics(range.start, range.end),
    searchTerms: LIVE_QUERIES.searchTerms(range.start, range.end),
  };
  const names = Object.keys(build) as LiveQueryName[];
  const results = await Promise.all(names.map((n) => searchGaql<GaqlRow>(row, customerId, build[n])));
  const rows = Object.fromEntries(names.map((n, i) => [n, results[i]])) as LiveRows;

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

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  const at = Date.now();
  cache.set(key, { at, data });
  return { data, fetchedAt: new Date(at).toISOString() };
}

/** Drop cached snapshots for a workspace (after disconnecting or picking another account). */
export function forgetLiveAccount(workspaceId: string) {
  for (const key of cache.keys()) if (key.startsWith(`${workspaceId}:`)) cache.delete(key);
}
