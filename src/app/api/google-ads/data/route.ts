import { NextRequest, NextResponse } from "next/server";
import { errorStatus, loadConnection, requireConnectionAccess, selectAccount } from "@/lib/google-ads/connection.server";
import { loadLiveAccount } from "@/lib/google-ads/live-report.server";
import { isValidLiveRange } from "@/lib/google-ads/live-segments";
import { allowForcedRefresh } from "@/lib/google-ads/refresh-limit";

/**
 * Read-only snapshot of the workspace's chosen Google Ads account for a date
 * range. The account comes from our database; the browser only picks the dates.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const workspaceId = params.get("workspaceId") ?? "";
    const start = params.get("start") ?? "";
    const end = params.get("end") ?? "";
    if (!isValidLiveRange(start, end))
      return NextResponse.json({ error: "invalid_range" }, { status: 400 });

    const { admin } = await requireConnectionAccess(workspaceId);
    const row = await loadConnection(admin, workspaceId, "ads");
    if (!row?.composio_connected_account_id || !row.account_id) return NextResponse.json({ error: "not_connected" }, { status: 409 });

    const { data, fetchedAt } = await loadLiveAccount(row, { start, end }, { force: params.get("refresh") === "1" && allowForcedRefresh(workspaceId, "ads") });
    // Accounts picked through a manager were saved without these; the agent's dates and reports use them.
    if (!row.account_currency || !row.account_time_zone)
      await selectAccount(admin, row, { id: row.account_id, name: row.account_name ?? data.account.name, currency: data.account.currency, timeZone: data.account.timeZone });
    return NextResponse.json({ data, fetchedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, code } = errorStatus(err);
    if (status >= 500) console.error("[google-ads/data]", code, (err as { detail?: string }).detail ?? (err as Error).message);
    return NextResponse.json({ error: code }, { status });
  }
}
