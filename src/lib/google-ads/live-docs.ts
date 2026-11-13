// Plans and reports Vera writes for a live Google Ads account. A plan is a
// list of concrete steps, each one change (Google Ads or Merchant Center) that
// Google already checked when it was saved; the owner applies them from the
// page. A report is a verdict, numbers, findings and sections. Pure: shared by
// the platform routes, the page and the tests.

import type { ApprovalPreview } from "@/lib/store-agent/protocol";
import { reportHtmlProblem } from "./report-sandbox";

export type DocKind = "plan" | "report";
export type StepTarget = "ads" | "merchant";
export type StepRisk = "low" | "medium" | "high";
export type PreviewItem = ApprovalPreview["items"][number];

export type PlanStep = {
  id: string;
  title: string;
  /** Why, with the numbers behind it. */
  why: string;
  target: StepTarget;
  /** The edits, in the same formats as ads_change / merchant_change. */
  ops: Record<string, unknown>[];
  risk: StepRisk;
  /** What should happen after it, e.g. "≈ +12 conversions a month". */
  expected: string;
  /** Before → after, as Google checked it when the plan was saved. */
  preview: PreviewItem[];
  warnings: string[];
};

export type PlanContent = {
  /** Markdown: the goal, the situation and the approach. */
  overview: string;
  steps: PlanStep[];
  /** Markdown: expected effect, risks, what to watch after. */
  notes: string;
  /** e.g. "Last 30 days (Oct 5 – Nov 3, 2026)": the numbers the plan rests on. */
  period: string;
};

export type ValueFormat = "money" | "number" | "percent" | "ratio";

export type ReportBlock =
  | { kind: "text"; md: string }
  | { kind: "callout"; tone: "info" | "good" | "warn" | "bad"; title: string; text: string }
  | { kind: "table"; columns: string[]; rows: (string | number)[][]; align?: ("left" | "right")[] }
  | { kind: "chart"; title: string; variant: "bar" | "line" | "donut"; format: ValueFormat; data: { label: string; value: number }[] }
  | { kind: "score"; score: number; label: string; parts: { label: string; score: number }[] }
  /** Any page the agent writes (layouts, charts, JavaScript), shown in a sandboxed frame that can't reach anything. */
  | { kind: "html"; title: string; html: string };

export type ReportKpi = { label: string; value: string; delta?: number; hint?: string; higherIsBetter?: boolean };

export type ReportFinding = {
  id: string;
  title: string;
  severity: "high" | "medium" | "low";
  /** Money or results at stake, e.g. "$1,240 a month". */
  impact: string;
  evidence: string;
  fix: string;
};

export type ReportContent = {
  period: string;
  /** Three short lines: health, the biggest problem, the first fix. */
  verdict: string[];
  kpis: ReportKpi[];
  findings: ReportFinding[];
  sections: { id: string; title: string; blocks: ReportBlock[] }[];
};

export type StepStatus = "todo" | "applying" | "applied" | "failed" | "undone";

export type StepState = {
  status: StepStatus;
  /** google_ads_changes row of the latest attempt. */
  changeId?: string;
  error?: string;
  at?: string;
  undoable?: boolean;
  attempts: number;
};

export type DocStatus = "draft" | "in_progress" | "applied" | "undone" | "ready" | "archived";

export type DocVersion = { version: number; at: string; title: string; summary: string; content: PlanContent | ReportContent };

export type LiveDocSummary = {
  id: string;
  kind: DocKind;
  title: string;
  summary: string;
  status: DocStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  chatId: string | null;
  /** Plans: steps and how many are applied. */
  steps?: { total: number; applied: number; failed: number };
};

export type LiveDoc = LiveDocSummary & {
  content: PlanContent | ReportContent;
  /** Plans: the state of each step, by step id. */
  stepStates?: Record<string, StepState>;
  history: Omit<DocVersion, "content">[];
};

export class DocInputError extends Error {}

export const DOC_LIMITS = { steps: 20, opsPerStep: 50, findings: 30, sections: 20, blocksPerSection: 20, kpis: 8, tableRows: 200, tableColumns: 12, chartPoints: 60, history: 10, htmlTotal: 600_000 } as const;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = <T>(v: unknown, max: number): T[] => (Array.isArray(v) ? (v.slice(0, max) as T[]) : []);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);

/** A plan as the agent sends it: steps without previews (the platform adds them after Google checks each one). */
export type PlanInput = { title: string; summary: string; content: Omit<PlanContent, "steps"> & { steps: Omit<PlanStep, "preview" | "warnings">[] } };

export function parsePlanInput(raw: Record<string, unknown>): PlanInput {
  const title = str(raw.title, 200);
  if (!title) throw new DocInputError("Give the plan a title.");
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
  if (!rawSteps.length) throw new DocInputError("A plan needs at least one step.");
  if (rawSteps.length > DOC_LIMITS.steps) throw new DocInputError(`At most ${DOC_LIMITS.steps} steps in one plan; split it into two plans.`);
  const steps = rawSteps.map((s, i) => {
    const step = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const ops = Array.isArray(step.edits) ? step.edits : Array.isArray(step.ops) ? step.ops : [];
    const stepTitle = str(step.title, 200);
    if (!stepTitle) throw new DocInputError(`Step ${i + 1} has no title.`);
    if (!ops.length) throw new DocInputError(`Step ${i + 1} ("${stepTitle}") has no edits. Every step must be a change the owner can apply; put advice in the overview or notes.`);
    if (ops.length > DOC_LIMITS.opsPerStep) throw new DocInputError(`Step ${i + 1} has more than ${DOC_LIMITS.opsPerStep} edits; split it.`);
    if (!ops.every((o) => o && typeof o === "object" && typeof (o as { kind?: unknown }).kind === "string")) throw new DocInputError(`Step ${i + 1} has an edit without a kind.`);
    const target = oneOf(step.target, ["ads", "merchant"] as const, "ads");
    if (target === "merchant" && !ops.every((o) => (o as { kind?: unknown }).kind === "product.update")) throw new DocInputError(`Step ${i + 1}: a Merchant Center step can only update products.`);
    return {
      id: `s${i + 1}`,
      title: stepTitle,
      why: str(step.why ?? step.reason, 1500),
      target,
      ops: ops as Record<string, unknown>[],
      risk: oneOf(step.risk, ["low", "medium", "high"] as const, "low"),
      expected: str(step.expected, 300),
    };
  });
  return {
    title,
    summary: str(raw.summary, 1000),
    content: { overview: str(raw.overview, 20_000), steps, notes: str(raw.notes, 20_000), period: str(raw.period, 120) },
  };
}

const BLOCK_KINDS = "text, callout, table, chart, score or html";

/**
 * One block. A block that can't be shown is an error the agent sees and fixes,
 * never dropped in silence (the owner would read a report with a hole in it).
 */
function parseBlock(raw: unknown, where: string): ReportBlock {
  const bad = (why: string): never => {
    throw new DocInputError(`${where}: ${why}`);
  };
  if (!raw || typeof raw !== "object") return bad(`a block must be an object with a "kind" (${BLOCK_KINDS}).`);
  const b = raw as Record<string, unknown>;
  switch (b.kind) {
    case "text": {
      const md = str(b.md ?? b.text, 20_000);
      return md ? { kind: "text", md } : bad("the text block is empty (give md).");
    }
    case "html": {
      const html = typeof b.html === "string" ? b.html : "";
      const problem = reportHtmlProblem(html);
      if (problem) bad(`the html block ${problem}.`);
      return { kind: "html", title: str(b.title, 200), html };
    }
    case "callout":
      return { kind: "callout", tone: oneOf(b.tone, ["info", "good", "warn", "bad"] as const, "info"), title: str(b.title, 200), text: str(b.text, 2000) };
    case "table": {
      const columns = list<unknown>(b.columns, DOC_LIMITS.tableColumns).map((c) => str(String(c ?? ""), 80));
      if (!columns.length) bad("the table has no columns.");
      const rows = list<unknown>(b.rows, DOC_LIMITS.tableRows)
        .filter(Array.isArray)
        .map((r) => (r as unknown[]).slice(0, columns.length).map((c) => (typeof c === "number" && Number.isFinite(c) ? c : str(String(c ?? ""), 300))));
      const align = Array.isArray(b.align) ? b.align.slice(0, columns.length).map((a) => (a === "right" ? "right" : "left")) : undefined;
      return { kind: "table", columns, rows, ...(align ? { align: align as ("left" | "right")[] } : {}) };
    }
    case "chart": {
      const data = list<Record<string, unknown>>(b.data, DOC_LIMITS.chartPoints)
        .filter((d) => d && typeof d === "object" && Number.isFinite(Number(d.value)))
        .map((d) => ({ label: str(String(d.label ?? ""), 60), value: Number(d.value) }));
      if (!data.length) bad("the chart has no data points with a number value.");
      return { kind: "chart", title: str(b.title, 200), variant: oneOf(b.variant, ["bar", "line", "donut"] as const, "bar"), format: oneOf(b.format, ["money", "number", "percent", "ratio"] as const, "number"), data };
    }
    case "score": {
      const score = Math.max(0, Math.min(100, Math.round(Number(b.score) || 0)));
      const parts = list<Record<string, unknown>>(b.parts, 10)
        .filter((p) => p && typeof p === "object")
        .map((p) => ({ label: str(p.label, 80), score: Math.max(0, Math.min(100, Math.round(Number(p.score) || 0))) }));
      return { kind: "score", score, label: str(b.label, 120), parts };
    }
    default:
      return bad(`unknown block kind "${String(b.kind)}". Use ${BLOCK_KINDS}.`);
  }
}

export type ReportInput = { title: string; summary: string; content: ReportContent };

export function parseReportInput(raw: Record<string, unknown>): ReportInput {
  const title = str(raw.title, 200);
  if (!title) throw new DocInputError("Give the report a title.");
  const verdict = list<unknown>(raw.verdict, 3).map((v) => str(v, 400)).filter(Boolean);
  if (!verdict.length) throw new DocInputError("Start the report with a verdict: up to three short lines (health, the biggest problem, the first fix).");
  const kpis = list<Record<string, unknown>>(raw.kpis, DOC_LIMITS.kpis)
    .filter((k) => k && typeof k === "object" && str(k.label, 60))
    .map((k) => ({
      label: str(k.label, 60),
      value: str(String(k.value ?? ""), 40),
      ...(Number.isFinite(Number(k.delta)) && k.delta !== null && k.delta !== undefined && k.delta !== "" ? { delta: Number(k.delta) } : {}),
      ...(str(k.hint, 160) ? { hint: str(k.hint, 160) } : {}),
      ...(typeof k.higherIsBetter === "boolean" ? { higherIsBetter: k.higherIsBetter } : {}),
    }));
  const findings = list<Record<string, unknown>>(raw.findings, DOC_LIMITS.findings)
    .filter((f) => f && typeof f === "object" && str(f.title, 200))
    .map((f, i) => ({
      id: `f${i + 1}`,
      title: str(f.title, 200),
      severity: oneOf(f.severity, ["high", "medium", "low"] as const, "medium"),
      impact: str(f.impact, 200),
      evidence: str(f.evidence, 3000),
      fix: str(f.fix, 2000),
    }));
  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const sections = list<Record<string, unknown>>(raw.sections, DOC_LIMITS.sections)
    .filter((s) => s && typeof s === "object")
    .map((s, i) => {
      const title = str(s.title, 200);
      const where = `Section ${i + 1}${title ? ` ("${title}")` : ""}`;
      if (!title) throw new DocInputError(`${where}: give the section a title.`);
      const blocks = list<unknown>(s.blocks, DOC_LIMITS.blocksPerSection).map((b, j) => parseBlock(b, `${where}, block ${j + 1}`));
      if (!blocks.length) throw new DocInputError(`${where}: the section has no blocks.`);
      return { id: `sec${i + 1}`, title, blocks };
    });
  const htmlSize = sections.flatMap((s) => s.blocks).reduce((n, b) => n + (b.kind === "html" ? b.html.length : 0), 0);
  if (htmlSize > DOC_LIMITS.htmlTotal) throw new DocInputError(`The report's html blocks add up to more than ${DOC_LIMITS.htmlTotal.toLocaleString("en")} characters; keep data in tables and the pages short.`);
  return { title, summary: str(raw.summary, 1000), content: { period: str(raw.period, 120), verdict, kpis, findings, sections } };
}

/** Every value shown before → after is already the same (e.g. pausing what is paused): not a step. */
export function changesNothing(items: PreviewItem[]): boolean {
  const changes = items.flatMap((i) => i.changes);
  return changes.length > 0 && changes.every((c) => c.before !== undefined && c.after !== undefined && c.before === c.after);
}

// ─── Step state ──────────────────────────────────────────────────────────────

/** Each attempt to apply a step is its own change, so a failed step can be tried again. */
export const stepChangeId = (docId: string, stepId: string, attempt: number) => `doc:${docId}:${stepId}:${attempt}`;
export const docChangePrefix = (docId: string) => `doc:${docId}:`;

export type StepChangeRow = { id: string; client_change_id: string; status: string; error: string | null; undone_at: string | null; created_at: string; undoable: boolean };

/** The state of every step from its changes: the latest attempt decides. */
export function stepStates(docId: string, steps: Pick<PlanStep, "id">[], changes: StepChangeRow[]): Record<string, StepState> {
  const prefix = docChangePrefix(docId);
  const latest = new Map<string, { attempt: number; row: StepChangeRow }>();
  for (const row of changes) {
    if (!row.client_change_id.startsWith(prefix)) continue;
    const [stepId, attemptText] = row.client_change_id.slice(prefix.length).split(":");
    const attempt = Number(attemptText);
    if (!stepId || !Number.isInteger(attempt)) continue;
    const seen = latest.get(stepId);
    if (!seen || attempt > seen.attempt) latest.set(stepId, { attempt, row });
  }
  const out: Record<string, StepState> = {};
  for (const step of steps) {
    const found = latest.get(step.id);
    if (!found) {
      out[step.id] = { status: "todo", attempts: 0 };
      continue;
    }
    const { row, attempt } = found;
    const status: StepStatus = row.status === "applied" ? (row.undone_at ? "undone" : "applied") : row.status === "failed" ? "failed" : "applying";
    out[step.id] = {
      status,
      changeId: row.id,
      attempts: attempt,
      at: row.undone_at ?? row.created_at,
      ...(row.error && status === "failed" ? { error: row.error } : {}),
      ...(status === "applied" ? { undoable: row.undoable } : {}),
    };
  }
  return out;
}

export function planStatus(steps: Pick<PlanStep, "id">[], states: Record<string, StepState>): Exclude<DocStatus, "ready" | "archived"> {
  const all = steps.map((s) => states[s.id]?.status ?? "todo");
  if (all.every((s) => s === "todo")) return "draft";
  if (all.every((s) => s === "applied")) return "applied";
  if (all.every((s) => s === "undone" || s === "todo") && all.some((s) => s === "undone")) return "undone";
  return "in_progress";
}

export function stepCounts(steps: Pick<PlanStep, "id">[], states: Record<string, StepState>) {
  const all = steps.map((s) => states[s.id]?.status ?? "todo");
  return { total: all.length, applied: all.filter((s) => s === "applied").length, failed: all.filter((s) => s === "failed").length };
}

/** A step can be applied when it was never applied, failed, or was undone. */
export const canApply = (state: StepState | undefined) => !state || state.status === "todo" || state.status === "failed" || state.status === "undone";

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  draft: "Ready to review",
  in_progress: "In progress",
  applied: "Applied",
  undone: "Undone",
  ready: "Ready",
  archived: "Archived",
};
