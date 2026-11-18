import { NextRequest, NextResponse } from "next/server";
import {
  BUSINESS_FILE_KIND_IDS,
  addFileToDocument,
  businessFileProblem,
  isBusinessFileKind,
  removeFileFromDocument,
  safeFileName,
} from "@/lib/business-files";
import { businessFileUrl, deleteBusinessFile, listBusinessFiles, saveBusinessFile } from "@/lib/business-files.server";
import { editDocument } from "@/lib/business-profile.server";
import { errorStatus, requireConnectionAccess } from "@/lib/google-ads/connection.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(err: unknown) {
  const { status, code } = errorStatus(err);
  if (status >= 500) console.error("[business-profile/files]", code, (err as Error).message);
  return NextResponse.json({ error: code }, { status });
}

/**
 * The business files of this workspace, for every member: the list, or (with
 * ?name=) the file itself through a short-lived address. This is the link the
 * document carries, so it works for anyone in the workspace and nobody else.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const workspaceId = params.get("workspaceId") ?? "";
    const { admin } = await requireConnectionAccess(workspaceId, { preview: false });
    const name = params.get("name");
    if (!name) return NextResponse.json({ files: await listBusinessFiles(admin, workspaceId) }, { headers: { "Cache-Control": "no-store" } });
    const url = await businessFileUrl(admin, workspaceId, name, { download: params.get("download") === "1" });
    return url ? NextResponse.redirect(url, { status: 302 }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (err) {
    return fail(err);
  }
}

/**
 * Owners and admins keep a file: it is saved for the workspace and linked in the
 * document (under its section and under Sources). Form fields: workspaceId, kind,
 * description (optional) and file.
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData().catch(() => null);
    const workspaceId = String(form?.get("workspaceId") ?? "");
    const { admin, user } = await requireConnectionAccess(workspaceId, { admin: true, preview: false });
    const file = form?.get("file");
    const kind = form?.get("kind");
    if (!(file instanceof File) || !isBusinessFileKind(kind)) {
      return NextResponse.json({ error: "invalid_request", message: `Send a file and a kind: ${BUSINESS_FILE_KIND_IDS.join(", ")}.` }, { status: 400 });
    }
    const problem = businessFileProblem(file.name, file.size);
    if (problem) return NextResponse.json({ error: "invalid_file", message: problem }, { status: 422 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const name = await saveBusinessFile(admin, workspaceId, file.name, bytes, file.type);
    const description = typeof form?.get("description") === "string" ? String(form?.get("description")) : undefined;
    await editDocument(admin, workspaceId, (doc) => addFileToDocument(doc, kind, workspaceId, name, description), { source: "owner", status: "confirmed" }, { userId: user.id });
    return NextResponse.json({ name, files: await listBusinessFiles(admin, workspaceId) });
  } catch (err) {
    return fail(err);
  }
}

/** Owners and admins delete a file; the lines that link it leave the document too. */
export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { workspaceId?: string; name?: string };
    const workspaceId = body.workspaceId ?? "";
    const { admin, user } = await requireConnectionAccess(workspaceId, { admin: true, preview: false });
    const name = safeFileName(body.name ?? "");
    if (!name) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    await deleteBusinessFile(admin, workspaceId, name);
    await editDocument(admin, workspaceId, (doc) => removeFileFromDocument(doc, workspaceId, name), { source: "owner", status: "confirmed" }, { userId: user.id });
    return NextResponse.json({ files: await listBusinessFiles(admin, workspaceId) });
  } catch (err) {
    return fail(err);
  }
}
