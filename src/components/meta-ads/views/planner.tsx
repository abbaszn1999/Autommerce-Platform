"use client";

import { useMemo, useState } from "react";
import { Card, Pill, ViewHeader } from "@/components/google-ads/ga-ui";
import { forecastCampaign, learningBudget, recentCostPerResult } from "@/lib/meta-ads/analytics";
import { LIMITS } from "@/lib/meta-ads/constants";
import { campaignBase, daysIn, derive, money, num } from "@/lib/meta-ads/metrics";
import { AskButton, Note } from "../ma-common";
import { LearningBar } from "../ma-ui";
import { useMa } from "../use-ma";

/** Budget & learning planner: what a daily budget buys, and whether every ad set can leave the learning phase on it. */
export function PlannerView() {
  const { data, range, currency, campaign } = useMa();
  const live = data.campaigns.filter((c) => c.status === "ACTIVE");
  const [campaignId, setCampaignId] = useState(campaign?.id ?? live[0]?.id ?? "");
  const c = data.campaigns.find((x) => x.id === campaignId);
  const days = Math.max(1, daysIn(range));
  const current = c ? campaignBase(data, c.id, range).spend / days : 0;
  const [budget, setBudget] = useState(() => Math.max(LIMITS.minDailyBudget, Math.round(current || 50)));

  const forecast = useMemo(() => (c ? forecastCampaign(data, c.id, range, budget) : null), [c, data, range, budget]);
  const now = useMemo(() => (c ? derive(campaignBase(data, c.id, range)) : null), [c, data, range]);
  const sets = c ? data.adSets.filter((s) => s.campaignId === c.id && s.status === "ACTIVE") : [];
  const perSet = sets.length ? budget / sets.length : budget;
  const step = Math.max(1, Math.round((current || 50) / 10));

  return (
    <div className="space-y-4">
      <ViewHeader title="Budget & learning planner" subtitle="Meta needs about 50 results per ad set in 7 days. Check what a budget can do before you change it." />
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block text-xs">
            <span className="mb-1 block font-semibold">Campaign</span>
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="h-9 min-w-64 rounded-lg border border-border/70 bg-background px-2 text-xs">
              {live.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-64 flex-1 text-xs">
            <span className="mb-1 flex justify-between font-semibold">
              <span>Daily budget</span>
              <span className="tabular-nums">{money(budget, currency)}</span>
            </span>
            <input type="range" min={LIMITS.minDailyBudget} max={Math.max(100, Math.round((current || 50) * 3))} step={step} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="w-full accent-[#400095]" />
            <span className="flex justify-between text-[10px] text-muted-foreground">
              <span>Now ≈ {money(current, currency)}/day</span>
              {current > 0 && <span>{budget >= current ? "+" : ""}{Math.round(((budget - current) / current) * 100)}%</span>}
            </span>
          </label>
        </div>
        {c && current > 0 && Math.abs(budget - current) / current > LIMITS.safeBudgetStep && (
          <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-400">A change over {Math.round(LIMITS.safeBudgetStep * 100)}% restarts learning. Raise in steps of about 20% every few days.</p>
        )}
      </Card>

      {forecast && now && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Forecast spend", money(forecast.spend, currency), `${money(now.spend, currency)} last period`],
            ["Forecast results", num(forecast.results, { compact: true }), `${num(now.results, { compact: true })} last period`],
            ["Forecast value", forecast.value ? money(forecast.value, currency) : "—", now.purchaseValue ? `${money(now.purchaseValue, currency)} last period` : "No value tracking"],
            ["Forecast reach", num(forecast.reach, { compact: true }), `${num(now.reach, { compact: true })} last period`],
          ].map(([label, value, sub]) => (
            <Card key={label} className="p-4">
              <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
              <p className="text-2xl font-black tabular-nums">{value}</p>
              <p className="text-[10px] text-muted-foreground">{sub}</p>
            </Card>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Forecasts are estimates from the last period with diminishing returns. They are not a promise.</p>

      <Card className="overflow-hidden">
        <div className="border-b border-border/60 px-4 py-3">
          <p className="text-sm font-bold">Learning check per ad set</p>
          <p className="text-[11px] text-muted-foreground">Needed per day ≈ cost per result × 50 ÷ 7. With this budget each ad set gets about {money(perSet, currency)}/day{c?.budget ? " (even split)" : ""}.</p>
        </div>
        <div className="divide-y divide-border/40">
          {sets.map((s) => {
            const cpr = recentCostPerResult(data, s.id, range);
            const need = cpr ? learningBudget(cpr) : 0;
            const available = s.budget ? s.budget.amount : perSet;
            const ok = !need || available >= need;
            return (
              <div key={s.id} className="grid items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_140px_120px_100px]">
                <span className="truncate text-xs font-semibold">{s.name}</span>
                <LearningBar learning={s.learning} compact />
                <span className="text-xs text-muted-foreground">{need ? `needs ≈ ${money(need, currency)}/day` : "no results yet"}</span>
                <Pill tone={ok ? "good" : "warn"}>{ok ? "Enough" : "Too low"}</Pill>
              </div>
            );
          })}
          {!sets.length && <p className="px-4 py-6 text-center text-xs text-muted-foreground">Pick a campaign with active ad sets.</p>}
        </div>
      </Card>
      {sets.some((s) => s.learning.phase === "LIMITED") && (
        <Note tone="warn">
          Some ad sets are learning limited. Consolidating them or raising the budget usually helps. <AskButton prompt="Why are my ad sets learning limited and how do I fix it?" className="ml-2">Ask the agent</AskButton>
        </Note>
      )}
    </div>
  );
}
