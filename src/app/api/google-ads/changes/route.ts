import { NextRequest, NextResponse } from "next/server";
import { errorStatus, loadConnection, requireConnectionAccess } from "@/lib/google-ads/connection.server";
import { applyLiveChange } from "@/lib/google-ads/live-mutate.server";
import type { MutateOp } from "@/lib/google-ads/types";

const SOURCES = new Set(["AGENT", "USER", "RECOMMENDATION"]);
const MAX_BODY = 200_000;

/**
 * The workspace's Google Ads change history for its current account: changes
 * approved on the page or in Vera's chats, newest first.
 */
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
    const { admin } = await requireConnectionAccess(workspaceId);
    const row = await loadConnection(admin, workspaceId, "ads");
    if (!row?.account_id) return NextResponse.json({ changes: [] });
    const { data, error } = await admin
      .from("google_ads_changes")
      .select("id, title, source, status, ops, inverse, undo_of, undone_at, created_at")
      .eq("workspace_id", workspaceId)
      .eq("customer_id", row.account_id)
      .eq("status", "applied")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: "load_failed" }, { status: 500 });
    return NextResponse.json({ changes: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, code } = errorStatus(err);
    return NextResponse.json({ error: code }, { status });
  }
}

/**
 * Send an approved change to the workspace's Google Ads account, or undo one.
 * Owners and admins only: these changes move real money. The account comes from
 * our database; the browser only sends what to change.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });
    const body = (() => {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    })();
    const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
    const clientChangeId = typeof body?.clientChangeId === "string" ? body.clientChangeId.slice(0, 100) : "";
    if (!clientChangeId) return NextResponse.json({ error: "invalid_change" }, { status: 400 });

    let input: Parameters<typeof applyLiveChange>[0]["input"];
    if (typeof body?.undoOf === "string") {
      input = { clientChangeId, undoOf: body.undoOf };
    } else {
      const title = typeof body?.title === "string" ? body.title.trim().slice(0, 300) : "";
      const source = typeof body?.source === "string" && SOURCES.has(body.source) ? (body.source as "AGENT" | "USER" | "RECOMMENDATION") : null;
      const ops = Array.isArray(body?.ops) ? (body.ops as MutateOp[]) : null;
      if (!title || !source || !ops?.length || ops.length > 50 || !ops.every((o) => o && typeof o === "object" && typeof o.kind === "string"))
        return NextResponse.json({ error: "invalid_change" }, { status: 400 });
      input = { clientChangeId, title, source, ops };
    }

    const { user, admin } = await requireConnectionAccess(workspaceId, { admin: true });
    const row = await loadConnection(admin, workspaceId, "ads");
    if (!row?.composio_connected_account_id || !row.account_id) return NextResponse.json({ error: "not_connected" }, { status: 409 });

    const result = await applyLiveChange({ admin, row, userId: user.id, input });
    return NextResponse.json(result, { status: result.status === "applied" ? 200 : 422 });
  } catch (err) {
    const { status, code } = errorStatus(err);
    if (status >= 500) console.error("[google-ads/changes]", code, (err as { detail?: string }).detail ?? (err as Error).message);
    return NextResponse.json({ error: code }, { status });
  }
}
