// Server side of the Meta connection (stage A, meta-ads/connect-plan.md).
// Facebook Login for Business on our own Meta app → server-side code exchange →
// long-lived user token, stored encrypted in meta_ads_connections. The token
// never reaches the browser or the agent service. Never import from client code.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptIntegrationConfig, encryptIntegrationConfig, encryptionConfigured } from "@/lib/integrations/crypto";
import { ConnectionHttpError, errorStatus } from "@/lib/google-ads/connection.server";
import { MetaMcpError, forgetToken } from "./mcp.server";

export const GRAPH_VERSION = "v27.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const STATE_TTL_MS = 15 * 60 * 1000;
/** Show "Reconnect" this long before the token ends. */
export const RECONNECT_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

/** What we ask for (the Facebook Login for Business configuration holds the same list). */
export const META_SCOPES = [
  "ads_management",
  "ads_read",
  "ads_mcp_management",
  "business_management",
  "catalog_management",
  "pages_show_list",
  "pages_read_engagement",
  "public_profile",
] as const;
/** Without these the agent can't work at all. */
export const REQUIRED_SCOPES = ["ads_mcp_management", "ads_read"] as const;

export type MetaConfig = { appId: string; appSecret: string; configId: string };

export function metaConfig(): MetaConfig | null {
  const appId = process.env.META_APP_ID ?? "";
  const appSecret = process.env.META_APP_SECRET ?? "";
  const configId = process.env.META_LOGIN_CONFIG_ID ?? "";
  if (!/^[0-9]{5,30}$/.test(appId) || appSecret.length < 16 || !/^[0-9]{5,30}$/.test(configId) || !encryptionConfigured()) return null;
  return { appId, appSecret, configId };
}

function requireConfig(): MetaConfig {
  const config = metaConfig();
  if (!config) throw new ConnectionHttpError(503, "not_configured");
  return config;
}

export function metaRedirectUri(origin: string): string {
  return process.env.META_OAUTH_REDIRECT_URI || `${origin.replace(/\/+$/, "")}/api/meta-ads/oauth/callback`;
}

// ── Login state (signed, short-lived) ─────────────────────────────────────

export type MetaOAuthState = { workspaceId: string; slug: string; userId: string; exp: number };

const sign = (encoded: string) => createHmac("sha256", requireConfig().appSecret).update(`meta-state:${encoded}`).digest("base64url");

export function createState(input: Omit<MetaOAuthState, "exp">, now = Date.now()): string {
  const encoded = Buffer.from(JSON.stringify({ ...input, exp: now + STATE_TTL_MS }), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyState(raw: string, now = Date.now()): MetaOAuthState | null {
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const encoded = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1));
  const expected = Buffer.from(sign(encoded));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as MetaOAuthState;
    if (!/^[0-9a-f-]{36}$/i.test(parsed.workspaceId) || !/^[0-9a-f-]{36}$/i.test(parsed.userId) || typeof parsed.slug !== "string") return null;
    if (typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The Facebook Login for Business dialog. Permissions come from the configuration (config_id), not `scope`. */
export function loginUrl(origin: string, state: string): string {
  const { appId, configId } = requireConfig();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: metaRedirectUri(origin),
    state,
    config_id: configId,
    response_type: "code",
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

// ── Graph API ─────────────────────────────────────────────────────────────

/** Meta recommends appsecret_proof on every server call made with a user token. */
export function appSecretProof(token: string, appSecret = requireConfig().appSecret): string {
  return createHmac("sha256", appSecret).update(token).digest("hex");
}

export class MetaGraphError extends Error {
  constructor(public status: number, public metaCode: number | undefined, message: string) {
    super(message);
  }
}

async function graph<T>(path: string, opts: { token?: string; params?: Record<string, string>; method?: "GET" | "DELETE" } = {}): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);
  if (opts.token) {
    url.searchParams.set("access_token", opts.token);
    url.searchParams.set("appsecret_proof", appSecretProof(opts.token));
  }
  let res: Response;
  try {
    res = await fetch(url, { method: opts.method ?? "GET", signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new ConnectionHttpError(503, "network", (error as Error).message);
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || json.error) throw new MetaGraphError(res.status, json.error?.code, json.error?.message ?? `Graph API status ${res.status}`);
  return json;
}

export type TokenResult = { accessToken: string; expiresAt: Date | null };

/** Code → short-lived token → long-lived token (about 60 days). */
export async function exchangeCode(origin: string, code: string): Promise<TokenResult> {
  const { appId, appSecret } = requireConfig();
  const short = await graph<{ access_token?: string; expires_in?: number }>("/oauth/access_token", {
    params: { client_id: appId, client_secret: appSecret, redirect_uri: metaRedirectUri(origin), code },
  });
  if (!short.access_token) throw new ConnectionHttpError(502, "meta_token_failed");
  const long = await graph<{ access_token?: string; expires_in?: number }>("/oauth/access_token", {
    params: { grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token },
  }).catch(() => short);
  const token = long.access_token ?? short.access_token;
  const seconds = Number(long.expires_in ?? short.expires_in);
  return { accessToken: token, expiresAt: Number.isFinite(seconds) && seconds > 0 ? new Date(Date.now() + seconds * 1000) : null };
}

export async function metaUser(token: string): Promise<{ id: string; name: string | null }> {
  const me = await graph<{ id?: string; name?: string }>("/me", { token, params: { fields: "id,name" } });
  if (!me.id || !/^[0-9]{1,30}$/.test(me.id)) throw new ConnectionHttpError(502, "meta_user_failed");
  return { id: me.id, name: me.name ?? null };
}

export async function grantedScopes(token: string): Promise<string[]> {
  const res = await graph<{ data?: Array<{ permission: string; status: string }> }>("/me/permissions", { token });
  return (res.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission);
}

/** Removes our app's access for this person on Meta's side. */
export async function revokeOnMeta(token: string): Promise<void> {
  await graph("/me/permissions", { token, method: "DELETE" });
}

/** Deletes a product catalog (catalog_management). Only ever run after a person approved it. */
export async function deleteCatalog(token: string, catalogId: string): Promise<void> {
  if (!/^[0-9]{1,30}$/.test(catalogId)) throw new ConnectionHttpError(400, "invalid_catalog");
  const res = await graph<{ success?: boolean }>(`/${catalogId}`, { token, method: "DELETE" });
  if (res.success === false) throw new MetaGraphError(400, undefined, "Meta did not delete the catalog.");
}

export type PagePost = { id: string; message: string | null; createdTime: string; permalink: string | null; picture: string | null };

/** A Page's latest posts (pages_read_engagement). Uses the Page token the user's token gives access to. */
export async function pagePosts(userToken: string, pageId: string, limit = 10): Promise<PagePost[]> {
  if (!/^[0-9]{1,30}$/.test(pageId)) throw new ConnectionHttpError(400, "invalid_page");
  const page = await graph<{ access_token?: string }>(`/${pageId}`, { token: userToken, params: { fields: "access_token" } });
  const token = page.access_token ?? userToken;
  const posts = await graph<{ data?: Array<{ id: string; message?: string; created_time: string; permalink_url?: string; full_picture?: string }> }>(`/${pageId}/posts`, {
    token,
    params: { fields: "id,message,created_time,permalink_url,full_picture", limit: String(Math.min(25, Math.max(1, limit))) },
  });
  return (posts.data ?? []).map((p) => ({
    id: p.id,
    message: p.message ?? null,
    createdTime: p.created_time,
    permalink: p.permalink_url ?? null,
    picture: p.full_picture ?? null,
  }));
}

// ── Stored connection ─────────────────────────────────────────────────────

export type MetaConnectionRow = {
  workspace_id: string;
  token: unknown;
  token_expires_at: string | null;
  granted_scopes: string[];
  meta_user_id: string;
  meta_user_name: string | null;
  ad_account_id: string | null;
  ad_account_name: string | null;
  ad_account_currency: string | null;
  business_id: string | null;
  business_name: string | null;
  page_id: string | null;
  page_name: string | null;
  catalog_id: string | null;
  catalog_name: string | null;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function loadMetaConnection(admin: SupabaseClient, workspaceId: string): Promise<MetaConnectionRow | null> {
  const { data, error } = await admin.from("meta_ads_connections").select("*").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MetaConnectionRow | null) ?? null;
}

export function isExpired(row: Pick<MetaConnectionRow, "token_expires_at">, now = Date.now()): boolean {
  return !!row.token_expires_at && new Date(row.token_expires_at).getTime() <= now;
}

/** The decrypted token, or a 409 the UI turns into "Reconnect Meta". */
export function tokenOf(row: MetaConnectionRow | null): string {
  if (!row) throw new ConnectionHttpError(409, "not_connected");
  if (isExpired(row)) throw new ConnectionHttpError(409, "token_expired");
  const token = decryptIntegrationConfig(row.token).plaintext.access_token;
  if (typeof token !== "string" || !token) throw new ConnectionHttpError(409, "not_connected");
  return token;
}

export async function saveConnection(
  admin: SupabaseClient,
  input: { workspaceId: string; userId: string; token: TokenResult; user: { id: string; name: string | null }; scopes: string[] }
): Promise<void> {
  const previous = await loadMetaConnection(admin, input.workspaceId);
  // Reconnecting with the same Meta person keeps the assets already picked.
  const keep = previous && previous.meta_user_id === input.user.id;
  const { error } = await admin.from("meta_ads_connections").upsert(
    {
      workspace_id: input.workspaceId,
      token: encryptIntegrationConfig({ access_token: input.token.accessToken }),
      token_expires_at: input.token.expiresAt?.toISOString() ?? null,
      granted_scopes: input.scopes,
      meta_user_id: input.user.id,
      meta_user_name: input.user.name,
      ad_account_id: keep ? previous.ad_account_id : null,
      ad_account_name: keep ? previous.ad_account_name : null,
      ad_account_currency: keep ? previous.ad_account_currency : null,
      business_id: keep ? previous.business_id : null,
      business_name: keep ? previous.business_name : null,
      page_id: keep ? previous.page_id : null,
      page_name: keep ? previous.page_name : null,
      catalog_id: keep ? previous.catalog_id : null,
      catalog_name: keep ? previous.catalog_name : null,
      connected_by: input.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" }
  );
  if (error) throw new Error(error.message);
  if (previous && !keep) {
    try {
      forgetToken(tokenOf(previous));
    } catch {
      // Old token unreadable or expired: nothing cached worth clearing.
    }
  }
}

export type AssetSelection = Partial<{
  adAccount: { id: string; name: string; currency: string } | null;
  business: { id: string; name: string } | null;
  page: { id: string; name: string } | null;
  catalog: { id: string; name: string } | null;
}>;

const ID = /^[0-9]{1,30}$/;
const name = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");

/** Validates a selection from the browser. Ids must be digits ("act_" is stripped). */
export function parseSelection(body: Record<string, unknown>): AssetSelection | null {
  const out: AssetSelection = {};
  const pick = (value: unknown, withCurrency = false) => {
    if (value === null) return null;
    if (!value || typeof value !== "object") return undefined;
    const v = value as Record<string, unknown>;
    const id = String(v.id ?? "").replace(/^act_/, "");
    if (!ID.test(id)) return false as const;
    return withCurrency ? { id, name: name(v.name) || id, currency: name(v.currency).slice(0, 10) } : { id, name: name(v.name) || id };
  };
  const entries = [
    ["adAccount", pick(body.adAccount, true)],
    ["business", pick(body.business)],
    ["page", pick(body.page)],
    ["catalog", pick(body.catalog)],
  ] as const;
  for (const [key, value] of entries) {
    if (value === false) return null;
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

export async function saveSelection(admin: SupabaseClient, workspaceId: string, sel: AssetSelection): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (sel.adAccount !== undefined) Object.assign(patch, { ad_account_id: sel.adAccount?.id ?? null, ad_account_name: sel.adAccount?.name ?? null, ad_account_currency: sel.adAccount?.currency || null });
  if (sel.business !== undefined) Object.assign(patch, { business_id: sel.business?.id ?? null, business_name: sel.business?.name ?? null });
  if (sel.page !== undefined) Object.assign(patch, { page_id: sel.page?.id ?? null, page_name: sel.page?.name ?? null });
  if (sel.catalog !== undefined) Object.assign(patch, { catalog_id: sel.catalog?.id ?? null, catalog_name: sel.catalog?.name ?? null });
  const { error } = await admin.from("meta_ads_connections").update(patch).eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
}

/**
 * Disconnect: revoke on Meta (best effort), then delete the token, the
 * connection and the change log at once, and the Meta Ads chats (their messages
 * hold data read from Meta). Matches the /data-deletion page.
 */
export async function disconnectMeta(admin: SupabaseClient, workspaceId: string, opts: { revoke?: boolean } = {}): Promise<void> {
  const row = await loadMetaConnection(admin, workspaceId);
  if (row && opts.revoke !== false) {
    try {
      const token = tokenOf(row);
      forgetToken(token);
      await revokeOnMeta(token);
    } catch (error) {
      console.warn("[meta-ads] revoke on Meta failed", (error as Error).message);
    }
  }
  const results = await Promise.all([
    admin.from("meta_ads_connections").delete().eq("workspace_id", workspaceId),
    admin.from("meta_ads_changes").delete().eq("workspace_id", workspaceId),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  await deleteMetaChats(admin, workspaceId);
}

/**
 * Meta Ads chats go through the agent service, which also removes their files
 * and agent memory. A chat the service could not delete is removed from the
 * database here, so no Meta data stays visible either way.
 */
async function deleteMetaChats(admin: SupabaseClient, workspaceId: string): Promise<void> {
  const { data: chats } = await admin.from("store_agent_chats").select("id, user_id").eq("workspace_id", workspaceId).eq("domain", "meta_ads");
  if (!chats?.length) return;
  const { callStoreAgentService } = await import("@/lib/store-agent/server");
  for (const chat of chats) {
    try {
      const res = await callStoreAgentService({ path: "/store-agent/chats/delete", userId: String(chat.user_id), body: { chatId: chat.id } });
      if (res.ok) continue;
    } catch {
      // Service unreachable: fall through to the database delete.
    }
    await admin.from("store_agent_chats").delete().eq("id", chat.id);
  }
}

// ── Deauthorize callback (signed_request) ────────────────────────────────

/** Meta's signed_request: base64url(signature).base64url(payload), HMAC-SHA256 with the app secret. */
export function parseSignedRequest(raw: string, appSecret = requireConfig().appSecret): { user_id?: string; algorithm?: string } | null {
  const [sig, payload] = raw.split(".", 2);
  if (!sig || !payload) return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const given = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    if (String(data.algorithm).toUpperCase() !== "HMAC-SHA256") return null;
    return data;
  } catch {
    return null;
  }
}

/** HTTP status and a safe code for any error from this module, the MCP client or the Graph API. */
export function metaErrorStatus(err: unknown): { status: number; code: string } {
  if (err instanceof MetaGraphError) {
    // 190: token invalid or expired; 200/10: permission missing.
    if (err.metaCode === 190) return { status: 409, code: "token_expired" };
    if (err.metaCode === 200 || err.metaCode === 10) return { status: 403, code: "meta_permission_missing" };
    return { status: 502, code: "meta_request_failed" };
  }
  if (err instanceof MetaMcpError) {
    if (err.code === "unauthorized") return { status: 409, code: "token_expired" };
    if (err.code === "network") return { status: 503, code: "network" };
    return { status: 502, code: "meta_request_failed" };
  }
  return errorStatus(err);
}

/** Short, non-reversible id for logs. */
export const logId = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 10);
