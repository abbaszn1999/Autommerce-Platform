import { NextRequest, NextResponse } from "next/server";
import { verifyAgentRequest } from "@/lib/google-ads/agent-auth.server";
import { approvalBinding } from "@/lib/google-ads/approval-binding";
import { createAdminClient } from "@/lib/supabase-admin";
import { loadMetaConnection, metaErrorStatus, pagePosts, tokenOf } from "@/lib/meta-ads/connection.server";
import { changeCard, cleanArguments, findAgentTool, withConversationId } from "@/lib/meta-ads/mcp-tools";
import { callTool, listAgentTools } from "@/lib/meta-ads/mcp.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ACTIONS = new Set(["tools", "read", "preview", "apply", "page_posts"]);
const UUID = /^[0-9a-f-]{36}$/i;
const MAX_BODY = 200_000;
/** Bigger tool answers are cut (the agent service saves big ones to a file anyway). */
const MAX_RESULT = 150_000;

type Params = { params: Promise<{ action: string }> };

/**
 * The Meta Ads agent's tools, called by our agent service (signed), never by a
 * browser. Each call is for one chat of one user, who must still be the
 * workspace owner or an admin; the chat must be theirs and a Meta Ads chat.
 * The client's token stays here: the agent service never sees it.
 * - tools: Meta's Ads MCP tools the agent may use, read vs write.
 * - read: runs one read-only tool.
 * - preview: checks one write tool call and returns its approval card.
 * - apply: runs one write tool call, only with a person's approval for exactly
 *   that call (checked against the approval row and its binding).
 * - page_posts: a Page's latest posts (Graph API; not in the MCP server).
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { action } = await params;
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const caller = verifyAgentRequest({ method: "POST", path: `/api/meta-ads/agent/${action}`, body: raw, headers: request.headers });
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
      admin.from("store_agent_chats").select("id").eq("id", chatId).eq("workspace_id", workspaceId).eq("user_id", caller.userId).eq("domain", "meta_ads").maybeSingle(),
    ]);
    if (!member || !["owner", "admin"].includes(String(member.role))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!chat) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const row = await loadMetaConnection(admin, workspaceId);
    const token = tokenOf(row);
    const tools = await listAgentTools(token);

    if (action === "tools") return NextResponse.json({ tools });

    if (action === "page_posts") {
      const pageId = typeof body.pageId === "string" && body.pageId ? body.pageId : row?.page_id ?? "";
      if (!pageId) return NextResponse.json({ ok: false, error: "No Page is selected. Ask the user to pick a Page on the Meta Ads page, or pass pageId." });
      const limit = typeof body.limit === "number" ? body.limit : 10;
      return NextResponse.json({ ok: true, pageId, posts: await pagePosts(token, pageId, limit) });
    }

    const tool = findAgentTool(tools, body.tool);
    if (!tool) return NextResponse.json({ ok: false, error: `Unknown or unavailable tool: ${String(body.tool)}.` });
    const cleaned = cleanArguments(body.arguments);
    if (!cleaned) return NextResponse.json({ ok: false, error: "The arguments must be one JSON object under 100 KB." });
    // Meta's conversation id, the same for every call of this chat (preview and apply included, so the approval binding matches).
    const args = withConversationId(tool, cleaned, chatId);

    if (action === "read") {
      if (tool.kind !== "read") return NextResponse.json({ ok: false, error: `${tool.name} changes the account: propose it as a change so the user can approve it.` });
      const out = await callTool(token, tool.name, args);
      return NextResponse.json({ ok: !out.isError, text: out.text.slice(0, MAX_RESULT), truncated: out.text.length > MAX_RESULT });
    }

    if (tool.kind !== "write") return NextResponse.json({ ok: false, error: `${tool.name} only reads: call it directly.` });
    const binding = approvalBinding("meta", { tool: tool.name, arguments: args });

    if (action === "preview") {
      const card = changeCard(tool, args);
      return NextResponse.json({ ok: true, items: card.items, warnings: card.warnings, binding });
    }

    // apply: only with a person's approval for exactly this call, in this chat.
    const approvalId = typeof body.approvalId === "string" ? body.approvalId : "";
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
    if (!UUID.test(approvalId) || !title) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    const { data: approval } = await admin
      .from("store_agent_approvals")
      .select("id, status, decided_by, preview, applied_at")
      .eq("id", approvalId)
      .eq("chat_id", chatId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!approval || approval.status !== "approved" || !approval.decided_by) return NextResponse.json({ error: "not_approved" }, { status: 403 });
    if ((approval.preview as { binding?: string } | null)?.binding !== binding) return NextResponse.json({ error: "not_approved" }, { status: 403 });
    // Never twice: an approval applies one call once.
    const { data: done } = await admin.from("meta_ads_changes").select("status, error").eq("approval_id", approvalId).maybeSingle();
    if (done || approval.applied_at) return NextResponse.json({ status: "failed", error: "This approved change was already sent to Meta. Check the account before trying again." });

    let out: { isError: boolean; text: string };
    try {
      out = await callTool(token, tool.name, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await admin.from("meta_ads_changes").insert({ workspace_id: workspaceId, chat_id: chatId, approval_id: approvalId, tool: tool.name, title, arguments: args, status: "failed", error: message.slice(0, 2000), applied_by: approval.decided_by });
      throw error;
    }
    const status = out.isError ? "failed" : "applied";
    await admin.from("meta_ads_changes").insert({
      workspace_id: workspaceId,
      chat_id: chatId,
      approval_id: approvalId,
      tool: tool.name,
      title,
      arguments: args,
      status,
      result: out.isError ? null : { text: out.text.slice(0, 20_000) },
      error: out.isError ? out.text.slice(0, 2000) : null,
      applied_by: approval.decided_by,
    });
    if (!out.isError) await admin.from("store_agent_approvals").update({ applied_at: new Date().toISOString(), undoable: false }).eq("id", approvalId);
    return NextResponse.json(out.isError ? { status: "failed", error: out.text.slice(0, 2000) } : { status: "applied", text: out.text.slice(0, MAX_RESULT) });
  } catch (err) {
    const { status, code } = metaErrorStatus(err);
    if (status >= 500) console.error("[meta-ads/agent]", action, code, (err as Error).message);
    return NextResponse.json({ error: code }, { status });
  }
}
