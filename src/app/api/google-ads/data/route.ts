import { NextRequest, NextResponse } from "next/server";
import { errorStatus, loadConnection, requireConnectionAccess } from "@/lib/google-ads/connection.server";
import { loadLiveAccount } from "@/lib/google-ads/live-report.server";
import { addDays, isoDay } from "@/lib/google-ads/metrics";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

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
    if (!DAY.test(start) || !DAY.test(end) || start > end || end > isoDay(new Date()) || start < addDays(end, -365))
      return NextResponse.json({ error: "invalid_range" }, { status: 400 });

    const { admin } = await requireConnectionAccess(workspaceId);
    const row = await loadConnection(admin, workspaceId, "ads");
    if (!row?.composio_connected_account_id || !row.account_id) return NextResponse.json({ error: "not_connected" }, { status: 409 });

    const { data, fetchedAt } = await loadLiveAccount(row, { start, end }, { force: params.get("refresh") === "1" });
    return NextResponse.json({ data, fetchedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, code } = errorStatus(err);
    if (status >= 500) console.error("[google-ads/data]", code, (err as { detail?: string }).detail ?? (err as Error).message);
    return NextResponse.json({ error: code }, { status });
  }
}
