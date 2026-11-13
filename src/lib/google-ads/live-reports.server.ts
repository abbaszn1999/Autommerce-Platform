// Runs the agent's expert reports against a workspace's Google Ads account. Each
// query runs on its own: one that Google refuses (a feature the account doesn't
// use) is listed as unavailable instead of failing the whole report.

import { ConnectionHttpError, searchGaql, type ConnectionRow } from "./connection.server";
import { googleMessage } from "./live-mutate.server";
import type { GaqlRow } from "./live-report";
import { geoNames } from "./live-segments.server";
import { todayIn } from "./metrics";
import {
  conversionsReport,
  productsReport,
  reachReport,
  recommendationsReport,
  reportQueries,
  shoppingPmaxReport,
  type ReportDays,
  type ReportName,
  type Finding,
  withoutUnreadChecks,
} from "./live-reports";

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 200;
/** Performance Max campaigns whose search categories are read (one query each). */
const MAX_PMAX_CAMPAIGNS = 5;

const cache = new Map<string, { at: number; data: unknown }>();

async function runAll(row: ConnectionRow, customerId: string, queries: Record<string, string>) {
  const rows: Record<string, GaqlRow[]> = {};
  const unavailable: Record<string, string> = {};
  await Promise.all(
    Object.entries(queries).map(async ([name, query]) => {
      try {
        rows[name] = await searchGaql<GaqlRow>(row, customerId, query.replace(/\s+/g, " "), 10);
      } catch (err) {
        if (!(err instanceof ConnectionHttpError) || err.message !== "google_request_failed") throw err;
        rows[name] = [];
        unavailable[name] = googleMessage(err.detail);
      }
    })
  );
  return { rows, unavailable };
}

export async function runReport(row: ConnectionRow, report: ReportName, days: ReportDays, opts: { targetRoas?: number; force?: boolean } = {}) {
  const customerId = row.account_id;
  if (row.kind !== "ads" || !customerId) throw new ConnectionHttpError(409, "no_account");
  const key = `${row.workspace_id}:${customerId}:${report}:${days}:${opts.targetRoas ?? ""}`;
  const hit = cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  // Noon on the account's own date: every day the report asks for follows the account's clock.
  const today = new Date(`${todayIn(row.account_time_zone)}T12:00:00Z`);
  const queries = reportQueries(report, days, today);
  const pmaxQuery = queries.pmaxSearch;
  delete queries.pmaxSearch;
  // Google keeps change history for 30 days and wants both ends of the range.
  if (queries.changes)
    queries.changes = queries.changes
      .replace("{since}", new Date(today.getTime() - 29 * 86_400_000).toISOString().slice(0, 10))
      .replace("{until}", new Date(today.getTime() + 86_400_000).toISOString().slice(0, 10));
  const { rows, unavailable } = await runAll(row, customerId, queries);

  let data: Record<string, unknown>;
  if (report === "conversions") data = conversionsReport(rows, days);
  else if (report === "products") data = productsReport(rows, days, { targetRoas: opts.targetRoas });
  else if (report === "recommendations") data = recommendationsReport(rows);
  else if (report === "reach") {
    const ids = [
      ...(rows.geo ?? []).map((r) => String(r.geographicView?.countryCriterionId ?? "")),
      ...(rows.locations ?? []).map((r) => String(r.campaignCriterion?.location?.geoTargetConstant ?? "").split("/").pop() ?? ""),
    ];
    data = reachReport(rows, days, await geoNames(row, customerId, ids));
  } else {
    // Search categories: one query per enabled Performance Max campaign, biggest spenders first.
    const spend = new Map<string, number>();
    for (const r of rows.campaignPerf ?? []) spend.set(String(r.campaign?.id), (spend.get(String(r.campaign?.id)) ?? 0) + Number(r.metrics?.costMicros ?? 0));
    const pmax = (rows.campaigns ?? [])
      .filter((r) => r.campaign?.advertisingChannelType === "PERFORMANCE_MAX" && r.campaign?.status === "ENABLED")
      .map((r) => String(r.campaign.id))
      .sort((a, b) => (spend.get(b) ?? 0) - (spend.get(a) ?? 0))
      .slice(0, MAX_PMAX_CAMPAIGNS);
    const search: Record<string, GaqlRow[]> = {};
    if (pmaxQuery)
      await Promise.all(
        pmax.map(async (id) => {
          const { rows: r, unavailable: u } = await runAll(row, customerId, { [id]: pmaxQuery.replace("{campaignId}", id) });
          search[id] = r[id] ?? [];
          if (u[id]) unavailable[`pmaxSearch:${id}`] = u[id];
        })
      );
    data = shoppingPmaxReport(rows, days, search);
  }

  if (Array.isArray(data.findings)) data.findings = withoutUnreadChecks(data.findings as Finding[], unavailable);
  const out = { report, account: { customerId, name: row.account_name, currency: row.account_currency }, ...data, unavailable, fetchedAt: new Date().toISOString() };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), data: out });
  return out;
}

/** Drop cached reports for a workspace (after a change, so the next read is fresh). */
export function forgetReports(workspaceId: string) {
  for (const key of cache.keys()) if (key.startsWith(`${workspaceId}:`)) cache.delete(key);
}
