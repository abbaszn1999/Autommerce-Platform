// The Meta Ads agent's tools: a thin, safe layer over Meta's official Ads MCP
// server (through the platform site, which holds the token).
// - meta_tool_info: the exact input format of one Meta tool.
// - meta_read: run one read-only Meta tool.
// - meta_change: propose one Meta tool call that changes the account. It is
//   shown on an approval card that ALWAYS waits for a person, and the site runs
//   it only with that approval (bound to exactly this call).
// - meta_page_posts: a Page's latest posts (Graph API; not in the MCP server).
// Which tools read and which write comes from Meta's own annotations (site side).

import type { SDKCustomTool } from "@cursor/sdk";
import type { ApprovalPreview } from "../../../../src/lib/store-agent/protocol";
import { INLINE_RESULT_BYTES, byteLength } from "../../core/sdk-output";
import { failure, stamp, text, writeChatFile, type ToolContext } from "../../core/tool-helpers";
import { waitForAdsApproval } from "../../core/approvals";
import { MetaPlatformError, callMetaPlatform, type MetaAction, type MetaPlatform, type MetaToolInfo } from "./platform";

type PreviewItem = ApprovalPreview["items"][number];
type PreviewResult = { ok: true; items: PreviewItem[]; warnings: string[]; binding: string } | { ok: false; error: string };
type ApplyResult = { status: "applied"; text: string } | { status: "failed"; error: string };

/** Big answers go to a file in the chat folder instead of the model's context. */
async function compact(ctx: ToolContext, raw: string, name: string): Promise<string> {
  if (byteLength(raw) <= INLINE_RESULT_BYTES) return raw;
  let pretty = raw;
  try {
    pretty = JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    // Not JSON: saved as it is.
  }
  const relative = `meta-ads/${name}-${stamp()}.json`;
  await writeChatFile(ctx, relative, pretty);
  return `The result is large (${raw.length.toLocaleString("en")} characters) and was saved to ${relative}. Read it with read_file or analyse it with run_script. First part:\n${raw.slice(0, 4000)}`;
}

/** The tools, fetched once per run (the run's rules list them too). */
export async function loadMetaTools(platform: MetaPlatform, ctx: Pick<ToolContext, "run">): Promise<MetaToolInfo[]> {
  const res = await callMetaPlatform<{ tools: MetaToolInfo[] }>(platform, {
    action: "tools",
    userId: ctx.run.userId,
    body: { workspaceId: ctx.run.workspaceId, chatId: ctx.run.chatId },
    signal: ctx.run.signal,
  });
  return Array.isArray(res.tools) ? res.tools : [];
}

export function createMetaAdsTools(ctx: ToolContext, platform: MetaPlatform, tools: MetaToolInfo[]): Record<string, SDKCustomTool> {
  const call = <T>(action: MetaAction, body: Record<string, unknown>) =>
    callMetaPlatform<T>(platform, { action, userId: ctx.run.userId, body: { ...body, workspaceId: ctx.run.workspaceId, chatId: ctx.run.chatId }, signal: ctx.run.signal });
  const byName = new Map(tools.map((t) => [t.name, t]));
  const readNames = tools.filter((t) => t.kind === "read").map((t) => t.name);
  const writeNames = tools.filter((t) => t.kind === "write").map((t) => t.name);
  const argsOf = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

  return {
    meta_tool_info: {
      description: "The exact input format (JSON schema) and full description of one Meta tool. Call it before using a tool whose arguments you are not sure of.",
      inputSchema: { type: "object", properties: { tool: { type: "string", enum: [...readNames, ...writeNames] } }, required: ["tool"] },
      execute: async (args) => {
        const tool = byName.get(String(args.tool));
        if (!tool) return failure(`Unknown Meta tool: ${String(args.tool)}.`);
        return text(JSON.stringify({ name: tool.name, kind: tool.kind, destructive: tool.destructive, description: tool.description, inputSchema: tool.inputSchema }, null, 1));
      },
    },

    meta_read: {
      description:
        "Run one READ-ONLY Meta tool (ad accounts, campaigns/ad sets/ads with metrics, insights, creatives, previews, audiences, catalogs, pixels, " +
        "activity log, errors, benchmarks…) with its arguments. Nothing changes. Check the format with meta_tool_info when unsure.",
      inputSchema: {
        type: "object",
        properties: {
          tool: { type: "string", enum: readNames },
          arguments: { type: "object", additionalProperties: true, description: "The tool's arguments, as its input format says." },
          purpose: { type: "string", description: "One short sentence, in the user's language, saying what you are looking for." },
        },
        required: ["tool"],
      },
      execute: async (args) => {
        try {
          const res = await call<{ ok: boolean; error?: string; text?: string; truncated?: boolean }>("read", { tool: args.tool, arguments: argsOf(args.arguments) });
          if (!res.ok) return failure(`Meta refused: ${res.error ?? res.text ?? "unknown error"}`);
          const body = `${res.text ?? ""}${res.truncated ? "\n[The answer was cut: ask for less, e.g. a smaller date range or fewer fields.]" : ""}`;
          return text(await compact(ctx, body, String(args.tool)));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    meta_change: {
      description:
        "Propose ONE Meta tool call that changes the ad account or catalog (create, update, activate, duplicate, delete…). " +
        "The user sees every argument on a card and must approve it; nothing changes without that. New campaigns, ad sets and ads are created PAUSED; " +
        "making them live is a separate ads_activate_entity change. Check the tool's format with meta_tool_info first.",
      inputSchema: {
        type: "object",
        properties: {
          tool: { type: "string", enum: writeNames },
          arguments: { type: "object", additionalProperties: true, description: "The tool's arguments, as its input format says." },
          title: { type: "string", description: 'Short title in the user\'s language, e.g. "Pause 2 ad sets with no purchases".' },
          reason: { type: "string", description: "Why, with the numbers behind it, in the user's language. Shown on the card." },
        },
        required: ["tool", "arguments", "title", "reason"],
      },
      execute: async (args) => {
        const tool = byName.get(String(args.tool));
        const title = typeof args.title === "string" ? args.title.trim().slice(0, 200) : "";
        const reason = typeof args.reason === "string" ? args.reason.trim().slice(0, 1500) : "";
        if (!tool || tool.kind !== "write") return failure(`${String(args.tool)} is not a Meta tool that changes the account. Use meta_read for reading tools.`);
        if (!title || !reason) return failure("Give the change a title and a reason.");
        if (ctx.planMode) return failure("Plan mode is on, so nothing in Meta can change. Describe this step in your plan; the user switches to Agent mode to carry it out.");
        const toolArgs = argsOf(args.arguments);

        // 1. The site checks the call and builds the card (refused calls never reach the card).
        let preview: PreviewResult;
        try {
          preview = await call<PreviewResult>("preview", { tool: tool.name, arguments: toolArgs });
        } catch (error) {
          return failure((error as Error).message);
        }
        if (!preview.ok) return failure(`This change can't be made: ${preview.error}`);

        // 2. The card. Always waits for a person.
        const outcome = await waitForAdsApproval(ctx, { title, reason, items: preview.items, warnings: preview.warnings, label: "Meta Ads", binding: preview.binding });
        if (!outcome.ok) return failure(outcome.message);

        // 3. Apply. The site checks the approval again (bound to exactly this call) and never runs it twice.
        let result: ApplyResult;
        try {
          result = await call<ApplyResult>("apply", { approvalId: outcome.approvalId, title, tool: tool.name, arguments: toolArgs });
        } catch (error) {
          const message = error instanceof MetaPlatformError ? error.message : String(error);
          return failure(`The change was approved but not confirmed by Meta: ${message} Check the account before trying again; it is never applied twice.`);
        } finally {
          ctx.checkpoint();
        }
        if (result.status === "failed") return failure(`Meta did not apply the change: ${result.error}`);
        ctx.run.emit({ type: "approval_resolved", approvalId: outcome.approvalId, status: "approved", auto: false, undoable: false });
        return text(JSON.stringify({ applied: true, result: result.text.slice(0, 20_000), undo: "Meta changes cannot be undone automatically: to reverse it, propose the opposite change." }));
      },
    },

    meta_page_posts: {
      description: "The latest posts of the selected Facebook Page (or of pageId): text, date, link and picture. Use it to find posts worth boosting or reusing in ads.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: { type: "string", description: "Only for another Page than the selected one." },
          limit: { type: "number", description: "How many posts (1–25, default 10)." },
        },
      },
      execute: async (args) => {
        try {
          const res = await call<{ ok: boolean; error?: string; pageId?: string; posts?: unknown[] }>("page_posts", { pageId: args.pageId, limit: args.limit });
          if (!res.ok) return failure(res.error ?? "Meta did not return the posts.");
          return text(await compact(ctx, JSON.stringify({ pageId: res.pageId, posts: res.posts }), "page-posts"));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },
  };
}
