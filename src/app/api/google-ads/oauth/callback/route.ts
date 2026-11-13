import { NextRequest, NextResponse } from "next/server";

/** Composio finishes the OAuth exchange; this route only keeps Google's redirect on our verified domain. */
const COMPOSIO_CALLBACK = "https://backend.composio.dev/api/v3/toolkits/auth/callback";

/**
 * Google OAuth redirect for Google Ads and Merchant Center connections.
 * Forwards the query (code, state, scope, error) to Composio untouched.
 * The query carries a one-time authorization code, so it is never logged,
 * cached, or sent on as a referrer.
 */
export function GET(request: NextRequest) {
  const res = NextResponse.redirect(`${COMPOSIO_CALLBACK}${request.nextUrl.search}`, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
