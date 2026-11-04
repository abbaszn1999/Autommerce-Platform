"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ClipboardList, FileBarChart, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import type { DocKind, LiveDocSummary } from "@/lib/google-ads/live-docs";
import { openDoc, refreshDocList, setDocKind, useLiveDocs } from "@/lib/google-ads/live-docs-store";
import { useGoogleAds } from "@/lib/google-ads/store";
import { EmptyState, Segmented, ViewHeader } from "../ga-ui";
import { RowsSkeleton } from "../ga-skeleton";
import { LiveDocView, StatusChip, ago } from "./live-doc-view";

/** What Vera can start from here: real requests about the connected account. */
const STARTERS: Record<DocKind, { title: string; blurb: string; prompt: string }[]> = {
  plan: [
    {
      title: "Cut wasted spend",
      blurb: "Negatives for search terms and pauses for keywords that spend without sales",
      prompt: "Make a plan to cut wasted spend in my account over the last 30 days: search terms to add as negatives and keywords to pause. Save it as a plan.",
    },
    {
      title: "Budget plan for next month",
      blurb: "Move budget from campaigns below target to those limited by budget",
      prompt: "Make a budget plan for next month: which campaign budgets to raise, lower or keep, within my monthly budget cap. Save it as a plan.",
    },
    {
      title: "Fix product feed issues",
      blurb: "Product fixes in Merchant Center for disapproved or limited products",
      prompt: "Make a plan to fix the product issues in Merchant Center (titles, descriptions, brands, categories) that I can fix from here. Save it as a plan.",
    },
    {
      title: "Bidding & targets review",
      blurb: "Targets that match each campaign's real results and volume",
      prompt: "Review the bidding targets of my campaigns and make a plan to set targets that match their real results and conversion volume. Save it as a plan.",
    },
  ],
  report: [
    {
      title: "Account audit",
      blurb: "Health score, issues ranked by money at stake, and the fix for each",
      prompt: "Write a full audit of my Google Ads account: tracking, structure, waste, bidding, Shopping/PMax and products. Save it as a report.",
    },
    {
      title: "Monthly performance report",
      blurb: "The last 30 days against the 30 before: what moved and why",
      prompt: "Write my performance report for the last 30 days compared with the 30 days before: key numbers, trends, best and worst campaigns, and what to do next. Save it as a report.",
    },
    {
      title: "Wasted spend report",
      blurb: "Search terms, keywords and products that cost money without sales",
      prompt: "Write a wasted-spend report for the last 30 days: search terms, keywords and products that spent without sales, with the money at stake. Save it as a report.",
    },
    {
      title: "Products & Shopping report",
      blurb: "Stars, losers and products that barely serve",
      prompt: "Write a products and Shopping report: which products sell well, which spend without sales, and which barely show. Save it as a report.",
    },
  ],
};

const PLAN_FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "To review" },
  { value: "in_progress", label: "In progress" },
  { value: "applied", label: "Applied" },
  { value: "archived", label: "Archived" },
] as const;

type Filter = (typeof PLAN_FILTERS)[number]["value"];

/** The live Documents page: Vera's plans and reports for the connected account, and the one open inside it. */
export function LiveDocumentsView() {
  const openId = useLiveDocs((s) => s.openId);
  return openId ? <LiveDocView key={openId} docId={openId} /> : <DocList />;
}

function DocList() {
  const list = useLiveDocs((s) => s.list);
  const status = useLiveDocs((s) => s.listStatus);
  const canAct = useLiveDocs((s) => s.canApply);
  const kind = useLiveDocs((s) => s.kind);
  const agentBusy = useGoogleAds((s) => s.agentBusy);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    void refreshDocList();
  }, []);

  const ofKind = useMemo(() => list.filter((d) => d.kind === kind), [list, kind]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ofKind.filter((d) => {
      if (filter === "all" ? d.status === "archived" : d.status !== filter) return false;
      return !needle || `${d.title} ${d.summary}`.toLowerCase().includes(needle);
    });
  }, [ofKind, filter, q]);
  const count = (k: DocKind) => list.filter((d) => d.kind === k && d.status !== "archived").length;
  const filters = kind === "plan" ? PLAN_FILTERS : PLAN_FILTERS.filter((f) => f.value === "all" || f.value === "archived");

  return (
    <div className="space-y-5">
      <ViewHeader
        title="Documents"
        subtitle="Plans and reports Vera wrote for this account. Open one to read it; a plan's steps are applied from inside it, one by one, with undo."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-border/70 bg-card p-1 shadow-sm">
          {(["plan", "report"] as const).map((k) => {
            const Icon = k === "plan" ? ClipboardList : FileBarChart;
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setDocKind(k);
                  setFilter("all");
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  kind === k ? "bg-[#400095] text-white shadow-sm dark:bg-violet-600" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {k === "plan" ? "Plans" : "Reports"}
                <span className={cn("rounded-full px-1.5 text-[10.5px]", kind === k ? "bg-white/20" : "bg-muted")}>{count(k)}</span>
              </button>
            );
          })}
        </div>
        <Segmented value={filter} onChange={setFilter} size="xs" options={filters.map((f) => ({ value: f.value, label: f.label }))} />
        <label className="ms-auto flex h-9 w-64 max-w-full items-center gap-2 rounded-xl border border-border/70 bg-card px-3 text-[13px] shadow-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${kind === "plan" ? "plans" : "reports"}`} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
        </label>
      </div>

      {(status === "loading" || status === "idle") && !list.length ? (
        <RowsSkeleton rows={3} />
      ) : shown.length ? (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          {shown.map((d) => (
            <DocRow key={d.id} doc={d} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={kind === "plan" ? ClipboardList : FileBarChart}
          title={q || filter !== "all" ? "Nothing matches" : kind === "plan" ? "No plans yet" : "No reports yet"}
          body={
            q || filter !== "all"
              ? "Try another filter or search."
              : kind === "plan"
                ? "Ask Vera for a plan, or start from one below. Every step is checked by Google before you see it, and you apply it from here."
                : "Ask Vera for a report or an audit, or start from one below."
          }
        />
      )}

      {canAct && (
        <section>
          <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold">
            <Sparkles className="h-4 w-4 text-[#F76D01]" /> {kind === "plan" ? "Start a plan" : "Start a report"}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {STARTERS[kind].map((s) => (
              <button
                key={s.title}
                type="button"
                disabled={agentBusy}
                onClick={() => runAgentTurn(s.prompt)}
                className="group flex flex-col items-start rounded-2xl border border-border/60 bg-card p-3.5 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#400095]/30 hover:shadow-md disabled:opacity-50"
              >
                <span className="text-[13px] font-semibold">{s.title}</span>
                <span className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{s.blurb}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#400095] opacity-0 transition-opacity group-hover:opacity-100 dark:text-violet-300">
                  Ask Vera <ChevronRight className="h-3 w-3" />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DocRow({ doc }: { doc: LiveDocSummary }) {
  const Icon = doc.kind === "plan" ? ClipboardList : FileBarChart;
  const steps = doc.steps;
  return (
    <button type="button" onClick={() => openDoc(doc.id)} className="flex w-full items-center gap-4 border-b border-border/50 px-4 py-3.5 text-start transition-colors last:border-b-0 hover:bg-muted/40">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#400095]/10 to-[#F76D01]/15 text-[#400095] dark:text-violet-300">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span dir="auto" className="truncate text-[13.5px] font-semibold">
            {doc.title}
          </span>
          <StatusChip status={doc.status} />
        </span>
        {doc.summary && (
          <span dir="auto" className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {doc.summary}
          </span>
        )}
      </span>
      {steps && (
        <span className="hidden w-36 shrink-0 md:block">
          <span className="flex justify-between text-[11px] text-muted-foreground">
            <span>
              {steps.applied}/{steps.total} applied
            </span>
            {steps.failed > 0 && <span className="text-red-600">{steps.failed} failed</span>}
          </span>
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${steps.total ? (steps.applied / steps.total) * 100 : 0}%` }} />
          </span>
        </span>
      )}
      <span className="hidden w-28 shrink-0 text-end text-[11.5px] text-muted-foreground sm:block">
        v{doc.version} · {ago(doc.updatedAt)}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
