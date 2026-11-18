import { NextRequest, NextResponse } from "next/server";
import { publicOriginFromRequest } from "@/lib/app-origin";
import { requireConnectionAccess } from "@/lib/google-ads/connection.server";
import {
  REQUIRED_SCOPES,
  exchangeCode,
  grantedScopes,
  logId,
  metaErrorStatus,
  metaUser,
  revokeOnMeta,
  saveConnection,
  verifyState,
} from "@/lib/meta-ads/connection.server";

export const dynamic = "force-dynamic";

/**
 * Facebook sends the person back here after Facebook Login for Business.
 * The code is exchanged on the server (it needs the app secret), the token is
 * stored encrypted, and the browser goes back to the Meta Ads page.
 */
export async function GET(request: NextRequest) {
  const origin = publicOriginFromRequest(request);
  const params = request.nextUrl.searchParams;
  const state = verifyState(params.get("state") ?? "");
  const back = (slug: string | null, query: string) => NextResponse.redirect(new URL(slug ? `/w/${slug}/meta-ads?${query}` : `/?${query}`, origin));
  if (!state) return back(null, "meta_error=invalid_state");

  // The person cancelled or Facebook refused.
  if (params.get("error")) return back(state.slug, `meta_error=${params.get("error_reason") === "user_denied" ? "cancelled" : "login_failed"}`);
  const code = params.get("code") ?? "";
  if (!code) return back(state.slug, "meta_error=login_failed");

  try {
    // Same person who started, still an owner or admin of the workspace.
    const { user, admin } = await requireConnectionAccess(state.workspaceId, { admin: true });
    if (user.id !== state.userId) return back(state.slug, "meta_error=invalid_state");

    const token = await exchangeCode(origin, code);
    const [person, scopes] = await Promise.all([metaUser(token.accessToken), grantedScopes(token.accessToken)]);
    const missing = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
    if (missing.length) {
      // Without these the agent can't work; don't keep a half connection.
      await revokeOnMeta(token.accessToken).catch(() => undefined);
      return back(state.slug, `meta_error=missing_permissions&missing=${encodeURIComponent(missing.join(","))}`);
    }
    await saveConnection(admin, { workspaceId: state.workspaceId, userId: user.id, token, user: person, scopes });
    console.info("[meta-ads] connected", { workspace: logId(state.workspaceId), metaUser: logId(person.id), scopes: scopes.length });
    return back(state.slug, "meta=connected");
  } catch (err) {
    const { code: reason } = metaErrorStatus(err);
    console.error("[meta-ads] callback failed", reason, (err as Error).message);
    return back(state.slug, `meta_error=${encodeURIComponent(reason)}`);
  }
}
