// The Google Ads agent never talks to Google itself: every tool asks the platform
// site, which holds the Google connection and applies all safety checks. Calls
// are signed with the service secret for the user the run belongs to.

import { signRequest } from "../../auth";

export type AdsPlatform = { url: string; secret: string };

export class AdsPlatformError extends Error {}

export type AdsAction =
  | "overview"
  | "query"
  | "report"
  | "preview"
  | "apply"
  | "merchant"
  | "merchant_preview"
  | "merchant_apply"
  | "profile"
  | "profile_update"
  | "onboarding"
  | "doc_plan"
  | "doc_report"
  | "doc_read"
  | "keywords"
  | "keyword_forecast"
  | "competitor_ads";

export async function callAdsPlatform<T>(
  platform: AdsPlatform,
  params: { action: AdsAction; userId: string; body: Record<string, unknown>; signal?: AbortSignal }
): Promise<T> {
  const path = `/api/google-ads/agent/${params.action}`;
  const body = JSON.stringify(params.body);
  const timestamp = Date.now();
  const signature = signRequest({ secret: platform.secret, timestamp, userId: params.userId, method: "POST", path, body });
  let res: Response;
  try {
    res = await fetch(`${platform.url}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-assistant-signature": signature,
        "x-assistant-timestamp": String(timestamp),
        "x-assistant-user": params.userId,
      },
      body,
      signal: params.signal,
    });
  } catch (error) {
    throw new AdsPlatformError(`Could not reach Google Ads right now (${(error as Error).message}). Try again in a moment.`);
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const code = json.error ?? `status ${res.status}`;
    const readable: Record<string, string> = {
      forbidden: "Only the workspace owner or an admin can use the Google Ads agent.",
      not_connected: "Google Ads is not connected for this workspace any more. The user must reconnect it on the Google Ads page.",
      merchant_not_connected: "Merchant Center is not connected for this workspace. The user can connect it on the Google Ads page (Connections).",
      not_approved: "This change was not approved, so it was not applied.",
      network: "Google Ads could not be reached. Try again in a moment.",
      google_request_failed: "Google Ads did not answer. Try again in a moment.",
    };
    throw new AdsPlatformError(readable[code] ?? `Google Ads request failed (${code}).`);
  }
  return json;
}
