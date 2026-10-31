"use client";

import { useMemo } from "react";
import { Bot, Globe, Layers, ShieldOff, Telescope } from "lucide-react";
import { cn } from "@/lib/utils";
import { contentMetrics, segmentRows, type SegmentRow } from "@/lib/google-ads/analytics";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import { EMPTY_BASE, addBase, assetGroupBase, campaignBase, derive, money, searchTermBase } from "@/lib/google-ads/metrics";
import type { AssetGroup, AssetRating, ContentTarget, Metrics } from "@/lib/google-ads/types";
import { metricColumns } from "../ga-columns";
import { GaTable, type GaColumn } from "../ga-table";
import { Card, EmptyState, Pill, ViewHeader } from "../ga-ui";
import { useGa } from "../use-ga";

const AGENT_BTN = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-xs font-semibold hover:bg-muted";

function NeedsCampaign({ title, kind = "Performance Max" }: { title: string; kind?: string }) {
  return (
    <div>
      <ViewHeader title={title} />
      <EmptyState icon={Telescope} title={`Open a ${kind} campaign`} body={`These pages explain what Google did with a ${kind} campaign, so they live inside the campaign.`} />
    </div>
  );
}

// ─── Channels ───────────────────────────────────────────────────────────────

export function ChannelsView() {
  const { data, range, currency, campaign, assetGroup } = useGa();
  const rows = useMemo(() => {
    if (!campaign) return [];
    const all = segmentRows(data, range, "network", [campaign.id]);
    if (!assetGroup) return all;
    // Inside an asset group: the group's share of the campaign's spend, split the same way across channels.
    const k = Math.min(1, assetGroupBase(data, assetGroup.id, range).cost / (campaignBase(data, campaign.id, range).cost || 1));
    return all.map((r) => {
      const base = { impressions: r.base.impressions * k, clicks: r.base.clicks * k, cost: r.base.cost * k, conversions: r.base.conversions * k, conversionsValue: r.base.conversionsValue * k };
      return { ...r, base, metrics: derive(base) };
    });
  }, [data, range, campaign, assetGroup]);
  if (!campaign) return <NeedsCampaign title="Channels" kind="Performance Max or Demand Gen" />;
  const demandGen = campaign.type === "DEMAND_GEN";
  const total = rows.reduce((s, r) => s + r.base.cost, 0) || 1;

  const columns: GaColumn<SegmentRow>[] = [
    { id: "channel", header: "Channel", label: "Channel", sticky: true, sortValue: (r) => r.label, render: (r) => <span className="font-semibold">{r.label}</span> },
    {
      id: "share",
      header: "Share of spend",
      label: "Share of spend",
      sortValue: (r) => r.base.cost,
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-[#400095] dark:bg-violet-500" style={{ width: `${Math.round((r.base.cost / total) * 100)}%` }} />
          </span>
          <span className="tabular-nums text-muted-foreground">{Math.round((r.base.cost / total) * 100)}%</span>
        </span>
      ),
    },
    ...metricColumns<SegmentRow>((r) => r.metrics, currency, { keys: ["impressions", "clicks", "cost", "conversions", "cpa", "roas"] }),
  ];

  return (
    <div>
      <ViewHeader
        title="Channels"
        subtitle={demandGen ? `Where ${campaign.name} spent its budget, by surface. You choose the allowed channels per ad group; Google decides the split.` : `Where ${campaign.name} spent its budget. Google decides the split; this shows what it chose.`}
        actions={<button type="button" onClick={() => runAgentTurn(demandGen ? "Which Demand Gen channels are working and which are wasting money?" : "Which channels is my Performance Max campaign wasting money on?")} className={AGENT_BTN}><Bot className="h-3.5 w-3.5" /> Analyse with agent</button>}
      />
      <GaTable rows={rows} columns={columns} rowKey={(r) => r.key} defaultSort={{ id: "cost", dir: "desc" }} />
    </div>
  );
}

// ─── Search categories ─────────────────────────────────────────────────────

type CategoryRow = { category: string; terms: string[]; base: ReturnType<typeof addBase>; metrics: Metrics };

const words = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean);

/** Groups the searches Google matched under the search theme they share the most words with. */
function categorise(themes: string[], text: string) {
  const w = new Set(words(text));
  let best = "";
  let score = 0;
  for (const theme of themes) {
    const overlap = words(theme).filter((x) => w.has(x)).length;
    if (overlap > score) {
      best = theme;
      score = overlap;
    }
  }
  return score ? best : "Other searches";
}

export function SearchCategoriesView() {
  const { data, range, currency, campaign } = useGa();
  const rows = useMemo<CategoryRow[]>(() => {
    if (!campaign) return [];
    const themes = [...new Set(data.assetGroups.filter((g) => g.campaignId === campaign.id).flatMap((g) => g.searchThemes))];
    const groups = new Map<string, CategoryRow>();
    for (const t of data.searchTerms.filter((x) => x.campaignId === campaign.id)) {
      const cat = categorise(themes, t.text);
      const base = addBase(groups.get(cat)?.base ?? EMPTY_BASE, searchTermBase(data, t.id, range));
      groups.set(cat, { category: cat, terms: [...(groups.get(cat)?.terms ?? []), t.text], base, metrics: derive(base) });
    }
    return [...groups.values()];
  }, [data, range, campaign]);
  if (!campaign) return <NeedsCampaign title="Search categories" />;

  const columns: GaColumn<CategoryRow>[] = [
    { id: "category", header: "Search category", label: "Search category", sticky: true, sortValue: (r) => r.category, render: (r) => <span className="font-semibold">{r.category}</span> },
    { id: "examples", header: "Example searches", label: "Example searches", render: (r) => <span className="block max-w-72 truncate text-muted-foreground">{r.terms.slice(0, 3).join(" · ")}{r.terms.length > 3 ? ` · +${r.terms.length - 3}` : ""}</span> },
    ...metricColumns<CategoryRow>((r) => r.metrics, currency, { keys: ["impressions", "clicks", "cost", "conversions", "roas"] }),
  ];

  return (
    <div>
      <ViewHeader
        title="Search categories"
        subtitle="Groups of searches Google matched to this campaign, based on your search themes. The searches themselves are under Search terms."
        actions={<button type="button" onClick={() => runAgentTurn("Which search categories should I block or expand in my Performance Max campaign?")} className={AGENT_BTN}><Bot className="h-3.5 w-3.5" /> Analyse with agent</button>}
      />
      <GaTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.category}
        defaultSort={{ id: "cost", dir: "desc" }}
        empty={<p className="px-4 py-6 text-center text-xs text-muted-foreground">No search data yet. Google needs a few weeks of traffic to report categories.</p>}
      />
    </div>
  );
}

// ─── Asset combinations ────────────────────────────────────────────────────

const RANK: Record<AssetRating["rating"], number> = { BEST: 0, GOOD: 1, LEARNING: 2, LOW: 3 };
const RATING: Record<AssetRating["rating"], { label: string; tone: "good" | "info" | "warn" | "neutral" }> = {
  BEST: { label: "Best", tone: "good" },
  GOOD: { label: "Good", tone: "info" },
  LEARNING: { label: "Learning", tone: "neutral" },
  LOW: { label: "Low", tone: "warn" },
};
const KIND_LABEL: Record<AssetRating["kind"], string> = { HEADLINE: "Headline", LONG_HEADLINE: "Long headline", DESCRIPTION: "Description", IMAGE: "Image", VIDEO: "Video", LOGO: "Logo" };
// How many of each asset a combination uses: Google builds ads from a few of each.
const COMBO: [AssetRating["kind"], number][] = [["HEADLINE", 3], ["LONG_HEADLINE", 1], ["DESCRIPTION", 2], ["IMAGE", 1]];

function bestOf(ratings: AssetRating[], kind: AssetRating["kind"], n: number) {
  return ratings.filter((r) => r.kind === kind && r.rating !== "LOW").sort((a, b) => RANK[a.rating] - RANK[b.rating]).slice(0, n);
}

function GroupCombination({ group }: { group: AssetGroup }) {
  const ratings = group.assetPerformance ?? [];
  const low = ratings.filter((r) => r.rating === "LOW");
  const count = (k: AssetRating["rating"]) => ratings.filter((r) => r.rating === k).length;
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-bold">{group.name}</p>
        <Pill tone={group.adStrength === "EXCELLENT" || group.adStrength === "GOOD" ? "good" : "warn"}>Ad strength: {group.adStrength.toLowerCase()}</Pill>
        <span className="ml-auto flex gap-1.5 text-[11px]">
          {(Object.keys(RATING) as AssetRating["rating"][]).map((k) => (
            <Pill key={k} tone={RATING[k].tone}>{RATING[k].label} {count(k)}</Pill>
          ))}
        </span>
      </div>
      {!ratings.length ? (
        <p className="text-xs text-muted-foreground">Google hasn&apos;t rated these assets yet. Ratings appear after the group has served enough.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Top combination</p>
            <div className="divide-y divide-border/40 rounded-xl border border-border/60">
              {COMBO.flatMap(([kind, n]) => bestOf(ratings, kind, n)).map((r, i) => (
                <div key={`${r.kind}-${r.text}-${i}`} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="w-24 shrink-0 text-[10px] text-muted-foreground">{KIND_LABEL[r.kind]}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{r.text}</span>
                  <Pill tone={RATING[r.rating].tone}>{RATING[r.rating].label}</Pill>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Low-rated, worth replacing</p>
            {low.length ? (
              <div className="space-y-1.5">
                {low.map((r, i) => (
                  <p key={`${r.text}-${i}`} className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px]">
                    <span className="shrink-0 text-muted-foreground">{KIND_LABEL[r.kind]}</span>
                    <span className="min-w-0 flex-1 truncate">{r.text}</span>
                  </p>
                ))}
                <button type="button" onClick={() => runAgentTurn(`Replace the low-rated assets in ${group.name}`)} className={cn(AGENT_BTN, "mt-1")}>
                  <Bot className="h-3.5 w-3.5" /> Ask agent to replace them
                </button>
              </div>
            ) : (
              <p className="text-xs text-emerald-600">No low-rated assets.</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export function AssetCombinationsView() {
  const { data, campaign, assetGroup } = useGa();
  if (!campaign) return <NeedsCampaign title="Asset combinations" />;
  // Inside an asset group only that group's best combination shows.
  const groups = data.assetGroups.filter((g) => g.campaignId === campaign.id && g.status !== "REMOVED" && (!assetGroup || g.id === assetGroup.id));
  return (
    <div className="space-y-4">
      <ViewHeader title="Asset combinations" subtitle="Google mixes your headlines, descriptions and images into ads. This shows the mix that performs best in each asset group." />
      {groups.length ? groups.map((g) => <GroupCombination key={g.id} group={g} />) : <EmptyState icon={Layers} title="No asset groups yet" body="Ask the agent to create an asset group for this campaign." />}
    </div>
  );
}

// ─── Where ads showed ──────────────────────────────────────────────────────

const KIND: Record<ContentTarget["kind"], string> = { PLACEMENT: "Website / app", YOUTUBE_CHANNEL: "YouTube channel", TOPIC: "Topic", CONTENT_KEYWORD: "Content keyword" };

export function PlacementsShownView() {
  const { data, range, currency, campaign } = useGa();
  const targets = useMemo(() => (campaign ? data.contentTargets.filter((t) => t.campaignId === campaign.id) : []), [data, campaign]);
  const metrics = useMemo(() => contentMetrics(data, range, targets), [data, range, targets]);
  if (!campaign) return <NeedsCampaign title="Where ads showed" />;
  const rows = targets.filter((t) => !t.excluded);

  const columns: GaColumn<ContentTarget>[] = [
    { id: "value", header: "Where ads showed", label: "Placement", sticky: true, sortValue: (t) => t.value, render: (t) => <span className="flex items-center gap-2 font-semibold"><Globe className="h-3.5 w-3.5 text-muted-foreground" />{t.value.replace("mobileapp::", "App: ")}</span> },
    { id: "kind", header: "Type", label: "Type", render: (t) => <span className="text-muted-foreground">{KIND[t.kind]}</span> },
    ...metricColumns<ContentTarget>((t) => metrics.get(t.id)!, currency, { keys: ["impressions", "clicks", "cost", "conversions", "cpa"] }),
  ];
  const wasted = rows.filter((t) => (metrics.get(t.id)?.cost ?? 0) > 5 && (metrics.get(t.id)?.conversions ?? 0) < 0.5);

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Where ads showed"
        subtitle="Websites, apps and YouTube channels where Google placed this campaign's ads. To exclude some, ask the agent."
        actions={<button type="button" onClick={() => runAgentTurn("Find placements that waste budget")} className={AGENT_BTN}><Bot className="h-3.5 w-3.5" /> Find bad placements</button>}
      />
      {wasted.length > 0 && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
          {wasted.length} placement{wasted.length > 1 ? "s" : ""} spent {money(wasted.reduce((s, t) => s + (metrics.get(t.id)?.cost ?? 0), 0), currency)} with almost no conversions.
        </p>
      )}
      <GaTable
        rows={rows}
        columns={columns}
        rowKey={(t) => t.id}
        defaultSort={{ id: "cost", dir: "desc" }}
        empty={<p className="px-4 py-6 text-center text-xs text-muted-foreground">No placement data yet.</p>}
      />
    </div>
  );
}

// ─── Brand exclusions ──────────────────────────────────────────────────────

export function BrandExclusionsView() {
  const { data } = useGa();
  const brands = data.account.brandExclusions ?? [];
  return (
    <div className="space-y-4">
      <ViewHeader title="Brand exclusions" subtitle="Brands this campaign must not show ads for, even when someone searches for them. To change the list, ask the agent." />
      {brands.length ? (
        <Card className="p-4">
          <p className="mb-2 text-sm font-bold">Excluded brands</p>
          <div className="flex flex-wrap gap-1.5">
            {brands.map((b) => <Pill key={b} tone="bad">{b}</Pill>)}
          </div>
        </Card>
      ) : (
        <EmptyState icon={ShieldOff} title="No brand exclusions" body="Nothing is blocked by brand. Performance Max may show for searches on your competitors' names, or your own brand, unless you exclude them." />
      )}
    </div>
  );
}
