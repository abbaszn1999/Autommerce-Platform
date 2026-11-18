import { NextRequest, NextResponse } from "next/server";
import { requireConnectionAccess } from "@/lib/google-ads/connection.server";
import { loadMetaConnection, metaErrorStatus, tokenOf } from "@/lib/meta-ads/connection.server";
import { panelData } from "@/lib/meta-ads/live.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Live data for the Meta Ads panel: campaigns, Page posts, catalog products. */
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
    const { admin } = await requireConnectionAccess(workspaceId);
    const row = await loadMetaConnection(admin, workspaceId);
    const token = tokenOf(row);
    return NextResponse.json(await panelData(row!, token));
  } catch (err) {
    const { status, code } = metaErrorStatus(err);
    return NextResponse.json({ error: code }, { status });
  }
}
