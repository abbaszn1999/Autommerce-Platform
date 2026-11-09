import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { verifyAgentRequest } from "@/lib/google-ads/agent-auth.server";
import { GaqlGuardError, accountOverview, describeLiveChange, guardGaql } from "@/lib/google-ads/agent-support";
import { ConnectionHttpError, batchMutate, errorStatus, loadConnection, searchGaql } from "@/lib/google-ads/connection.server";
import { LivePlanError, planLiveChange } from "@/lib/google-ads/live-mutate";
import { applyLiveChange, fetchBefore, googleMessage } from "@/lib/google-ads/live-mutate.server";
import { loadLiveAccount } from "@/lib/google-ads/live-report.server";
import { REPORTS, REPORT_DAYS, isReportName, type ReportDays } from "@/lib/google-ads/live-reports";
import { runReport } from "@/lib/google-ads/live-reports.server";
import { MerchantPlanError, merchantOverview, type MerchantOp } from "@/lib/google-ads/merchant-live";
import { applyMerchantChange, loadMerchantSnapshot, previewMerchantChange } from "@/lib/google-ads/merchant.server";
import { rangeFor } from "@/lib/google-ads/metrics";
import { PROFILE_SOURCES, ProfileEditError, fieldLabel, formatValue, isProfileField, missingRequired, profileForAgent, userStatedValue, type ProfileEdit, type ProfileSource } from "@/lib/business-profile";
import { editProfile, loadProfile } from "@/lib/business-profile.server";
import { DocInputError, parsePlanInput, parseReportInput } from "@/lib/google-ads/live-docs";
import { approvalBinding, type ApprovalTarget } from "@/lib/google-ads/approval-binding";
import { KeywordInputError, regionNameIndex, rowsForAgent } from "@/lib/google-ads/keyword-planner";
import { keywordForecast, keywordResearch } from "@/lib/google-ads/keyword-planner.server";
import { docConnections, getDoc, savePlan, saveReport } from "@/lib/google-ads/live-docs.server";
import { CompetitorInputError, analysisForAgent, parseTarget } from "@/lib/google-ads/competitor-ads";
import { CompetitorCreditsError, CompetitorUnavailableError, quoteAnalysis, runAnalysis } from "@/lib/google-ads/competitor-ads.server";
import type { MutateOp } from "@/lib/google-ads/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ACTIONS = new Set([
  "overview",
  "query",
  "report",
  "preview",
  "apply",
  "merchant",
  "merchant_preview",
  "merchant_apply",
  "profile",
  "profile_update",
  "doc_plan",
  "doc_report",
  "doc_read",
  "keywords",
  "keyword_forecast",
  "competitor_ads",
]);
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
    if (action === "profile" || action === "profile_update") return await profileAction(action, body, { admin, workspaceId, chatId }, caller.userId);
    if (action.startsWith("doc_")) return await docAction(action, body, { admin, workspaceId, chatId }, caller.userId);
    if (action === "competitor_ads") return await competitorAction(body, { admin, workspaceId, chatId }, caller.userId);
    const row = await loadConnection(admin, workspaceId, "ads");
    if (!row?.composio_connected_account_id || !row.account_id) return NextResponse.json({ error: "not_connected" }, { status: 409 });
    const customerId = row.account_id;

    if (action === "overview") {
      const range = rangeFor("LAST_30_DAYS");
      const { data, fetchedAt } = await loadLiveAccount(row, range);
      return NextResponse.json({ overview: accountOverview(data, range), fetchedAt });
    }

    if (action === "report") {
      if (!isReportName(body.report)) return NextResponse.json({ ok: false, error: `Unknown report. Use one of: ${REPORTS.join(", ")}.` });
      const days = (REPORT_DAYS as readonly number[]).includes(Number(body.days)) ? (Number(body.days) as ReportDays) : 30;
      // The store's own target (business profile) unless the agent passes one; otherwise the account average.
      const given = typeof body.targetRoas === "number" && body.targetRoas > 0 && body.targetRoas < 100 ? body.targetRoas : undefined;
      const saved = body.report === "products" && given === undefined ? (await loadProfile(admin, workspaceId)).values.targetRoas : undefined;
      const targetRoas = given ?? (typeof saved === "number" ? saved : undefined);
      const report = await runReport(row, body.report, days, { targetRoas, force: body.refresh === true });
      return NextResponse.json({ ok: true, report });
    }

    if (action === "keywords" || action === "keyword_forecast") {
      try {
        if (action === "keyword_forecast") return NextResponse.json({ ok: true, forecast: await keywordForecast(admin, row, body) });
        const research = await keywordResearch(admin, row, body);
        return NextResponse.json({
          ok: true,
          research: {
            mode: research.mode,
            seed: research.seed,
            countries: research.countries.map((c) => c.name),
            language: research.language?.name ?? "all languages",
            currency: research.currency,
            totalIdeas: research.totalIdeas,
            keywords: rowsForAgent(research.rows),
          },
        });
      } catch (err) {
        if (err instanceof KeywordInputError) return NextResponse.json({ ok: false, error: err.message });
        throw err;
      }
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
    const approved = await approvedChange(admin, body, { workspaceId, chatId }, "ads", ops);
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

/** The approval a person gave in this chat for exactly these edits, or the response refusing it. */
async function approvedChange(admin: Ctx["admin"], body: Record<string, unknown>, { workspaceId, chatId }: Omit<Ctx, "admin">, target: ApprovalTarget, ops: unknown[]) {
  const approvalId = typeof body.approvalId === "string" ? body.approvalId : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
  if (!UUID.test(approvalId) || !title) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { data: approval } = await admin
    .from("store_agent_approvals")
    .select("id, status, decided_by, preview")
    .eq("id", approvalId)
    .eq("chat_id", chatId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!approval || approval.status !== "approved" || !approval.decided_by) return NextResponse.json({ error: "not_approved" }, { status: 403 });
  if ((approval.preview as { binding?: string } | null)?.binding !== approvalBinding(target, ops)) return NextResponse.json({ error: "not_approved" }, { status: 403 });
  return { approvalId, title, decidedBy: String(approval.decided_by) };
}

/**
 * The business profile. What the user said in the chat is saved as confirmed;
 * what the agent found itself (website, account data) only as a suggestion,
 * under the rules in planProfileEdits.
 */
async function profileAction(action: string, body: Record<string, unknown>, { admin, workspaceId, chatId }: Ctx, userId: string) {
  const currency = (await loadConnection(admin, workspaceId, "ads"))?.account_currency ?? "";
  if (action === "profile") return NextResponse.json({ ok: true, profile: profileForAgent(await loadProfile(admin, workspaceId), currency) });
  try {
    const all = Array.isArray(body.edits) ? (body.edits as ProfileEdit[]) : [];
    if (!all.length || !all.every((e) => e && typeof e === "object")) return NextResponse.json({ ok: false, error: "Give at least one { field, value } edit." });
    const stated = body.statedByUser === true;
    // "The user said so" is the agent's word: numbers that steer spending must be in what the user wrote here.
    let edits = all;
    const unproven: ProfileEdit[] = [];
    if (stated) {
      const { data } = await admin.from("store_agent_messages").select("content").eq("chat_id", chatId).eq("role", "user").order("created_at", { ascending: false }).limit(5);
      const messages = ((data ?? []) as { content: string | null }[]).map((m) => m.content ?? "");
      edits = all.filter((e) => {
        const ok = !isProfileField(e.field) || userStatedValue(e.field, e.value, messages);
        if (!ok) unproven.push(e);
        return ok;
      });
    }
    const notSaid = unproven.map((e) => ({ field: e.field, label: fieldLabel(e.field), reason: "the user has not written this number in the chat; ask them, or they can set it on the Business profile page" }));
    if (!edits.length) return NextResponse.json({ ok: true, saved: [], status: "confirmed", skipped: notSaid, missingRequired: [] });
    const source = PROFILE_SOURCES.includes(body.source as ProfileSource) && body.source !== "owner" && body.source !== "chat" ? (body.source as ProfileSource) : "website";
    const result = await editProfile(admin, workspaceId, edits, stated ? { source: "chat", status: "confirmed" } : { source, status: "suggested" }, { userId, chatId });
    return NextResponse.json({
      ok: true,
      saved: result.changes.map((c) => ({ field: c.field, label: fieldLabel(c.field), before: formatValue(c.field, c.before, currency), after: formatValue(c.field, c.after, currency) })),
      status: stated ? "confirmed" : "suggested",
      skipped: [...result.skipped.map((s) => ({ field: s.field, label: fieldLabel(s.field), reason: s.reason })), ...notSaid],
      missingRequired: missingRequired(result.profile.values),
    });
  } catch (err) {
    if (err instanceof ProfileEditError) return NextResponse.json({ ok: false, error: err.message });
    throw err;
  }
}

/**
 * Plans and reports. Saving a plan has Google check every step; the owner
 * applies the steps from the page, never the agent.
 */
async function docAction(action: string, body: Record<string, unknown>, { admin, workspaceId, chatId }: Ctx, userId: string) {
  const conns = await docConnections(admin, workspaceId);
  const documentId = typeof body.documentId === "string" && UUID.test(body.documentId) ? body.documentId : undefined;
  if (action === "doc_read") {
    const doc = documentId ? await getDoc(admin, workspaceId, conns.ads.account_id!, documentId) : null;
    return NextResponse.json(doc ? { ok: true, document: doc } : { ok: false, error: "No document with that id on this account." });
  }
  try {
    const ctx = { admin, workspaceId, chatId, userId, conns };
    const result = action === "doc_plan" ? await savePlan(ctx, documentId, parsePlanInput(body)) : await saveReport(ctx, documentId, parseReportInput(body));
    if (!result.ok) return NextResponse.json(result);
    const { doc } = result;
    return NextResponse.json({ ok: true, document: { id: doc.id, kind: doc.kind, title: doc.title, version: doc.version, steps: doc.steps?.total } });
  } catch (err) {
    if (err instanceof DocInputError) return NextResponse.json({ ok: false, error: err.message });
    throw err;
  }
}

let nameToCode: ((name: string) => string | undefined) | null = null;

/**
 * A competitor's paid search keywords (SE Ranking's list). "quote" says what it
 * would cost; a lookup charges the workspace our cost for what had to be bought.
 */
async function competitorAction(body: Record<string, unknown>, { admin, workspaceId }: Ctx, userId: string) {
  try {
    const target = parseTarget({ domain: body.domain, country: body.country }, (nameToCode ??= regionNameIndex()));
    const pages = Number(body.pages) || 1;
    if (body.quoteOnly === true) {
      const quote = await quoteAnalysis(admin, target, pages);
      return NextResponse.json({ ok: true, quote: { ...target, credits: quote.credits, note: quote.credits ? "Charged at cost to the workspace when run." : "Free: this month's copy already has it." } });
    }
    const analysis = await runAnalysis({ admin, workspaceId, userId, target, pages });
    return NextResponse.json({ ok: true, analysis: analysisForAgent(analysis) });
  } catch (err) {
    if (err instanceof CompetitorInputError) return NextResponse.json({ ok: false, error: err.message });
    if (err instanceof CompetitorCreditsError) return NextResponse.json({ ok: false, error: `${err.message} The user can top up credits, then ask again.` });
    if (err instanceof CompetitorUnavailableError) return NextResponse.json({ ok: false, error: "Competitor data is not available right now. Nothing was charged; try again later." });
    throw err;
  }
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

  const approved = await approvedChange(admin, body, { workspaceId, chatId }, "merchant", ops);
  if (approved instanceof NextResponse) return approved;
  const { approvalId, title, decidedBy } = approved;
  const result = await applyMerchantChange({ admin, row, userId: decidedBy, input: { clientChangeId: approvalId, title, source: "AGENT", ops } });
  if (result.status === "applied") await admin.from("store_agent_approvals").update({ applied_at: new Date().toISOString(), undoable: result.inverse.length > 0 }).eq("id", approvalId);
  return NextResponse.json(result);
}
