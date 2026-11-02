"use client";

import { useMemo, useState } from "react";
import { Bot, Pause, Play, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BIDDING, CAMPAIGN_TYPES, SERVING_ISSUES } from "@/lib/google-ads/constants";
import { accountBase, campaignBase, derive, money } from "@/lib/google-ads/metrics";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import { useGoogleAds } from "@/lib/google-ads/store";
import type { Campaign, EntityStatus, Metrics } from "@/lib/google-ads/types";
import { metricColumns } from "../ga-columns";
import { BulkButton, GaTable, type GaColumn } from "../ga-table";
import { Pill, Segmented, StatusDot, ViewHeader } from "../ga-ui";
import { useGa } from "../use-ga";

export type StatusFilter = "ACTIVE" | "ENABLED" | "PAUSED" | "ALL";

export function filterByStatus<T extends { status: EntityStatus }>(rows: T[], filter: StatusFilter) {
  return rows.filter((r) =>
    filter === "ALL" ? true : filter === "ACTIVE" ? r.status !== "REMOVED" : r.status === filter
  );
}

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ACTIVE", label: "All but removed" },
  { value: "ENABLED", label: "Enabled" },
  { value: "PAUSED", label: "Paused" },
  { value: "ALL", label: "All" },
];

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-56 rounded-lg border border-border/70 bg-background pl-8 pr-3 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
      />
    </div>
  );
}

export function CampaignsView() {
  const { data, range, currency } = useGa();
  const setScope = useGoogleAds((s) => s.setScope);
  const [filter, setFilter] = useState<StatusFilter>("ACTIVE");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const metrics = useMemo(() => {
    const map = new Map<string, Metrics>();
    for (const c of data.campaigns) map.set(c.id, derive(campaignBase(data, c.id, range)));
    return map;
  }, [data, range]);

  const rows = filterByStatus(data.campaigns, filter).filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
  const totals = derive(accountBase(data, range, rows.map((r) => r.id)));

  // The dashboard is view-only: bulk actions hand the request to the agent, which proposes the change in the chat.
  const askStatus = (ids: string[], status: EntityStatus) => {
    const verb = status === "ENABLED" ? "Enable" : status === "PAUSED" ? "Pause" : "Remove";
    runAgentTurn(`${verb} these campaigns: ${ids.map((id) => data.campaigns.find((c) => c.id === id)?.name).join(", ")}`);
    setSelected(new Set());
  };

  const columns: GaColumn<Campaign>[] = [
    {
      id: "status",
      header: "",
      width: "w-8",
      render: (c) => <StatusDot status={c.status} />,
    },
    {
      id: "name",
      header: "Campaign",
      sticky: true,
      sortValue: (c) => c.name,
      render: (c) => (
        <button type="button" onClick={() => setScope({ campaignId: c.id }, "adGroups")} className="max-w-64 truncate text-left font-semibold text-[#400095] hover:underline dark:text-violet-300">
          {c.name}
        </button>
      ),
      total: <span>Total: {rows.length} campaigns</span>,
    },
    {
      id: "budget",
      header: "Budget",
      align: "right",
      sortValue: (c) => data.budgets.find((b) => b.id === c.budgetId)?.amount ?? 0,
      render: (c) => {
        const b = data.budgets.find((x) => x.id === c.budgetId);
        return <span className="whitespace-nowrap">{b ? `${money(b.amount, currency)}/day` : "—"}</span>;
      },
    },
    {
      id: "serving",
      header: "Status",
      render: (c) => (
        <span className="flex flex-col items-start gap-1">
          <span className="whitespace-nowrap">{c.status === "ENABLED" ? "Eligible" : c.status === "PAUSED" ? "Paused" : "Removed"}</span>
          {c.status === "ENABLED" &&
            c.servingIssues.map((s) => (
              <Pill key={s} tone={SERVING_ISSUES[s].tone === "warn" ? "warn" : SERVING_ISSUES[s].tone === "bad" ? "bad" : "info"}>
                {SERVING_ISSUES[s].label}
              </Pill>
            ))}
        </span>
      ),
    },
    {
      id: "type",
      header: "Type",
      sortValue: (c) => c.type,
      render: (c) => <span className="whitespace-nowrap text-muted-foreground">{CAMPAIGN_TYPES[c.type].label}</span>,
    },
    {
      id: "bidding",
      header: "Bid strategy",
      render: (c) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {BIDDING[c.bidding.type].label}
          {c.bidding.targetCpa ? ` (${money(c.bidding.targetCpa, currency)})` : ""}
          {c.bidding.targetRoas ? ` (${Math.round(c.bidding.targetRoas * 100)}%)` : ""}
        </span>
      ),
    },
    ...metricColumns<Campaign>((c) => metrics.get(c.id)!, currency, { totals }),
  ];

  return (
    <div>
      <ViewHeader
        title="Campaigns"
        subtitle="Every campaign in this account. Click a name to open it. To change anything, select campaigns and ask the agent."
        actions={
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Find a campaign" />
          </>
        }
      >
        <Segmented value={filter} onChange={setFilter} options={STATUS_FILTERS} size="xs" />
      </ViewHeader>
      <GaTable
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        exportName="campaigns"
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        defaultSort={{ id: "cost", dir: "desc" }}
        rowClassName={(c) => cn(c.status === "REMOVED" && "opacity-50")}
        bulkActions={(ids) => (
          <>
            <BulkButton onClick={() => askStatus(ids, "ENABLED")}>
              <Play className="h-3 w-3" /> Enable
            </BulkButton>
            <BulkButton onClick={() => askStatus(ids, "PAUSED")}>
              <Pause className="h-3 w-3" /> Pause
            </BulkButton>
            <BulkButton tone="danger" onClick={() => askStatus(ids, "REMOVED")}>
              <Trash2 className="h-3 w-3" /> Remove
            </BulkButton>
            <BulkButton
              onClick={() =>
                runAgentTurn(`Review these campaigns: ${ids.map((id) => data.campaigns.find((c) => c.id === id)?.name).join(", ")}. Should I move budget between campaigns?`)
              }
            >
              <Bot className="h-3 w-3" /> Ask agent
            </BulkButton>
          </>
        )}
        empty="No campaigns match this filter."
      />
    </div>
  );
}
