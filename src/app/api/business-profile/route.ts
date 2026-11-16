import { NextRequest, NextResponse } from "next/server";
import { ProfileEditError, isProfileField, type ProfileEdit } from "@/lib/business-profile";
import { isProfileSection, setSection } from "@/lib/business-profile-doc";
import { editDocument, editProfile, getDocumentVersion, loadProfile } from "@/lib/business-profile.server";
import { errorStatus, loadConnection, requireConnectionAccess } from "@/lib/google-ads/connection.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const canEdit = (role: string) => role === "owner" || role === "admin";

function fail(err: unknown) {
  if (err instanceof ProfileEditError) {
    if (err.code === "conflict") return NextResponse.json({ error: "conflict", message: err.message }, { status: 409 });
    return NextResponse.json({ error: err.code ?? "invalid_edit", message: err.message }, { status: 422 });
  }
  const { status, code } = errorStatus(err);
  if (status >= 500) console.error("[business-profile]", code, (err as Error).message);
  return NextResponse.json({ error: code }, { status });
}

/** The workspace's business profile. Every member can read it. */
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
    const { admin, role } = await requireConnectionAccess(workspaceId, { preview: false });
    const [profile, ads] = await Promise.all([loadProfile(admin, workspaceId), loadConnection(admin, workspaceId, "ads")]);
    return NextResponse.json(
      { profile: { values: profile.values, meta: profile.meta, updatedAt: profile.updatedAt }, canEdit: canEdit(role), currency: ads?.account_currency ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return fail(err);
  }
}

/**
 * Owners and admins edit directly; their values count as confirmed.
 * { edits: [{ field, value }] } for the data fields; { section, markdown } to
 * replace one section of the knowledge document (the other sections are
 * untouched, even if Vera wrote in them a moment ago); { restoreVersion } to
 * put an earlier version of the whole document back.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { workspaceId?: string; edits?: unknown; section?: unknown; markdown?: unknown; restoreVersion?: unknown };
    const workspaceId = body.workspaceId ?? "";
    const { admin, user } = await requireConnectionAccess(workspaceId, { admin: true, preview: false });
    if (body.section !== undefined) {
      if (!isProfileSection(body.section) || typeof body.markdown !== "string") return NextResponse.json({ error: "invalid_edit", message: "Nothing valid to save." }, { status: 422 });
      const { section, markdown } = body;
      const result = await editDocument(admin, workspaceId, (doc) => setSection(doc, section, markdown), { source: "owner", status: "confirmed" }, { userId: user.id });
      return NextResponse.json({ profile: result.profile });
    }
    if (body.restoreVersion !== undefined) {
      const version = typeof body.restoreVersion === "string" ? await getDocumentVersion(admin, workspaceId, body.restoreVersion) : null;
      if (version === null) return NextResponse.json({ error: "invalid_edit", message: "That version no longer exists." }, { status: 422 });
      const result = await editDocument(admin, workspaceId, () => version, { source: "owner", status: "confirmed" }, { userId: user.id });
      return NextResponse.json({ profile: result.profile });
    }
    const edits = Array.isArray(body.edits) ? body.edits : [];
    if (!edits.length || !edits.every((e) => e && typeof e === "object" && isProfileField((e as ProfileEdit).field)))
      return NextResponse.json({ error: "invalid_edit", message: "Nothing valid to save." }, { status: 422 });
    const result = await editProfile(admin, workspaceId, edits as ProfileEdit[], { source: "owner", status: "confirmed" }, { userId: user.id });
    return NextResponse.json({ profile: result.profile, changes: result.changes });
  } catch (err) {
    return fail(err);
  }
}
