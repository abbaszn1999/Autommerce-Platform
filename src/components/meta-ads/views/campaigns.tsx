"use client";

import { useMemo, useState } from "react";
import { Bot, Lock, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill, Segmented, ViewHeader } from "@/components/google-ads/ga-ui";
import { BulkButton, GaTable, type GaColumn } from "@/components/google-ads/ga-table";
import { BID_STRATEGIES, OBJECTIVES } from "@/lib/meta-ads/constants";
import { runAgentTurn } from "@/lib/meta-ads/agent-runner";
import { accountBase, campaignBase, derive, money } from "@/lib/meta-ads/metrics";
import { isLocked } from "@/lib/meta-ads/mutations";
import { useMetaAds } from "@/lib/meta-ads/store";
import type { EntityStatus, MetaCampaign, Metrics } from "@/lib/meta-ads/types";
import { AskButton, SearchBox, campaignNeedsAction, filterByStatus, statusFilterOptions, type FilterRules, type StatusFilter } from "../ma-common";
import { metricColumns } from "../ma-columns";
import { AdvantageBadge, DeliveryPill, ObjectivePill, StatusDot } from "../ma-ui";
import { useMa } from "../use-ma";

export function CampaignsView() {
  const { data, range, currency } = useMa();
  const setScope = useMetaAds((s) => s.setScope);
  const openDialog = useMetaAds((s) => s.openDialog);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const metrics = useMemo(() => {
    const map = new Map<string, Metrics>();
    for (const c of data.campaigns) map.set(c.id, derive(campaignBase(data, c.id, range)));
    return map;
  }, [data, range]);

  const rules: FilterRules<MetaCampaign> = { delivered: (c) => (metrics.get(c.id)?.spend ?? 0) > 0, needsAction: (c) => campaignNeedsAction(data, c) };
  const rows = filterByStatus(data.campaigns, filter, rules).filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
  const totals = derive(accountBase(data, range, rows.map((r) => r.id)));

  // The dashboard is view-only for bulk edits: they go to the agent, which proposes the change in the chat.
  const askStatus = (ids: string[], status: EntityStatus) => {
    const verb = status === "ACTIVE" ? "Turn on" : status === "PAUSED" ? "Pause" : "Archive";
    runAgentTurn(`${verb} these campaigns: ${ids.map((id) => data.campaigns.find((c) => c.id === id)?.name).join(", ")}`);
    setSelected(new Set());
  };

  const columns: GaColumn<MetaCampaign>[] = [
    { id: "status", header: "", width: "w-8", render: (c) => <StatusDot status={c.status} /> },
    {
      id: "name",
      header: "Campaign",
      sticky: true,
      sortValue: (c) => c.name,
      render: (c) => (
        <span className="flex items-center gap-1.5">
          <button type="button" onClick={() => setScope({ campaignId: c.id }, "adSets")} className="max-w-64 truncate text-left font-semibold text-[#400095] hover:underline dark:text-violet-300">
            {c.name}
          </button>
          {isLocked(c) && <span title="View only: Meta no longer allows edits"><Lock className="h-3 w-3 text-muted-foreground" /></span>}
        </span>
      ),
      total: <span>Total: {rows.length} campaigns</span>,
    },
    { id: "delivery", header: "Delivery", sortValue: (c) => c.delivery, render: (c) => <DeliveryPill delivery={c.delivery} /> },
    {
      id: "objective",
      header: "Objective",
      sortValue: (c) => c.objective,
      render: (c) => (
        <span className="flex items-center gap-1">
          <ObjectivePill objective={c.objective} />
          <AdvantageBadge state={c.advantageState} />
        </span>
      ),
    },
    {
      id: "budget",
      header: "Budget",
      align: "right",
      sortValue: (c) => c.budget?.amount ?? 0,
      render: (c) => (
        <span className="group inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
          {c.budget ? (
            <>
              {money(c.budget.amount, currency)}
              <span className="text-[10px] text-muted-foreground">{c.budget.kind === "DAILY" ? "/day" : "lifetime"}</span>
              {!isLocked(c) && c.status !== "ARCHIVED" && (
                <button type="button" title="Edit budget" onClick={() => openDialog({ kind: "budget", entity: "CAMPAIGN", id: c.id })} className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100">
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Ad set budget</span>
          )}
        </span>
      ),
    },
    {
      id: "bid",
      header: "Bid strategy",
      render: (c) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {BID_STRATEGIES[c.bidStrategy].label}
          {c.bidValue ? ` (${c.bidStrategy === "LOWEST_COST_WITH_MIN_ROAS" ? `${c.bidValue}x` : money(c.bidValue, currency)})` : ""}
        </span>
      ),
    },
    {
      id: "learning",
      header: "Learning",
      render: (c) => {
        const sets = data.adSets.filter((s) => s.campaignId === c.id && s.status === "ACTIVE");
        const limited = sets.filter((s) => s.delivery === "LEARNING_LIMITED").length;
        const learning = sets.filter((s) => s.delivery === "LEARNING").length;
        if (!limited && !learning) return <span className="text-muted-foreground/60">—</span>;
        return (
          <span className="flex gap-1">
            {learning > 0 && <Pill tone="info">{learning} learning</Pill>}
            {limited > 0 && <Pill tone="warn">{limited} limited</Pill>}
          </span>
        );
      },
    },
    ...metricColumns<MetaCampaign>((c) => metrics.get(c.id)!, currency, { totals, resultLabelOf: (c) => OBJECTIVES[c.objective].resultLabel }),
  ];

  return (
    <div>
      <ViewHeader
        title="Campaigns"
        subtitle="Every campaign in this ad account. Click a name to open it. To change anything, select campaigns and ask the agent."
        actions={
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Find a campaign" />
            <AskButton primary prompt="Create an Advantage+ Sales campaign for running shoes in Saudi Arabia with $80/day">
              Create with agent
            </AskButton>
          </>
        }
      >
        <Segmented value={filter} onChange={setFilter} options={statusFilterOptions(data.campaigns, "campaigns", rules)} size="xs" />
      </ViewHeader>
      <GaTable
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        exportName="campaigns"
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        defaultSort={{ id: "spend", dir: "desc" }}
        rowClassName={(c) => cn(c.status === "ARCHIVED" && "opacity-50")}
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
            <BulkButton onClick={() => runAgentTurn(`Review these campaigns: ${ids.map((id) => data.campaigns.find((c) => c.id === id)?.name).join(", ")}. Should I move budget between them?`)}>
              <Bot className="h-3 w-3" /> Ask agent
            </BulkButton>
          </>
        )}
        empty="No campaigns match this filter."
      />
    </div>
  );
}
