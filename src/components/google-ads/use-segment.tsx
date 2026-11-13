"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { segmentRows, type SegmentRow } from "@/lib/google-ads/analytics";
import { LiveApiError, liveApi } from "@/lib/google-ads/live-api";
import { isGoogleBreakdown, rowsFromCells, type LiveSegment, type SegmentCell } from "@/lib/google-ads/live-segments";
import { useAccountState, useGoogleAds } from "@/lib/google-ads/store";
import type { SegmentKey } from "@/lib/google-ads/types";

const CACHE_MAX = 60;
const loaded = new Map<string, SegmentCell[]>();

export type SegmentLoad = { loading: boolean; error: string | null; retry: () => void };

/** Loads a breakdown from Google once per account, range and refresh. Pass null when it isn't needed. */
export function useLiveCells(segment: LiveSegment | null): SegmentLoad & { cells: SegmentCell[] | null } {
  const workspaceId = useGoogleAds((s) => s.workspaceId);
  const range = useGoogleAds((s) => s.range);
  const acc = useAccountState();
  const customerId = acc?.data.account.customerId;
  const pending = !!acc?.sync.pending;
  const refreshedAt = acc?.sync.refreshedAt;
  const key = segment && workspaceId && customerId && !pending ? `${workspaceId}:${customerId}:${segment}:${range.start}:${range.end}:${refreshedAt}` : null;
  const [result, setResult] = useState<{ key: string; cells?: SegmentCell[]; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key || !segment || !workspaceId || loaded.has(key)) return;
    let active = true;
    liveApi.segment(workspaceId, segment, range).then(
      ({ cells }) => {
        if (loaded.size >= CACHE_MAX) loaded.delete(loaded.keys().next().value!);
        loaded.set(key, cells);
        if (active) setResult({ key, cells });
      },
      (err: unknown) => {
        if (active) setResult({ key, error: err instanceof LiveApiError ? err.message : "Couldn't read this from Google Ads." });
      }
    );
    return () => {
      active = false;
    };
    // `key` already carries the workspace, segment and range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  if (!segment) return { cells: null, loading: false, error: null, retry: () => {} };
  const current = result && result.key === key ? result : null;
  const cells = (key && loaded.get(key)) || current?.cells || null;
  const error = cells ? null : current?.error ?? null;
  return {
    cells,
    loading: !cells && !error,
    error,
    retry: () => {
      setResult(null);
      setAttempt((a) => a + 1);
    },
  };
}

/**
 * Rows of a breakdown for the campaigns given (the whole account when omitted).
 * Live accounts read what Google reports; only the demo uses simulated splits.
 */
export function useSegmentRows(segment: SegmentKey, campaignIds?: string[]): SegmentLoad & { rows: SegmentRow[]; empty: boolean } {
  const live = useGoogleAds((s) => s.mode === "live") && isGoogleBreakdown(segment);
  const acc = useAccountState()!;
  const range = useGoogleAds((s) => s.range);
  const { cells, loading, error, retry } = useLiveCells(live ? (segment as LiveSegment) : null);
  const rows = useMemo<SegmentRow[]>(() => {
    if (!live) return segmentRows(acc.data, range, segment, campaignIds);
    return cells ? rowsFromCells(segment as LiveSegment, cells, campaignIds) : [];
  }, [live, cells, segment, campaignIds, acc.data, range]);
  const empty = !loading && !error && rows.every((r) => !r.base.impressions && !r.base.clicks && !r.base.cost);
  return { rows, loading, error, retry, empty };
}

/** What to show instead of a breakdown that is loading, failed, or has nothing in this period. */
export function SegmentNotice({ load, empty, height = 120 }: { load: SegmentLoad; empty?: boolean; height?: number }) {
  if (load.loading) return <div className="animate-pulse rounded-xl bg-muted/60" style={{ height }} aria-label="Loading from Google Ads" />;
  if (load.error)
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground" style={{ minHeight: height }}>
        <p>{load.error}</p>
        <button type="button" onClick={load.retry} className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-1.5 font-semibold text-foreground hover:bg-muted">
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      </div>
    );
  if (empty) return <p className="flex items-center justify-center text-center text-xs text-muted-foreground" style={{ minHeight: height }}>Google Ads has no data for this period.</p>;
  return null;
}

/** True when SegmentNotice has something to show instead of the data. */
export const hasNotice = (load: SegmentLoad, empty?: boolean) => load.loading || !!load.error || !!empty;
