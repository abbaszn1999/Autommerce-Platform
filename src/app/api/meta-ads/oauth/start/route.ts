import { NextRequest, NextResponse } from "next/server";
import { publicOriginFromRequest } from "@/lib/app-origin";
import { requireConnectionAccess } from "@/lib/google-ads/connection.server";
import { createState, loginUrl, metaConfig, metaErrorStatus } from "@/lib/meta-ads/connection.server";

export const dynamic = "force-dynamic";

/**
 * "Connect Meta": sends the browser to Facebook Login for Business for our app.
 * Owners and admins only (the agent can change ads that spend money).
 */
export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
  try {
    if (!metaConfig()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
    const { user, admin } = await requireConnectionAccess(workspaceId, { admin: true });
    const { data: workspace } = await admin.from("workspaces").select("slug").eq("id", workspaceId).maybeSingle();
    if (!workspace?.slug) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const origin = publicOriginFromRequest(request);
    const state = createState({ workspaceId, slug: String(workspace.slug), userId: user.id });
    return NextResponse.redirect(loginUrl(origin, state));
  } catch (err) {
    const { status, code } = metaErrorStatus(err);
    return NextResponse.json({ error: code }, { status });
  }
}
