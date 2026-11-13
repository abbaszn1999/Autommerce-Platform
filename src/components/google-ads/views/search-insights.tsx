"use client";

import { useMemo } from "react";
import { Bot, Link2, Telescope } from "lucide-react";
import { cn } from "@/lib/utils";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import { productsInGroup } from "@/lib/google-ads/analytics";
import { EMPTY_BASE, addBase, adBase, derive, money, pct } from "@/lib/google-ads/metrics";
import type { Metrics, Product } from "@/lib/google-ads/types";
import { metricColumns } from "../ga-columns";
import { GaTable, type GaColumn } from "../ga-table";
import { Card, EmptyState, Pill, ViewHeader } from "../ga-ui";
import { useGa } from "../use-ga";
import { SegmentNotice, hasNotice, useLiveCells } from "../use-segment";
import { rowsFromCells } from "@/lib/google-ads/live-segments";
import { useGoogleAds } from "@/lib/google-ads/store";

const AGENT_BTN = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-xs font-semibold hover:bg-muted";

function NeedsSearchCampaign({ title, kind = "Search" }: { title: string; kind?: string }) {
  return (
    <div>
      <ViewHeader title={title} />
      <EmptyState icon={Telescope} title={`Open a ${kind} campaign`} body="This page reads one campaign's own data, so it lives inside the campaign." />
    </div>
  );
}

// ─── Landing pages ──────────────────────────────────────────────────────────

/** `speed` is out of 100 so one scale colours it; `speedText` is what is shown. Empty when Google has no score. */
type PageRow = { url: string; ads: number; base: ReturnType<typeof addBase>; metrics: Metrics; speed: number | null; speedText: string };

const clean = (url: string) => url.replace(/^https?:\/\//, "").replace(/[?#].*$/, "").replace(/\/$/, "");

/** Demo stand-in for Google's mobile speed score; the real value comes from the landing page report. */
function speedScore(url: string) {
  let h = 0;
  for (const ch of url) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 38 + (h % 58);
}

export function LandingPagesView() {
  const { data, range, currency, campaign } = useGa();
  const live = useGoogleAds((s) => s.mode === "live");
  const load = useLiveCells(live && campaign ? "landing" : null);
  const rows = useMemo<PageRow[]>(() => {
    if (!campaign) return [];
    const groups = new Set(data.adGroups.filter((g) => g.campaignId === campaign.id).map((g) => g.id));
    if (live) {
      const adsUsing = (url: string) => data.ads.filter((a) => groups.has(a.adGroupId) && a.finalUrl && clean(a.finalUrl) === clean(url)).length;
      return rowsFromCells("landing", load.cells ?? [], [campaign.id]).map((r) => ({
        url: clean(r.key),
        ads: adsUsing(r.key),
        base: r.base,
        metrics: r.metrics,
        speed: r.speed ? r.speed * 10 : null,
        speedText: r.speed ? `${r.speed}/10` : "—",
      }));
    }
    const byUrl = new Map<string, PageRow>();
    for (const ad of data.ads.filter((a) => groups.has(a.adGroupId) && a.finalUrl)) {
      const url = clean(ad.finalUrl);
      const cur = byUrl.get(url);
      const base = addBase(cur?.base ?? EMPTY_BASE, adBase(data, ad.id, range));
      const speed = speedScore(url);
      byUrl.set(url, { url, ads: (cur?.ads ?? 0) + 1, base, metrics: derive(base), speed, speedText: String(speed) });
    }
    return [...byUrl.values()];
  }, [data, range, campaign, live, load.cells]);
  if (!campaign) return <NeedsSearchCampaign title="Landing pages" kind="Search, Display or Demand Gen" />;

  const columns: GaColumn<PageRow>[] = [
    { id: "url", header: "Landing page", label: "Landing page", sticky: true, sortValue: (r) => r.url, render: (r) => <span className="flex items-center gap-2 font-semibold"><Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="block max-w-80 truncate">{r.url}</span></span> },
    { id: "ads", header: "Ads", label: "Ads using it", align: "right", sortValue: (r) => r.ads, render: (r) => r.ads },
    ...metricColumns<PageRow>((r) => r.metrics, currency, { keys: ["clicks", "cost", "conversions", "convRate", "cpa", "roas"] }),
    {
      id: "speed",
      header: "Mobile speed",
      label: "Mobile speed score",
      align: "right",
      sortValue: (r) => r.speed ?? -1,
      render: (r) => (r.speed === null ? <span className="text-muted-foreground">—</span> : <Pill tone={r.speed >= 75 ? "good" : r.speed >= 50 ? "warn" : "bad"}>{r.speedText}</Pill>),
    },
  ];

  return (
    <div>
      <ViewHeader
        title="Landing pages"
        subtitle={`Pages ${campaign.name} sends people to. Slow or low-converting pages waste clicks. To change a page, ask the agent.`}
        actions={<button type="button" onClick={() => runAgentTurn(`Which landing pages in ${campaign.name} are wasting clicks?`)} className={AGENT_BTN}><Bot className="h-3.5 w-3.5" /> Analyse with agent</button>}
      />
      {live && hasNotice(load) ? (
        <Card className="p-4"><SegmentNotice load={load} /></Card>
      ) : (
        <GaTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.url}
          defaultSort={{ id: "cost", dir: "desc" }}
          empty={<p className="px-4 py-6 text-center text-xs text-muted-foreground">{live ? "Google Ads has no landing page data for this period." : "No landing pages yet. They appear once the campaign has ads."}</p>}
        />
      )}
    </div>
  );
}

// ─── Impression share ──────────────────────────────────────────────────────

type ShareStats = { share: number; lost: number; lostBudget: number; lostRank: number; days: { date: string; searchImprShare?: number }[]; budget: number; avgCost: number };

/** Search impression share for one campaign over the range (demo split of the loss into budget and rank). */
function shareStats(data: ReturnType<typeof useGa>["data"], campaign: { id: string; budgetId: string }, range: { start: string; end: string }): ShareStats | null {
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
}

/** Account level: one row per Search or Shopping campaign. */
function AccountImpressionShare() {
  const { data, range } = useGa();
  const rows = data.campaigns
    .filter((c) => (c.type === "SEARCH" || c.type === "SHOPPING") && c.status !== "REMOVED")
    .map((c) => ({ campaign: c, stats: shareStats(data, c, range) }))
    .filter((r): r is { campaign: typeof r.campaign; stats: ShareStats } => !!r.stats);
  const columns: GaColumn<(typeof rows)[number]>[] = [
    { id: "campaign", header: "Campaign", label: "Campaign", sticky: true, sortValue: (r) => r.campaign.name, render: (r) => <span className="block max-w-64 truncate font-semibold">{r.campaign.name}</span> },
    { id: "share", header: "Search impr. share", label: "Search impression share", align: "right", sortValue: (r) => r.stats.share, render: (r) => pct(r.stats.share, 0) },
    { id: "budget", header: "Lost to budget", label: "Lost to budget", align: "right", sortValue: (r) => r.stats.lostBudget, render: (r) => <span className={cn(r.stats.lostBudget > 0.1 && "font-semibold text-amber-600")}>{pct(r.stats.lostBudget, 0)}</span> },
    { id: "rank", header: "Lost to rank", label: "Lost to rank", align: "right", sortValue: (r) => r.stats.lostRank, render: (r) => <span className={cn(r.stats.lostRank > 0.15 && "font-semibold text-amber-600")}>{pct(r.stats.lostRank, 0)}</span> },
  ];
  return (
    <div>
      <ViewHeader
        title="Impression share"
        subtitle="How often each Search and Shopping campaign showed compared with how often it could have, and why it didn't."
        actions={<button type="button" onClick={() => runAgentTurn("Which campaigns are losing the most impression share and why?")} className={AGENT_BTN}><Bot className="h-3.5 w-3.5" /> Analyse with agent</button>}
      />
      <GaTable rows={rows} columns={columns} rowKey={(r) => r.campaign.id} exportName="impression-share" defaultSort={{ id: "share", dir: "asc" }} empty="No Search or Shopping campaign has impression share yet." />
    </div>
  );
}

export function ImpressionShareView() {
  const { data, range, currency, campaign } = useGa();
  const stats = useMemo(() => (campaign ? shareStats(data, campaign, range) : null), [data, range, campaign]);
  if (!campaign) return <AccountImpressionShare />;

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

// ─── Price competitiveness (Shopping) ─────────────────────────────────────

/** Products a Shopping campaign includes: everything its product groups don't exclude. */
export function campaignProducts(data: ReturnType<typeof useGa>["data"], campaignId: string): Product[] {
  const roots = data.listingGroups.filter((g) => g.campaignId === campaignId && !g.parentId && !g.excluded);
  if (!roots.length) return data.products;
  const ids = new Set(roots.flatMap((r) => productsInGroup(data, r.id).map((p) => p.id)));
  return data.products.filter((p) => ids.has(p.id));
}

export function PriceCompetitivenessView() {
  const { data, currency, campaign } = useGa();
  if (!campaign) return <NeedsSearchCampaign title="Price competitiveness" kind="Shopping" />;
  const rows = campaignProducts(data, campaign.id).filter((p) => p.benchmarkPrice);
  const diff = (p: Product) => ((p.salePrice ?? p.price) - p.benchmarkPrice!) / p.benchmarkPrice!;

  const columns: GaColumn<Product>[] = [
    { id: "title", header: "Product", label: "Product", sticky: true, sortValue: (p) => p.title, render: (p) => <span><span className="block max-w-72 truncate font-semibold">{p.title}</span><span className="text-[10px] text-muted-foreground">{p.id} · {p.productType}</span></span> },
    { id: "price", header: "Your price", label: "Your price", align: "right", sortValue: (p) => p.salePrice ?? p.price, render: (p) => money(p.salePrice ?? p.price, currency) },
    { id: "market", header: "Market price", label: "Market price", align: "right", sortValue: (p) => p.benchmarkPrice!, render: (p) => <span className="text-muted-foreground">{money(p.benchmarkPrice!, currency)}</span> },
    { id: "diff", header: "Difference", label: "Difference", align: "right", sortValue: diff, render: (p) => <span className={cn("font-semibold tabular-nums", diff(p) > 0.03 ? "text-red-600" : diff(p) < -0.03 ? "text-emerald-600" : "text-muted-foreground")}>{diff(p) > 0 ? "+" : ""}{(diff(p) * 100).toFixed(0)}%</span> },
    { id: "position", header: "Position", label: "Position", render: (p) => <Pill tone={diff(p) > 0.03 ? "bad" : diff(p) < -0.03 ? "good" : "neutral"}>{diff(p) > 0.03 ? "Above market" : diff(p) < -0.03 ? "Below market" : "In line"}</Pill> },
  ];

  return (
    <div>
      <ViewHeader
        title="Price competitiveness"
        subtitle={
          <span>
            <Pill tone="warn">Sample data</Pill> How the prices of {campaign.name}&apos;s products compare with the market average. Market prices come from Merchant Center reports, which are not connected yet.
          </span>
        }
        actions={<button type="button" onClick={() => runAgentTurn("Which products are priced above the market and losing clicks?")} className={AGENT_BTN}><Bot className="h-3.5 w-3.5" /> Analyse with agent</button>}
      />
      <GaTable
        rows={rows}
        columns={columns}
        rowKey={(p) => p.id}
        defaultSort={{ id: "diff", dir: "desc" }}
        empty={<p className="px-4 py-6 text-center text-xs text-muted-foreground">No market price data yet. Merchant Center needs enough product views to compare.</p>}
      />
    </div>
  );
}