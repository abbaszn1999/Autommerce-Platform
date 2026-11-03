import { cookies } from "next/headers";
import { GoogleAdsLock } from "@/components/google-ads/ga-lock";
import { GoogleAdsShell } from "@/components/google-ads/ga-shell";
import { connectionConfigured } from "@/lib/google-ads/connection.server";
import { PREVIEW_COOKIE, hasPreviewAccess } from "@/lib/google-ads/preview-access";

export const dynamic = "force-dynamic";

/**
 * Google Ads agent — chat with the agent on the left, the full account on the
 * right. Open only to people given the preview password (checked on the server).
 * Connections are real when Composio is configured; `?demo=1` keeps the demo data.
 */
export default async function GoogleAdsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const unlocked = hasPreviewAccess((await cookies()).get(PREVIEW_COOKIE)?.value);
  const live = connectionConfigured() && (await searchParams).demo !== "1";
  return unlocked ? <GoogleAdsShell live={live} /> : <GoogleAdsLock />;
}
