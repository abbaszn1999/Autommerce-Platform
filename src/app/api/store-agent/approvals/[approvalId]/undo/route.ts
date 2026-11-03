import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeStoreAgent, callStoreAgentService, chatDomain, type StoreAgentAccess } from "@/lib/store-agent/server";
import { errorStatus, loadConnection } from "@/lib/google-ads/connection.server";
import { applyLiveChange } from "@/lib/google-ads/live-mutate.server";
import { applyMerchantChange } from "@/lib/google-ads/merchant.server";
import { LIVE_ERRORS } from "@/lib/google-ads/live-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ approvalId: string }> };

const bodySchema = z.object({ workspaceId: z.string().uuid() });

/** Put back the values an approved store change overwrote. */
export async function POST(request: NextRequest, { params }: Params) {
  const { approvalId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(approvalId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const access = await authorizeStoreAgent({ workspaceId: parsed.data.workspaceId });
  if (access instanceof NextResponse) return access;

  const { data: approval } = await access.admin
    .from("store_agent_approvals")
    .select("id, workspace_id, kind, chat_id")
    .eq("id", approvalId)
    .eq("workspace_id", parsed.data.workspaceId)
    .maybeSingle();
  if (!approval) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((await chatDomain(access.admin, String(approval.chat_id))) === "google_ads") return undoGoogleAdsApproval(access, approvalId, String(approval.chat_id));
  if (approval.kind !== "write" && !["owner", "admin"].includes(String(access.ctx.membershipRole))) {
    return NextResponse.json({ error: "Only the workspace owner or an admin can undo bulk changes." }, { status: 403 });
  }

  try {
    const res = await callStoreAgentService({ path: "/store-agent/approvals/undo", userId: access.userId, body: { approvalId } });
    const json = await res.json().catch(() => ({}));
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json({ error: "The agent service is not available right now." }, { status: 503 });
  }
}

/**
 * A Google Ads change approved in a chat is undone like any other Google Ads
 * change: the server uses the inverse it stored when the change was applied
 * (the change's id there is the approval id). Owners and admins only.
 */
async function undoGoogleAdsApproval(access: StoreAgentAccess, approvalId: string, chatId: string) {
  if (!["owner", "admin"].includes(String(access.ctx.membershipRole))) {
    return NextResponse.json({ error: "Only the workspace owner or an admin can undo Google Ads changes." }, { status: 403 });
  }
  const { data: chat } = await access.admin.from("store_agent_chats").select("user_id, workspace_id").eq("id", chatId).maybeSingle();
  if (!chat || chat.user_id !== access.userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const { data: change } = await access.admin
      .from("google_ads_changes")
      .select("id, target")
      .eq("workspace_id", String(chat.workspace_id))
      .eq("client_change_id", approvalId)
      .eq("status", "applied")
      .maybeSingle();
    if (!change) return NextResponse.json({ error: "This change was not applied, so there is nothing to undo." }, { status: 409 });
    const merchant = change.target === "merchant";
    const row = await loadConnection(access.admin, String(chat.workspace_id), merchant ? "merchant" : "ads");
    if (!row?.composio_connected_account_id || !row.account_id) return NextResponse.json({ error: LIVE_ERRORS.not_connected }, { status: 409 });
    // A fixed id per approval: pressing Undo twice can't undo twice.
    const undo = { admin: access.admin, row, userId: access.userId, input: { clientChangeId: `undo:${approvalId}`, undoOf: String(change.id) } };
    const result = merchant ? await applyMerchantChange(undo) : await applyLiveChange(undo);
    if (result.status === "failed") return NextResponse.json({ error: result.error }, { status: 422 });
    await access.admin.from("store_agent_approvals").update({ undone_at: new Date().toISOString(), undoable: false }).eq("id", approvalId);
    return NextResponse.json({ restored: 1, failed: 0, errors: [], skipped: [] });
  } catch (err) {
    const { status, code } = errorStatus(err);
    return NextResponse.json({ error: LIVE_ERRORS[code] ?? "The undo couldn't be completed. Refresh to check Google Ads." }, { status });
  }
}
