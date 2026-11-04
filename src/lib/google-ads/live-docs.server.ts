// Plans and reports for a workspace's live Google Ads account: saved by Vera
// (signed agent route), read and applied from the page (owner or admin).
// Every step goes through the same path as an approved change in the chat:
// Google checks it first, it is applied all-or-nothing, and its inverse is kept
// for undo. Never import from client code.

import type { SupabaseClient } from "@supabase/supabase-js";
import { describeLiveChange } from "./agent-support";
import { ConnectionHttpError, batchMutate, loadConnections, type ConnectionRow } from "./connection.server";
import { LivePlanError, planLiveChange } from "./live-mutate";
import { applyLiveChange, fetchBefore, googleMessage } from "./live-mutate.server";
import { MerchantPlanError, type MerchantOp } from "./merchant-live";
import { applyMerchantChange, previewMerchantChange } from "./merchant.server";
import {
  DOC_LIMITS,
  DocInputError,
  canApply,
  changesNothing,
  docChangePrefix,
  planStatus,
  stepChangeId,
  stepCounts,
  stepStates,
  type DocKind,
  type DocVersion,
  type LiveDoc,
  type LiveDocSummary,
  type PlanContent,
  type PlanInput,
  type PlanStep,
  type PreviewItem,
  type ReportContent,
  type ReportInput,
  type StepChangeRow,
  type StepState,
} from "./live-docs";
import type { MutateOp } from "./types";

type DocRow = {
  id: string;
  workspace_id: string;
  customer_id: string;
  kind: DocKind;
  title: string;
  summary: string;
  content: PlanContent | ReportContent;
  version: number;
  history: DocVersion[];
  chat_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

const SUMMARY_COLUMNS = "id, workspace_id, customer_id, kind, title, summary, version, chat_id, archived_at, created_at, updated_at, content";
const ALL_COLUMNS = `${SUMMARY_COLUMNS}, history`;

export type DocConnections = { ads: ConnectionRow; merchant: ConnectionRow | null };

/** The workspace's connected Google Ads account (and Merchant Center, when connected). */
export async function docConnections(admin: SupabaseClient, workspaceId: string): Promise<DocConnections> {
  const rows = await loadConnections(admin, workspaceId);
  if (!rows.ads?.composio_connected_account_id || !rows.ads.account_id) throw new ConnectionHttpError(409, "not_connected");
  const merchant = rows.merchant?.composio_connected_account_id && rows.merchant.account_id ? rows.merchant : null;
  return { ads: rows.ads, merchant };
}

// ─── Checking a step with Google ─────────────────────────────────────────────

export type StepCheck = { ok: true; items: PreviewItem[]; warnings: string[] } | { ok: false; error: string };

/** Same checks as applying (and Google's validate_only for Google Ads). Nothing changes. */
export async function checkStep(admin: SupabaseClient, conns: DocConnections, step: Pick<PlanStep, "target" | "ops">): Promise<StepCheck> {
  try {
    if (step.target === "merchant") {
      if (!conns.merchant) return { ok: false, error: "Merchant Center is not connected." };
      const plan = await previewMerchantChange(admin, conns.merchant, step.ops as MerchantOp[]);
      return { ok: true, items: plan.items, warnings: plan.warnings };
    }
    const row = conns.ads;
    const customerId = row.account_id!;
    const ops = step.ops as MutateOp[];
    const before = await fetchBefore(admin, row, customerId, ops);
    const plan = planLiveChange(customerId, ops, before);
    await batchMutate(row, customerId, plan.operations, { validateOnly: true });
    return { ok: true, items: describeLiveChange(ops, before, row.account_currency ?? ""), warnings: plan.warnings };
  } catch (err) {
    if (err instanceof LivePlanError || err instanceof MerchantPlanError) return { ok: false, error: err.message };
    if (err instanceof ConnectionHttpError && err.message === "google_request_failed") return { ok: false, error: googleMessage(err.detail) };
    throw err;
  }
}

/** Check steps a few at a time (each is several Google calls). */
async function checkAll(admin: SupabaseClient, conns: DocConnections, steps: Pick<PlanStep, "target" | "ops">[]): Promise<StepCheck[]> {
  const out: StepCheck[] = new Array(steps.length);
  let next = 0;
  const worker = async () => {
    while (next < steps.length) {
      const i = next++;
      out[i] = await checkStep(admin, conns, steps[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, steps.length) }, worker));
  return out;
}

// ─── Reading ─────────────────────────────────────────────────────────────────

async function changesFor(admin: SupabaseClient, workspaceId: string, docIds: string[]): Promise<StepChangeRow[]> {
  if (!docIds.length) return [];
  const { data, error } = await admin
    .from("google_ads_changes")
    .select("id, client_change_id, status, error, undone_at, created_at, inverse")
    .eq("workspace_id", workspaceId)
    .like("client_change_id", "doc:%")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new ConnectionHttpError(500, "load_failed");
  const prefixes = docIds.map(docChangePrefix);
  return (data ?? [])
    .filter((r) => prefixes.some((p) => String(r.client_change_id).startsWith(p)))
    .map((r) => ({
      id: String(r.id),
      client_change_id: String(r.client_change_id),
      status: String(r.status),
      error: (r.error as string | null) ?? null,
      undone_at: (r.undone_at as string | null) ?? null,
      created_at: String(r.created_at),
      undoable: Array.isArray(r.inverse) && r.inverse.length > 0,
    }));
}

function toSummary(row: DocRow, states?: Record<string, StepState>): LiveDocSummary {
  const base = {
    id: row.id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    chatId: row.chat_id,
  };
  if (row.kind === "report") return { ...base, status: row.archived_at ? "archived" : "ready" };
  const steps = (row.content as PlanContent).steps ?? [];
  const s = states ?? {};
  return { ...base, status: row.archived_at ? "archived" : planStatus(steps, s), steps: stepCounts(steps, s) };
}

function toDoc(row: DocRow, changes: StepChangeRow[]): LiveDoc {
  const states = row.kind === "plan" ? stepStates(row.id, (row.content as PlanContent).steps, changes) : undefined;
  return {
    ...toSummary(row, states),
    content: row.content,
    ...(states ? { stepStates: states } : {}),
    history: (row.history ?? []).map((v) => ({ version: v.version, at: v.at, title: v.title, summary: v.summary })),
  };
}

export async function listDocs(admin: SupabaseClient, workspaceId: string, customerId: string): Promise<LiveDocSummary[]> {
  const { data, error } = await admin
    .from("google_ads_documents")
    .select(SUMMARY_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("customer_id", customerId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new ConnectionHttpError(500, "load_failed");
  const rows = (data ?? []) as unknown as DocRow[];
  const plans = rows.filter((r) => r.kind === "plan");
  const changes = await changesFor(admin, workspaceId, plans.map((r) => r.id));
  return rows.map((r) => toSummary(r, r.kind === "plan" ? stepStates(r.id, (r.content as PlanContent).steps ?? [], changes) : undefined));
}

async function loadRow(admin: SupabaseClient, workspaceId: string, customerId: string, id: string): Promise<DocRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await admin
    .from("google_ads_documents")
    .select(ALL_COLUMNS)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw new ConnectionHttpError(500, "load_failed");
  return (data as unknown as DocRow) ?? null;
}

export async function getDoc(admin: SupabaseClient, workspaceId: string, customerId: string, id: string): Promise<LiveDoc | null> {
  const row = await loadRow(admin, workspaceId, customerId, id);
  if (!row) return null;
  return toDoc(row, row.kind === "plan" ? await changesFor(admin, workspaceId, [row.id]) : []);
}

/** An earlier version's content (read only). */
export async function getDocVersion(admin: SupabaseClient, workspaceId: string, customerId: string, id: string, version: number) {
  const row = await loadRow(admin, workspaceId, customerId, id);
  return row?.history.find((v) => v.version === version) ?? null;
}

// ─── Saving (Vera) ───────────────────────────────────────────────────────────

export type SaveResult = { ok: true; doc: LiveDoc } | { ok: false; error: string; steps?: { step: number; title: string; error: string }[] };

type SaveContext = { admin: SupabaseClient; workspaceId: string; chatId: string; userId: string; conns: DocConnections };

/** Write a new document, or a new version of one (the old version goes to history). */
async function write(ctx: SaveContext, kind: DocKind, documentId: string | undefined, input: { title: string; summary: string; content: PlanContent | ReportContent }): Promise<DocRow> {
  const { admin, workspaceId, chatId, userId, conns } = ctx;
  const customerId = conns.ads.account_id!;
  const now = new Date().toISOString();
  if (!documentId) {
    const { data, error } = await admin
      .from("google_ads_documents")
      .insert({ workspace_id: workspaceId, customer_id: customerId, kind, title: input.title, summary: input.summary, content: input.content, chat_id: chatId, created_by: userId })
      .select(ALL_COLUMNS)
      .single();
    if (error || !data) throw new ConnectionHttpError(500, "save_failed", error?.message);
    return data as unknown as DocRow;
  }
  const current = await loadRow(admin, workspaceId, customerId, documentId);
  if (!current || current.kind !== kind) throw new DocInputError(`No ${kind} with id ${documentId} on this account. Leave documentId out to write a new one.`);
  const history = [{ version: current.version, at: current.updated_at, title: current.title, summary: current.summary, content: current.content }, ...(current.history ?? [])].slice(0, DOC_LIMITS.history);
  const { data, error } = await admin
    .from("google_ads_documents")
    .update({ title: input.title, summary: input.summary, content: input.content, version: current.version + 1, history, archived_at: null, updated_at: now })
    .eq("id", current.id)
    .eq("version", current.version)
    .select(ALL_COLUMNS)
    .maybeSingle();
  if (error) throw new ConnectionHttpError(500, "save_failed", error.message);
  if (!data) throw new DocInputError("The document changed while you were writing it. Read it again and send the whole revision.");
  return data as unknown as DocRow;
}

/**
 * Save a plan. Google checks every step first; a plan with a step Google
 * refuses is not saved (the agent fixes the step and sends it again). A plan
 * whose steps were already applied is not rewritten: that is a new plan.
 */
export async function savePlan(ctx: SaveContext, documentId: string | undefined, input: PlanInput): Promise<SaveResult> {
  if (input.content.steps.some((s) => s.target === "merchant") && !ctx.conns.merchant)
    return { ok: false, error: "Merchant Center is not connected, so a plan cannot include Merchant Center steps." };
  if (documentId) {
    const changes = await changesFor(ctx.admin, ctx.workspaceId, [documentId]);
    if (changes.length) return { ok: false, error: "Steps of this plan were already applied, so it cannot be rewritten. Write a new plan (leave documentId out) for what is left." };
  }
  const checks = (await checkAll(ctx.admin, ctx.conns, input.content.steps)).map((c): StepCheck =>
    c.ok && changesNothing(c.items) ? { ok: false, error: "This step changes nothing: every value is already what it would set. Leave it out." } : c
  );
  const refused = checks.flatMap((c, i) => (c.ok ? [] : [{ step: i + 1, title: input.content.steps[i]!.title, error: c.error }]));
  if (refused.length) return { ok: false, error: `Google refused ${refused.length} of the steps, so the plan was not saved. Fix those steps (or leave them out) and save it again.`, steps: refused };
  const steps: PlanStep[] = input.content.steps.map((s, i) => {
    const check = checks[i] as Extract<StepCheck, { ok: true }>;
    return { ...s, preview: check.items, warnings: check.warnings };
  });
  const row = await write(ctx, "plan", documentId, { title: input.title, summary: input.summary, content: { ...input.content, steps } });
  return { ok: true, doc: toDoc(row, []) };
}

export async function saveReport(ctx: SaveContext, documentId: string | undefined, input: ReportInput): Promise<SaveResult> {
  const row = await write(ctx, "report", documentId, input);
  return { ok: true, doc: toDoc(row, []) };
}

// ─── Applying from the page ──────────────────────────────────────────────────

export type StepOutcome = { ok: true; doc: LiveDoc } | { ok: false; error: string; doc: LiveDoc };

/** Apply one step of a plan. Repeating the same attempt returns its first result. */
export async function applyStep(admin: SupabaseClient, conns: DocConnections, userId: string, docId: string, stepId: string): Promise<StepOutcome | null> {
  const workspaceId = conns.ads.workspace_id;
  const customerId = conns.ads.account_id!;
  const row = await loadRow(admin, workspaceId, customerId, docId);
  if (!row || row.kind !== "plan") return null;
  if (row.archived_at) throw new ConnectionHttpError(409, "archived");
  const step = (row.content as PlanContent).steps.find((s) => s.id === stepId);
  if (!step) return null;
  const before = toDoc(row, await changesFor(admin, workspaceId, [docId]));
  const state = before.stepStates?.[stepId];
  if (!canApply(state)) return { ok: false, error: state?.status === "applying" ? "This step is being applied." : "This step is already applied.", doc: before };

  const clientChangeId = stepChangeId(docId, stepId, (state?.attempts ?? 0) + 1);
  const title = `${row.title}: ${step.title}`.slice(0, 300);
  let error: string | null = null;
  if (step.target === "merchant") {
    if (!conns.merchant) error = "Merchant Center is not connected.";
    else {
      const result = await applyMerchantChange({ admin, row: conns.merchant, userId, input: { clientChangeId, title, source: "AGENT", ops: step.ops as MerchantOp[] } });
      if (result.status === "failed") error = result.error;
    }
  } else {
    const result = await applyLiveChange({ admin, row: conns.ads, userId, input: { clientChangeId, title, source: "AGENT", ops: step.ops as MutateOp[] } });
    if (result.status === "failed") error = result.error;
  }
  await touch(admin, docId);
  const doc = toDoc(row, await changesFor(admin, workspaceId, [docId]));
  return error ? { ok: false, error, doc } : { ok: true, doc };
}

/** Undo an applied step from the inverse the server stored when it was applied. */
export async function undoStep(admin: SupabaseClient, conns: DocConnections, userId: string, docId: string, stepId: string): Promise<StepOutcome | null> {
  const workspaceId = conns.ads.workspace_id;
  const row = await loadRow(admin, workspaceId, conns.ads.account_id!, docId);
  if (!row || row.kind !== "plan") return null;
  const step = (row.content as PlanContent).steps.find((s) => s.id === stepId);
  if (!step) return null;
  const before = toDoc(row, await changesFor(admin, workspaceId, [docId]));
  const state = before.stepStates?.[stepId];
  if (state?.status !== "applied" || !state.changeId) return { ok: false, error: "Only an applied step can be undone.", doc: before };
  if (!state.undoable) return { ok: false, error: "This step cannot be undone automatically.", doc: before };

  const clientChangeId = `undo:${state.changeId}`;
  let error: string | null = null;
  try {
    const result =
      step.target === "merchant"
        ? conns.merchant
          ? await applyMerchantChange({ admin, row: conns.merchant, userId, input: { clientChangeId, undoOf: state.changeId } })
          : null
        : await applyLiveChange({ admin, row: conns.ads, userId, input: { clientChangeId, undoOf: state.changeId } });
    if (!result) error = "Merchant Center is not connected.";
    else if (result.status === "failed") error = result.error;
  } catch (err) {
    if (err instanceof ConnectionHttpError && err.message === "cannot_undo") error = "This step was already undone.";
    else throw err;
  }
  await touch(admin, docId);
  const doc = toDoc(row, await changesFor(admin, workspaceId, [docId]));
  return error ? { ok: false, error, doc } : { ok: true, doc };
}

/** Check the steps still to apply against the account as it is now (nothing changes). */
export async function checkSteps(admin: SupabaseClient, conns: DocConnections, docId: string, stepIds: string[]) {
  const row = await loadRow(admin, conns.ads.workspace_id, conns.ads.account_id!, docId);
  if (!row || row.kind !== "plan") return null;
  const steps = (row.content as PlanContent).steps.filter((s) => stepIds.includes(s.id));
  const checks = await checkAll(admin, conns, steps);
  return steps.map((s, i) => ({ stepId: s.id, ...checks[i]! }));
}

export async function setArchived(admin: SupabaseClient, workspaceId: string, customerId: string, docId: string, archived: boolean): Promise<LiveDoc | null> {
  const { data, error } = await admin
    .from("google_ads_documents")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", docId)
    .eq("workspace_id", workspaceId)
    .eq("customer_id", customerId)
    .select("id");
  if (error) throw new ConnectionHttpError(500, "save_failed");
  if (!data?.length) return null;
  return getDoc(admin, workspaceId, customerId, docId);
}

async function touch(admin: SupabaseClient, docId: string) {
  await admin.from("google_ads_documents").update({ updated_at: new Date().toISOString() }).eq("id", docId);
}
