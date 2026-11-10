// Loads one breakdown of the workspace's account from Google Ads and keeps it for
// a short while, so opening a page again doesn't spend the daily API quota.

import { ConnectionHttpError, searchGaql, type ConnectionRow } from "./connection.server";
import type { GaqlRow } from "./live-report";
import { cellsFromRows, segmentQuery, type LiveSegment, type SegmentCell } from "./live-segments";

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 300;

const cache = new Map<string, { at: number; cells: SegmentCell[] }>();

/** Readable names for Google's location ids (empty when the lookup fails). */
export async function geoNames(row: ConnectionRow, customerId: string, ids: string[]): Promise<Record<string, string>> {
  const list = [...new Set(ids.filter((id) => /^\d+$/.test(id)))].slice(0, 200);
  if (!list.length) return {};
  try {
    const rows = await searchGaql<GaqlRow>(row, customerId, `SELECT geo_target_constant.id, geo_target_constant.canonical_name FROM geo_target_constant WHERE geo_target_constant.id IN (${list.join(", ")})`, 2);
    return Object.fromEntries(rows.map((r) => [String(r.geoTargetConstant?.id), String(r.geoTargetConstant?.canonicalName ?? r.geoTargetConstant?.id)]));
  } catch {
    return {};
  }
}

export async function loadSegment(row: ConnectionRow, segment: LiveSegment, range: { start: string; end: string }): Promise<{ cells: SegmentCell[]; fetchedAt: string }> {
  const customerId = row.account_id;
  if (row.kind !== "ads" || !customerId) throw new ConnectionHttpError(409, "no_account");
  const key = `${row.workspace_id}:${customerId}:${segment}:${range.start}:${range.end}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { cells: hit.cells, fetchedAt: new Date(hit.at).toISOString() };

  const rows = await searchGaql<GaqlRow>(row, customerId, segmentQuery(segment, range.start, range.end));
  const names = segment === "country" ? await geoNames(row, customerId, rows.map((r) => String(r.geographicView?.countryCriterionId ?? ""))) : {};
  const cells = cellsFromRows(segment, rows, names);

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  const at = Date.now();
  cache.set(key, { at, cells });
  return { cells, fetchedAt: new Date(at).toISOString() };
}

/** Drop a workspace's breakdowns (the Refresh button, or the account changed). */
export function forgetSegments(workspaceId: string) {
  for (const key of cache.keys()) if (key.startsWith(`${workspaceId}:`)) cache.delete(key);
}
