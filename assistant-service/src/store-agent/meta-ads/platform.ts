// The Meta Ads agent never talks to Meta itself: every tool asks the platform
// site, which holds the client's Meta token, talks to Meta's Ads MCP server and
// checks every approval. Calls are signed with the service secret for the user
// the run belongs to (same scheme as the Google Ads agent).

import { signRequest } from "../../auth";

export type MetaPlatform = { url: string; secret: string };

export class MetaPlatformError extends Error {}

export type MetaAction = "tools" | "read" | "preview" | "apply" | "page_posts";

/** One Meta tool as the site lists it. */
export type MetaToolInfo = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  kind: "read" | "write";
  destructive: boolean;
};

export async function callMetaPlatform<T>(
  platform: MetaPlatform,
  params: { action: MetaAction; userId: string; body: Record<string, unknown>; signal?: AbortSignal }
): Promise<T> {
  const path = `/api/meta-ads/agent/${params.action}`;
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
    throw new MetaPlatformError(`Could not reach Meta right now (${(error as Error).message}). Try again in a moment.`);
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const code = json.error ?? `status ${res.status}`;
    const readable: Record<string, string> = {
      forbidden: "Only the workspace owner or an admin can use the Meta Ads agent.",
      not_connected: "Meta is not connected for this workspace any more. The user must connect it again on the Meta Ads page.",
      token_expired: "The Meta connection expired or was removed. The user must reconnect Meta on the Meta Ads page (it lasts about 60 days).",
      meta_permission_missing: "Meta refused: the connection is missing a permission for this. The user can reconnect Meta and allow everything asked.",
      not_approved: "This change was not approved, so it was not applied.",
      network: "Meta could not be reached. Try again in a moment.",
      meta_request_failed: "Meta did not answer. Try again in a moment.",
    };
    throw new MetaPlatformError(readable[code] ?? `Meta request failed (${code}).`);
  }
  return json;
}
