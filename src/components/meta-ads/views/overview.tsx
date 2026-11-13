"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Bot, Gauge, Lightbulb, ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_BTN, Card, Delta, EmptyState, ViewHeader } from "@/components/google-ads/ga-ui";
import { ADVANTAGE_STATES, BID_STRATEGIES, OBJECTIVES } from "@/lib/meta-ads/constants";
import { opportunityScore } from "@/lib/meta-ads/analytics";
import { runAgentTurn } from "@/lib/meta-ads/agent-runner";
import { METRICS, accountBase, adSetBase, campaignBase, dailySeries, delta, derive, formatMetric, money, previousRange } from "@/lib/meta-ads/metrics";
import { useMetaAds } from "@/lib/meta-ads/store";
import type { MetricKey, Objective } from "@/lib/meta-ads/types";
import { MaChart } from "../ma-chart";
import { Note, SummaryStrip, Stat, Section } from "../ma-common";
import { AdvantageBadge, DeliveryPill, LearningBar, StatusDot } from "../ma-ui";
import { scopedAdSets, scopedCampaignIds, useMa } from "../use-ma";

const TILE_CHOICES: MetricKey[] = ["spend", "results", "costPerResult", "purchases", "purchaseValue", "roas", "leads", "cpl", "linkClicks", "ctr", "cpm", "reach", "frequency", "impressions"];

function defaultTiles(objective?: Objective): [MetricKey, MetricKey, MetricKey, MetricKey] {
  switch (objective) {
    case "LEADS":
      return ["spend", "leads", "cpl", "ctr"];
    case "TRAFFIC":
      return ["spend", "linkClicks", "costPerResult", "ctr"];
    case "AWARENESS":
      return ["spend", "reach", "frequency", "cpm"];
    case "ENGAGEMENT":
      return ["spend", "results", "costPerResult", "cpm"];
    default:
      return ["spend", "purchases", "purchaseValue", "roas"];
  }
}

/** The ad set and ad scopes reuse the campaign picture for their parent: numbers are scoped to what the user opened. */
export function OverviewView() {
  const { data, range, currency, campaign, adSet } = useMa();
  const setScope = useMetaAds((s) => s.setScope);
  const setView = useMetaAds((s) => s.setView);
  const objective = campaign?.objective;
  const [tiles, setTiles] = useState<MetricKey[]>(() => defaultTiles(objective));
  const [chart, setChart] = useState<[MetricKey, MetricKey]>(() => [defaultTiles(objective)[0], defaultTiles(objective)[1]]);

  const ids = useMemo(() => scopedCampaignIds(data, campaign), [data, campaign]);
  const now = useMemo(() => (adSet ? derive(adSetBase(data, adSet.id, range)) : derive(accountBase(data, range, ids))), [data, range, ids, adSet]);
  const prev = useMemo(() => (adSet ? derive(adSetBase(data, adSet.id, previousRange(range))) : derive(accountBase(data, previousRange(range), ids))), [data, range, ids, adSet]);
  const points = useMemo(() => dailySeries(data, range, ids), [data, range, ids]);

  if (!data.campaigns.length) {
    return (
      <div>
        <ViewHeader title="Overview" subtitle="This ad account has no campaigns yet." />
        <EmptyState
          icon={Sparkles}
          title="Start your first campaign"
          body="Describe what you sell and the agent drafts the whole campaign: objective, audience, placements and ads. You review it before anything goes live."
          action={
            <button type="button" onClick={() => runAgentTurn("Create an Advantage+ Sales campaign for running shoes in Saudi Arabia with $80/day")} className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold", ACCENT_BTN)}>
              <Bot className="h-3.5 w-3.5" /> Ask the agent to build it
            </button>
          }
        />
      </div>
    );
  }

  const available = TILE_CHOICES.filter((k) => (OBJECTIVES[objective ?? "SALES"].conversions || !METRICS[k].conversion));
  const toggleChart = (key: MetricKey) => setChart(([a, b]) => (a === key ? [b, a] : [key, a]));

  return (
    <div className="space-y-4">
      <ViewHeader
        title={adSet ? adSet.name : campaign ? campaign.name : "Overview"}
        subtitle={adSet ? `Ad set in ${campaign?.name}` : campaign ? `${OBJECTIVES[campaign.objective].label} · ${ADVANTAGE_STATES[campaign.advantageState].label}` : `${data.account.name} · all campaigns`}
      />
      {!campaign && <AccountAlerts />}
      {campaign && !adSet && <CampaignSummary />}
      {adSet && <AdSetSummary />}

      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 border-b border-border/60 md:grid-cols-4">
          {tiles.map((key, i) => {
            const on = chart.includes(key);
            const color = METRICS[key].color;
            return (
              <div key={`${i}-${key}`} className={cn("relative border-border/60 p-4 text-left transition-colors", i > 0 && "md:border-l", i % 2 === 1 && "border-l", i >= 2 && "border-t md:border-t-0", on ? "bg-muted/30" : "hover:bg-muted/20")}>
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
                    {available.filter((k) => k === key || !tiles.includes(k)).map((k) => (
                      <option key={k} value={k}>
                        {k === "results" && objective ? OBJECTIVES[objective].resultLabel : METRICS[k].label}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => toggleChart(key)} title="Show on chart" className="h-3 w-3 rounded-sm border-2 transition-colors" style={{ borderColor: color, background: on ? color : "transparent" }} />
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
        <div className="p-4">{adSet ? <p className="py-6 text-center text-xs text-muted-foreground">Daily trend is tracked per campaign. Open the campaign for the chart.</p> : <MaChart points={points} primary={chart[0]} secondary={chart[1]} currency={currency} />}</div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Section
          title={campaign ? "Ad sets" : "Campaigns"}
          actions={
            <button type="button" onClick={() => setView(campaign ? "adSets" : "campaigns")} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
              {campaign ? "All ad sets" : "All campaigns"} <ArrowRight className="h-3 w-3" />
            </button>
          }
        >
          {campaign ? <AdSetBars /> : <CampaignBars onOpen={(id) => setScope({ campaignId: id }, "overview")} />}
        </Section>
        {!adSet && (
          <div className="space-y-4">
            <ScoreCard />
            <Insights />
          </div>
        )}
      </div>
    </div>
  );
}

function AccountAlerts() {
  const { data, currency } = useMa();
  const setView = useMetaAds((s) => s.setView);
  const issues = data.policyIssues.filter((p) => p.status !== "RESOLVED" && !p.reviewRequested);
  const limited = data.adSets.filter((s) => s.delivery === "LEARNING_LIMITED" && s.status === "ACTIVE");
  const billing = data.billing;
  const nearLimit = billing.spendLimit > 0 && billing.amountSpent / billing.spendLimit > 0.85;
  if (!issues.length && !limited.length && !nearLimit && billing.accountStatus === "ACTIVE") return null;
  return (
    <div className="space-y-2">
      {billing.accountStatus !== "ACTIVE" && (
        <Note tone="bad" icon={<ShieldAlert className="mt-0.5 h-3.5 w-3.5 text-red-600" />}>
          <span className="font-semibold">Ad account is {billing.accountStatus.toLowerCase()}.</span> Ads are not delivering. Fix payment in Meta Billing: <button type="button" onClick={() => setView("billing")} className="font-semibold underline">see Billing</button>.
        </Note>
      )}
      {nearLimit && (
        <Note tone="warn" icon={<AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-600" />}>
          Account spending limit is {Math.round((billing.amountSpent / billing.spendLimit) * 100)}% used ({money(billing.amountSpent, currency)} of {money(billing.spendLimit, currency)}). Ads stop when it is reached. Change it in Meta Billing, the agent cannot.
        </Note>
      )}
      {issues.length > 0 && (
        <Note tone="bad" icon={<ShieldAlert className="mt-0.5 h-3.5 w-3.5 text-red-600" />}>
          <span className="font-semibold">{issues.length} policy {issues.length === 1 ? "issue needs" : "issues need"} attention.</span>{" "}
          <button type="button" onClick={() => setView("accountQuality")} className="font-semibold underline">Open Account quality</button>
        </Note>
      )}
      {limited.length > 0 && (
        <Note tone="warn" icon={<Gauge className="mt-0.5 h-3.5 w-3.5 text-amber-600" />}>
          {limited.length} {limited.length === 1 ? "ad set is" : "ad sets are"} learning limited. <button type="button" onClick={() => runAgentTurn("Why are my ad sets learning limited and how do I fix it?")} className="font-semibold underline">Ask the agent why</button>
        </Note>
      )}
    </div>
  );
}

function CampaignSummary() {
  const { data, campaign, currency } = useMa();
  const setView = useMetaAds((s) => s.setView);
  if (!campaign) return null;
  const sets = scopedAdSets(data, { campaignId: campaign.id });
  const limited = sets.filter((s) => s.delivery === "LEARNING_LIMITED").length;
  const learning = sets.filter((s) => s.delivery === "LEARNING").length;
  return (
    <SummaryStrip>
      <Stat label="Status">
        <span className="flex items-center gap-1.5">
          <StatusDot status={campaign.status} /> {campaign.status === "ACTIVE" ? "Active" : campaign.status === "PAUSED" ? "Paused" : "Archived"}
        </span>
      </Stat>
      <Stat label="Mode">
        <AdvantageBadge state={campaign.advantageState} />
      </Stat>
      <Stat label={campaign.budget ? "Campaign budget (CBO)" : "Budget"}>{campaign.budget ? `${money(campaign.budget.amount, currency)}${campaign.budget.kind === "DAILY" ? "/day" : " lifetime"}` : "Set per ad set"}</Stat>
      <Stat label="Bid strategy">
        {BID_STRATEGIES[campaign.bidStrategy].label}
        {campaign.bidValue ? ` · ${campaign.bidStrategy === "LOWEST_COST_WITH_MIN_ROAS" ? `${campaign.bidValue}x` : money(campaign.bidValue, currency)}` : ""}
      </Stat>
      {campaign.existingCustomerCap !== undefined && <Stat label="Existing customer cap">{Math.round(campaign.existingCustomerCap * 100)}%</Stat>}
      <Stat label="Learning">{learning || limited ? `${learning} learning · ${limited} limited` : "All exited learning"}</Stat>
      <button type="button" onClick={() => setView("settings")} className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
        Campaign settings <ArrowRight className="h-3 w-3" />
      </button>
    </SummaryStrip>
  );
}

function AdSetSummary() {
  const { adSet, currency, campaign } = useMa();
  const setView = useMetaAds((s) => s.setView);
  if (!adSet) return null;
  const budget = adSet.budget ?? campaign?.budget;
  return (
    <SummaryStrip>
      <Stat label="Delivery">
        <DeliveryPill delivery={adSet.delivery} />
      </Stat>
      <Stat label={adSet.budget ? "Ad set budget" : "Budget"}>{budget ? `${money(budget.amount, currency)}${budget.kind === "DAILY" ? "/day" : " lifetime"}${adSet.budget ? "" : " (campaign)"}` : "—"}</Stat>
      <Stat label="Learning">
        <div className="w-40">
          <LearningBar learning={adSet.learning} compact />
        </div>
      </Stat>
      <Stat label="Audience">{adSet.targeting.advantageAudience ? "Advantage+ audience" : `${adSet.targeting.ageMin}–${adSet.targeting.ageMax}, ${adSet.targeting.genders.toLowerCase()}`}</Stat>
      <button type="button" onClick={() => setView("adSetSettings")} className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
        Ad set settings <ArrowRight className="h-3 w-3" />
      </button>
    </SummaryStrip>
  );
}

function CampaignBars({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, range, currency } = useMa();
  const rows = data.campaigns
    .filter((c) => c.status !== "ARCHIVED")
    .map((c) => ({ c, m: derive(campaignBase(data, c.id, range)) }))
    .sort((a, b) => b.m.spend - a.m.spend);
  const max = Math.max(1, ...rows.map((r) => r.m.spend));
  return (
    <div className="divide-y divide-border/40">
      {rows.map(({ c, m }) => (
        <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left hover:bg-muted/30 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_88px_70px]">
          <span className="flex min-w-0 items-center gap-2">
            <StatusDot status={c.status} />
            <span className="truncate text-xs font-semibold">{c.name}</span>
            <span className="shrink-0 rounded bg-muted px-1 text-[9px] font-semibold uppercase text-muted-foreground">{OBJECTIVES[c.objective].label}</span>
          </span>
          <span className="hidden h-2 overflow-hidden rounded-full bg-muted md:block">
            <span className="block h-full rounded-full bg-gradient-to-r from-[#400095] to-[#F76D01]" style={{ width: `${(m.spend / max) * 100}%` }} />
          </span>
          <span className="text-right text-xs font-semibold tabular-nums">{money(m.spend, currency)}</span>
          <span className={cn("hidden text-right text-xs font-bold tabular-nums md:block", !OBJECTIVES[c.objective].conversions ? "text-muted-foreground" : m.roas >= 3 ? "text-emerald-600" : m.roas >= 1.5 ? "text-amber-600" : m.spend ? "text-red-600" : "text-muted-foreground")}>
            {OBJECTIVES[c.objective].conversions && m.spend ? `${m.roas.toFixed(2)}x` : "—"}
          </span>
        </button>
      ))}
    </div>
  );
}

function AdSetBars() {
  const { data, range, currency, scope } = useMa();
  const setScope = useMetaAds((s) => s.setScope);
  const sets = scopedAdSets(data, { campaignId: scope.campaignId });
  const rows = sets.map((s) => ({ s, m: derive(adSetBase(data, s.id, range)) })).sort((a, b) => b.m.spend - a.m.spend);
  const max = Math.max(1, ...rows.map((r) => r.m.spend));
  return (
    <div className="divide-y divide-border/40">
      {rows.map(({ s, m }) => (
        <button key={s.id} type="button" onClick={() => setScope({ campaignId: s.campaignId, adSetId: s.id }, "overview")} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 px-4 py-3 text-left hover:bg-muted/30 md:grid-cols-[minmax(0,1.3fr)_110px_minmax(0,1fr)_88px]">
          <span className="flex min-w-0 items-center gap-2">
            <StatusDot status={s.status} />
            <span className="truncate text-xs font-semibold">{s.name}</span>
          </span>
          <span className="hidden md:block">
            <DeliveryPill delivery={s.delivery} />
          </span>
          <span className="hidden h-2 overflow-hidden rounded-full bg-muted md:block">
            <span className="block h-full rounded-full bg-gradient-to-r from-[#400095] to-[#F76D01]" style={{ width: `${(m.spend / max) * 100}%` }} />
          </span>
          <span className="text-right text-xs font-semibold tabular-nums">{money(m.spend, currency)}</span>
        </button>
      ))}
      {!rows.length && <p className="px-4 py-6 text-center text-xs text-muted-foreground">No ad sets yet.</p>}
    </div>
  );
}

function ScoreCard() {
  const { data } = useMa();
  const setView = useMetaAds((s) => s.setView);
  const score = opportunityScore(data);
  const open = data.opportunities.filter((o) => o.status === "OPEN").length;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">Opportunity score</p>
        <span className={cn("text-2xl font-black tabular-nums", score >= 80 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-red-600")}>{score}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-gradient-to-r from-[#400095] to-[#F76D01]" style={{ width: `${score}%` }} />
      </div>
      <button type="button" onClick={() => setView("opportunities")} className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
        {open} open {open === 1 ? "opportunity" : "opportunities"} <ArrowRight className="h-3 w-3" />
      </button>
    </Card>
  );
}

function Insights() {
  const { data } = useMa();
  const alerts = data.alerts.filter((a) => !a.read).slice(0, 4);
  return (
    <Card className="p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
        <Lightbulb className="h-3.5 w-3.5 text-[#F76D01]" /> Worth a look
      </p>
      {alerts.length ? (
        <ul className="space-y-2.5">
          {alerts.map((a) => (
            <li key={a.id} className="text-xs">
              <p className="font-semibold">{a.title}</p>
              <p className="text-muted-foreground">{a.body}</p>
              {a.prompt && (
                <button type="button" onClick={() => runAgentTurn(a.prompt!)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[#400095] hover:underline dark:text-violet-300">
                  <Bot className="h-3 w-3" /> Ask the agent
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nothing needs attention right now.</p>
      )}
    </Card>
  );
}
