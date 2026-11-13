// Where account data comes from. The workspace only talks to this interface, so the demo data
// can be swapped for the live Google Ads source without touching any view.

import { liveApi } from "./live-api";
import type { AccountData, DateRange } from "./types";

export type SyncState = {
  status: "ready" | "loading" | "error";
  /** ISO time of the last successful load. */
  refreshedAt: string;
  error?: string;
  /** A live account whose numbers have not loaded yet: the page shows skeletons, not zeros. */
  pending?: boolean;
};

export interface GoogleAdsDataSource {
  id: string;
  /** Shown next to the refresh button, e.g. "Demo data". */
  label: string;
  /**
   * Load a fresh snapshot of one account. Return the `current` object unchanged when nothing
   * changed; the store only replaces its data when a new object comes back.
   */
  fetchAccount(customerId: string, current: AccountData, opts?: FetchOptions): Promise<AccountData>;
}

export type FetchOptions = {
  /** The range on screen; live sources load exact per-entity totals for it. */
  range?: DateRange;
  /** Skip any server-side cache (the Refresh button). */
  force?: boolean;
};

/** Demo data lives in memory, so a refresh just waits a moment and returns the same snapshot. */
export const demoDataSource: GoogleAdsDataSource = {
  id: "demo",
  label: "Demo data",
  fetchAccount: async (_customerId, current) => {
    await new Promise((resolve) => setTimeout(resolve, 450));
    return current;
  },
};

/** The workspace's chosen account, read from Google through our server (read only). */
export function liveDataSource(workspaceId: string): GoogleAdsDataSource {
  return {
    id: "live",
    label: "Google Ads",
    fetchAccount: async (customerId, current, opts) => {
      if (!opts?.range) return current;
      const { data } = await liveApi.account(workspaceId, opts.range, !!opts.force);
      // The server always serves the account picked for this workspace; ignore a stale answer for another one.
      return data.account.customerId === customerId ? data : current;
    },
  };
}

let active: GoogleAdsDataSource = demoDataSource;

export const getDataSource = () => active;

/** Swap the data source: demo by default, live once a workspace connects for real. */
export function setDataSource(source: GoogleAdsDataSource) {
  active = source;
}

export const freshSync = (): SyncState => ({ status: "ready", refreshedAt: new Date().toISOString() });