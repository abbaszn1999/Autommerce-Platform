"use client";

import { useState } from "react";
import { FlaskConical, Microscope, Trophy } from "lucide-react";
import { Card, EmptyState, Pill, Segmented, ViewHeader } from "@/components/google-ads/ga-ui";
import { money } from "@/lib/meta-ads/metrics";
import type { AbTest, LiftStudy } from "@/lib/meta-ads/types";
import { AskButton, Note } from "../ma-common";
import { useMa } from "../use-ma";

const VARIABLE: Record<AbTest["variable"], string> = { CREATIVE: "Creative", AUDIENCE: "Audience", PLACEMENT: "Placement", OPTIMIZATION: "Optimization", CUSTOM: "Custom" };
const STATUS_TONE = { DRAFT: "neutral", RUNNING: "info", COMPLETED: "good", ENDED: "neutral", PLANNED: "neutral" } as const;

/** Experiments: A/B tests (split test of one variable) and lift studies (incrementality against a held-out group). */
export function ExperimentsView() {
  const { data } = useMa();
  const [tab, setTab] = useState<"ab" | "lift">("ab");
  return (
    <div>
      <ViewHeader
        title="Experiments"
        subtitle="Test one change at a time, or measure how many results your ads caused."
        actions={<AskButton primary prompt={tab === "ab" ? "Set up an A/B test of two creative concepts" : "Plan a conversion lift study for my Sales campaign"}>{tab === "ab" ? "Plan an A/B test" : "Plan a lift study"}</AskButton>}
      >
        <Segmented value={tab} onChange={setTab} size="xs" options={[{ value: "ab", label: "A/B tests", count: data.abTests.length }, { value: "lift", label: "Lift studies", count: data.liftStudies.length }]} />
      </ViewHeader>
      {tab === "ab" ? <AbTests /> : <LiftStudies />}
    </div>
  );
}

function AbTests() {
  const { data, currency } = useMa();
  if (!data.abTests.length) return <EmptyState icon={FlaskConical} title="No A/B tests yet" body="Ask the agent to split-test creative, audience or placement. Each test needs a budget large enough to reach 50 results per cell." />;
  return (
    <div className="space-y-4">
      {data.abTests.map((t) => {
        const best = t.cells.reduce((a, b) => (b.costPerResult < a.costPerResult ? b : a), t.cells[0]);
        return (
          <Card key={t.id} className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold">{t.name}</p>
              <Pill tone={STATUS_TONE[t.status]}>{t.status.toLowerCase()}</Pill>
              <Pill>{VARIABLE[t.variable]}</Pill>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {t.startDate} → {t.endDate} · metric: {t.metric}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {t.cells.map((c) => (
                <div key={c.name} className={`rounded-xl border p-3 ${t.winner === c.name ? "border-emerald-500/50 bg-emerald-500/5" : "border-border/60"}`}>
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    {t.winner === c.name && <Trophy className="h-3.5 w-3.5 text-emerald-600" />}
                    {c.name}
                  </p>
                  <p className="mt-1 text-xl font-black tabular-nums">{money(c.costPerResult, currency, { decimals: 2 })}</p>
                  <p className="text-[10px] text-muted-foreground">cost per result · {Math.round(c.budgetShare * 100)}% of budget</p>
                </div>
              ))}
            </div>
            {t.status === "COMPLETED" && t.winner && (
              <p className="mt-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{t.winner}</span> won with {Math.round((t.confidence ?? 0) * 100)}% confidence.
                {(t.confidence ?? 0) < 0.8 && " That is below the 80% bar, so treat the result as a hint, not proof."}
              </p>
            )}
            {t.status === "RUNNING" && best && <p className="mt-3 text-xs text-muted-foreground">Leading so far: {best.name}. Wait for the end date: stopping early inflates false winners.</p>}
          </Card>
        );
      })}
    </div>
  );
}

function LiftStudies() {
  const { data } = useMa();
  return (
    <>
      <Note icon={<Microscope className="mt-0.5 h-3.5 w-3.5 text-sky-600" />}>
        A lift study holds back a share of people and compares them with people who saw the ads. It shows <b>incremental</b> results, the ones that would not have happened anyway. Attribution windows alone can&apos;t tell you that.
      </Note>
      {!data.liftStudies.length ? (
        <EmptyState icon={Microscope} title="No lift studies yet" body="Ask the agent to plan one. It needs a campaign with steady spend and a minimum of two weeks." />
      ) : (
        <div className="space-y-4">
          {data.liftStudies.map((s) => (
            <LiftCard key={s.id} study={s} />
          ))}
        </div>
      )}
    </>
  );
}

function LiftCard({ study: s }: { study: LiftStudy }) {
  const { data } = useMa();
  const names = s.campaignIds.map((id) => data.campaigns.find((c) => c.id === id)?.name).filter(Boolean).join(", ");
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold">{s.name}</p>
        <Pill tone={STATUS_TONE[s.status]}>{s.status.toLowerCase()}</Pill>
        <Pill tone="brand">{s.kind === "CONVERSION_LIFT" ? "Conversion lift" : "Brand lift"}</Pill>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {s.startDate} → {s.endDate}
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {names || "No campaigns"} · {s.controlPct}% held out · metric: {s.metric}
      </p>
      {s.status === "COMPLETED" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">{s.kind === "CONVERSION_LIFT" ? "Incremental lift" : "Ad recall lift"}</p>
            <p className="text-2xl font-black tabular-nums text-emerald-600">{s.kind === "CONVERSION_LIFT" ? `+${Math.round((s.lift ?? 0) * 100)}%` : `+${(s.recallLiftPoints ?? 0).toFixed(1)} pts`}</p>
          </div>
          {s.incrementalResults !== undefined && (
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Incremental results</p>
              <p className="text-2xl font-black tabular-nums">{s.incrementalResults.toLocaleString()}</p>
            </div>
          )}
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Confidence</p>
            <p className="text-2xl font-black tabular-nums">{Math.round((s.confidence ?? 0) * 100)}%</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{s.status === "RUNNING" ? "Collecting data. Results appear when the study ends." : "Planned: starts on its start date."}</p>
      )}
    </Card>
  );
}
