import { NextRequest, NextResponse } from "next/server";
import {
  ConnectionHttpError,
  errorStatus,
  isConnectionKind,
  listAdsAccounts,
  listMerchantAccounts,
  loadConnection,
  requireConnectionAccess,
  selectAccount,
} from "@/lib/google-ads/connection.server";

const fail = (err: unknown) => {
  const { status, code } = errorStatus(err);
  return NextResponse.json({ error: code }, { status });
};

async function connected(workspaceId: string, kind: "ads" | "merchant", opts: { admin?: boolean } = {}) {
  const { admin } = await requireConnectionAccess(workspaceId, opts);
  const row = await loadConnection(admin, workspaceId, kind);
  if (!row?.composio_connected_account_id) throw new ConnectionHttpError(409, "not_connected");
  return { admin, row };
}

/** Accounts the connected Google sign-in can reach. */
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
    const kind = request.nextUrl.searchParams.get("kind");
    if (!isConnectionKind(kind)) return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
    const { row } = await connected(workspaceId, kind);
    const accounts = kind === "ads" ? await listAdsAccounts(row) : await listMerchantAccounts(row);
    return NextResponse.json({ accounts });
  } catch (err) {
    return fail(err);
  }
}

/** Pick the account the agent works on. It must be one the sign-in can reach. Admins only. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { workspaceId?: unknown; kind?: unknown; accountId?: unknown } | null;
    const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
    const kind = body?.kind;
    const accountId = typeof body?.accountId === "string" ? body.accountId.replace(/-/g, "") : "";
    if (!isConnectionKind(kind)) return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
    if (!/^\d{1,20}$/.test(accountId)) return NextResponse.json({ error: "invalid_account" }, { status: 400 });

    const { admin, row } = await connected(workspaceId, kind, { admin: true });
    const pick =
      kind === "ads"
        ? (await listAdsAccounts(row)).find((a) => a.customerId === accountId && a.usable && !a.isManager)
        : (await listMerchantAccounts(row)).find((a) => a.merchantId === accountId);
    if (!pick) return NextResponse.json({ error: "account_not_accessible" }, { status: 403 });

    await selectAccount(admin, row, {
      id: accountId,
      name: pick.name,
      currency: "currency" in pick ? pick.currency : undefined,
      timeZone: pick.timeZone,
    });
    return NextResponse.json({ account: pick });
  } catch (err) {
    return fail(err);
  }
}
