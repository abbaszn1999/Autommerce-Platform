import { NextRequest, NextResponse } from "next/server";
import { PROFILE_SOURCES, ProfileEditError, isProfileField, onboardingStageOf, type ProfileSource } from "@/lib/business-profile";
import { editProfile, loadProfile, loadSetupStatus, saveSetupStatus, setOnboardingStage } from "@/lib/business-profile.server";
import { setupPrefill } from "@/lib/business-profile-setup.server";
import { errorStatus, requireConnectionAccess } from "@/lib/google-ads/connection.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const canEdit = (role: string) => role === "owner" || role === "admin";

/**
 * The first-run setup screen. GET says whether to show it (only owners and
 * admins see it, once); with prefill=1 it also returns what Google already
 * tells us and the profile as it is now.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const workspaceId = params.get("workspaceId") ?? "";
    const { admin, role } = await requireConnectionAccess(workspaceId, { preview: false });
    const status = await loadSetupStatus(admin, workspaceId);
    const show = canEdit(role) && status === null;
    const profile = await loadProfile(admin, workspaceId);
    const onboardingStage = onboardingStageOf(profile.values);
    if (!show || params.get("prefill") !== "1") return NextResponse.json({ show, status, onboardingStage }, { headers: { "Cache-Control": "no-store" } });
    const prefill = await setupPrefill(admin, workspaceId);
    return NextResponse.json({ show, status, onboardingStage, prefill, values: profile.values }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, code } = errorStatus(err);
    if (status >= 500) console.error("[business-profile/setup]", code, (err as Error).message);
    return NextResponse.json({ error: code }, { status });
  }
}

/**
 * { status: "completed", suggestions?: [{ field, value, source }] }. The setup cannot be skipped.
 * Suggestions (read from the accounts, never typed by the owner) are saved as
 * such, for the owner to confirm later on the Business profile page.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { workspaceId?: string; status?: string; action?: string; suggestions?: unknown };
    const workspaceId = body.workspaceId ?? "";
    const { admin, user } = await requireConnectionAccess(workspaceId, { admin: true, preview: false });
    // The way out when Vera cannot finish onboarding (the agent is down, or stuck): open the board as it is.
    if (body.action === "unlock") {
      await setOnboardingStage(admin, workspaceId, "done", user.id);
      return NextResponse.json({ ok: true });
    }
    if (body.status !== "completed") return NextResponse.json({ error: "invalid_request" }, { status: 400 });

    const suggestions = Array.isArray(body.suggestions) ? (body.suggestions as { field?: unknown; value?: unknown; source?: unknown }[]) : [];
    for (const s of suggestions.slice(0, 5)) {
      if (!isProfileField(s.field) || !PROFILE_SOURCES.includes(s.source as ProfileSource) || s.source === "owner" || s.source === "chat") continue;
      await editProfile(admin, workspaceId, [{ field: s.field, value: s.value }], { source: s.source as ProfileSource, status: "suggested" }, { userId: user.id }).catch((e) => {
        if (!(e instanceof ProfileEditError)) throw e;
      });
    }
    await saveSetupStatus(admin, workspaceId, body.status, user.id);
    // Finishing the popup starts the onboarding: Vera interviews the owner and the board stays locked until she has filled it in.
    if (!onboardingStageOf((await loadProfile(admin, workspaceId)).values)) await setOnboardingStage(admin, workspaceId, "interview", user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, code } = errorStatus(err);
    if (status >= 500) console.error("[business-profile/setup]", code, (err as Error).message);
    return NextResponse.json({ error: code }, { status });
  }
}
