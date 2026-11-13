import { NextRequest, NextResponse } from "next/server";
import {
  ConnectionHttpError,
  adsAccountDetails,
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

/** Accounts the connected Google sign-in can reach. Owners and admins only: it lists every account that person can open. */
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
    const kind = request.nextUrl.searchParams.get("kind");
    if (!isConnectionKind(kind)) return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
    const { row } = await connected(workspaceId, kind, { admin: true });
    if (kind === "merchant") return NextResponse.json({ accounts: await listMerchantAccounts(row) });
    const accounts = await listAdsAccounts(row);
    // Every request goes through the customer ID typed before sign-in. When it isn't one this sign-in can use,
    // Google refuses every account: say so, instead of listing them all as not active.
    const wrongLoginId =
      !!row.login_customer_id &&
      accounts.length > 0 &&
      !accounts.some((a) => a.usable) &&
      accounts.some((a) => a.reason === "This sign-in has no access to it");
    return NextResponse.json({ accounts, ...(wrongLoginId ? { wrongLoginId: row.login_customer_id } : {}) });
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

    // Accounts listed under a manager come without their currency and time zone.
    const details = kind === "ads" && "currency" in pick && (!pick.currency || !pick.timeZone) ? await adsAccountDetails(row, accountId) : null;
    const account = details ? { ...pick, ...details } : pick;
    await selectAccount(admin, row, {
      id: accountId,
      name: account.name,
      currency: "currency" in account ? account.currency : undefined,
      timeZone: account.timeZone,
    });
    return NextResponse.json({ account });
  } catch (err) {
    return fail(err);
  }
}
