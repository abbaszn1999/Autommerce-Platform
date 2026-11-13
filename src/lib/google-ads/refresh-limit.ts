// The Refresh button skips our cache and spends Google's daily quota, which every
// workspace shares. One forced reload per workspace and kind a minute is enough.

const MIN_GAP_MS = 60_000;
const last = new Map<string, number>();

/** True when a forced reload may go to Google now; otherwise the cached copy is served. */
export function allowForcedRefresh(workspaceId: string, kind: string, now = Date.now()): boolean {
  const key = `${workspaceId}:${kind}`;
  const previous = last.get(key);
  if (previous !== undefined && now - previous < MIN_GAP_MS) return false;
  if (last.size > 5000) last.clear();
  last.set(key, now);
  return true;
}
