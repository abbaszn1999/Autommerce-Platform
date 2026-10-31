"use client";

import { Bot, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIMITS } from "@/lib/google-ads/constants";
import { METRICS, assetGroupBase, derive, formatMetric } from "@/lib/google-ads/metrics";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import type { AssetGroup, AssetRating, MetricKey } from "@/lib/google-ads/types";
import { GaTable, type GaColumn } from "../ga-table";
import { AdStrengthMeter, Card, EmptyState, Pill, ViewHeader } from "../ga-ui";
import { useGa } from "../use-ga";
import { InfoRow } from "./settings";

/** Views inside a Performance Max asset group. Read-only: the agent changes assets, signals and filters. */

const AGENT_BTN = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-xs font-semibold hover:bg-muted";
const KPIS: MetricKey[] = ["cost", "conversions", "conversionsValue", "roas", "ctr", "clicks"];

const RATING: Record<AssetRating["rating"], { label: string; tone: "good" | "info" | "bad" | "neutral" }> = {
  BEST: { label: "Best", tone: "good" },
  GOOD: { label: "Good", tone: "info" },
  LOW: { label: "Low", tone: "bad" },
  LEARNING: { label: "Learning", tone: "neutral" },
};

const KIND_LABEL: Record<AssetRating["kind"], string> = { HEADLINE: "Headline", LONG_HEADLINE: "Long headline", DESCRIPTION: "Description", IMAGE: "Image", VIDEO: "Video", LOGO: "Logo" };

function NeedsAssetGroup({ title }: { title: string }) {
  return (
    <div>
      <ViewHeader title={title} />
      <EmptyState icon={Layers} title="Open a Performance Max asset group" body="This page describes one asset group, so it lives inside it. Open one from the campaign's Asset groups page." />
    </div>
  );
}

function coverageOf(g: AssetGroup) {
  return [
    { label: "Headlines", have: g.headlines.length, max: LIMITS.pmaxHeadlinesMax },
    { label: "Long headlines", have: g.longHeadlines.length, max: LIMITS.pmaxLongHeadlinesMax },
    { label: "Descriptions", have: g.descriptions.length, max: LIMITS.pmaxDescriptionsMax },
    { label: "Images", have: g.imageUrls.length, max: 20 },
    { label: "Logos", have: g.logoUrls.length, max: 5 },
    { label: "Videos", have: g.videoUrls.length, max: 5 },
  ];
}

// ─── Overview ──────────────────────────────────────────────────────────────

export function AssetGroupOverview() {
  const { data, range, currency, campaign, assetGroup } = useGa();
  if (!assetGroup) return <NeedsAssetGroup title="Overview" />;
  const m = derive(assetGroupBase(data, assetGroup.id, range));
  const weak = (assetGroup.assetPerformance ?? []).filter((a) => a.rating === "LOW");
  return (
    <div className="space-y-4">
      <ViewHeader
        title={assetGroup.name}
        subtitle={`Asset group in ${campaign?.name ?? "this campaign"} · ${assetGroup.finalUrl.replace(/^https?:\/\//, "")}`}
        actions={<AdStrengthMeter strength={assetGroup.adStrength} />}
      />
      <Card className="grid grid-cols-2 divide-x divide-y divide-border/60 overflow-hidden md:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
        {KPIS.map((k) => (
          <div key={k} className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground">{METRICS[k].label}</p>
            <p className="mt-1 text-xl font-black tabular-nums tracking-tight">{formatMetric(k, m[k], currency)}</p>
          </div>
        ))}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2 p-4">
          <p className="text-sm font-bold">Asset coverage</p>
          {coverageOf(assetGroup).map((c) => (
            <div key={c.label} className="flex items-center gap-2 text-[11px]">
              <span className="w-24 text-muted-foreground">{c.label}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span className={cn("block h-full rounded-full", c.have / c.max >= 0.6 ? "bg-emerald-500" : c.have ? "bg-amber-500" : "bg-red-400")} style={{ width: `${Math.min(100, (c.have / c.max) * 100)}%` }} />
              </span>
              <span className="w-10 text-right tabular-nums text-muted-foreground">{c.have}/{c.max}</span>
            </div>
          ))}
        </Card>
        <Card className="space-y-2 p-4">
          <p className="text-sm font-bold">What needs attention</p>
          {weak.length ? (
            <>
              <p className="text-xs text-muted-foreground">{weak.length} asset{weak.length > 1 ? "s are" : " is"} rated Low by Google.</p>
              <button type="button" onClick={() => runAgentTurn(`Replace the low-rated assets in ${assetGroup.name}`)} className={AGENT_BTN}>
                <Bot className="h-3.5 w-3.5" /> Ask agent to replace them
              </button>
            </>
          ) : (
            <p className="text-xs text-emerald-600">No low-rated assets.</p>
          )}
          {assetGroup.adStrength === "POOR" || assetGroup.adStrength === "AVERAGE" ? (
            <button type="button" onClick={() => runAgentTurn(`Improve the ad strength of ${assetGroup.name}`)} className={AGENT_BTN}>
              <Bot className="h-3.5 w-3.5" /> Ask agent to improve ad strength
            </button>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

// ─── Assets ────────────────────────────────────────────────────────────────

type AssetRow = { id: string; kind: AssetRating["kind"]; text: string; rating?: AssetRating["rating"] };

export function AssetGroupAssetsView() {
  const { assetGroup } = useGa();
  if (!assetGroup) return <NeedsAssetGroup title="Assets" />;
  const rated = (kind: AssetRating["kind"], text: string) => assetGroup.assetPerformance?.find((a) => a.kind === kind && a.text === text)?.rating;
  const rows: AssetRow[] = [
    ...assetGroup.headlines.map((t) => ({ kind: "HEADLINE" as const, text: t })),
    ...assetGroup.longHeadlines.map((t) => ({ kind: "LONG_HEADLINE" as const, text: t })),
    ...assetGroup.descriptions.map((t) => ({ kind: "DESCRIPTION" as const, text: t })),
    ...assetGroup.imageUrls.map((t) => ({ kind: "IMAGE" as const, text: t })),
    ...assetGroup.logoUrls.map((t) => ({ kind: "LOGO" as const, text: t })),
    ...assetGroup.videoUrls.map((t) => ({ kind: "VIDEO" as const, text: t })),
  ].map((r, i) => ({ ...r, id: `${r.kind}-${i}`, rating: rated(r.kind, r.text) }));

  const columns: GaColumn<AssetRow>[] = [
    { id: "kind", header: "Type", label: "Type", sortValue: (r) => KIND_LABEL[r.kind], render: (r) => <span className="text-muted-foreground">{KIND_LABEL[r.kind]}</span> },
    { id: "asset", header: "Asset", label: "Asset", sticky: true, sortValue: (r) => r.text, render: (r) => <span className="block max-w-[28rem] truncate font-medium">{r.text}</span> },
    {
      id: "rating",
      header: "Google's rating",
      label: "Google's rating",
      sortValue: (r) => r.rating ?? "",
      render: (r) => (r.rating ? <Pill tone={RATING[r.rating].tone}>{RATING[r.rating].label}</Pill> : <span className="text-muted-foreground">Not rated</span>),
    },
  ];

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Assets"
        subtitle={`Everything Google can mix into ${assetGroup.name}'s ads. Ratings appear once the group has served enough.`}
        actions={<button type="button" onClick={() => runAgentTurn(`Which assets in ${assetGroup.name} are weak? Replace them`)} className={AGENT_BTN}><Bot className="h-3.5 w-3.5" /> Analyse with agent</button>}
      />
      <GaTable rows={rows} columns={columns} rowKey={(r) => r.id} empty={<p className="px-4 py-6 text-center text-xs text-muted-foreground">No assets in this group yet.</p>} />
    </div>
  );
}

// ─── Audience signals & search themes ──────────────────────────────────────

export function AudienceSignalsView() {
  const { assetGroup } = useGa();
  if (!assetGroup) return <NeedsAssetGroup title="Audience signals" />;
  return (
    <div className="space-y-4">
      <ViewHeader title="Audience signals" subtitle="Hints that tell Google who is most likely to convert. They guide the AI; they do not limit who sees the ads. To change them, ask the agent." />
      <Card className="space-y-2 p-4">
        {assetGroup.audienceSignal ? <Pill tone="brand">{assetGroup.audienceSignal}</Pill> : <p className="text-xs text-muted-foreground">No audience signal set. Google finds the audience on its own.</p>}
        <button type="button" onClick={() => runAgentTurn(`Suggest an audience signal for ${assetGroup.name}`)} className={AGENT_BTN}>
          <Bot className="h-3.5 w-3.5" /> Ask agent for a better signal
        </button>
      </Card>
    </div>
  );
}

export function SearchThemesView() {
  const { assetGroup } = useGa();
  if (!assetGroup) return <NeedsAssetGroup title="Search themes" />;
  return (
    <div className="space-y-4">
      <ViewHeader title="Search themes" subtitle="Topics you tell Google people search for. They steer Search traffic for this asset group. To change them, ask the agent." />
      <Card className="space-y-2 p-4">
        {assetGroup.searchThemes.length ? (
          <div className="flex flex-wrap gap-1.5">{assetGroup.searchThemes.map((t) => <Pill key={t} tone="info">“{t}”</Pill>)}</div>
        ) : (
          <p className="text-xs text-muted-foreground">No search themes yet.</p>
        )}
        <button type="button" onClick={() => runAgentTurn(`Suggest search themes for ${assetGroup.name}`)} className={AGENT_BTN}>
          <Bot className="h-3.5 w-3.5" /> Ask agent for search themes
        </button>
      </Card>
    </div>
  );
}

// ─── Settings ──────────────────────────────────────────────────────────────

export function AssetGroupSettingsView() {
  const { assetGroup, campaign } = useGa();
  if (!assetGroup) return <NeedsAssetGroup title="Asset group settings" />;
  const status = { ENABLED: "Enabled", PAUSED: "Paused", REMOVED: "Removed" }[assetGroup.status];
  return (
    <div>
      <ViewHeader title="Asset group settings" subtitle={`${assetGroup.name} in ${campaign?.name ?? "this campaign"}. To change them, ask the agent.`} />
      <Card className="max-w-2xl space-y-3 p-4">
        <InfoRow label="Name" value={assetGroup.name} />
        <InfoRow label="Status" value={status} />
        <InfoRow label="Final URL" hint="Where the ads send people." value={assetGroup.finalUrl.replace(/^https?:\/\//, "")} />
        <InfoRow label="Business name" value={assetGroup.businessName} />
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="text-xs font-semibold">Ad strength</p>
            <p className="text-[11px] text-muted-foreground">How complete and varied the assets are.</p>
          </div>
          <AdStrengthMeter strength={assetGroup.adStrength} />
        </div>
      </Card>
    </div>
  );
}
