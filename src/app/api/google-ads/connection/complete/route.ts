import { NextRequest, NextResponse } from "next/server";
import { publicOriginFromRequest } from "@/lib/app-origin";
import { completeConnection, errorStatus, isConnectionKind, requireConnectionAccess } from "@/lib/google-ads/connection.server";

/**
 * Where Composio sends the browser after Google sign-in. Query parameters from
 * Composio are not trusted: the server asks Composio whether the workspace's
 * pending connection is ACTIVE, then returns to the Google Ads page.
 */
export async function GET(request: NextRequest) {
  const origin = publicOriginFromRequest(request);
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
  const kind = request.nextUrl.searchParams.get("kind");

  let slug = "";
  let result = "failed";
  try {
    if (!isConnectionKind(kind)) throw new Error("invalid_kind");
    const { admin } = await requireConnectionAccess(workspaceId, { admin: true });
    const { data: workspace } = await admin.from("workspaces").select("slug").eq("id", workspaceId).maybeSingle();
    slug = workspace?.slug ?? "";
    result = (await completeConnection(admin, workspaceId, kind)) ? "connected" : "failed";
  } catch (err) {
    if (errorStatus(err).status === 401) return NextResponse.redirect(new URL("/login", origin));
  }

  const target = new URL(slug ? `/w/${slug}/google-ads` : "/workspaces", origin);
  target.searchParams.set("google", result);
  if (isConnectionKind(kind)) target.searchParams.set("kind", kind);
  const res = NextResponse.redirect(target);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
