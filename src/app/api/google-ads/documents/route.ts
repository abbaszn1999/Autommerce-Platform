import { NextRequest, NextResponse } from "next/server";
import { errorStatus, loadConnection, requireConnectionAccess } from "@/lib/google-ads/connection.server";
import { listDocs } from "@/lib/google-ads/live-docs.server";

/** The plans and reports Vera wrote for the workspace's connected Google Ads account. Members can read them. */
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
    const { admin, role } = await requireConnectionAccess(workspaceId);
    const row = await loadConnection(admin, workspaceId, "ads");
    if (!row?.account_id) return NextResponse.json({ documents: [], canApply: false });
    const documents = await listDocs(admin, workspaceId, row.account_id);
    return NextResponse.json({ documents, canApply: role === "owner" || role === "admin" }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, code } = errorStatus(err);
    return NextResponse.json({ error: code }, { status });
  }
}
