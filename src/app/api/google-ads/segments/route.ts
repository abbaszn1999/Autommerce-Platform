import { NextRequest, NextResponse } from "next/server";
import { errorStatus, loadConnection, requireConnectionAccess } from "@/lib/google-ads/connection.server";
import { isLiveSegment, isValidLiveRange } from "@/lib/google-ads/live-segments";
import { loadSegment } from "@/lib/google-ads/live-segments.server";

/**
 * One breakdown of the workspace's chosen Google Ads account (device, hour, age…)
 * for a date range. The account comes from our database.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const workspaceId = params.get("workspaceId") ?? "";
    const segment = params.get("segment") ?? "";
    const start = params.get("start") ?? "";
    const end = params.get("end") ?? "";
    if (!isLiveSegment(segment)) return NextResponse.json({ error: "invalid_segment" }, { status: 400 });
    if (!isValidLiveRange(start, end)) return NextResponse.json({ error: "invalid_range" }, { status: 400 });

    const { admin } = await requireConnectionAccess(workspaceId);
    const row = await loadConnection(admin, workspaceId, "ads");
    if (!row?.composio_connected_account_id || !row.account_id) return NextResponse.json({ error: "not_connected" }, { status: 409 });

    const result = await loadSegment(row, segment, { start, end });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, code } = errorStatus(err);
    if (status >= 500) console.error("[google-ads/segments]", code, (err as { detail?: string }).detail ?? (err as Error).message);
    return NextResponse.json({ error: code }, { status });
  }
}
