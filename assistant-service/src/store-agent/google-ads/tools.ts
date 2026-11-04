// The Google Ads agent's own tools. Reads go straight through; a change is
// previewed (the platform runs every safety check and Google's validate_only),
// shown on an approval card that ALWAYS waits for a person, and applied only
// after approval. The platform checks that approval again before applying.

import type { SDKCustomTool } from "@cursor/sdk";
import type { ApprovalPreview } from "../../../../src/lib/store-agent/protocol";
import { INLINE_RESULT_BYTES, byteLength } from "../sdk-output";
import { failure, setChatStatus, stamp, text, writeChatFile, type ToolContext } from "../tool-helpers";
import { AdsPlatformError, callAdsPlatform, type AdsAction, type AdsPlatform } from "./platform";

type PreviewItem = ApprovalPreview["items"][number];
type PreviewResult = { ok: true; items: PreviewItem[]; warnings: string[]; operations: number } | { ok: false; error: string };
type ApplyResult = { status: "applied"; id: string; inverse: unknown[]; warnings: string[] } | { status: "failed"; id: string; error: string };

/** Items shown on the card itself; the rest are counted. */
const CARD_ITEMS = 12;

/** Big reads go to a file in the chat folder instead of the model's context. */
async function compact(ctx: ToolContext, payload: unknown, name: string): Promise<string> {
  const json = JSON.stringify(payload, null, 1);
  if (byteLength(json) <= INLINE_RESULT_BYTES) return json;
  const relative = `google-ads/${name}-${stamp()}.json`;
  await writeChatFile(ctx, relative, JSON.stringify(payload, null, 2));
  return `The result is large (${json.length.toLocaleString("en")} characters) and was saved to ${relative}. Read it with read_file or analyse it with run_script. First part:\n${json.slice(0, 4000)}`;
}

/** Where a change goes: its platform actions and the label on its card. */
const TARGETS = {
  ads: { preview: "preview", apply: "apply", label: "Google Ads" },
  merchant: { preview: "merchant_preview", apply: "merchant_apply", label: "Merchant Center" },
} as const;

export function createGoogleAdsTools(ctx: ToolContext, platform: AdsPlatform): Record<string, SDKCustomTool> {
  const call = <T>(action: AdsAction, body: Record<string, unknown>) =>
    callAdsPlatform<T>(platform, { action, userId: ctx.run.userId, body: { workspaceId: ctx.run.workspaceId, chatId: ctx.run.chatId, ...body }, signal: ctx.run.signal });

  /** Check → card (always waits for a person) → apply; the platform re-checks the approval. */
  const propose = async (target: keyof typeof TARGETS, args: Record<string, unknown>) => {
    const { preview: previewAction, apply: applyAction, label } = TARGETS[target];
    const title = typeof args.title === "string" ? args.title.trim().slice(0, 200) : "";
    const reason = typeof args.reason === "string" ? args.reason.trim().slice(0, 1500) : "";
    const ops = Array.isArray(args.edits) ? (args.edits as Record<string, unknown>[]) : [];
    if (!title || !reason || !ops.length) return failure("Give the change a title, a reason and at least one edit.");
    if (ctx.planMode) {
      return failure(`Plan mode is on, so nothing in ${label} can change. Put this step in the plan; the user switches to Agent mode to carry it out.`);
    }

    // 1. Same checks as applying (and Google's validate_only for Google Ads). Refused changes never reach the card.
    let preview: PreviewResult;
    try {
      preview = await call<PreviewResult>(previewAction, { ops });
    } catch (error) {
      return failure((error as Error).message);
    }
    if (!preview.ok) return failure(`This change can't be made: ${preview.error}`);

    // 2. The card. These changes always wait for a person, whatever auto-run is set to.
    const outcome = await waitForAdsApproval(ctx, { title, reason, items: preview.items, warnings: preview.warnings, label });
    if (!outcome.ok) return failure(outcome.message);

    // 3. Apply. The platform checks the approval again and reads the current state from Google.
    let result: ApplyResult;
    try {
      result = await call<ApplyResult>(applyAction, { approvalId: outcome.approvalId, title, ops });
    } catch (error) {
      const message = error instanceof AdsPlatformError ? error.message : String(error);
      return failure(`The change was approved but not confirmed by ${label}: ${message} Check the account before trying again; it is never applied twice.`);
    } finally {
      ctx.checkpoint();
    }
    if (result.status === "failed") return failure(`${label} did not apply the change: ${result.error}`);
    // Applied: the card can now offer Undo (the platform kept the inverse).
    ctx.run.emit({ type: "approval_resolved", approvalId: outcome.approvalId, status: "approved", auto: false, undoable: result.inverse.length > 0 });
    return text(
      JSON.stringify({
        applied: true,
        edits: ops.length,
        warnings: result.warnings,
        undo: result.inverse.length ? "The user can undo this change from its card." : "This change cannot be undone automatically.",
      })
    );
  };

  return {
    ads_overview: {
      description:
        "The connected Google Ads account at a glance (last 30 days): account, every campaign with budget, bidding, serving issues and metrics, " +
        "the ad groups, keywords and search terms that cost the most, and the negatives. Start every task with this.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        try {
          const res = await call<{ overview: unknown; fetchedAt: string }>("overview", {});
          return text(await compact(ctx, { ...res.overview as object, dataAsOf: res.fetchedAt }, "overview"));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    ads_query: {
      description:
        "Run one read-only GAQL query (SELECT … FROM … WHERE … ORDER BY … LIMIT …) on the connected Google Ads account. At most 500 rows. " +
        "Money fields ending in _micros are millionths of the account currency.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "One GAQL SELECT statement." },
          purpose: { type: "string", description: "One short sentence, in the user's language, saying what you are looking for." },
        },
        required: ["query"],
      },
      execute: async (args) => {
        const query = typeof args.query === "string" ? args.query : "";
        try {
          const res = await call<{ ok: boolean; error?: string; query?: string; rows?: unknown[]; rowCount?: number }>("query", { query });
          if (!res.ok) return failure(`Google Ads refused the query: ${res.error}`);
          return text(await compact(ctx, { query: res.query, rowCount: res.rowCount, rows: res.rows }, "query"));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    ads_report: {
      description:
        "An expert report on the connected Google Ads account, computed by the platform: " +
        "conversions (tracking health: double counting, values, primary actions, bidding volume), " +
        "shopping_pmax (asset groups, asset coverage, listing groups, signals, PMax search categories), " +
        "products (every advertised product tiered star / on_target / below_target / loser / too_early, plus products that barely serve), " +
        "recommendations (Google's open recommendations, each with a verdict from the account's own numbers, and auto-apply), " +
        "reach (devices, countries, location targeting, audiences, ad assets, recent account changes). Each returns findings ranked by severity.",
      inputSchema: {
        type: "object",
        properties: {
          report: { type: "string", enum: ["conversions", "shopping_pmax", "products", "recommendations", "reach"] },
          days: { type: "number", enum: [7, 14, 30, 90], description: "Period, default 30. Recommendations always use 30." },
          targetRoas: { type: "number", description: "products only: the store's real target ROAS (e.g. 4 = 400%) when the user gives one; otherwise the account average is used." },
          refresh: { type: "boolean", description: "Read fresh from Google instead of the last 15 minutes' copy. Only after a change." },
        },
        required: ["report"],
      },
      execute: async (args) => {
        try {
          const res = await call<{ ok: boolean; error?: string; report?: unknown }>("report", {
            report: args.report,
            days: args.days,
            targetRoas: args.targetRoas,
            refresh: args.refresh === true,
          });
          if (!res.ok) return failure(res.error ?? "The report could not be made.");
          return text(await compact(ctx, res.report, `report-${String(args.report)}`));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    ads_change: {
      description:
        "Propose one change to the Google Ads account: one or more related edits applied together (all or nothing). " +
        "The user sees every edit before → after, already checked by Google, and must approve it; nothing changes without that. " +
        "Edits: status.set, budget.update, campaign.update, adGroup.update, keyword.create, keyword.update, negative.create, negative.remove (formats in your rules).",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short title in the user's language, e.g. \"Pause 3 keywords that spent with no conversions\"." },
          reason: { type: "string", description: "Why, with the numbers behind it, in the user's language. Shown on the card." },
          edits: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", additionalProperties: true }, description: "The edits, in the formats from your rules." },
        },
        required: ["title", "reason", "edits"],
      },
      execute: (args) => propose("ads", args),
    },

    merchant_products: {
      description:
        "The connected Merchant Center account's products: each product's id, title, description, brand, GTIN, image, price, availability, " +
        "status (approved, limited, disapproved, pending) and every issue Google reports, plus the account's own issues and issue counts. " +
        "Start here for any product or feed question.",
      inputSchema: {
        type: "object",
        properties: { refresh: { type: "boolean", description: "Read fresh from Google instead of the last few minutes' copy. Only after a fix." } },
      },
      execute: async (args) => {
        try {
          const res = await call<{ overview: unknown; fetchedAt: string }>("merchant", { refresh: args.refresh === true });
          return text(await compact(ctx, { ...(res.overview as object), dataAsOf: res.fetchedAt }, "merchant-products"));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    merchant_change: {
      description:
        "Propose fixes to Merchant Center products: title, description, brand, GTIN, MPN, image link or Google product category. " +
        "The user sees every product before → after on a card and must approve it; nothing changes without that. " +
        'Edits: { "kind": "product.update", "productId": "<id from merchant_products>", "set": { ...fields } }, one per product.',
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: 'Short title in the user\'s language, e.g. "Clearer titles for 3 products".' },
          reason: { type: "string", description: "Why: which issue or weakness each fix solves, in the user's language. Shown on the card." },
          edits: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", additionalProperties: true }, description: "One product.update per product." },
        },
        required: ["title", "reason", "edits"],
      },
      execute: (args) => propose("merchant", args),
    },

    business_profile: {
      description:
        "The business profile shared by every Autommerce agent in this workspace: every field with its value, where it came from and whether the owner " +
        "confirmed it or it is only a suggestion, and the required fields still missing. A short version is already in your rules; " +
        "read this for the full texts (brand voice, identity, shipping and returns) or after an edit.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        try {
          const res = await call<{ ok: boolean; profile: unknown }>("profile", {});
          return text(JSON.stringify(res.profile, null, 1));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    update_business_profile: {
      description:
        "Save fields of the business profile. statedByUser: true ONLY when the user said these values in this chat (\"our margin is 40%\", " +
        "\"add Qatar\"): they are saved as confirmed, at once; the user can change them on the Business profile page. " +
        "statedByUser: false for what you found yourself (website, account data): saved only as suggestions the owner confirms, only into empty or " +
        "suggested fields, and never for margin, target ROAS, monthly budget cap or goal (only the owner sets those). " +
        "Fields: businessName, website, languages, brandTerms, markets, categories, focusProducts, goal (profit | growth | new_customers), margin (e.g. 40 for 40%), " +
        "targetRoas (e.g. 4 for 400%), monthlyBudgetCap, averageOrderValue (amounts in the account currency), keySellingPoints, competitiveAdvantages, " +
        "competitors ([{ name, url }]), shippingReturns, peakSeasons, neverAdvertise, brandIdentity, brandVoice, visualDirection, logoUrl, palette ([{ name, hex, role }]). " +
        "Lists are arrays and REPLACE the whole list: to add one item, send the current items plus the new one. value null clears a field.",
      inputSchema: {
        type: "object",
        properties: {
          edits: {
            type: "array",
            minItems: 1,
            maxItems: 23,
            items: { type: "object", properties: { field: { type: "string" }, value: {} }, required: ["field", "value"] },
          },
          statedByUser: { type: "boolean" },
          source: { type: "string", enum: ["website", "google_ads", "merchant", "store"], description: "Only for suggestions: where you found the values." },
        },
        required: ["edits", "statedByUser"],
      },
      execute: async (args) => {
        try {
          const res = await call<{ ok: boolean; error?: string } & Record<string, unknown>>("profile_update", {
            edits: args.edits,
            statedByUser: args.statedByUser === true,
            source: args.source,
          });
          if (!res.ok) return failure(`Not saved: ${res.error}`);
          return text(JSON.stringify({ ...res, ok: undefined }));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

  };
}

type AdsApproval = { ok: true; approvalId: string } | { ok: false; message: string };

/**
 * Record the change, show its card and wait. Unlike store changes there is no
 * auto-run and no backup file: the platform keeps the inverse when it applies.
 */
async function waitForAdsApproval(
  ctx: ToolContext,
  change: { title: string; reason: string; items: PreviewItem[]; warnings: string[]; label: string }
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
      preview,
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
