import { cookies } from "next/headers";
import { MetaAdsLock } from "@/components/meta-ads/ma-lock";
import { MetaAdsShell } from "@/components/meta-ads/ma-shell";
import { PREVIEW_COOKIE, hasPreviewAccess } from "@/lib/google-ads/preview-access";

export const dynamic = "force-dynamic";

/**
 * Meta Ads agent: chat with the agent on the left, the full ad account on the
 * right. Front-end prototype on demo data until the Marketing API is wired,
 * open only to people given the same preview password as Google Ads (checked
 * on the server).
 */
export default async function MetaAdsPage() {
  const unlocked = hasPreviewAccess((await cookies()).get(PREVIEW_COOKIE)?.value);
  return unlocked ? <MetaAdsShell /> : <MetaAdsLock />;
}
