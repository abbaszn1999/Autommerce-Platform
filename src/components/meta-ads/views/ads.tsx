"use client";

import { useMemo, useState } from "react";
import { Bot, Handshake, Pause, Play, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageTile, Pill, Segmented, ViewHeader } from "@/components/google-ads/ga-ui";
import { BulkButton, GaTable, type GaColumn } from "@/components/google-ads/ga-table";
import { AD_FORMATS, ATTRIBUTION, CTAS, OPTIMIZATION_GOALS } from "@/lib/meta-ads/constants";
import { runAgentTurn } from "@/lib/meta-ads/agent-runner";
import { adBase, derive } from "@/lib/meta-ads/metrics";
import { isLocked } from "@/lib/meta-ads/mutations";
import type { EntityStatus, MetaAd, Metrics } from "@/lib/meta-ads/types";
import { AskButton, SearchBox, adNeedsAction, filterByStatus, statusFilterOptions, type FilterRules, type StatusFilter } from "../ma-common";
import { metricColumns } from "../ma-columns";
import { DeliveryPill, RankingPill, ReviewPill, StatusDot } from "../ma-ui";
import { useMa } from "../use-ma";
import { AdDetail } from "./ad-detail";

export function AdsView() {
  const { data, range, currency, scope, campaign, adSet } = useMa();
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  const all = useMemo(
    () =>
      data.ads.filter((a) => {
        const set = data.adSets.find((s) => s.id === a.adSetId);
        if (!set) return false;
        if (scope.adSetId && a.adSetId !== scope.adSetId) return false;
        if (scope.campaignId && set.campaignId !== scope.campaignId) return false;
        return data.campaigns.find((c) => c.id === set.campaignId)?.status !== "ARCHIVED";
      }),
    [data, scope.adSetId, scope.campaignId]
  );
  const metrics = useMemo(() => {
    const map = new Map<string, Metrics>();
    for (const a of all) map.set(a.id, derive(adBase(data, a.id, range)));
    return map;
  }, [all, data, range]);

  const open = openId ? data.ads.find((a) => a.id === openId) : undefined;
  if (open) return <AdDetail ad={open} onBack={() => setOpenId(null)} />;

  const rules: FilterRules<MetaAd> = { delivered: (a) => (metrics.get(a.id)?.spend ?? 0) > 0, needsAction: adNeedsAction };
  const rows = filterByStatus(all, filter, rules).filter((a) => a.name.toLowerCase().includes(query.toLowerCase()));
  const setOf = (a: MetaAd) => data.adSets.find((s) => s.id === a.adSetId);
  const askStatus = (ids: string[], status: EntityStatus) => {
    const verb = status === "ACTIVE" ? "Turn on" : status === "PAUSED" ? "Pause" : "Archive";
    runAgentTurn(`${verb} these ads: ${ids.map((id) => data.ads.find((a) => a.id === id)?.name).join(", ")}`);
    setSelected(new Set());
  };

  const columns: GaColumn<MetaAd>[] = [
    { id: "status", header: "", width: "w-8", render: (a) => <StatusDot status={a.status} /> },
    {
      id: "name",
      header: "Ad",
      sticky: true,
      sortValue: (a) => a.name,
      render: (a) => (
        <button type="button" onClick={() => setOpenId(a.id)} className="flex max-w-72 items-center gap-2 text-left">
          <span className="w-9 shrink-0">
            <ImageTile label={data.creatives.find((c) => c.id === a.mediaIds[0])?.name ?? a.name} ratio="square" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-[#400095] hover:underline dark:text-violet-300">{a.name}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{a.headlines[0]}</span>
          </span>
          {a.partnership && (
            <span title="Partnership ad">
              <Handshake className="h-3 w-3 shrink-0 text-[#400095]" />
            </span>
          )}
        </button>
      ),
      total: <span>Total: {rows.length} ads</span>,
    },
    { id: "delivery", header: "Delivery", sortValue: (a) => a.delivery, render: (a) => <DeliveryPill delivery={a.delivery} /> },
    { id: "review", header: "Review", sortValue: (a) => a.review, render: (a) => <ReviewPill review={a.review} /> },
    { id: "format", header: "Format", sortValue: (a) => a.format, render: (a) => <span className="whitespace-nowrap text-muted-foreground">{AD_FORMATS[a.format].label}</span> },
    ...(!scope.adSetId
      ? [
          {
            id: "adset",
            header: "Ad set",
            sortValue: (a: MetaAd) => setOf(a)?.name ?? "",
            render: (a: MetaAd) => <span className="block max-w-44 truncate text-muted-foreground">{setOf(a)?.name}</span>,
          } satisfies GaColumn<MetaAd>,
        ]
      : []),
    { id: "cta", header: "Button", render: (a) => <span className="whitespace-nowrap text-muted-foreground">{a.cta === "NO_BUTTON" ? "—" : CTAS[a.cta]}</span> },
    { id: "quality", header: "Quality", label: "Quality ranking", hideable: true, defaultHidden: true, render: (a) => <RankingPill ranking={a.rankings.quality} /> },
    { id: "engagement", header: "Engagement", label: "Engagement ranking", hideable: true, defaultHidden: true, render: (a) => <RankingPill ranking={a.rankings.engagement} /> },
    { id: "conversion", header: "Conversion", label: "Conversion ranking", hideable: true, defaultHidden: true, render: (a) => <RankingPill ranking={a.rankings.conversion} /> },
    { id: "attribution", header: "Attribution setting", label: "Attribution setting", hideable: true, defaultHidden: true, sortValue: (a) => setOf(a)?.attribution ?? "", render: (a) => { const s = setOf(a); return s ? <span className="whitespace-nowrap text-muted-foreground" title={ATTRIBUTION[s.attribution].label}>{ATTRIBUTION[s.attribution].short}</span> : null; } },
    ...metricColumns<MetaAd>((a) => metrics.get(a.id)!, currency, { objective: campaign?.objective, resultLabelOf: (a) => { const s = setOf(a); return s ? OPTIMIZATION_GOALS[s.optimizationGoal].resultLabel : ""; } }),
  ];

  const issues = all.filter((a) => a.review === "REJECTED" || a.review === "LIMITED").length;
  const locked = isLocked(campaign);

  return (
    <div>
      <ViewHeader
        title="Ads"
        subtitle={adSet ? `Ads in ${adSet.name}. Click an ad to see previews, rankings and asset results.` : campaign ? `Ads in ${campaign.name}.` : "Every ad in this ad account. Click an ad to open it."}
        actions={
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Find an ad" />
            {locked ? <Pill tone="warn">View only</Pill> : <AskButton prompt={`Add a new ad to ${adSet ? adSet.name : campaign ? campaign.name : "my best ad set"}`}>Add ad</AskButton>}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Segmented value={filter} onChange={setFilter} options={statusFilterOptions(all, "ads", rules)} size="xs" />
          {issues > 0 && <Pill tone="bad">{issues} with review issues</Pill>}
        </div>
      </ViewHeader>
      <GaTable
        rows={rows}
        columns={columns}
        rowKey={(a) => a.id}
        exportName="ads"
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        defaultSort={{ id: "spend", dir: "desc" }}
        rowClassName={(a) => cn(a.status === "ARCHIVED" && "opacity-50")}
        bulkActions={(ids) => (
          <>
            <BulkButton onClick={() => askStatus(ids, "ACTIVE")}>
              <Play className="h-3 w-3" /> Turn on
            </BulkButton>
            <BulkButton onClick={() => askStatus(ids, "PAUSED")}>
              <Pause className="h-3 w-3" /> Pause
            </BulkButton>
            <BulkButton tone="danger" onClick={() => askStatus(ids, "ARCHIVED")}>
              <Trash2 className="h-3 w-3" /> Archive
            </BulkButton>
            <BulkButton onClick={() => runAgentTurn(`Which of these ads are fatigued: ${ids.map((id) => data.ads.find((a) => a.id === id)?.name).join(", ")}?`)}>
              <Bot className="h-3 w-3" /> Ask agent
            </BulkButton>
          </>
        )}
        empty="No ads match this filter."
      />
    </div>
  );
}
