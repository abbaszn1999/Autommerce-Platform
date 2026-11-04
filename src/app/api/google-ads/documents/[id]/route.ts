import { NextRequest, NextResponse } from "next/server";
import { errorStatus, loadConnection, requireConnectionAccess } from "@/lib/google-ads/connection.server";
import { applyStep, checkSteps, docConnections, getDoc, getDocVersion, setArchived, undoStep } from "@/lib/google-ads/live-docs.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/** One plan or report; `?version=` reads an earlier version. Members can read. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
    const { admin, role } = await requireConnectionAccess(workspaceId);
    const row = await loadConnection(admin, workspaceId, "ads");
    if (!row?.account_id) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const version = Number(request.nextUrl.searchParams.get("version"));
    if (version) {
      const old = await getDocVersion(admin, workspaceId, row.account_id, id, version);
      return old ? NextResponse.json({ version: old }) : NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const doc = await getDoc(admin, workspaceId, row.account_id, id);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ document: doc, canApply: role === "owner" || role === "admin" }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, code } = errorStatus(err);
    return NextResponse.json({ error: code }, { status });
  }
}

const ACTIONS = new Set(["check", "apply", "undo", "archive", "restore"]);

/**
 * Work on a plan from the page. Owners and admins only: these changes move real
 * money. `check` asks Google about the steps without changing anything; `apply`
 * and `undo` handle one step per request, so the page shows each one finish.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
    const action = typeof body?.action === "string" ? body.action : "";
    if (!ACTIONS.has(action)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    const { user, admin } = await requireConnectionAccess(workspaceId, { admin: true });
    const conns = await docConnections(admin, workspaceId);

    if (action === "archive" || action === "restore") {
      const doc = await setArchived(admin, workspaceId, conns.ads.account_id!, id, action === "archive");
      return doc ? NextResponse.json({ ok: true, document: doc }) : NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (action === "check") {
      const stepIds = Array.isArray(body?.stepIds) ? body.stepIds.filter((s): s is string => typeof s === "string").slice(0, 20) : [];
      const checks = await checkSteps(admin, conns, id, stepIds);
      return checks ? NextResponse.json({ ok: true, checks }) : NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const stepId = typeof body?.stepId === "string" ? body.stepId : "";
    const outcome = action === "apply" ? await applyStep(admin, conns, user.id, id, stepId) : await undoStep(admin, conns, user.id, id, stepId);
    if (!outcome) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(outcome, { status: outcome.ok ? 200 : 422 });
  } catch (err) {
    const { status, code } = errorStatus(err);
    if (status >= 500) console.error("[google-ads/documents]", code, (err as { detail?: string }).detail ?? (err as Error).message);
    return NextResponse.json({ error: code }, { status });
  }
}
