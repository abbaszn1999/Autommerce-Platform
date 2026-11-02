// Where account data comes from. The workspace only talks to this interface, so the demo data
// can be swapped for the Markifact Google Ads MCP (or the API) without touching any view.

import type { AccountData } from "./types";

export type SyncState = {
  status: "ready" | "loading" | "error";
  /** ISO time of the last successful load. */
  refreshedAt: string;
  error?: string;
};

export interface GoogleAdsDataSource {
  id: string;
  /** Shown next to the refresh button, e.g. "Demo data". */
  label: string;
  /**
   * Load a fresh snapshot of one account. Return the `current` object unchanged when nothing
   * changed; the store only replaces its data when a new object comes back.
   */
  fetchAccount(customerId: string, current: AccountData): Promise<AccountData>;
}

/** Demo data lives in memory, so a refresh just waits a moment and returns the same snapshot. */
export const demoDataSource: GoogleAdsDataSource = {
  id: "demo",
  label: "Demo data",
  fetchAccount: async (_customerId, current) => {
    await new Promise((resolve) => setTimeout(resolve, 450));
    return current;
  },
};

let active: GoogleAdsDataSource = demoDataSource;

export const getDataSource = () => active;

/** Swap the data source (for example to the Markifact-backed one) at app start. */
export function setDataSource(source: GoogleAdsDataSource) {
  active = source;
}

export const freshSync = (): SyncState => ({ status: "ready", refreshedAt: new Date().toISOString() });