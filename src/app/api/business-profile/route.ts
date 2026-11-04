import { NextRequest, NextResponse } from "next/server";
import { ProfileEditError, isProfileField, type ProfileEdit } from "@/lib/business-profile";
import { editProfile, loadProfile } from "@/lib/business-profile.server";
import { errorStatus, loadConnection, requireConnectionAccess } from "@/lib/google-ads/connection.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const canEdit = (role: string) => role === "owner" || role === "admin";

function fail(err: unknown) {
  if (err instanceof ProfileEditError) return NextResponse.json({ error: "invalid_edit", message: err.message }, { status: 422 });
  const { status, code } = errorStatus(err);
  if (status >= 500) console.error("[business-profile]", code, (err as Error).message);
  return NextResponse.json({ error: code }, { status });
}

/** The workspace's business profile. Every member can read it. */
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
    const { admin, role } = await requireConnectionAccess(workspaceId);
    const [profile, ads] = await Promise.all([loadProfile(admin, workspaceId), loadConnection(admin, workspaceId, "ads")]);
    return NextResponse.json(
      { profile: { values: profile.values, meta: profile.meta, updatedAt: profile.updatedAt }, canEdit: canEdit(role), currency: ads?.account_currency ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return fail(err);
  }
}

/** Owners and admins edit fields directly; their values count as confirmed. */
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { workspaceId?: string; edits?: unknown };
    const workspaceId = body.workspaceId ?? "";
    const { admin, user } = await requireConnectionAccess(workspaceId, { admin: true });
    const edits = Array.isArray(body.edits) ? body.edits : [];
    if (!edits.length || !edits.every((e) => e && typeof e === "object" && isProfileField((e as ProfileEdit).field)))
      return NextResponse.json({ error: "invalid_edit", message: "Nothing valid to save." }, { status: 422 });
    const result = await editProfile(admin, workspaceId, edits as ProfileEdit[], { source: "owner", status: "confirmed" }, { userId: user.id });
    return NextResponse.json({ profile: result.profile, changes: result.changes });
  } catch (err) {
    return fail(err);
  }
}
