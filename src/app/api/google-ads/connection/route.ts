import { NextRequest, NextResponse } from "next/server";
import { publicOriginFromRequest } from "@/lib/app-origin";
import {
  connectionConfigured,
  disconnect,
  errorStatus,
  isConnectionKind,
  loadConnections,
  normalizeCustomerId,
  requireConnectionAccess,
  startConnection,
  toClientConnection,
} from "@/lib/google-ads/connection.server";
import { forgetLiveAccount } from "@/lib/google-ads/live-report.server";
import { forgetMerchant } from "@/lib/google-ads/merchant.server";

const fail = (err: unknown) => {
  const { status, code } = errorStatus(err);
  return NextResponse.json({ error: code }, { status });
};

/** Both connections of a workspace, without any Composio ids. */
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
    if (!connectionConfigured()) return NextResponse.json({ configured: false });
    const { admin } = await requireConnectionAccess(workspaceId);
    const rows = await loadConnections(admin, workspaceId);
    return NextResponse.json({ configured: true, ads: toClientConnection(rows.ads), merchant: toClientConnection(rows.merchant) });
  } catch (err) {
    return fail(err);
  }
}

/** Start Google sign-in; returns the URL to send the browser to. Admins only. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { workspaceId?: unknown; kind?: unknown; loginCustomerId?: unknown } | null;
    const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
    const kind = body?.kind;
    if (!isConnectionKind(kind)) return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
    const loginCustomerId = kind === "ads" ? normalizeCustomerId(body?.loginCustomerId) : null;
    if (kind === "ads" && !loginCustomerId) return NextResponse.json({ error: "invalid_customer_id" }, { status: 400 });

    const { user, admin } = await requireConnectionAccess(workspaceId, { admin: true });
    const callback = new URL("/api/google-ads/connection/complete", publicOriginFromRequest(request));
    callback.searchParams.set("workspaceId", workspaceId);
    callback.searchParams.set("kind", kind);
    const redirectUrl = await startConnection({ admin, workspaceId, kind, userId: user.id, loginCustomerId, callbackUrl: callback.toString() });
    return NextResponse.json({ redirectUrl });
  } catch (err) {
    return fail(err);
  }
}

/** Remove the connection here and in Composio. Admins only. */
export async function DELETE(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
    const kind = request.nextUrl.searchParams.get("kind");
    if (!isConnectionKind(kind)) return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
    const { admin } = await requireConnectionAccess(workspaceId, { admin: true });
    await disconnect(admin, workspaceId, kind);
    if (kind === "ads") forgetLiveAccount(workspaceId);
    else forgetMerchant(workspaceId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
