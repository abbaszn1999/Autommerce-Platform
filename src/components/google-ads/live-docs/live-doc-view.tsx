"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { downloadExcel, openPrintable } from "./report-download";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardList,
  FileBarChart,
  History,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  Play,
  Printer,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Undo2,
  XCircle,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/store-agent/markdown";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import { canApply, DOC_STATUS_LABEL, type LiveDoc, type PlanContent, type PlanStep, type PreviewItem, type ReportContent, type StepState } from "@/lib/google-ads/live-docs";
import {
  checkDocSteps,
  closeDoc,
  loadDoc,
  loadDocVersion,
  runDocStep,
  setDocArchived,
  useLiveDocs,
  type StepCheckResult,
} from "@/lib/google-ads/live-docs-store";
import { useAccountData, useGoogleAds } from "@/lib/google-ads/store";
import { Delta } from "../ga-ui";
import { DocSkeleton } from "../ga-skeleton";
import { Inline, ReportBlockView } from "./report-blocks";

export function ago(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const STATUS_TONE: Record<LiveDoc["status"], string> = {
  draft: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  in_progress: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  applied: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  undone: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
  ready: "bg-[#400095]/10 text-[#400095] dark:bg-violet-500/15 dark:text-violet-300",
  archived: "bg-muted text-muted-foreground",
};

export function StatusChip({ status }: { status: LiveDoc["status"] }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold", STATUS_TONE[status])}>{DOC_STATUS_LABEL[status]}</span>;
}

/** A plan or report, open inside the Documents page. */
export function LiveDocView({ docId }: { docId: string }) {
  const doc = useLiveDocs((s) => s.docs[docId]);
  const [failed, setFailed] = useState(false);
  const [viewing, setViewing] = useState<{ version: number; at: string; content: LiveDoc["content"]; title: string; summary: string } | null>(null);

  useEffect(() => {
    // Fresh on focus: a step may have been applied from another tab or the agent revised it.
    const reload = () => void loadDoc(docId).catch(() => setFailed(true));
    reload();
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [docId]);

  if (!doc) {
    if (!failed) return <DocSkeleton />;
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-muted-foreground">
        This document could not be loaded.
        <button type="button" onClick={closeDoc} className="text-[12.5px] font-semibold text-[#400095] hover:underline dark:text-violet-300">
          Back to Documents
        </button>
      </div>
    );
  }
  const shown = viewing ? { ...doc, title: viewing.title, summary: viewing.summary, content: viewing.content } : doc;
  return (
    <div className="mx-auto max-w-[1100px] pb-10 print:max-w-none">
      <DocHeader doc={doc} viewing={viewing} onView={setViewing} />
      <div className="space-y-5 pt-5">
        {viewing && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[12.5px] print:hidden">
            <History className="h-4 w-4 text-amber-600" />
            You are reading version {viewing.version} from {ago(viewing.at)}. Nothing can be applied from an old version.
            <button type="button" onClick={() => setViewing(null)} className="ms-auto font-semibold text-[#400095] hover:underline dark:text-violet-300">
              Back to the latest
            </button>
          </div>
        )}
        {doc.kind === "plan" ? <PlanBody doc={shown} readOnly={!!viewing} /> : <ReportBody doc={shown} readOnly={!!viewing} />}
        {!viewing && doc.status !== "archived" && <AskVera doc={doc} />}
      </div>
    </div>
  );
}

function DocHeader({ doc, viewing, onView }: { doc: LiveDoc; viewing: unknown; onView: (v: { version: number; at: string; content: LiveDoc["content"]; title: string; summary: string } | null) => void }) {
  const account = useAccountData()?.account;
  // Exports are of the version on screen.
  const shownVersion = viewing as { content: LiveDoc["content"]; title: string; summary: string } | null;
  const exportable = { kind: doc.kind, title: shownVersion?.title ?? doc.title, summary: shownVersion?.summary ?? doc.summary, content: shownVersion?.content ?? doc.content };
  const exportOptions = { currency: account?.currency ?? "", accountName: account?.name ?? "" };
  const canEdit = useLiveDocs((s) => s.canApply);
  const isPlan = doc.kind === "plan";
  const Icon = isPlan ? ClipboardList : FileBarChart;
  const period = (doc.content as PlanContent | ReportContent).period;
  return (
    <div className="print:border-0">
      <div className="mb-3 flex items-center gap-2 text-[12px] text-muted-foreground print:hidden">
        <button
          type="button"
          onClick={closeDoc}
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-border/70 bg-card px-2 font-semibold text-foreground shadow-sm hover:bg-muted"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <button type="button" onClick={closeDoc} className="hover:text-foreground hover:underline">
          Documents
        </button>
        <ChevronRight className="h-3 w-3" />
        <button type="button" onClick={closeDoc} className="hover:text-foreground hover:underline">
          {isPlan ? "Plans" : "Reports"}
        </button>
        <ChevronRight className="h-3 w-3" />
        <span dir="auto" className="max-w-80 truncate text-foreground">
          {doc.title}
        </span>
      </div>
      <div className="flex items-start gap-3.5 rounded-2xl border border-border/60 bg-card p-4 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#400095]/10 to-[#F76D01]/15 text-[#400095] dark:text-violet-300">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#400095] dark:text-violet-300">{isPlan ? "Plan" : "Report"}</p>
          <h1 dir="auto" className="text-xl font-bold leading-snug">
            {doc.title}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
            <StatusChip status={doc.status} />
            <span>Version {doc.version}</span>
            <span>·</span>
            <span>Updated {ago(doc.updatedAt)}</span>
            {period && (
              <>
                <span>·</span>
                <span dir="auto">{period}</span>
              </>
            )}
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Written by Vera
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 print:hidden">
          {doc.history.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 text-xs hover:bg-muted">
                <History className="h-3.5 w-3.5" /> Versions <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Version history</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => onView(null)} className="flex-col items-start gap-0 text-xs">
                  <span className="font-semibold">Version {doc.version} · latest{!viewing ? " (open)" : ""}</span>
                  <span className="text-[10.5px] text-muted-foreground">{ago(doc.updatedAt)}</span>
                </DropdownMenuItem>
                {doc.history.map((v) => (
                  <DropdownMenuItem
                    key={v.version}
                    onSelect={() =>
                      void loadDocVersion(doc.id, v.version)
                        .then((full) => full && onView({ version: full.version, at: full.at, content: full.content, title: full.title, summary: full.summary }))
                        .catch(() => toast.error("Could not load that version"))
                    }
                    className="flex-col items-start gap-0 text-xs"
                  >
                    <span className="font-semibold">Version {v.version}</span>
                    <span dir="auto" className="w-full truncate text-[10.5px] text-muted-foreground">
                      {ago(v.at)} · {v.title}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 hover:bg-muted" aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => openPrintable(exportable, exportOptions)} className="gap-2 text-xs">
                <Printer className="h-3.5 w-3.5" /> Save as PDF or print
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void downloadExcel(exportable, exportOptions).catch(() => toast.error("The Excel file couldn't be made. Try again."))}
                className="gap-2 text-xs"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> Download Excel
              </DropdownMenuItem>
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() =>
                      void setDocArchived(doc.id, doc.status !== "archived")
                        .then(() => toast.success(doc.status === "archived" ? "Restored" : "Archived"))
                        .catch((e: Error) => toast.error(e.message))
                    }
                    className="gap-2 text-xs"
                  >
                    {doc.status === "archived" ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    {doc.status === "archived" ? "Restore" : "Archive"}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, aside, children }: { title: string; icon?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm print:break-inside-avoid print:shadow-none">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {aside && <div className="ms-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

// ─── Plans ───────────────────────────────────────────────────────────────────

const RISK_TONE = {
  low: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  high: "bg-red-500/10 text-red-700 dark:text-red-300",
};

function PlanBody({ doc, readOnly }: { doc: LiveDoc; readOnly: boolean }) {
  const content = doc.content as PlanContent;
  const role = useLiveDocs((s) => s.canApply);
  const canEdit = role && !readOnly && doc.status !== "archived";
  const busy = useLiveDocs((s) => s.busy);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const states = readOnly ? {} : (doc.stepStates ?? {});
  const applied = content.steps.filter((s) => states[s.id]?.status === "applied");
  const remaining = content.steps.filter((s) => canApply(states[s.id]));
  const failed = content.steps.filter((s) => states[s.id]?.status === "failed").length;
  const pct = content.steps.length ? (applied.length / content.steps.length) * 100 : 0;
  const anyBusy = Object.keys(busy).some((k) => k.startsWith(`${doc.id}:`));

  return (
    <>
      {doc.summary && (
        <p dir="auto" className="text-[14px] leading-relaxed text-foreground/90">
          {doc.summary}
        </p>
      )}

      {!readOnly && (
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm print:hidden">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-48 flex-1">
              <p className="text-[13px] font-semibold">
                {applied.length} of {content.steps.length} step{content.steps.length > 1 ? "s" : ""} applied
                {failed > 0 && <span className="text-red-600"> · {failed} failed</span>}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-gradient-to-r from-[#400095] to-[#6B358D] transition-all dark:from-violet-500 dark:to-violet-400" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Google checked every step. Nothing changes until you apply it, and every applied step can be undone.
              </p>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2">
                {applied.some((s) => states[s.id]?.undoable) && (
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => setUndoOpen(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/70 px-3 text-[12.5px] font-semibold hover:bg-muted disabled:opacity-50"
                  >
                    <Undo2 className="h-4 w-4" /> Undo applied
                  </button>
                )}
                {remaining.length > 0 && (
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => setReviewOpen(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#400095] px-4 text-[12.5px] font-semibold text-white shadow-sm hover:bg-[#33007a] disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                  >
                    <Play className="h-4 w-4" /> Review & apply {remaining.length > 1 ? `${remaining.length} steps` : "step"}
                  </button>
                )}
              </div>
            )}
          </div>
          {!role && (
            <p className="mt-3 text-[11.5px] text-muted-foreground">Only the workspace owner or an admin can apply the steps.</p>
          )}
        </div>
      )}

      {content.overview && (
        <Section title="Overview">
          <Markdown text={content.overview} />
        </Section>
      )}

      <Section title={`Steps (${content.steps.length})`}>
        <ol className="space-y-3">
          {content.steps.map((step, i) => (
            <StepCard key={step.id} doc={doc} step={step} index={i} state={states[step.id]} canEdit={canEdit} busy={busy[`${doc.id}:${step.id}`]} />
          ))}
        </ol>
      </Section>

      {content.notes && (
        <Section title="Expected effect & risks">
          <Markdown text={content.notes} />
        </Section>
      )}

      {reviewOpen && <ReviewDialog doc={doc} steps={remaining} onClose={() => setReviewOpen(false)} />}
      {undoOpen && <UndoDialog doc={doc} steps={applied.filter((s) => states[s.id]?.undoable)} onClose={() => setUndoOpen(false)} />}
    </>
  );
}

function StepStatusIcon({ state, busy, index }: { state?: StepState; busy?: "apply" | "undo"; index: number }) {
  if (busy) return <Loader2 className="h-5 w-5 animate-spin text-[#400095] dark:text-violet-300" />;
  if (state?.status === "applied") return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (state?.status === "failed") return <XCircle className="h-5 w-5 text-red-600" />;
  if (state?.status === "undone") return <RotateCcw className="h-5 w-5 text-muted-foreground" />;
  if (state?.status === "applying") return <Loader2 className="h-5 w-5 animate-spin text-amber-600" />;
  return <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#400095]/30 text-[10px] font-bold text-[#400095] dark:border-violet-400/40 dark:text-violet-300">{index + 1}</span>;
}

function StepCard({ doc, step, index, state, canEdit, busy }: { doc: LiveDoc; step: PlanStep; index: number; state?: StepState; canEdit: boolean; busy?: "apply" | "undo" }) {
  const [open, setOpen] = useState(index === 0 && !state?.status);
  const run = async (action: "apply" | "undo") => {
    const res = await runDocStep(doc.id, step.id, action);
    if (res.ok) toast.success(action === "apply" ? "Applied in Google" : "Undone", { description: step.title });
    else toast.error(action === "apply" ? "Google did not apply this step" : "Could not undo", { description: res.error });
  };
  const status = state?.status ?? "todo";
  const changes = step.preview.reduce((n, item) => n + Math.max(1, item.changes.length), 0);
  return (
    <li className={cn("rounded-xl border bg-background transition-colors print:break-inside-avoid", status === "applied" ? "border-emerald-500/30" : status === "failed" ? "border-red-500/30" : "border-border/70")}>
      <div className="flex items-start gap-3 p-3.5">
        <span className="mt-0.5 shrink-0">
          <StepStatusIcon state={state} busy={busy} index={index} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p dir="auto" className={cn("text-[13.5px] font-semibold", status === "undone" && "text-muted-foreground line-through")}>
              {step.title}
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground">{step.target === "merchant" ? "Merchant Center" : "Google Ads"}</span>
            <span className={cn("rounded-md px-1.5 py-0.5 font-semibold", RISK_TONE[step.risk])}>{step.risk} risk</span>
            {step.expected && (
              <span dir="auto" className="rounded-md bg-[#400095]/[0.07] px-1.5 py-0.5 font-medium text-[#400095] dark:bg-violet-500/10 dark:text-violet-300">
                {step.expected}
              </span>
            )}
          </div>
          {step.why && (
            <p dir="auto" className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
              <Inline text={step.why} />
            </p>
          )}
          {state?.status === "failed" && state.error && (
            <p dir="auto" className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-500/[0.07] px-2.5 py-1.5 text-[12px] text-red-700 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {state.error}
            </p>
          )}
          {step.warnings.length > 0 && status === "todo" && (
            <ul className="mt-2 space-y-1">
              {step.warnings.map((w, i) => (
                <li key={i} dir="auto" className="flex items-start gap-1.5 text-[11.5px] text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#400095] hover:underline dark:text-violet-300 print:hidden">
            <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
            {open ? "Hide" : "Show"} {changes} change{changes > 1 ? "s" : ""}
          </button>
          <div className={cn("mt-2", !open && "hidden print:block")}>
            <PreviewTable items={step.preview} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 print:hidden">
          {status === "applied" && <span className="text-[11px] font-semibold text-emerald-600">Applied {state?.at ? ago(state.at) : ""}</span>}
          {status === "undone" && <span className="text-[11px] font-semibold text-muted-foreground">Undone</span>}
          {canEdit && !busy && canApply(state) && (
            <button
              type="button"
              onClick={() => void run("apply")}
              className="inline-flex items-center gap-1 rounded-lg border border-[#400095]/30 px-2.5 py-1 text-[11.5px] font-semibold text-[#400095] hover:bg-[#400095]/[0.06] dark:border-violet-400/40 dark:text-violet-300"
            >
              {status === "failed" ? <RefreshCw className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {status === "failed" ? "Try again" : status === "undone" ? "Apply again" : "Apply"}
            </button>
          )}
          {canEdit && !busy && status === "applied" && state?.undoable && (
            <button type="button" onClick={() => void run("undo")} className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-2.5 py-1 text-[11.5px] font-semibold hover:bg-muted">
              <Undo2 className="h-3 w-3" /> Undo
            </button>
          )}
          {busy && <span className="text-[11px] font-semibold text-[#400095] dark:text-violet-300">{busy === "apply" ? "Applying…" : "Undoing…"}</span>}
        </div>
      </div>
    </li>
  );
}

function PreviewTable({ items }: { items: PreviewItem[] }) {
  if (!items.length) return <p className="text-[12px] text-muted-foreground">No details.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      {items.map((item, i) => (
        <div key={`${item.id}-${i}`} className="border-b border-border/50 px-3 py-2 last:border-b-0">
          <p dir="auto" className="text-[12px] font-semibold">
            {item.label}
          </p>
          {item.changes.map((c, j) => (
            <div key={j} className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px]">
              <span className="text-muted-foreground">{c.field}</span>
              {c.before !== undefined && (
                <span dir="auto" className="rounded bg-red-500/[0.07] px-1.5 py-0.5 text-red-700 line-through decoration-red-400/60 dark:text-red-300">
                  {c.before || "—"}
                </span>
              )}
              {c.before !== undefined && c.after !== undefined && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
              {c.after !== undefined && (
                <span dir="auto" className="rounded bg-emerald-500/[0.08] px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
                  {c.after || "—"}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

type RunRow = { step: PlanStep; check?: StepCheckResult; selected: boolean; result?: "running" | "applied" | "failed" | "skipped"; error?: string };

/** Check the steps against the account as it is now, choose, then apply them in order, one at a time. */
function ReviewDialog({ doc, steps, onClose }: { doc: LiveDoc; steps: PlanStep[]; onClose: () => void }) {
  const [rows, setRows] = useState<RunRow[]>(() => steps.map((step) => ({ step, selected: true })));
  const [phase, setPhase] = useState<"checking" | "ready" | "applying" | "done">("checking");
  const [stopped, setStopped] = useState<string | null>(null);
  // Checked once, for the steps the dialog opened with (the plan re-renders while steps apply).
  const [stepIds] = useState(() => steps.map((s) => s.id));
  const [closeOnError] = useState(() => onClose);

  useEffect(() => {
    let alive = true;
    checkDocSteps(doc.id, stepIds)
      .then((checks) => {
        if (!alive) return;
        setRows((rs) =>
          rs.map((r) => {
            const check = checks.find((c) => c.stepId === r.step.id);
            return { ...r, check, selected: !!check?.ok };
          })
        );
        setPhase("ready");
      })
      .catch((e: Error) => {
        if (!alive) return;
        toast.error("Google could not check the steps", { description: e.message });
        closeOnError();
      });
    return () => {
      alive = false;
    };
  }, [doc.id, stepIds, closeOnError]);

  const chosen = rows.filter((r) => r.selected && r.check?.ok);
  const apply = async () => {
    setPhase("applying");
    for (const row of chosen) {
      setRows((rs) => rs.map((r) => (r.step.id === row.step.id ? { ...r, result: "running" } : r)));
      const res = await runDocStep(doc.id, row.step.id, "apply");
      setRows((rs) => rs.map((r) => (r.step.id === row.step.id ? { ...r, result: res.ok ? "applied" : "failed", error: res.error } : r)));
      if (!res.ok) {
        // Later steps may build on this one: stop here.
        setStopped(row.step.title);
        setRows((rs) => rs.map((r) => (r.selected && r.check?.ok && !r.result ? { ...r, result: "skipped" } : r)));
        break;
      }
    }
    setPhase("done");
  };
  const appliedCount = rows.filter((r) => r.result === "applied").length;

  return (
    <Dialog open onOpenChange={(open) => !open && phase !== "applying" && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0">
        <div className="flex max-h-[85vh] flex-col">
          <DialogHeader className="border-b border-border/60 px-5 py-4">
            <DialogTitle className="text-base">Review & apply</DialogTitle>
            <DialogDescription className="text-[12.5px]">
              {phase === "checking"
                ? "Google is checking each step against your account as it is right now. Nothing changes yet."
                : phase === "done"
                  ? stopped
                    ? `Stopped at “${stopped}”. The steps after it were not applied.`
                    : `${appliedCount} step${appliedCount === 1 ? "" : "s"} applied in Google. Each one can be undone from the plan.`
                  : "These are the exact changes, checked by Google just now. They are applied in this order, one at a time."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
            {rows.map((r, i) => (
              <div key={r.step.id} className={cn("rounded-xl border p-3", r.check && !r.check.ok ? "border-red-500/30 bg-red-500/[0.03]" : "border-border/70")}>
                <div className="flex items-start gap-2.5">
                  {phase === "ready" ? (
                    <input
                      type="checkbox"
                      checked={r.selected}
                      disabled={!r.check?.ok}
                      onChange={(e) => setRows((rs) => rs.map((x) => (x.step.id === r.step.id ? { ...x, selected: e.target.checked } : x)))}
                      className="mt-0.5 h-4 w-4 accent-[#400095]"
                      aria-label={`Apply ${r.step.title}`}
                    />
                  ) : (
                    <span className="mt-0.5">
                      {phase === "checking" || r.result === "running" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[#400095] dark:text-violet-300" />
                      ) : r.result === "applied" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : r.result === "failed" || (r.check && !r.check.ok) ? (
                        <XCircle className="h-4 w-4 text-red-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/50" />
                      )}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="text-[13px] font-semibold">
                      {i + 1}. {r.step.title}
                    </p>
                    {r.check?.ok && phase !== "done" && (
                      <div className="mt-2">
                        <PreviewTable items={r.check.items} />
                      </div>
                    )}
                    {r.check && !r.check.ok && (
                      <p dir="auto" className="mt-1 text-[12px] text-red-700 dark:text-red-300">
                        Google would refuse it now: {r.check.error}
                      </p>
                    )}
                    {r.result === "failed" && r.error && (
                      <p dir="auto" className="mt-1 text-[12px] text-red-700 dark:text-red-300">
                        {r.error}
                      </p>
                    )}
                    {r.result === "skipped" && <p className="mt-1 text-[12px] text-muted-foreground">Not applied</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="border-t border-border/60 px-5 py-3">
            {phase === "done" ? (
              <button type="button" onClick={onClose} className="rounded-lg bg-[#400095] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#33007a] dark:bg-violet-600">
                Done
              </button>
            ) : (
              <>
                <button type="button" disabled={phase === "applying"} onClick={onClose} className="rounded-lg px-3 py-2 text-[12.5px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={phase !== "ready" || !chosen.length}
                  onClick={() => void apply()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#400095] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#33007a] disabled:opacity-50 dark:bg-violet-600"
                >
                  {phase === "applying" || phase === "checking" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {phase === "checking" ? "Checking with Google…" : phase === "applying" ? "Applying…" : `Apply ${chosen.length} step${chosen.length === 1 ? "" : "s"}`}
                </button>
              </>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Undo applied steps, last applied first. */
function UndoDialog({ doc, steps, onClose }: { doc: LiveDoc; steps: PlanStep[]; onClose: () => void }) {
  const [phase, setPhase] = useState<"confirm" | "running" | "done">("confirm");
  const [results, setResults] = useState<Record<string, "running" | "ok" | string>>({});
  const ordered = useMemo(() => [...steps].reverse(), [steps]);
  const run = async () => {
    setPhase("running");
    for (const s of ordered) {
      setResults((r) => ({ ...r, [s.id]: "running" }));
      const res = await runDocStep(doc.id, s.id, "undo");
      setResults((r) => ({ ...r, [s.id]: res.ok ? "ok" : (res.error ?? "Failed") }));
    }
    setPhase("done");
  };
  return (
    <Dialog open onOpenChange={(open) => !open && phase !== "running" && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Undo {steps.length} applied step{steps.length === 1 ? "" : "s"}?</DialogTitle>
          <DialogDescription>Each step goes back to the values it had before it was applied, last step first.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5">
          {ordered.map((s) => {
            const r = results[s.id];
            return (
              <li key={s.id} className="flex items-start gap-2 text-[12.5px]">
                {r === "running" ? <Loader2 className="mt-0.5 h-3.5 w-3.5 animate-spin" /> : r === "ok" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-600" /> : r ? <XCircle className="mt-0.5 h-3.5 w-3.5 text-red-600" /> : <Undo2 className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />}
                <span dir="auto">
                  {s.title}
                  {r && r !== "ok" && r !== "running" && <span className="block text-red-600">{r}</span>}
                </span>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          {phase === "done" ? (
            <button type="button" onClick={onClose} className="rounded-lg bg-[#400095] px-4 py-2 text-[12.5px] font-semibold text-white dark:bg-violet-600">
              Done
            </button>
          ) : (
            <>
              <button type="button" disabled={phase === "running"} onClick={onClose} className="rounded-lg px-3 py-2 text-[12.5px] font-semibold text-muted-foreground hover:bg-muted">
                Cancel
              </button>
              <button type="button" disabled={phase === "running"} onClick={() => void run()} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {phase === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Undo
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reports ─────────────────────────────────────────────────────────────────

const SEVERITY = {
  high: { label: "High", cls: "bg-red-500/10 text-red-700 dark:text-red-300", bar: "bg-red-500" },
  medium: { label: "Medium", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300", bar: "bg-amber-500" },
  low: { label: "Low", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300", bar: "bg-sky-500" },
};

const VERDICT_LABELS = ["Health", "Biggest problem", "First fix"];

function ReportBody({ doc, readOnly }: { doc: LiveDoc; readOnly: boolean }) {
  const content = doc.content as ReportContent;
  const currency = useAccountData()?.account.currency ?? "";
  const agentBusy = useGoogleAds((s) => s.agentBusy);
  const canAct = useLiveDocs((s) => s.canApply) && !readOnly && doc.status !== "archived";
  const planFix = (title: string) =>
    runAgentTurn(`From the report "${doc.title}" (documentId ${doc.id}): make a plan with save_plan to fix this finding: "${title}". Check the current numbers first.`);
  const high = content.findings.filter((f) => f.severity === "high");

  return (
    <>
      {doc.summary && (
        <p dir="auto" className="text-[14px] leading-relaxed text-foreground/90">
          {doc.summary}
        </p>
      )}

      {canAct && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            type="button"
            disabled={agentBusy}
            onClick={() => runAgentTurn(`Update the report "${doc.title}" (documentId ${doc.id}) with the latest numbers from the account. Keep its structure, and save it again with save_report and the same documentId.`)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 text-[12px] font-semibold hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh with the latest numbers
          </button>
          {high.length > 0 && (
            <button
              type="button"
              disabled={agentBusy}
              onClick={() =>
                runAgentTurn(
                  `From the report "${doc.title}" (documentId ${doc.id}): make one plan with save_plan that fixes its high-severity findings (${high.map((f) => `"${f.title}"`).join(", ")}). Check the current numbers first.`
                )
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#400095] px-3 text-[12px] font-semibold text-white hover:bg-[#33007a] disabled:opacity-50 dark:bg-violet-600"
            >
              <ClipboardList className="h-3.5 w-3.5" /> Plan fixes for the {high.length} high-priority finding{high.length > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-[#400095]/20 bg-gradient-to-br from-[#400095]/[0.06] via-card to-[#F76D01]/[0.05] p-5 shadow-sm print:break-inside-avoid">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#400095] dark:text-violet-300">Verdict</p>
        <div className="grid gap-3 md:grid-cols-3">
          {content.verdict.map((line, i) => (
            <div key={i} className="rounded-xl bg-background/70 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{VERDICT_LABELS[i] ?? ""}</p>
              <p dir="auto" className="mt-1 text-[13px] font-medium leading-snug">
                {/* The label is already shown above: drop a repeated "**Health:**" at the start. */}
                <Inline text={line.replace(/^\s*\*\*[^*]{1,40}:\*\*\s*/, "")} />
              </p>
            </div>
          ))}
        </div>
      </section>

      {content.kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {content.kpis.map((k, i) => (
            <div key={i} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm print:break-inside-avoid">
              <p dir="auto" className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                {k.label}
              </p>
              <p className="mt-1 text-xl font-black tabular-nums">{k.value}</p>
              {k.delta !== undefined && <Delta value={k.delta} higherIsBetter={k.higherIsBetter ?? true} />}
              {k.hint && (
                <p dir="auto" className="mt-1 text-[10.5px] text-muted-foreground">
                  {k.hint}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {content.findings.length > 0 && (
        <Section title={`Findings (${content.findings.length})`} icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}>
          <ul className="space-y-2.5">
            {content.findings.map((f) => (
              <Finding key={f.id} finding={f} onPlan={canAct ? () => planFix(f.title) : undefined} disabled={agentBusy} />
            ))}
          </ul>
        </Section>
      )}

      {content.sections.map((s) => (
        <Section key={s.id} title={s.title}>
          <div className="space-y-3">
            {s.blocks.map((b, i) => (
              <ReportBlockView key={i} block={b} currency={currency} />
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

function Finding({ finding, onPlan, disabled }: { finding: ReportContent["findings"][number]; onPlan?: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(finding.severity === "high");
  const sev = SEVERITY[finding.severity];
  return (
    <li className="relative overflow-hidden rounded-xl border border-border/70 bg-background print:break-inside-avoid">
      <span className={cn("absolute inset-y-0 start-0 w-1", sev.bar)} />
      <div className="flex items-start gap-3 py-3 pe-3 ps-4">
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full flex-wrap items-center gap-2 text-start">
            <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase", sev.cls)}>{sev.label}</span>
            <span dir="auto" className="text-[13.5px] font-semibold">
              {finding.title}
            </span>
            {finding.impact && (
              <span dir="auto" className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                {finding.impact}
              </span>
            )}
            <ChevronDown className={cn("ms-auto h-3.5 w-3.5 text-muted-foreground transition-transform print:hidden", open && "rotate-180")} />
          </button>
          <div className={cn("mt-2 grid gap-2 md:grid-cols-2", !open && "hidden print:grid")}>
            <div className="rounded-lg bg-muted/40 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Evidence</p>
              <p dir="auto" className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed">
                <Inline text={finding.evidence} />
              </p>
            </div>
            <div className="rounded-lg bg-emerald-500/[0.06] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Fix</p>
              <p dir="auto" className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed">
                <Inline text={finding.fix} />
              </p>
            </div>
          </div>
        </div>
        {onPlan && (
          <button
            type="button"
            disabled={disabled}
            onClick={onPlan}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#400095]/30 px-2.5 py-1 text-[11.5px] font-semibold text-[#400095] hover:bg-[#400095]/[0.06] disabled:opacity-50 dark:border-violet-400/40 dark:text-violet-300 print:hidden"
          >
            <ClipboardList className="h-3 w-3" /> Plan a fix
          </button>
        )}
      </div>
    </li>
  );
}

// ─── Talking to Vera about it ────────────────────────────────────────────────

function AskVera({ doc }: { doc: LiveDoc }) {
  const [text, setText] = useState("");
  const agentBusy = useGoogleAds((s) => s.agentBusy);
  const canEdit = useLiveDocs((s) => s.canApply);
  if (!canEdit) return null;
  const isPlan = doc.kind === "plan";
  const send = () => {
    const t = text.trim();
    if (!t) return;
    runAgentTurn(`About the ${doc.kind} "${doc.title}" (documentId ${doc.id}): ${t}`);
    setText("");
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card p-2 ps-3.5 shadow-sm print:hidden"
    >
      <MessageSquareText className="h-4 w-4 shrink-0 text-[#400095] dark:text-violet-300" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        dir="auto"
        placeholder={isPlan ? "Ask Vera to change this plan, e.g. “drop step 3” or “be more careful with budgets”…" : "Ask Vera about this report, or what to change in it…"}
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
      />
      <button
        type="submit"
        disabled={!text.trim() || agentBusy}
        className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#400095] px-3 text-[12px] font-semibold text-white disabled:opacity-40 dark:bg-violet-600"
      >
        <Send className="h-3.5 w-3.5" /> Send to Vera
      </button>
    </form>
  );
}
