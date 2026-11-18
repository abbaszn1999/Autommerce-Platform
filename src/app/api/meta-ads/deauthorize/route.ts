import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { disconnectMeta, logId, metaConfig, parseSignedRequest } from "@/lib/meta-ads/connection.server";

export const dynamic = "force-dynamic";

/**
 * Deauthorize callback (set in the Meta dashboard → Facebook Login for Business
 * → Settings). Meta calls it when a person removes our app in their Facebook
 * settings. The access is already gone on Meta's side, so we only delete our
 * copy: token, change log and Meta Ads chats, as after Disconnect.
 */
export async function POST(request: NextRequest) {
  if (!metaConfig()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const form = await request.formData().catch(() => null);
  const signed = typeof form?.get("signed_request") === "string" ? String(form?.get("signed_request")) : "";
  const data = parseSignedRequest(signed);
  const metaUserId = String(data?.user_id ?? "");
  if (!data || !/^[0-9]{1,30}$/.test(metaUserId)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const admin = createAdminClient();
  const { data: rows } = await admin.from("meta_ads_connections").select("workspace_id").eq("meta_user_id", metaUserId);
  for (const row of rows ?? []) {
    try {
      await disconnectMeta(admin, String(row.workspace_id), { revoke: false });
    } catch (error) {
      console.error("[meta-ads] deauthorize cleanup failed", logId(String(row.workspace_id)), (error as Error).message);
    }
  }
  console.info("[meta-ads] deauthorized", { metaUser: logId(metaUserId), workspaces: rows?.length ?? 0 });
  return NextResponse.json({ ok: true });
}
