import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { verifyAgentRequest } from "@/lib/google-ads/agent-auth.server";
import { GaqlGuardError, accountOverview, describeLiveChange, guardGaql } from "@/lib/google-ads/agent-support";
import { ConnectionHttpError, batchMutate, errorStatus, loadConnection, searchGaql } from "@/lib/google-ads/connection.server";
import { LivePlanError, planLiveChange } from "@/lib/google-ads/live-mutate";
import { applyLiveChange, fetchBefore, googleMessage } from "@/lib/google-ads/live-mutate.server";
import { loadLiveAccount } from "@/lib/google-ads/live-report.server";
import { MerchantPlanError, merchantOverview, type MerchantOp } from "@/lib/google-ads/merchant-live";
import { applyMerchantChange, loadMerchantSnapshot, previewMerchantChange } from "@/lib/google-ads/merchant.server";
import { rangeFor } from "@/lib/google-ads/metrics";
import type { MutateOp } from "@/lib/google-ads/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ACTIONS = new Set(["overview", "query", "preview", "apply", "merchant", "merchant_preview", "merchant_apply"]);
const UUID = /^[0-9a-f-]{36}$/i;
const MAX_BODY = 200_000;

type Params = { params: Promise<{ action: string }> };

/**
 * The Google Ads agent's tools, called by our agent service (signed), never by
 * a browser. Each call is for one chat of one user: the user must still be the
 * workspace owner or an admin, the chat must be theirs and a Google Ads chat,
 * and the ad account comes from our database. Changes apply only after the
 * person approved them in the chat (the approval row is checked here).
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { action } = await params;
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const caller = verifyAgentRequest({ method: "POST", path: `/api/google-ads/agent/${action}`, body: raw, headers: request.headers });
  if (!caller.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
  const chatId = typeof body.chatId === "string" ? body.chatId : "";
  if (!UUID.test(workspaceId) || !UUID.test(chatId)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const admin = createAdminClient();
  try {
    const [{ data: member }, { data: chat }] = await Promise.all([
      admin.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", caller.userId).maybeSingle(),
      admin.from("store_agent_chats").select("id").eq("id", chatId).eq("workspace_id", workspaceId).eq("user_id", caller.userId).eq("domain", "google_ads").maybeSingle(),
    ]);
    if (!member || !["owner", "admin"].includes(String(member.role))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!chat) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (action.startsWith("merchant")) return await merchantAction(action, body, { admin, workspaceId, chatId });
    const row = await loadConnection(admin, workspaceId, "ads");
    if (!row?.composio_connected_account_id || !row.account_id) return NextResponse.json({ error: "not_connected" }, { status: 409 });
    const customerId = row.account_id;

    if (action === "overview") {
      const range = rangeFor("LAST_30_DAYS");
      const { data, fetchedAt } = await loadLiveAccount(row, range);
      return NextResponse.json({ overview: accountOverview(data, range), fetchedAt });
    }

    if (action === "query") {
      let query: string;
      try {
        query = guardGaql(typeof body.query === "string" ? body.query : "");
      } catch (err) {
        return NextResponse.json({ ok: false, error: (err as GaqlGuardError).message });
      }
      try {
        const rows = await searchGaql(row, customerId, query, 1);
        return NextResponse.json({ ok: true, query, rows, rowCount: rows.length });
      } catch (err) {
        if (err instanceof ConnectionHttpError && err.message === "google_request_failed") return NextResponse.json({ ok: false, error: googleMessage(err.detail) });
        throw err;
      }
    }

    const ops = Array.isArray(body.ops) ? (body.ops as MutateOp[]) : [];
    if (!ops.length || ops.length > 50 || !ops.every((o) => o && typeof o === "object" && typeof o.kind === "string"))
      return NextResponse.json({ ok: false, error: "The change has no valid edits." });

    if (action === "preview") {
      // Same checks as applying, then Google validates it without changing anything.
      try {
        const before = await fetchBefore(admin, row, customerId, ops);
        const plan = planLiveChange(customerId, ops, before);
        await batchMutate(row, customerId, plan.operations, { validateOnly: true });
        return NextResponse.json({ ok: true, items: describeLiveChange(ops, before, row.account_currency ?? ""), warnings: plan.warnings, operations: plan.operations.length });
      } catch (err) {
        if (err instanceof LivePlanError) return NextResponse.json({ ok: false, error: err.message });
        if (err instanceof ConnectionHttpError && err.message === "google_request_failed") return NextResponse.json({ ok: false, error: googleMessage(err.detail) });
        throw err;
      }
    }

    // apply: only a change a person approved in this chat.
    const approved = await approvedChange(admin, body, { workspaceId, chatId });
    if (approved instanceof NextResponse) return approved;
    const { approvalId, title, decidedBy } = approved;
    const result = await applyLiveChange({ admin, row, userId: decidedBy, input: { clientChangeId: approvalId, title, source: "AGENT", ops } });
    if (result.status === "applied") await admin.from("store_agent_approvals").update({ applied_at: new Date().toISOString(), undoable: result.inverse.length > 0 }).eq("id", approvalId);
    return NextResponse.json(result);
  } catch (err) {
    const { status, code } = errorStatus(err);
    if (status >= 500) console.error("[google-ads/agent]", action, code, (err as { detail?: string }).detail ?? (err as Error).message);
    return NextResponse.json({ error: code }, { status });
  }
}

type Ctx = { admin: ReturnType<typeof createAdminClient>; workspaceId: string; chatId: string };

/** The approval a person gave in this chat for this change, or the response refusing it. */
async function approvedChange(admin: Ctx["admin"], body: Record<string, unknown>, { workspaceId, chatId }: Omit<Ctx, "admin">) {
  const approvalId = typeof body.approvalId === "string" ? body.approvalId : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
  if (!UUID.test(approvalId) || !title) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { data: approval } = await admin
    .from("store_agent_approvals")
    .select("id, status, decided_by")
    .eq("id", approvalId)
    .eq("chat_id", chatId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!approval || approval.status !== "approved" || !approval.decided_by) return NextResponse.json({ error: "not_approved" }, { status: 403 });
  return { approvalId, title, decidedBy: String(approval.decided_by) };
}

/** Merchant Center: products and issues, and product fixes (same approval rules as Google Ads). */
async function merchantAction(action: string, body: Record<string, unknown>, { admin, workspaceId, chatId }: Ctx) {
  const row = await loadConnection(admin, workspaceId, "merchant");
  if (!row?.composio_connected_account_id || !row.account_id) return NextResponse.json({ error: "merchant_not_connected" }, { status: 409 });

  if (action === "merchant") {
    const snapshot = await loadMerchantSnapshot(row, { force: body.refresh === true });
    return NextResponse.json({ overview: merchantOverview(snapshot), fetchedAt: snapshot.fetchedAt });
  }

  // Only updates come from the agent; restores are built by the server for undo.
  const ops = Array.isArray(body.ops) ? (body.ops as MerchantOp[]) : [];
  if (!ops.length || !ops.every((o) => o && typeof o === "object" && o.kind === "product.update" && typeof o.productId === "string"))
    return NextResponse.json({ ok: false, error: "The change has no valid product edits." });

  if (action === "merchant_preview") {
    try {
      const plan = await previewMerchantChange(admin, row, ops);
      return NextResponse.json({ ok: true, items: plan.items, warnings: plan.warnings, operations: plan.writes.length });
    } catch (err) {
      if (err instanceof MerchantPlanError) return NextResponse.json({ ok: false, error: err.message });
      if (err instanceof ConnectionHttpError && err.message === "google_request_failed") return NextResponse.json({ ok: false, error: googleMessage(err.detail) });
      throw err;
    }
  }

  const approved = await approvedChange(admin, body, { workspaceId, chatId });
  if (approved instanceof NextResponse) return approved;
  const { approvalId, title, decidedBy } = approved;
  const result = await applyMerchantChange({ admin, row, userId: decidedBy, input: { clientChangeId: approvalId, title, source: "AGENT", ops } });
  if (result.status === "applied") await admin.from("store_agent_approvals").update({ applied_at: new Date().toISOString(), undoable: result.inverse.length > 0 }).eq("id", approvalId);
  return NextResponse.json(result);
}
