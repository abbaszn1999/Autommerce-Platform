import { NextRequest, NextResponse } from "next/server";
import { errorStatus, loadConnection, requireConnectionAccess } from "@/lib/google-ads/connection.server";
import { KeywordInputError } from "@/lib/google-ads/keyword-planner";
import { keywordForecast, keywordResearch } from "@/lib/google-ads/keyword-planner.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Keyword Planner for the page: ideas, search volumes or a forecast from the
 * workspace's connected Google Ads account. Reading only: nothing is created in
 * the account. Any member can use it.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
    const { admin } = await requireConnectionAccess(workspaceId);
    const row = await loadConnection(admin, workspaceId, "ads");
    if (!row?.composio_connected_account_id || !row.account_id) return NextResponse.json({ error: "not_connected" }, { status: 409 });
    try {
      if (body?.mode === "forecast") return NextResponse.json({ forecast: await keywordForecast(admin, row, body) });
      return NextResponse.json({ research: await keywordResearch(admin, row, body ?? {}) });
    } catch (err) {
      if (err instanceof KeywordInputError) return NextResponse.json({ error: "invalid", message: err.message }, { status: 422 });
      throw err;
    }
  } catch (err) {
    const { status, code } = errorStatus(err);
    if (status >= 500) console.error("[google-ads/keywords]", code, (err as { detail?: string }).detail ?? (err as Error).message);
    return NextResponse.json({ error: code }, { status });
  }
}
