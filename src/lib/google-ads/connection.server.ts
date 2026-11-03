// Server side of the Google Ads / Merchant Center connection. Composio holds the
// Google tokens (user_id = workspace id); our table keeps which connection and
// which account each workspace uses. Never import from client code.

import { Composio, AuthScheme } from "@composio/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export type ConnectionKind = "ads" | "merchant";

export const isConnectionKind = (v: unknown): v is ConnectionKind => v === "ads" || v === "merchant";

export class ConnectionHttpError extends Error {
  /** `message` is the code sent to the browser; `detail` (e.g. Google's error text) is for server logs only. */
  constructor(public status: number, message: string, public detail?: string) {
    super(message);
  }
}

export type ConnectionRow = {
  workspace_id: string;
  kind: ConnectionKind;
  composio_connected_account_id: string | null;
  pending_connected_account_id: string | null;
  composio_auth_config_id: string;
  login_customer_id: string | null;
  pending_login_customer_id: string | null;
  account_id: string | null;
  account_name: string | null;
  account_currency: string | null;
  account_time_zone: string | null;
};

/** What the browser may see about a connection: no Composio ids. */
export type ClientConnection = {
  status: "none" | "selecting" | "connected";
  loginCustomerId: string | null;
  accountId: string | null;
  accountName: string | null;
  currency: string | null;
  timeZone: string | null;
};

export function toClientConnection(row: ConnectionRow | null | undefined): ClientConnection {
  if (!row?.composio_connected_account_id)
    return { status: "none", loginCustomerId: null, accountId: null, accountName: null, currency: null, timeZone: null };
  return {
    status: row.account_id ? "connected" : "selecting",
    loginCustomerId: row.login_customer_id,
    accountId: row.account_id,
    accountName: row.account_name,
    currency: row.account_currency,
    timeZone: row.account_time_zone,
  };
}

/** Accounts offered in the picker. */
export type AdsAccountOption = {
  customerId: string;
  name: string;
  currency: string;
  timeZone: string;
  isManager: boolean;
  managerCustomerId?: string;
  /** False for cancelled, suspended or otherwise unusable accounts. */
  usable: boolean;
};

export type MerchantAccountOption = { merchantId: string; name: string; website: string; timeZone: string };

const AUTH_CONFIG_ENV: Record<ConnectionKind, string> = {
  ads: "COMPOSIO_GOOGLEADS_AUTH_CONFIG_ID",
  merchant: "COMPOSIO_MERCHANT_AUTH_CONFIG_ID",
};

export function connectionConfigured(): boolean {
  return !!process.env.COMPOSIO_API_KEY && !!process.env[AUTH_CONFIG_ENV.ads] && !!process.env[AUTH_CONFIG_ENV.merchant];
}

export function authConfigId(kind: ConnectionKind): string {
  const id = process.env[AUTH_CONFIG_ENV[kind]];
  if (!id) throw new ConnectionHttpError(503, "not_configured");
  return id;
}

let composio: Composio | null = null;

function getComposio(): Composio {
  if (!process.env.COMPOSIO_API_KEY) throw new ConnectionHttpError(503, "not_configured");
  composio ??= new Composio({ apiKey: process.env.COMPOSIO_API_KEY, toolkitVersions: { googleads: "latest", google_merchant: "latest" } });
  return composio;
}

/** "204-636-2164", "204 636 2164" or "2046362164" → "2046362164"; anything else → null. */
export function normalizeCustomerId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{10}$/.test(digits) ? digits : null;
}

/** Signed-in member of the workspace (admin or owner when `admin` is set). */
export async function requireConnectionAccess(workspaceId: string, opts: { admin?: boolean } = {}) {
  if (!workspaceId) throw new ConnectionHttpError(400, "missing_workspace");
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  // Supabase Auth unreachable is not "signed out": say so, so the user retries instead of signing in again.
  if (!user && error && (error.name === "AuthRetryableFetchError" || error.status === 0 || /fetch failed/i.test(error.message)))
    throw new ConnectionHttpError(503, "network");
  if (!user) throw new ConnectionHttpError(401, "unauthorized");
  const admin = createAdminClient();
  const { data: member } = await admin.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (!member) throw new ConnectionHttpError(403, "forbidden");
  if (opts.admin && !["owner", "admin"].includes(member.role)) throw new ConnectionHttpError(403, "forbidden");
  return { user, admin };
}

export async function loadConnections(admin: SupabaseClient, workspaceId: string): Promise<Record<ConnectionKind, ConnectionRow | null>> {
  const { data, error } = await admin.from("google_ads_connections").select("*").eq("workspace_id", workspaceId);
  if (error) throw new ConnectionHttpError(500, "load_failed");
  const rows = (data ?? []) as ConnectionRow[];
  return { ads: rows.find((r) => r.kind === "ads") ?? null, merchant: rows.find((r) => r.kind === "merchant") ?? null };
}

export async function loadConnection(admin: SupabaseClient, workspaceId: string, kind: ConnectionKind): Promise<ConnectionRow | null> {
  return (await loadConnections(admin, workspaceId))[kind];
}

/**
 * Start Google sign-in. Keeps any active connection until the new one is ACTIVE,
 * so a cancelled reconnect leaves the workspace connected.
 */
export async function startConnection(opts: {
  admin: SupabaseClient;
  workspaceId: string;
  kind: ConnectionKind;
  userId: string;
  loginCustomerId: string | null;
  callbackUrl: string;
}): Promise<string> {
  const { admin, workspaceId, kind } = opts;
  if (kind === "ads" && !opts.loginCustomerId) throw new ConnectionHttpError(400, "invalid_customer_id");
  const configId = authConfigId(kind);
  const client = getComposio();
  const existing = await loadConnection(admin, workspaceId, kind);
  if (existing?.pending_connected_account_id) await deleteComposioAccount(existing.pending_connected_account_id);

  const request = await client.connectedAccounts.initiate(workspaceId, configId, {
    callbackUrl: opts.callbackUrl,
    allowMultiple: true,
    ...(kind === "ads" ? { config: AuthScheme.OAuth2({ generic_id: opts.loginCustomerId! }) } : {}),
  });
  if (!request.redirectUrl) {
    await deleteComposioAccount(request.id);
    throw new ConnectionHttpError(502, "connect_failed");
  }

  const { error } = await admin.from("google_ads_connections").upsert(
    {
      workspace_id: workspaceId,
      kind,
      pending_connected_account_id: request.id,
      pending_login_customer_id: kind === "ads" ? opts.loginCustomerId : null,
      composio_auth_config_id: configId,
      ...(existing ? {} : { composio_connected_account_id: null }),
      connected_by: opts.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,kind" }
  );
  if (error) {
    await deleteComposioAccount(request.id);
    throw new ConnectionHttpError(500, "save_failed");
  }
  return request.redirectUrl;
}

/**
 * After Google sends the user back: trust nothing in the URL, ask Composio
 * whether this workspace's pending connection is ACTIVE, then make it the active one.
 */
export async function completeConnection(admin: SupabaseClient, workspaceId: string, kind: ConnectionKind): Promise<boolean> {
  const row = await loadConnection(admin, workspaceId, kind);
  const pendingId = row?.pending_connected_account_id;
  if (!row || !pendingId) return !!row?.composio_connected_account_id;

  const { items } = await getComposio().connectedAccounts.list({ userIds: [workspaceId], authConfigIds: [row.composio_auth_config_id], statuses: ["ACTIVE"] });
  if (!items.some((a) => a.id === pendingId)) return false;

  const previous = row.composio_connected_account_id;
  const { error } = await admin
    .from("google_ads_connections")
    .update({
      composio_connected_account_id: pendingId,
      pending_connected_account_id: null,
      login_customer_id: row.pending_login_customer_id,
      pending_login_customer_id: null,
      // A new sign-in may reach different accounts, so the pick starts over.
      account_id: null,
      account_name: null,
      account_currency: null,
      account_time_zone: null,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("kind", kind);
  if (error) throw new ConnectionHttpError(500, "save_failed");
  if (previous && previous !== pendingId) await deleteComposioAccount(previous);
  return true;
}

export async function disconnect(admin: SupabaseClient, workspaceId: string, kind: ConnectionKind): Promise<void> {
  const row = await loadConnection(admin, workspaceId, kind);
  if (!row) return;
  for (const id of [row.composio_connected_account_id, row.pending_connected_account_id]) if (id) await deleteComposioAccount(id);
  const { error } = await admin.from("google_ads_connections").delete().eq("workspace_id", workspaceId).eq("kind", kind);
  if (error) throw new ConnectionHttpError(500, "save_failed");
}

async function deleteComposioAccount(id: string) {
  try {
    await getComposio().connectedAccounts.delete(id);
  } catch {
    // Already gone, or Composio is down: the row is the source of truth for us.
  }
}

async function execute<T>(row: ConnectionRow, slug: string, args: Record<string, unknown>): Promise<T> {
  if (!row.composio_connected_account_id) throw new ConnectionHttpError(409, "not_connected");
  const result = await getComposio().tools.execute(slug, {
    userId: row.workspace_id,
    connectedAccountId: row.composio_connected_account_id,
    arguments: args,
    dangerouslySkipVersionCheck: true,
  });
  if (!result.successful) throw new ConnectionHttpError(502, "google_request_failed", String(result.error ?? "").slice(0, 600));
  return result.data as T;
}

/**
 * GoogleAdsService.Mutate through Composio: all operations succeed together or none
 * do (partial_failure off). With `validateOnly`, Google checks everything and changes nothing.
 */
export async function batchMutate(
  row: ConnectionRow,
  customerId: string,
  operations: Record<string, unknown>[],
  opts: { validateOnly: boolean }
): Promise<{ mutate_operation_responses?: unknown[]; mutateOperationResponses?: unknown[] } & Record<string, unknown>> {
  return execute(row, "GOOGLEADS_BATCH_MUTATE", {
    customer_id: customerId,
    mutate_operations: operations,
    validate_only: opts.validateOnly,
    partial_failure: false,
    response_content_type: "RESOURCE_NAME_ONLY",
  });
}

/**
 * Run a GAQL query on one customer and return every row (follows page tokens).
 * The customer id always comes from our database, never from the browser or the model.
 */
export async function searchGaql<T = Record<string, unknown>>(row: ConnectionRow, customerId: string, query: string, maxPages = 10): Promise<T[]> {
  const rows: T[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const data = await execute<{ results?: T[]; next_page_token?: string | null; nextPageToken?: string | null }>(row, "GOOGLEADS_SEARCH_GAQL", {
      customer_id: customerId,
      query,
      ...(pageToken ? { page_token: pageToken } : {}),
    });
    rows.push(...(data.results ?? []));
    pageToken = data.next_page_token ?? data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }
  return rows;
}

type CustomerRow = { customer?: { id?: string; descriptiveName?: string; currencyCode?: string; timeZone?: string; manager?: boolean } };
type SubAccount = { customerClient?: { id?: string; descriptiveName?: string; manager?: boolean; status?: string; level?: string | number } };

/** Every Google Ads account the signed-in user can reach, including accounts under a manager. */
export async function listAdsAccounts(row: ConnectionRow): Promise<AdsAccountOption[]> {
  const { resourceNames = [] } = await execute<{ resourceNames?: string[] }>(row, "GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS", {});
  const ids = resourceNames.map((n) => n.replace("customers/", "")).filter((id) => /^\d{10}$/.test(id));

  const direct = await Promise.all(
    ids.map(async (id): Promise<AdsAccountOption> => {
      try {
        const data = await execute<{ results?: CustomerRow[] }>(row, "GOOGLEADS_SEARCH_GAQL", {
          customer_id: id,
          query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1",
        });
        const c = data.results?.[0]?.customer ?? {};
        return { customerId: id, name: c.descriptiveName || id, currency: c.currencyCode ?? "", timeZone: c.timeZone ?? "", isManager: !!c.manager, usable: true };
      } catch {
        // Google refuses cancelled or not-yet-enabled accounts; show them greyed out.
        return { customerId: id, name: id, currency: "", timeZone: "", isManager: false, usable: false };
      }
    })
  );

  const children: AdsAccountOption[] = [];
  for (const manager of direct.filter((a) => a.isManager && a.usable)) {
    try {
      const data = await execute<{ sub_accounts?: SubAccount[] }>(row, "GOOGLEADS_LIST_SUB_ACCOUNTS", { customer_id: manager.customerId });
      for (const s of data.sub_accounts ?? []) {
        const c = s.customerClient ?? {};
        if (!c.id || c.id === manager.customerId || ids.includes(c.id) || children.some((x) => x.customerId === c.id)) continue;
        children.push({
          customerId: c.id,
          name: c.descriptiveName || c.id,
          currency: "",
          timeZone: "",
          isManager: !!c.manager,
          managerCustomerId: manager.customerId,
          usable: !c.status || c.status === "ENABLED",
        });
      }
    } catch {
      // A manager we can't expand still shows its own row.
    }
  }
  return [...direct, ...children];
}

type MerchantApiAccount = { account_id?: string; account_name?: string; home_page_uri?: string; time_zone?: { id?: string } };

export async function listMerchantAccounts(row: ConnectionRow): Promise<MerchantAccountOption[]> {
  const out: MerchantAccountOption[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const data = await execute<{ accounts?: MerchantApiAccount[]; has_more?: boolean; next_cursor?: string | null }>(row, "GOOGLE_MERCHANT_LIST_ACCOUNTS", {
      page_size: 250,
      ...(cursor ? { cursor } : {}),
    });
    for (const a of data.accounts ?? [])
      if (a.account_id) out.push({ merchantId: a.account_id, name: a.account_name || a.account_id, website: a.home_page_uri ?? "", timeZone: a.time_zone?.id ?? "" });
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return out;
}

export async function selectAccount(
  admin: SupabaseClient,
  row: ConnectionRow,
  account: { id: string; name: string; currency?: string; timeZone?: string }
): Promise<void> {
  const { error } = await admin
    .from("google_ads_connections")
    .update({
      account_id: account.id,
      account_name: account.name,
      account_currency: account.currency || null,
      account_time_zone: account.timeZone || null,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", row.workspace_id)
    .eq("kind", row.kind);
  if (error) throw new ConnectionHttpError(500, "save_failed");
}

export function errorStatus(err: unknown): { status: number; code: string } {
  if (err instanceof ConnectionHttpError) return { status: err.status, code: err.message };
  // Supabase or Composio unreachable (timeouts, DNS): worth retrying, not a bug.
  const text = `${(err as Error)?.message ?? ""} ${String((err as { cause?: { code?: string } })?.cause?.code ?? "")}`;
  if (/fetch failed|timed? ?out|UND_ERR|ECONN|ENOTFOUND|EAI_AGAIN/i.test(text)) return { status: 503, code: "network" };
  return { status: 500, code: "internal_error" };
}
