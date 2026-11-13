import { NextRequest, NextResponse } from "next/server";
import { errorStatus, loadConnection, requireConnectionAccess } from "@/lib/google-ads/connection.server";
import { loadMerchantSnapshot } from "@/lib/google-ads/merchant.server";
import { allowForcedRefresh } from "@/lib/google-ads/refresh-limit";

/**
 * Read-only snapshot of the workspace's chosen Merchant Center account: products,
 * their status and issues, and account issues. The account comes from our database.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const workspaceId = params.get("workspaceId") ?? "";
    const { admin } = await requireConnectionAccess(workspaceId);
    const row = await loadConnection(admin, workspaceId, "merchant");
    if (!row?.composio_connected_account_id || !row.account_id) return NextResponse.json({ error: "not_connected" }, { status: 409 });

    const data = await loadMerchantSnapshot(row, { force: params.get("refresh") === "1" && allowForcedRefresh(workspaceId, "merchant") });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, code } = errorStatus(err);
    if (status >= 500) console.error("[google-ads/merchant]", code, (err as { detail?: string }).detail ?? (err as Error).message);
    return NextResponse.json({ error: code }, { status });
  }
}
