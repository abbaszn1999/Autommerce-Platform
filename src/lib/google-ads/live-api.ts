// Browser calls to /api/google-ads/connection and /api/google-ads/data. The store
// uses these in live mode; demo mode never touches the network.

import type { MerchantSnapshot } from "./merchant-live";
import type { AccountData, MutateOp } from "./types";

export type LiveKind = "ads" | "merchant";

export type LiveConnection = {
  status: "none" | "selecting" | "connected";
  loginCustomerId: string | null;
  accountId: string | null;
  accountName: string | null;
  currency: string | null;
  timeZone: string | null;
};

export type LiveConnections = { configured: false } | { configured: true; ads: LiveConnection; merchant: LiveConnection };

export type LiveAdsAccount = {
  customerId: string;
  name: string;
  currency: string;
  timeZone: string;
  isManager: boolean;
  managerCustomerId?: string;
  usable: boolean;
  reason?: string;
};

export type LiveMerchantAccount = { merchantId: string; name: string; website: string; timeZone: string };

export type LiveChangeRecord = {
  id: string;
  title: string;
  source: "AGENT" | "USER" | "RECOMMENDATION" | "UNDO";
  status: "applied";
  ops: MutateOp[];
  inverse: MutateOp[] | null;
  undo_of: string | null;
  undone_at: string | null;
  created_at: string;
};

/** Readable text for the error codes the routes return. */
export const LIVE_ERRORS: Record<string, string> = {
  invalid_customer_id: "Enter the 10-digit Google Ads customer ID, e.g. 123-456-7890.",
  forbidden: "Only workspace owners and admins can change the Google connection.",
  unauthorized: "Your session ended. Sign in again.",
  not_configured: "Google Ads isn't set up on this server yet.",
  not_connected: "The Google connection was removed. Connect again.",
  account_not_accessible: "That account isn't available to the Google sign-in you used.",
  google_request_failed: "Google didn't answer. Try again in a moment.",
  connect_failed: "Couldn't start Google sign-in. Try again.",
  network: "Couldn't reach the connection service. Check your internet and try again.",
  no_account: "Pick a Google Ads account first.",
  cannot_undo: "This change was already undone, or can't be undone.",
  invalid_change: "This change couldn't be read. Nothing was sent.",
  too_large: "This change is too large to send at once. Split it up.",
  invalid_range: "That date range can't be loaded.",
};

export class LiveApiError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new LiveApiError(LIVE_ERRORS[body.error ?? ""] ?? "Something went wrong. Try again.");
  return body as T;
}

const qs = (params: Record<string, string>) => new URLSearchParams(params).toString();

export const liveApi = {
  connections: (workspaceId: string) => call<LiveConnections>(`/api/google-ads/connection?${qs({ workspaceId })}`),

  /** Returns the Google sign-in URL to send the browser to. */
  start: (workspaceId: string, kind: LiveKind, loginCustomerId?: string) =>
    call<{ redirectUrl: string }>("/api/google-ads/connection", { method: "POST", body: JSON.stringify({ workspaceId, kind, loginCustomerId }) }),

  adsAccounts: (workspaceId: string) => call<{ accounts: LiveAdsAccount[]; wrongLoginId?: string }>(`/api/google-ads/connection/accounts?${qs({ workspaceId, kind: "ads" })}`),

  merchantAccounts: (workspaceId: string) =>
    call<{ accounts: LiveMerchantAccount[] }>(`/api/google-ads/connection/accounts?${qs({ workspaceId, kind: "merchant" })}`),

  select: (workspaceId: string, kind: LiveKind, accountId: string) =>
    call<{ account: LiveAdsAccount | LiveMerchantAccount }>("/api/google-ads/connection/accounts", {
      method: "POST",
      body: JSON.stringify({ workspaceId, kind, accountId }),
    }),

  disconnect: (workspaceId: string, kind: LiveKind) => call<{ ok: true }>(`/api/google-ads/connection?${qs({ workspaceId, kind })}`, { method: "DELETE" }),

  /**
   * Send an approved change (or an undo) to Google Ads. A refusal (Google's or our
   * safety checks) comes back as `failed` with the reason; only transport problems throw.
   */
  change: async (
    body: { workspaceId: string; clientChangeId: string } & ({ title: string; source: string; ops: MutateOp[] } | { undoOf: string })
  ): Promise<{ status: "applied"; id: string; inverse: MutateOp[]; warnings: string[] } | { status: "failed"; id: string; error: string }> => {
    const res = await fetch("/api/google-ads/changes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
    if (res.status === 422 && data.status === "failed") return data as { status: "failed"; id: string; error: string };
    if (!res.ok) throw new LiveApiError(LIVE_ERRORS[data.error ?? ""] ?? "Couldn't reach Google Ads. Try again; the change is never sent twice.");
    return data as { status: "applied"; id: string; inverse: MutateOp[]; warnings: string[] };
  },

  /** Applied changes for the workspace's account, newest first (from the page and from Vera's chats). */
  history: (workspaceId: string) => call<{ changes: LiveChangeRecord[] }>(`/api/google-ads/changes?${qs({ workspaceId })}`),

  /** Read-only snapshot of the chosen Google Ads account for a date range. */
  account: (workspaceId: string, range: { start: string; end: string }, force: boolean) =>
    call<{ data: AccountData; fetchedAt: string }>(
      `/api/google-ads/data?${qs({ workspaceId, start: range.start, end: range.end, ...(force ? { refresh: "1" } : {}) })}`
    ),

  /** Products, their status and issues in the chosen Merchant Center account. */
  merchant: (workspaceId: string, force: boolean) =>
    call<{ data: MerchantSnapshot }>(`/api/google-ads/merchant?${qs({ workspaceId, ...(force ? { refresh: "1" } : {}) })}`),
};
