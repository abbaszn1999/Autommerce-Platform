import { NextRequest, NextResponse } from "next/server";
import { getDocumentVersion, listDocumentVersions } from "@/lib/business-profile.server";
import { errorStatus, requireConnectionAccess } from "@/lib/google-ads/connection.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * The knowledge document's version history, for every member to read: the saved
 * versions with the sections each changed, or (with ?id=) one version's text,
 * to look at before restoring it.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const workspaceId = params.get("workspaceId") ?? "";
    const { admin } = await requireConnectionAccess(workspaceId, { preview: false });
    const id = params.get("id");
    if (id) {
      if (!UUID.test(id)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
      const document = await getDocumentVersion(admin, workspaceId, id);
      return document === null ? NextResponse.json({ error: "not_found" }, { status: 404 }) : NextResponse.json({ document }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ versions: await listDocumentVersions(admin, workspaceId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, code } = errorStatus(err);
    if (status >= 500) console.error("[business-profile/history]", code, (err as Error).message);
    return NextResponse.json({ error: code }, { status });
  }
}