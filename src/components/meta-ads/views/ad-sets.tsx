"use client";

import { useMemo, useState } from "react";
import { Bot, Lock, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill, Segmented, ViewHeader } from "@/components/google-ads/ga-ui";
import { BulkButton, GaTable, type GaColumn } from "@/components/google-ads/ga-table";
import { ATTRIBUTION, OPTIMIZATION_GOALS } from "@/lib/meta-ads/constants";
import { runAgentTurn } from "@/lib/meta-ads/agent-runner";
import { adSetBase, derive, money } from "@/lib/meta-ads/metrics";
import { isLocked } from "@/lib/meta-ads/mutations";
import { useMetaAds } from "@/lib/meta-ads/store";
import type { AdSet, EntityStatus, Metrics } from "@/lib/meta-ads/types";
import { AskButton, SearchBox, adSetNeedsAction, filterByStatus, statusFilterOptions, type FilterRules, type StatusFilter } from "../ma-common";
import { metricColumns } from "../ma-columns";
import { DeliveryPill, LearningBar, StatusDot } from "../ma-ui";
import { scopedAdSets, useMa } from "../use-ma";

export function AdSetsView() {
  const { data, range, currency, scope, campaign } = useMa();
  const setScope = useMetaAds((s) => s.setScope);
  const openDialog = useMetaAds((s) => s.openDialog);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const all = useMemo(() => data.adSets.filter((s) => (!scope.campaignId || s.campaignId === scope.campaignId) && data.campaigns.find((c) => c.id === s.campaignId)?.status !== "ARCHIVED"), [data, scope.campaignId]);
  const metrics = useMemo(() => {
    const map = new Map<string, Metrics>();
    for (const s of all) map.set(s.id, derive(adSetBase(data, s.id, range)));
    return map;
  }, [all, data, range]);

  const rules: FilterRules<AdSet> = { delivered: (s) => (metrics.get(s.id)?.spend ?? 0) > 0, needsAction: (s) => adSetNeedsAction(data, s) };
  const rows = filterByStatus(all, filter, rules).filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));
  const campaignOf = (s: AdSet) => data.campaigns.find((c) => c.id === s.campaignId);

  const askStatus = (ids: string[], status: EntityStatus) => {
    const verb = status === "ACTIVE" ? "Turn on" : status === "PAUSED" ? "Pause" : "Archive";
    runAgentTurn(`${verb} these ad sets: ${ids.map((id) => data.adSets.find((s) => s.id === id)?.name).join(", ")}`);
    setSelected(new Set());
  };

  const columns: GaColumn<AdSet>[] = [
    { id: "status", header: "", width: "w-8", render: (s) => <StatusDot status={s.status} /> },
    {
      id: "name",
      header: "Ad set",
      sticky: true,
      sortValue: (s) => s.name,
      render: (s) => (
        <button type="button" onClick={() => setScope({ campaignId: s.campaignId, adSetId: s.id }, "ads")} className="max-w-64 truncate text-left font-semibold text-[#400095] hover:underline dark:text-violet-300">
          {s.name}
        </button>
      ),
      total: <span>Total: {rows.length} ad sets</span>,
    },
    ...(!scope.campaignId
      ? [
          {
            id: "campaign",
            header: "Campaign",
            sortValue: (s: AdSet) => campaignOf(s)?.name ?? "",
            render: (s: AdSet) => (
              <button type="button" onClick={() => setScope({ campaignId: s.campaignId }, "adSets")} className="max-w-48 truncate text-left text-muted-foreground hover:underline">
                {campaignOf(s)?.name}
              </button>
            ),
          } satisfies GaColumn<AdSet>,
        ]
      : []),
    { id: "delivery", header: "Delivery", sortValue: (s) => s.delivery, render: (s) => <DeliveryPill delivery={s.delivery} /> },
    {
      id: "budget",
      header: "Budget",
      align: "right",
      sortValue: (s) => s.budget?.amount ?? 0,
      render: (s) => {
        const c = campaignOf(s);
        return (
          <span className="group inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
            {s.budget ? (
              <>
                {money(s.budget.amount, currency)}
                <span className="text-[10px] text-muted-foreground">{s.budget.kind === "DAILY" ? "/day" : "lifetime"}</span>
                {!isLocked(c) && s.status !== "ARCHIVED" && (
                  <button type="button" title="Edit budget" onClick={() => openDialog({ kind: "budget", entity: "AD_SET", id: s.id })} className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100">
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Campaign budget</span>
            )}
          </span>
        );
      },
    },
    {
      id: "goal",
      header: "Optimization",
      render: (s) => <span className="whitespace-nowrap text-muted-foreground">{OPTIMIZATION_GOALS[s.optimizationGoal].label.replace("Maximize ", "")}</span>,
    },
    {
      id: "audience",
      header: "Audience",
      render: (s) => (s.targeting.advantageAudience ? <Pill tone="brand">Advantage+</Pill> : <span className="whitespace-nowrap text-muted-foreground">{s.targeting.includeAudienceIds.length ? `${s.targeting.includeAudienceIds.length} audiences` : "Broad"}</span>),
    },
    { id: "learning", header: "Learning", render: (s) => <LearningBar learning={s.learning} compact /> },
    { id: "attribution", header: "Attribution setting", label: "Attribution setting", hideable: true, sortValue: (s) => s.attribution, render: (s) => <span className="whitespace-nowrap text-muted-foreground" title={ATTRIBUTION[s.attribution].label}>{ATTRIBUTION[s.attribution].short}</span> },
    ...metricColumns<AdSet>((s) => metrics.get(s.id)!, currency, { objective: campaign?.objective, resultLabelOf: (s) => OPTIMIZATION_GOALS[s.optimizationGoal].resultLabel }),
  ];

  const scopedCount = scopedAdSets(data, scope).length;

  return (
    <div>
      <ViewHeader
        title="Ad sets"
        subtitle={campaign ? `Ad sets in ${campaign.name}. Click a name to open it.` : "Ad sets across all campaigns. Click a name to open it."}
        actions={
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Find an ad set" />
            {campaign && isLocked(campaign) && (
              <Pill tone="warn">
                <Lock className="h-3 w-3" /> View only
              </Pill>
            )}
            {campaign && !isLocked(campaign) && <AskButton prompt={`Add an ad set to ${campaign.name}`}>Add ad set</AskButton>}
          </>
        }
      >
        <Segmented value={filter} onChange={setFilter} options={statusFilterOptions(all, "ad sets", rules)} size="xs" />
      </ViewHeader>
      <GaTable
        rows={rows}
        columns={columns}
        rowKey={(s) => s.id}
        exportName="ad-sets"
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        defaultSort={{ id: "spend", dir: "desc" }}
        rowClassName={(s) => cn(s.status === "ARCHIVED" && "opacity-50")}
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
            <BulkButton onClick={() => runAgentTurn(`Look at these ad sets: ${ids.map((id) => data.adSets.find((s) => s.id === id)?.name).join(", ")}. Should I consolidate them?`)}>
              <Bot className="h-3 w-3" /> Ask agent
            </BulkButton>
          </>
        )}
        empty={scopedCount ? "No ad sets match this filter." : "No ad sets yet."}
      />
    </div>
  );
}
