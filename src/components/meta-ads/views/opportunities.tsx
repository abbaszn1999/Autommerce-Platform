"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Lightbulb, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, EmptyState, Pill, Segmented, ViewHeader } from "@/components/google-ads/ga-ui";
import { OPPORTUNITY_CATEGORIES } from "@/lib/meta-ads/constants";
import { opportunityScore } from "@/lib/meta-ads/analytics";
import { useMetaAds } from "@/lib/meta-ads/store";
import type { Opportunity, OpportunityCategory } from "@/lib/meta-ads/types";
import { runAgentTurn } from "@/lib/meta-ads/agent-runner";
import { AskButton } from "../ma-common";
import { useMa } from "../use-ma";

type Filter = "ALL" | OpportunityCategory;

/** Meta-style opportunities. Applying one asks the agent to prepare it, so nothing runs until you approve it. */
export function OpportunitiesView() {
  const { data } = useMa();
  const applyDirect = useMetaAds((s) => s.applyDirect);
  const [filter, setFilter] = useState<Filter>("ALL");
  const score = opportunityScore(data);
  const open = data.opportunities.filter((o) => o.status === "OPEN");
  const shown = open.filter((o) => filter === "ALL" || o.category === filter);
  const cats = Object.keys(OPPORTUNITY_CATEGORIES) as OpportunityCategory[];

  const apply = (o: Opportunity) => {
    if (o.ops?.length) runAgentTurn(`Apply this opportunity: ${o.title}`);
  };
  const dismiss = (o: Opportunity) => {
    const res = applyDirect(`Dismiss opportunity: ${o.title}`, [{ kind: "opportunity.set", ids: [o.id], status: "DISMISSED" }]);
    if (!res.ok) toast.error(res.error ?? "Could not dismiss");
  };

  return (
    <div className="space-y-4">
      <ViewHeader title="Opportunities" subtitle="Ideas to improve delivery and cost, ranked by how much they lift the score." actions={<AskButton prompt="Run a full audit of my Meta account">Full audit</AskButton>}>
        <Segmented value={filter} onChange={setFilter} size="xs" options={[{ value: "ALL", label: "All", count: open.length }, ...cats.map((c) => ({ value: c, label: OPPORTUNITY_CATEGORIES[c], count: open.filter((o) => o.category === c).length }))]} />
      </ViewHeader>
      <Card className="flex items-center gap-4 p-4">
        <span className={cn("text-3xl font-black tabular-nums", score >= 80 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-red-600")}>{score}%</span>
        <div className="flex-1">
          <p className="text-sm font-bold">Opportunity score</p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-[#400095] to-[#F76D01]" style={{ width: `${score}%` }} />
          </div>
        </div>
      </Card>
      {!shown.length ? (
        <EmptyState icon={Sparkles} title="Nothing to do here" body="No open opportunities in this category. The agent keeps looking and adds new ones when it finds them." />
      ) : (
        <div className="space-y-3">
          {shown.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex flex-wrap items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#F76D01]/10 text-[#F76D01]">
                  <Lightbulb className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                    {o.title}
                    <Pill tone="brand">+{o.scoreGain} score</Pill>
                    <Pill>{OPPORTUNITY_CATEGORIES[o.category]}</Pill>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{o.description}</p>
                  {o.entityLabel && <p className="mt-1 text-[11px] text-muted-foreground">Affects: {o.entityLabel}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {o.ops?.length ? (
                    <button type="button" onClick={() => apply(o)} className="rounded-lg bg-[#400095] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#340079] dark:bg-[#F76D01]">
                      Apply with agent
                    </button>
                  ) : (
                    <AskButton primary prompt={o.prompt}>Ask the agent</AskButton>
                  )}
                  <button type="button" onClick={() => dismiss(o)} className="rounded-lg border border-border/70 px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                    Dismiss
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
