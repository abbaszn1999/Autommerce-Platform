"use client";

import { useMemo } from "react";
import { Bot, Link2, Telescope } from "lucide-react";
import { cn } from "@/lib/utils";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import { EMPTY_BASE, addBase, adBase, derive, money, pct } from "@/lib/google-ads/metrics";
import type { Metrics } from "@/lib/google-ads/types";
import { metricColumns } from "../ga-columns";
import { GaTable, type GaColumn } from "../ga-table";
import { Card, EmptyState, Pill, ViewHeader } from "../ga-ui";
import { useGa } from "../use-ga";

const AGENT_BTN = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-xs font-semibold hover:bg-muted";

function NeedsSearchCampaign({ title }: { title: string }) {
  return (
    <div>
      <ViewHeader title={title} />
      <EmptyState icon={Telescope} title="Open a Search campaign" body="This page reads the campaign's own landing pages and impression share, so it lives inside a Search campaign." />
    </div>
  );
}

// ─── Landing pages ──────────────────────────────────────────────────────────

type PageRow = { url: string; ads: number; base: ReturnType<typeof addBase>; metrics: Metrics; speed: number };

const clean = (url: string) => url.replace(/^https?:\/\//, "").replace(/[?#].*$/, "").replace(/\/$/, "");

/** Demo stand-in for Google's mobile speed score; the real value comes from the landing page report. */
function speedScore(url: string) {
  let h = 0;
  for (const ch of url) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 38 + (h % 58);
}

export function LandingPagesView() {
  const { data, range, currency, campaign } = useGa();
  const rows = useMemo<PageRow[]>(() => {
    if (!campaign) return [];
    const groups = new Set(data.adGroups.filter((g) => g.campaignId === campaign.id).map((g) => g.id));
    const byUrl = new Map<string, PageRow>();
    for (const ad of data.ads.filter((a) => groups.has(a.adGroupId) && a.finalUrl)) {
      const url = clean(ad.finalUrl);
      const cur = byUrl.get(url);
      const base = addBase(cur?.base ?? EMPTY_BASE, adBase(data, ad.id, range));
      byUrl.set(url, { url, ads: (cur?.ads ?? 0) + 1, base, metrics: derive(base), speed: speedScore(url) });
    }
    return [...byUrl.values()];
  }, [data, range, campaign]);
  if (!campaign) return <NeedsSearchCampaign title="Landing pages" />;

  const columns: GaColumn<PageRow>[] = [
    { id: "url", header: "Landing page", label: "Landing page", sticky: true, sortValue: (r) => r.url, render: (r) => <span className="flex items-center gap-2 font-semibold"><Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="block max-w-80 truncate">{r.url}</span></span> },
    { id: "ads", header: "Ads", label: "Ads using it", align: "right", sortValue: (r) => r.ads, render: (r) => r.ads },
    ...metricColumns<PageRow>((r) => r.metrics, currency, { keys: ["clicks", "cost", "conversions", "convRate", "cpa", "roas"] }),
    {
      id: "speed",
      header: "Mobile speed",
      label: "Mobile speed score",
      align: "right",
      sortValue: (r) => r.speed,
      render: (r) => <Pill tone={r.speed >= 75 ? "good" : r.speed >= 50 ? "warn" : "bad"}>{r.speed}</Pill>,
    },
  ];

  return (
    <div>
      <ViewHeader
        title="Landing pages"
        subtitle={`Pages ${campaign.name} sends people to. Slow or low-converting pages waste clicks. To change a page, ask the agent.`}
        actions={<button type="button" onClick={() => runAgentTurn(`Which landing pages in ${campaign.name} are wasting clicks?`)} className={AGENT_BTN}><Bot className="h-3.5 w-3.5" /> Analyse with agent</button>}
      />
      <GaTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.url}
        defaultSort={{ id: "cost", dir: "desc" }}
        empty={<p className="px-4 py-6 text-center text-xs text-muted-foreground">No landing pages yet. They appear once the campaign has ads.</p>}
      />
    </div>
  );
}

// ─── Impression share ──────────────────────────────────────────────────────

export function ImpressionShareView() {
  const { data, range, currency, campaign } = useGa();
  const stats = useMemo(() => {
    if (!campaign) return null;
    const points = (data.daily[campaign.id] ?? []).filter((p) => p.date >= range.start && p.date <= range.end);
    const withShare = points.filter((p) => p.searchImprShare !== undefined);
    if (!withShare.length) return null;
    const share = withShare.reduce((s, p) => s + (p.searchImprShare ?? 0), 0) / withShare.length;
    const lost = Math.max(0, 1 - share);
    // Demo split: the closer the campaign gets to its daily budget, the more of the loss is budget.
    const budget = data.budgets.find((b) => b.id === campaign.budgetId)?.amount ?? 0;
    const avgCost = points.reduce((s, p) => s + p.cost, 0) / Math.max(1, points.length);
    const util = budget ? Math.min(1, avgCost / budget) : 0;
    const lostBudget = lost * Math.max(0, util - 0.5) * 2;
    return { share, lost, lostBudget, lostRank: lost - lostBudget, days: withShare, budget, avgCost };
  }, [data, range, campaign]);
  if (!campaign) return <NeedsSearchCampaign title="Impression share" />;

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Impression share"
        subtitle="How often your ads showed compared with how often they could have, and why they didn't."
        actions={<button type="button" onClick={() => runAgentTurn(`Why am I losing impression share on ${campaign.name}?`)} className={AGENT_BTN}><Bot className="h-3.5 w-3.5" /> Why am I losing share?</button>}
      />
      {!stats ? (
        <EmptyState icon={Telescope} title="No impression share yet" body="Google reports it for Search campaigns once they have served enough impressions." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-[11px] font-semibold text-muted-foreground">Search impression share</p>
              <p className="mt-1 text-2xl font-black tabular-nums">{pct(stats.share, 0)}</p>
              <p className="text-[11px] text-muted-foreground">of eligible searches showed your ad</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-semibold text-muted-foreground">Lost to budget</p>
              <p className={cn("mt-1 text-2xl font-black tabular-nums", stats.lostBudget > 0.1 && "text-amber-600")}>{pct(stats.lostBudget, 0)}</p>
              <p className="text-[11px] text-muted-foreground">budget ran out; avg {money(stats.avgCost, currency)} of {money(stats.budget, currency)} a day</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-semibold text-muted-foreground">Lost to rank</p>
              <p className={cn("mt-1 text-2xl font-black tabular-nums", stats.lostRank > 0.15 && "text-amber-600")}>{pct(stats.lostRank, 0)}</p>
              <p className="text-[11px] text-muted-foreground">bids or ad quality too low to win the auction</p>
            </Card>
          </div>
          <Card className="p-4">
            <p className="mb-3 text-sm font-bold">Impression share by day</p>
            <div className="flex h-32 items-end gap-0.5">
              {stats.days.map((p) => (
                <span key={p.date} title={`${p.date}: ${pct(p.searchImprShare ?? 0, 0)}`} className="flex-1 rounded-t bg-[#400095]/70 dark:bg-violet-500/70" style={{ height: `${Math.round((p.searchImprShare ?? 0) * 100)}%` }} />
              ))}
            </div>
            <p className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>{stats.days[0]?.date}</span>
              <span>{stats.days[stats.days.length - 1]?.date}</span>
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
