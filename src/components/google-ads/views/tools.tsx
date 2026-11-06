"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Beaker, Calculator, FlaskConical, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { forecastCampaign } from "@/lib/google-ads/analytics";
import { money, num } from "@/lib/google-ads/metrics";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import { ACCENT_BTN, Card, Delta, EmptyState, Pill, ViewHeader } from "../ga-ui";
import { useGa } from "../use-ga";
import { useGoogleAds } from "@/lib/google-ads/store";
import { LiveCompetitorAdsView } from "./competitor-ads-live";

// ─── Competitor ads ────────────────────────────────────────────────────────

/** Real competitor data costs credits, so it is only on live accounts. */
export function CompetitorAdsView() {
  const live = useGoogleAds((s) => s.mode === "live");
  return live ? (
    <LiveCompetitorAdsView />
  ) : (
    <div className="space-y-5">
      <ViewHeader title="Competitor ads" subtitle="The searches a competitor pays Google to show up on, with their ads." />
      <EmptyState icon={Search} title="Connect your Google Ads account" body="Competitor ads uses real market data, so it is available once your own account is connected." />
    </div>
  );
}

// ─── Experiments ───────────────────────────────────────────────────────────

export function ExperimentsView() {
  const { data } = useGa();

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Experiments"
        subtitle="Tests of a change on part of a campaign's traffic before it is rolled out. To start, apply or end one, ask the agent."
      />
      {data.experiments.length === 0 && <EmptyState icon={FlaskConical} title="No experiments yet" body="Ask the agent to try a new bid strategy or broad match on half the traffic and see what actually works." />}
      <div className="grid gap-3 lg:grid-cols-2">
        {data.experiments.map((e) => {
          const r = e.result;
          const winning = r && r.confidence >= 0.9 && r.conversions + r.roas > 0;
          return (
            <Card key={e.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#400095]/10 text-[#400095] dark:bg-violet-500/15 dark:text-violet-300">
                  <Beaker className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{e.name}</p>
                  <p className="text-[11px] text-muted-foreground">{e.change}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {e.split}% split · {e.startDate} → {e.endDate} · base: {data.campaigns.find((c) => c.id === e.baseCampaignId)?.name}
                  </p>
                </div>
                <Pill tone={e.status === "RUNNING" ? "info" : e.status === "APPLIED" ? "good" : "neutral"}>{e.status.toLowerCase()}</Pill>
              </div>
              {r ? (
                <div className="mt-3 rounded-xl bg-muted/40 p-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-[10px] text-muted-foreground">Conversions</p><Delta value={r.conversions} /></div>
                    <div><p className="text-[10px] text-muted-foreground">Cost / conv.</p><Delta value={r.cpa} higherIsBetter={false} /></div>
                    <div><p className="text-[10px] text-muted-foreground">ROAS</p><Delta value={r.roas} /></div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                    Confidence
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className={cn("block h-full rounded-full", r.confidence >= 0.9 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${r.confidence * 100}%` }} />
                    </span>
                    {Math.round(r.confidence * 100)}%
                  </div>
                  <p className="mt-1.5 text-[11px]">{winning ? "The trial is winning with high confidence." : r.confidence < 0.9 ? "Not significant yet. Keep it running or end it." : "The trial is not better than the base."}</p>
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-muted/40 p-3 text-[11px] text-muted-foreground">Collecting data. Results usually need 2–4 weeks. No extra budget: the trial shares the campaign&apos;s budget.</p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Performance Planner ──────────────────────────────────────────────────

export function PlannerView() {
  const { data, range, currency, campaign } = useGa();
  const { resolvedTheme } = useTheme();
  const candidates = data.campaigns.filter((c) => c.status === "ENABLED" && (!campaign || c.id === campaign.id));
  const current = (id: string) => data.budgets.find((b) => b.id === data.campaigns.find((c) => c.id === id)?.budgetId)?.amount ?? 0;
  const [planned, setPlanned] = useState<Record<string, number>>(() => Object.fromEntries(candidates.map((c) => [c.id, current(c.id)])));

  if (!candidates.length) return <div><ViewHeader title="Performance Planner" /><EmptyState icon={Calculator} title="No enabled campaigns to plan" /></div>;

  const totals = (budgets: Record<string, number>) =>
    candidates.reduce(
      (s, c) => {
        const f = forecastCampaign(data, c, range, budgets[c.id] ?? current(c.id));
        return { cost: s.cost + f.cost, conversions: s.conversions + f.conversions, value: s.value + f.value, clicks: s.clicks + f.clicks };
      },
      { cost: 0, conversions: 0, value: 0, clicks: 0 }
    );
  const now = totals(Object.fromEntries(candidates.map((c) => [c.id, current(c.id)])));
  const plan = totals(planned);
  const curve = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5].map((k) => {
    const t = totals(Object.fromEntries(candidates.map((c) => [c.id, current(c.id) * k])));
    return { spend: Math.round(t.cost), conversions: Math.round(t.conversions) };
  });
  const changed = candidates.filter((c) => Math.abs((planned[c.id] ?? 0) - current(c.id)) >= 1);
  const axis = resolvedTheme === "dark" ? "#a1a1aa" : "#71717a";

  return (
    <div className="space-y-4">
      <ViewHeader title="Performance Planner" subtitle="See what happens to conversions and value if you change budgets. Forecasts are based on the last 30 days, seasonality and auction data." />
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Monthly spend", now: now.cost, plan: plan.cost, fmt: (v: number) => money(v, currency), good: false },
          { label: "Conversions", now: now.conversions, plan: plan.conversions, fmt: (v: number) => num(v, { decimals: 0 }), good: true },
          { label: "Conv. value", now: now.value, plan: plan.value, fmt: (v: number) => money(v, currency), good: true },
          { label: "ROAS", now: now.value / (now.cost || 1), plan: plan.value / (plan.cost || 1), fmt: (v: number) => `${v.toFixed(2)}x`, good: true },
        ].map((m) => (
          <Card key={m.label} className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground">{m.label}</p>
            <p className="text-xl font-black tabular-nums">{m.fmt(m.plan)}</p>
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              now {m.fmt(m.now)} <Delta value={m.now ? (m.plan - m.now) / m.now : null} higherIsBetter={m.good} />
            </p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card className="p-4">
          <p className="mb-2 text-sm font-bold">Conversions vs monthly spend</p>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curve} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={resolvedTheme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"} />
                <XAxis dataKey="spend" type="number" domain={["dataMin", "dataMax"]} tick={{ fontSize: 10, fill: axis }} tickFormatter={(v: number) => money(v, currency, { compact: true })} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={(v) => [num(Number(v)), "Conversions"]} labelFormatter={(v) => `Spend ${money(Number(v), currency)}`} />
                <Line type="monotone" dataKey="conversions" stroke="#400095" strokeWidth={2} dot={{ r: 2 }} />
                <ReferenceDot x={Math.round(now.cost)} y={Math.round(now.conversions)} r={5} fill="#a1a1aa" stroke="none" />
                <ReferenceDot x={Math.round(plan.cost)} y={Math.round(plan.conversions)} r={6} fill="#F76D01" stroke="white" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-muted-foreground"><span className="font-semibold text-[#F76D01]">●</span> your plan · <span className="font-semibold text-zinc-400">●</span> today. The curve flattens where extra budget buys fewer conversions.</p>
        </Card>
        <Card className="p-4">
          <p className="mb-3 text-sm font-bold">Daily budgets</p>
          <div className="space-y-4">
            {candidates.map((c) => {
              const cur = current(c.id);
              const v = planned[c.id] ?? cur;
              return (
                <div key={c.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="truncate font-semibold">{c.name}</span>
                    <span className="tabular-nums">{money(v, currency)} <span className="text-muted-foreground">/ {money(cur, currency)}</span></span>
                  </div>
                  <input type="range" min={Math.max(1, Math.round(cur * 0.3))} max={Math.round(cur * 3)} value={v} onChange={(e) => setPlanned((p) => ({ ...p, [c.id]: Number(e.target.value) }))} className="w-full accent-[#400095]" />
                  {c.servingIssues.includes("LIMITED_BY_BUDGET") && <p className="text-[10px] text-amber-600">Limited by budget: extra spend converts well here.</p>}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            disabled={!changed.length}
            onClick={() => {
              runAgentTurn(`Apply this budget plan: ${changed.map((c) => `${c.name} from ${money(current(c.id), currency)} to ${money(Math.round(planned[c.id]), currency)} per day`).join("; ")}`);
            }}
            className={cn("mt-4 w-full rounded-lg py-2 text-xs font-semibold", ACCENT_BTN)}
          >
            Ask agent to apply plan{changed.length ? ` (${changed.length} budget${changed.length > 1 ? "s" : ""})` : ""}
          </button>
        </Card>
      </div>
    </div>
  );
}
