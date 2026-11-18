import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { loadActiveJobForSession } from "@/lib/jobs/repo";
import { isCatalogWorkerStale } from "@/lib/jobs/catalog-recovery";
import { deleteCatalogSession } from "@/lib/catalog/delete-session";
import { canAdmin, type Role } from "@/lib/permissions";

type Ctx = { params: Promise<{ sessionId: string }> };

/**
 * DELETE /api/catalog-intelligence/sessions/[sessionId]?workspaceId=
 * Permanently removes the project and everything stored for it. Admins and
 * owners can delete any project; an editor can delete one they created.
 */
export async function DELETE(request: NextRequest, context: Ctx) {
  const { sessionId } = await context.params;
  const workspaceId = request.nextUrl.searchParams.get("workspaceId")?.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const ctx = await getWorkspaceContext({ workspaceId, userId: user.id, forceRefresh: true });
  const role = ctx.membershipRole as Role | null;
  if (!role || role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: session, error: loadError } = await admin
    .from("catalog_sessions")
    .select("id, workspace_id, created_by")
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!canAdmin(role) && session.created_by !== user.id) {
    return NextResponse.json(
      { error: "Only an admin or the person who created this project can delete it." },
      { status: 403 }
    );
  }

  const active = await loadActiveJobForSession(admin, { kind: "catalog", sessionId, workspaceId });
  if (active && !isCatalogWorkerStale(active)) {
    return NextResponse.json(
      { error: "Stop the running enrichment before deleting this project." },
      { status: 409 }
    );
  }

  try {
    const result = await deleteCatalogSession(admin, { workspaceId, sessionId });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete project" },
      { status: 500 }
    );
  }
}
