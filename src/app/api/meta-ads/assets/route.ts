import { NextRequest, NextResponse } from "next/server";
import { requireConnectionAccess } from "@/lib/google-ads/connection.server";
import { loadMetaConnection, metaErrorStatus, tokenOf } from "@/lib/meta-ads/connection.server";
import { listAssets } from "@/lib/meta-ads/live.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The ad accounts, businesses, Pages and catalogs the connected person shared with our app. */
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
    const { admin } = await requireConnectionAccess(workspaceId);
    const token = tokenOf(await loadMetaConnection(admin, workspaceId));
    return NextResponse.json(await listAssets(token, workspaceId));
  } catch (err) {
    const { status, code } = metaErrorStatus(err);
    return NextResponse.json({ error: code }, { status });
  }
}
