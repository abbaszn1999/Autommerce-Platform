"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Ban, Bot, FileWarning, FlaskConical, Gauge, Sparkles, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BIDDING, CAMPAIGN_TYPES, SERVING_ISSUES } from "@/lib/google-ads/constants";
import {
  METRICS,
  accountBase,
  adGroupBase,
  campaignBase,
  dailySeries,
  delta,
  derive,
  formatMetric,
  money,
  previousRange,
  searchTermBase,
} from "@/lib/google-ads/metrics";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import { useGoogleAds } from "@/lib/google-ads/store";
import type { MetricKey } from "@/lib/google-ads/types";
import { GaChart } from "../ga-chart";
import { ACCENT_BTN, Card, Delta, EmptyState, Pill, StatusDot, ViewHeader } from "../ga-ui";
import { scopedCampaignIds, useGa } from "../use-ga";
import { AssetGroupOverview } from "./asset-group";

const TILE_METRICS: MetricKey[] = ["clicks", "impressions", "cost", "conversions", "conversionsValue", "roas", "cpa", "ctr"];

/** Inside a Performance Max asset group the overview describes that group, not the whole campaign. */
export function OverviewView() {
  const { scope } = useGa();
  return scope.assetGroupId ? <AssetGroupOverview /> : <ScopeOverview />;
}

function ScopeOverview() {
  const { data, range, currency, campaign, adGroup } = useGa();
  const setScope = useGoogleAds((s) => s.setScope);
  const setView = useGoogleAds((s) => s.setView);
  const [tiles, setTiles] = useState<MetricKey[]>(["cost", "conversions", "conversionsValue", "roas"]);
  const [chart, setChart] = useState<[MetricKey, MetricKey]>(["cost", "conversions"]);

  const ids = useMemo(() => scopedCampaignIds(data, campaign), [data, campaign]);
  // Inside an ad group the numbers are the ad group's; the daily chart stays the campaign's (there is no daily series per ad group).
  const now = useMemo(() => derive(adGroup ? adGroupBase(data, adGroup.id, range) : accountBase(data, range, ids)), [data, range, ids, adGroup]);
  const prev = useMemo(() => derive(adGroup ? adGroupBase(data, adGroup.id, previousRange(range)) : accountBase(data, previousRange(range), ids)), [data, range, ids, adGroup]);
  const points = useMemo(() => dailySeries(data, range, ids), [data, range, ids]);

  if (!data.campaigns.length) {
    return (
      <div>
        <ViewHeader title="Overview" subtitle="This account has no campaigns yet." />
        <EmptyState
          icon={Sparkles}
          title="Start your first campaign"
          body="Describe what you sell and the agent drafts the whole campaign from your catalog. You review it in the chat before anything goes live."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => runAgentTurn("Create a Search campaign for running shoes in Saudi Arabia with $60/day")}
                className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold", ACCENT_BTN)}
              >
                <Bot className="h-3.5 w-3.5" /> Ask the agent to build it
              </button>
            </div>
          }
        />
      </div>
    );
  }

  const toggleChart = (key: MetricKey) => setChart(([a, b]) => (a === key ? [b, a] : [key, a]));

  return (
    <div className="space-y-4">
      <ViewHeader
        title={adGroup ? adGroup.name : campaign ? campaign.name : "Overview"}
        subtitle={
          adGroup && campaign
            ? `Ad group in ${campaign.name}`
            : campaign
              ? `${CAMPAIGN_TYPES[campaign.type].label} campaign · ${BIDDING[campaign.bidding.type].label}`
              : `${data.account.name} · all campaigns`
        }
      />

      {campaign && <ExperimentNote campaignId={campaign.id} />}
      {adGroup ? <AdGroupSummary /> : campaign && <CampaignSummary />}

      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 border-b border-border/60 md:grid-cols-4">
          {tiles.map((key, i) => {
            const on = chart.includes(key);
            const color = METRICS[key].color;
            return (
              <div key={key} className={cn("relative border-border/60 p-4 text-left transition-colors", i > 0 && "md:border-l", i % 2 === 1 && "border-l", i >= 2 && "border-t md:border-t-0", on ? "bg-muted/30" : "hover:bg-muted/20")}>
                {on && <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: color }} />}
                <div className="flex items-center justify-between gap-2">
                  <select
                    value={key}
                    onChange={(e) => {
                      const next = e.target.value as MetricKey;
                      setTiles((t) => t.map((k, j) => (j === i ? next : k)));
                      setChart((c) => (c.includes(key) ? (c.map((k) => (k === key ? next : k)) as [MetricKey, MetricKey]) : c));
                    }}
                    className="-ml-1 cursor-pointer rounded bg-transparent px-1 text-[11px] font-semibold text-muted-foreground outline-none hover:bg-muted"
                  >
                    {TILE_METRICS.filter((k) => k === key || !tiles.includes(k)).map((k) => (
                      <option key={k} value={k}>
                        {METRICS[k].label}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => toggleChart(key)} title="Show on chart" className={cn("h-3 w-3 rounded-sm border-2 transition-colors")} style={{ borderColor: color, background: on ? color : "transparent" }} />
                </div>
                <button type="button" onClick={() => toggleChart(key)} className="mt-1 block text-left">
                  <span className="block text-2xl font-black tracking-tight tabular-nums">{formatMetric(key, now[key], currency)}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Delta value={delta(now[key], prev[key])} higherIsBetter={METRICS[key].higherIsBetter} />
                    vs previous period
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="p-4">
          {adGroup && <p className="mb-2 text-[11px] text-muted-foreground">Daily chart: the whole campaign. The numbers above are this ad group&apos;s.</p>}
          <GaChart points={points} primary={chart[0]} secondary={chart[1]} currency={currency} />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        {!campaign ? (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <p className="text-sm font-bold">Campaigns</p>
              <button type="button" onClick={() => setView("campaigns")} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                All campaigns <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <CampaignBars onOpen={(id) => setScope({ campaignId: id }, "overview")} />
          </Card>
        ) : (
          <TopSearchTerms />
        )}
        <div className="space-y-4">
          <ScoreCard />
          <Insights />
        </div>
      </div>
    </div>
  );
}

function CampaignBars({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, range, currency } = useGa();
  const rows = data.campaigns
    .filter((c) => c.status !== "REMOVED")
    .map((c) => ({ c, m: derive(campaignBase(data, c.id, range)) }))
    .sort((a, b) => b.m.cost - a.m.cost);
  const max = Math.max(1, ...rows.map((r) => r.m.cost));
  return (
    <div className="divide-y divide-border/40">
      {rows.map(({ c, m }) => (
        <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left hover:bg-muted/30 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_88px_70px]">
          <span className="flex min-w-0 items-center gap-2">
            <StatusDot status={c.status} />
            <span className="truncate text-xs font-semibold">{c.name}</span>
            <span className="shrink-0 rounded bg-muted px-1 text-[9px] font-semibold uppercase text-muted-foreground">{CAMPAIGN_TYPES[c.type].short}</span>
          </span>
          <span className="hidden h-2 overflow-hidden rounded-full bg-muted md:block">
            <span className="block h-full rounded-full bg-gradient-to-r from-[#400095] to-[#F76D01]" style={{ width: `${(m.cost / max) * 100}%` }} />
          </span>
          <span className="text-right text-xs font-semibold tabular-nums">{money(m.cost, currency)}</span>
          <span className={cn("hidden text-right text-xs font-bold tabular-nums md:block", m.roas >= 3 ? "text-emerald-600" : m.roas >= 1.5 ? "text-amber-600" : m.cost ? "text-red-600" : "text-muted-foreground")}>
            {m.cost ? `${m.roas.toFixed(2)}x` : "—"}
          </span>
        </button>
      ))}
    </div>
  );
}

/** A campaign that is the base of a running experiment says so; the experiment itself lives under Experiments. */
function ExperimentNote({ campaignId }: { campaignId: string }) {
  const { data } = useGa();
  const running = data.experiments.filter((e) => e.baseCampaignId === campaignId && e.status === "RUNNING");
  if (!running.length) return null;
  return (
    <div className="space-y-1.5">
      {running.map((e) => (
        <p key={e.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs">
          <FlaskConical className="h-3.5 w-3.5 text-sky-600" />
          <span className="font-semibold">Running in an experiment:</span> {e.name}
          <span className="text-muted-foreground">· {e.change} · {e.split}% of traffic · ends {e.endDate}</span>
        </p>
      ))}
    </div>
  );
}

function CampaignSummary() {
  const { data, campaign, currency } = useGa();
  const setView = useGoogleAds((s) => s.setView);
  if (!campaign) return null;
  const budget = data.budgets.find((b) => b.id === campaign.budgetId);
  return (
    <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
          <StatusDot status={campaign.status} /> {campaign.status === "ENABLED" ? "Enabled" : campaign.status === "PAUSED" ? "Paused" : "Removed"}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Daily budget</p>
        <p className="mt-0.5 text-sm font-semibold">{budget ? money(budget.amount, currency) : "—"}</p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Bid strategy</p>
        <p className="mt-0.5 text-sm font-semibold">
          {BIDDING[campaign.bidding.type].label}
          {campaign.bidding.targetCpa ? ` · ${money(campaign.bidding.targetCpa, currency)}` : ""}
          {campaign.bidding.targetRoas ? ` · ${Math.round(campaign.bidding.targetRoas * 100)}%` : ""}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Locations</p>
        <p className="mt-0.5 text-sm font-semibold">{campaign.locations.filter((l) => !l.excluded).map((l) => l.name).join(", ") || "All"}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {campaign.servingIssues.map((s) => (
          <Pill key={s} tone={SERVING_ISSUES[s].tone === "bad" ? "bad" : SERVING_ISSUES[s].tone === "warn" ? "warn" : "info"}>
            {SERVING_ISSUES[s].label}
          </Pill>
        ))}
      </div>
      <button type="button" onClick={() => setView("settings")} className="ml-auto text-[11px] font-semibold text-[#400095] hover:underline dark:text-violet-300">
        Edit settings
      </button>
    </Card>
  );
}

/** Inside an ad group: what it is and holds, with a link to its settings. */
function AdGroupSummary() {
  const { data, adGroup, currency } = useGa();
  const setView = useGoogleAds((s) => s.setView);
  if (!adGroup) return null;
  const keywords = data.keywords.filter((k) => k.adGroupId === adGroup.id && k.status !== "REMOVED").length;
  const ads = data.ads.filter((a) => a.adGroupId === adGroup.id && a.status !== "REMOVED").length;
  const facts = [
    ["Status", adGroup.status === "ENABLED" ? "Enabled" : adGroup.status === "PAUSED" ? "Paused" : "Removed"],
    ["Default max. CPC", adGroup.defaultCpcBid ? money(adGroup.defaultCpcBid, currency) : "—"],
    ["Keywords", String(keywords)],
    ["Ads", String(ads)],
  ];
  return (
    <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
      {facts.map(([k, v]) => (
        <div key={k}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
            {k === "Status" && <StatusDot status={adGroup.status} />} {v}
          </p>
        </div>
      ))}
      <button type="button" onClick={() => setView("adGroupSettings")} className="ml-auto text-[11px] font-semibold text-[#400095] hover:underline dark:text-violet-300">
        Ad group settings
      </button>
    </Card>
  );
}

function TopSearchTerms() {
  const { data, range, currency, campaign, adGroup } = useGa();
  const setView = useGoogleAds((s) => s.setView);
  // Campaign types whose searches Google reports as search terms.
  const hasTerms = !campaign || ["SEARCH", "SHOPPING", "PERFORMANCE_MAX"].includes(campaign.type);
  const terms = data.searchTerms
    .filter((t) => (!campaign || t.campaignId === campaign.id) && (!adGroup || t.adGroupId === adGroup.id))
    .map((t) => ({ t, m: derive(searchTermBase(data, t.id, range)) }))
    .sort((a, b) => b.m.cost - a.m.cost)
    .slice(0, 8);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <p className="text-sm font-bold">Top search terms</p>
        <button type="button" onClick={() => setView("searchTerms")} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
          All search terms <ArrowRight className="h-3 w-3" />
        </button>
      </div>
      {terms.length ? (
        <div className="divide-y divide-border/40">
          {terms.map(({ t, m }) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
              <span className="min-w-0 flex-1 truncate font-medium">{t.text}</span>
              <span className="tabular-nums text-muted-foreground">{money(m.cost, currency)}</span>
              <span className={cn("w-16 text-right font-semibold tabular-nums", m.conversions < 0.5 ? "text-red-600" : "text-emerald-600")}>{m.conversions.toFixed(1)} conv.</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">
          {hasTerms ? "No search terms in this period: the ads got no clicks." : "No search terms for this campaign type."}
        </p>
      )}
    </Card>
  );
}

function ScoreCard() {
  const { data } = useGa();
  const setView = useGoogleAds((s) => s.setView);
  const score = data.account.optimizationScore;
  const recs = data.recommendations.filter((r) => r.status === "ACTIVE");
  const uplift = recs.reduce((s, r) => s + r.scoreUplift, 0);
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
          <circle cx="32" cy="32" r={r} fill="none" stroke="#400095" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * score} ${c}`} className="dark:stroke-violet-400" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" /> Optimization score
          </p>
          <p className="text-2xl font-black tabular-nums">{(score * 100).toFixed(1)}%</p>
          <p className="text-[11px] text-muted-foreground">
            {recs.length} recommendations · up to +{uplift.toFixed(1)} pts
          </p>
        </div>
      </div>
      <button type="button" onClick={() => setView("recommendations")} className="mt-3 w-full rounded-lg border border-border/70 py-1.5 text-[11px] font-semibold hover:bg-muted">
        View recommendations
      </button>
    </Card>
  );
}

function Insights() {
  const { data, range, currency, campaign } = useGa();
  const items = useMemo(() => {
    const out: { icon: LucideIcon; tone: string; title: string; body: string; prompt: string }[] = [];
    const inScope = <T extends { campaignId: string }>(x: T) => !campaign || x.campaignId === campaign.id;
    const wasted = data.searchTerms
      .filter((t) => t.status === "NONE" && t.adGroupId && inScope(t))
      .map((t) => derive(searchTermBase(data, t.id, range)))
      .filter((m) => m.cost > 8 && m.conversions < 0.5);
    const wastedCost = wasted.reduce((s, m) => s + m.cost, 0);
    if (wasted.length)
      out.push({ icon: Ban, tone: "text-red-600 bg-red-500/10", title: `${money(wastedCost, currency)} on non-converting searches`, body: `${wasted.length} search terms spent with zero conversions.`, prompt: "Where am I wasting budget?" });
    const limited = data.campaigns.filter((c) => c.status === "ENABLED" && c.servingIssues.includes("LIMITED_BY_BUDGET") && (!campaign || c.id === campaign.id));
    if (limited.length)
      out.push({ icon: Wallet, tone: "text-amber-600 bg-amber-500/10", title: `${limited.length === 1 ? limited[0].name : `${limited.length} campaigns`} limited by budget`, body: "Converting well but missing impressions every day.", prompt: "Should I move budget between campaigns?" });
    const adGroupIds = new Set(data.adGroups.filter((g) => inScope(g)).map((g) => g.id));
    const disapproved = data.ads.filter((a) => a.policy === "DISAPPROVED" && a.status === "ENABLED" && adGroupIds.has(a.adGroupId));
    if (disapproved.length)
      out.push({ icon: FileWarning, tone: "text-red-600 bg-red-500/10", title: `${disapproved.length} disapproved ad${disapproved.length > 1 ? "s" : ""}`, body: "Not serving until the copy is fixed.", prompt: "Fix my disapproved ads" });
    const poor = data.ads.filter((a) => a.adStrength === "POOR" && a.status === "ENABLED" && adGroupIds.has(a.adGroupId));
    if (poor.length)
      out.push({ icon: AlertTriangle, tone: "text-amber-600 bg-amber-500/10", title: `${poor.length} ad${poor.length > 1 ? "s" : ""} with Poor strength`, body: "More unique headlines would help Google serve better combinations.", prompt: "Write better ads for my weakest ad group" });
    const total = derive(accountBase(data, range, campaign ? [campaign.id] : undefined));
    const before = derive(accountBase(data, previousRange(range), campaign ? [campaign.id] : undefined));
    const d = delta(total.conversionsValue, before.conversionsValue);
    if (d !== null && d > 0.05)
      out.push({ icon: TrendingUp, tone: "text-emerald-600 bg-emerald-500/10", title: `Conversion value up ${(d * 100).toFixed(0)}%`, body: "Compared with the previous period.", prompt: "How did my account perform in the last 30 days?" });
    return out;
  }, [data, range, currency, campaign]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <Sparkles className="h-4 w-4 text-[#F76D01]" />
        <p className="text-sm font-bold">Agent insights</p>
      </div>
      {items.length ? (
        <div className="divide-y divide-border/40">
          {items.map((it) => (
            <div key={it.title} className="flex gap-3 px-4 py-3">
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", it.tone)}>
                <it.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold leading-snug">{it.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{it.body}</p>
                <button type="button" onClick={() => runAgentTurn(it.prompt)} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#400095] hover:underline dark:text-violet-300">
                  <Bot className="h-3 w-3" /> Ask the agent
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nothing needs attention right now.</p>
      )}
    </Card>
  );
}
