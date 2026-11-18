import { NextRequest, NextResponse } from "next/server";
import { requireConnectionAccess } from "@/lib/google-ads/connection.server";
import {
  RECONNECT_WARNING_MS,
  disconnectMeta,
  isExpired,
  loadMetaConnection,
  metaConfig,
  metaErrorStatus,
  parseSelection,
  saveSelection,
  type MetaConnectionRow,
} from "@/lib/meta-ads/connection.server";

export const dynamic = "force-dynamic";

const fail = (err: unknown) => {
  const { status, code } = metaErrorStatus(err);
  return NextResponse.json({ error: code }, { status });
};

/** What the browser may know about the connection: never the token. */
function toClient(row: MetaConnectionRow | null) {
  if (!row) return null;
  const expiresAt = row.token_expires_at;
  return {
    metaUserName: row.meta_user_name,
    connectedAt: row.created_at,
    expiresAt,
    expired: isExpired(row),
    expiresSoon: !!expiresAt && new Date(expiresAt).getTime() - Date.now() < RECONNECT_WARNING_MS,
    scopes: row.granted_scopes,
    adAccount: row.ad_account_id ? { id: row.ad_account_id, name: row.ad_account_name ?? row.ad_account_id, currency: row.ad_account_currency } : null,
    business: row.business_id ? { id: row.business_id, name: row.business_name ?? row.business_id } : null,
    page: row.page_id ? { id: row.page_id, name: row.page_name ?? row.page_id } : null,
    catalog: row.catalog_id ? { id: row.catalog_id, name: row.catalog_name ?? row.catalog_id } : null,
  };
}

/** The workspace's Meta connection. Any member may see it; only admins change it. */
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
    const { admin, role } = await requireConnectionAccess(workspaceId);
    if (!metaConfig()) return NextResponse.json({ configured: false, connection: null, canManage: false });
    const row = await loadMetaConnection(admin, workspaceId);
    return NextResponse.json({ configured: true, connection: toClient(row), canManage: role === "owner" || role === "admin" });
  } catch (err) {
    return fail(err);
  }
}

/** Pick the ad account, business, Page and catalog the agent works on. */
export async function PATCH(request: NextRequest) {
  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    const { admin } = await requireConnectionAccess(workspaceId, { admin: true });
    const row = await loadMetaConnection(admin, workspaceId);
    if (!row) return NextResponse.json({ error: "not_connected" }, { status: 409 });
    const selection = parseSelection(body);
    if (!selection) return NextResponse.json({ error: "invalid_selection" }, { status: 400 });
    await saveSelection(admin, workspaceId, selection);
    return NextResponse.json({ connection: toClient(await loadMetaConnection(admin, workspaceId)) });
  } catch (err) {
    return fail(err);
  }
}

/** Disconnect: revoke on Meta, delete the token, the change log and the Meta Ads chats. */
export async function DELETE(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
    const { admin } = await requireConnectionAccess(workspaceId, { admin: true });
    await disconnectMeta(admin, workspaceId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
