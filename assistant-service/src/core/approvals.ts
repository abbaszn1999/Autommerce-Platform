import type { ApprovalPreview } from "../../../src/lib/store-agent/protocol";
import { setChatStatus, type ToolContext } from "./tool-helpers";

type PreviewItem = ApprovalPreview["items"][number];

/** Most rows one approval card lists; the rest are counted. */
const CARD_ITEMS = 200;

export type AdsApproval = { ok: true; approvalId: string } | { ok: false; message: string };

/**
 * Record the change, show its card and wait. Unlike store changes there is no
 * auto-run and no backup file: the platform keeps the inverse when it applies.
 */
export async function waitForAdsApproval(
  ctx: ToolContext,
  change: { title: string; reason: string; items: PreviewItem[]; warnings: string[]; label: string; binding: string }
): Promise<AdsApproval> {
  const preview: ApprovalPreview = { items: change.items.slice(0, CARD_ITEMS), more: Math.max(0, change.items.length - CARD_ITEMS) };
  const summary = [change.title, change.reason, ...change.warnings.map((w) => `⚠ ${w}`)].join("\n\n").slice(0, 2000);
  const { data, error } = await ctx.db
    .from("store_agent_approvals")
    .insert({
      chat_id: ctx.run.chatId,
      workspace_id: ctx.run.workspaceId,
      run_id: ctx.run.id,
      kind: "write",
      summary,
      operations: [change.label],
      // The platform recomputes the binding before applying.
      preview: { ...preview, binding: change.binding },
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: `Could not record the change for approval (${error?.message ?? "no row"}). Do not make this change.` };
  const approvalId = data.id as string;

  ctx.run.emit({ type: "approval", approvalId, risk: "write", summary, operations: [change.label], preview, records: change.items.length });
  await setChatStatus(ctx, "awaiting_approval");
  const decision = await ctx.run.waitForApproval(approvalId);
  await setChatStatus(ctx, "running");
  const wroteInstead = decision === "superseded" ? (ctx.run.takeChatReply(approvalId) ?? "") : undefined;
  const status = decision === "superseded" ? "rejected" : decision;
  await ctx.db
    .from("store_agent_approvals")
    .update({ status, decided_by: status === "expired" ? null : ctx.run.userId, decided_at: new Date().toISOString(), undoable: false })
    .eq("id", approvalId);
  ctx.run.emit({ type: "approval_resolved", approvalId, status, auto: false, undoable: false });

  if (status === "approved") return { ok: true, approvalId };
  if (ctx.run.cancelled) return { ok: false, message: "The run was stopped." };
  if (wroteInstead !== undefined) {
    return {
      ok: false,
      message: `The user did not decide on this change; they wrote in the chat instead:\n"${wroteInstead}"\nThe change was not made. Follow their message; if they still want it, propose it again.`,
    };
  }
  if (status === "rejected") (ctx.consent ??= { declinedAt: null, answeredAt: null }).declinedAt = Date.now();
  return {
    ok: false,
    message:
      status === "expired"
        ? "Nobody approved this change in time, so it was not made. Tell the user it is waiting for them and stop."
        : "The user declined this change, so it was not made. Do not propose it again; ask what they would like instead.",
  };
}
