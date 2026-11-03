// Browser calls to /api/google-ads/connection. The store uses these in live mode;
// demo mode never touches the network.

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
};

export type LiveMerchantAccount = { merchantId: string; name: string; website: string; timeZone: string };

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

  adsAccounts: (workspaceId: string) => call<{ accounts: LiveAdsAccount[] }>(`/api/google-ads/connection/accounts?${qs({ workspaceId, kind: "ads" })}`),

  merchantAccounts: (workspaceId: string) =>
    call<{ accounts: LiveMerchantAccount[] }>(`/api/google-ads/connection/accounts?${qs({ workspaceId, kind: "merchant" })}`),

  select: (workspaceId: string, kind: LiveKind, accountId: string) =>
    call<{ account: LiveAdsAccount | LiveMerchantAccount }>("/api/google-ads/connection/accounts", {
      method: "POST",
      body: JSON.stringify({ workspaceId, kind, accountId }),
    }),

  disconnect: (workspaceId: string, kind: LiveKind) => call<{ ok: true }>(`/api/google-ads/connection?${qs({ workspaceId, kind })}`, { method: "DELETE" }),
};
