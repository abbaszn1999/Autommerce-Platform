// Where ad account data comes from. The workspace only talks to this interface, so the demo data
// can be swapped for the Marketing API (or an MCP) without touching any view.

import type { MetaAccountData } from "./types";

export { freshSync, type SyncState } from "@/lib/google-ads/data-source";

export interface MetaAdsDataSource {
  id: string;
  /** Shown next to the refresh button, e.g. "Demo data". */
  label: string;
  /**
   * Load a fresh snapshot of one ad account. Return the `current` object unchanged when nothing
   * changed; the store only replaces its data when a new object comes back.
   */
  fetchAccount(accountId: string, current: MetaAccountData): Promise<MetaAccountData>;
}

/** Demo data lives in memory, so a refresh just waits a moment and returns the same snapshot. */
export const demoDataSource: MetaAdsDataSource = {
  id: "demo",
  label: "Demo data",
  fetchAccount: async (_accountId, current) => {
    await new Promise((resolve) => setTimeout(resolve, 450));
    return current;
  },
};

let active: MetaAdsDataSource = demoDataSource;

export const getDataSource = () => active;

/** Swap the data source (for example to the Marketing API) at app start. */
export function setDataSource(source: MetaAdsDataSource) {
  active = source;
}
