"use client";

import { useMemo } from "react";
import { Laptop, Smartphone, Tablet } from "lucide-react";
import { cn } from "@/lib/utils";
import { WEEKDAYS } from "@/lib/google-ads/constants";
import { campaignBase, derive } from "@/lib/google-ads/metrics";
import { useGoogleAds } from "@/lib/google-ads/store";
import type { AdScheduleSlot, Campaign, LocationTarget } from "@/lib/google-ads/types";
import { metricColumns } from "../ga-columns";
import { GaTable, type GaColumn } from "../ga-table";
import { Card, Pill, ViewHeader } from "../ga-ui";
import { useGa } from "../use-ga";

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
const adj = (v?: number) => (v ? pct(v) : "None");
const title = (day: string) => day.charAt(0) + day.slice(1, 3).toLowerCase();
const hour = (h: number) => `${h}:00`;
const slotText = (s: AdScheduleSlot) => `${title(s.day)} ${hour(s.startHour)}–${hour(s.endHour)}`;

/** Read-only: targeting is changed by asking the agent. */
export function LocationsView() {
  const { data, range, currency, campaign } = useGa();
  const setScope = useGoogleAds((s) => s.setScope);
  const campaigns = data.campaigns.filter((c) => c.status !== "REMOVED");
  const metrics = useMemo(() => new Map(campaigns.map((c) => [c.id, derive(campaignBase(data, c.id, range))])), [campaigns, data, range]);

  if (campaign) return <CampaignLocations campaign={campaign} />;

  const columns: GaColumn<Campaign>[] = [
    { id: "name", header: "Campaign", label: "Campaign", sticky: true, sortValue: (c) => c.name, render: (c) => <span className="font-semibold">{c.name}</span> },
    {
      id: "targeted",
      header: "Targeted locations",
      label: "Targeted locations",
      render: (c) => {
        const list = c.locations.filter((l) => !l.excluded);
        return list.length ? <span className="flex flex-wrap gap-1">{list.map((l) => <Pill key={l.id}>{l.name}</Pill>)}</span> : <span className="text-muted-foreground">All countries</span>;
      },
    },
    {
      id: "excluded",
      header: "Excluded",
      label: "Excluded locations",
      render: (c) => {
        const list = c.locations.filter((l) => l.excluded);
        return list.length ? <span className="flex flex-wrap gap-1">{list.map((l) => <Pill key={l.id} tone="bad">{l.name}</Pill>)}</span> : <span className="text-muted-foreground">None</span>;
      },
    },
    { id: "languages", header: "Languages", label: "Languages", render: (c) => <span className="text-muted-foreground">{c.languages.join(", ")}</span> },
    ...metricColumns<Campaign>((c) => metrics.get(c.id)!, currency, { keys: ["cost", "conversions", "cpa", "roas"] }),
  ];

  return (
    <div>
      <ViewHeader title="Locations" subtitle="Where each campaign shows. Click a campaign to see its locations. To change targeting, ask the agent." />
      <GaTable rows={campaigns} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => setScope({ campaignId: c.id }, "locations")} />
    </div>
  );
}

function CampaignLocations({ campaign }: { campaign: Campaign }) {
  // Performance Max has no bid adjustments: Google's bidding decides by itself.
  const noBids = campaign.type === "PERFORMANCE_MAX";
  const columns: GaColumn<LocationTarget>[] = [
    { id: "name", header: "Location", sticky: true, render: (l) => <span className="font-semibold">{l.name}</span> },
    { id: "kind", header: "Type", render: (l) => <span className="text-muted-foreground">{l.kind}</span> },
    { id: "status", header: "Status", render: (l) => <Pill tone={l.excluded ? "bad" : "good"}>{l.excluded ? "Excluded" : "Targeted"}</Pill> },
    ...(noBids ? [] : [{ id: "bid", header: "Bid adj.", align: "right" as const, render: (l: LocationTarget) => (l.excluded ? <span className="text-muted-foreground">—</span> : <span className="font-semibold">{adj(l.bidModifier)}</span>) }]),
  ];
  return (
    <div className="space-y-4">
      <ViewHeader title="Locations" subtitle={`Where ${campaign.name} shows. To change it, ask the agent.`} />
      <GaTable rows={campaign.locations} columns={columns} rowKey={(l) => l.id} empty={<p className="px-3 py-4 text-xs text-muted-foreground">All countries and territories.</p>} />
      <p className="text-[11px] text-muted-foreground">Languages: {campaign.languages.join(", ")}</p>
    </div>
  );
}

/** Ad schedule tab: account level lists every campaign, inside a campaign shows its hour grid. */
export function ScheduleView() {
  const { data, campaign } = useGa();
  const setScope = useGoogleAds((s) => s.setScope);
  if (!campaign) {
    const columns: GaColumn<Campaign>[] = [
      { id: "name", header: "Campaign", label: "Campaign", sticky: true, sortValue: (c) => c.name, render: (c) => <span className="font-semibold">{c.name}</span> },
      {
        id: "runs",
        header: "Runs",
        label: "Runs",
        render: (c) => (c.schedule.length ? <span className="text-muted-foreground">{c.schedule.map(slotText).join(" · ")}</span> : <Pill>All day, every day</Pill>),
      },
      {
        id: "bids",
        header: "Bid adjustments",
        label: "Bid adjustments",
        render: (c) => {
          const adjusted = c.type === "PERFORMANCE_MAX" ? [] : c.schedule.filter((s) => s.bidModifier);
          return adjusted.length ? <span className="text-muted-foreground">{adjusted.map((s) => `${pct(s.bidModifier!)} ${slotText(s)}`).join(" · ")}</span> : <span className="text-muted-foreground">None</span>;
        },
      },
    ];
    return (
      <div>
        <ViewHeader title="Ad schedule" subtitle="When each campaign shows. Click a campaign to see its hour grid. To change it, ask the agent." />
        <GaTable rows={data.campaigns.filter((c) => c.status !== "REMOVED")} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => setScope({ campaignId: c.id }, "schedule")} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ViewHeader title="Ad schedule" subtitle={`When ${campaign.name} shows. To change it, ask the agent.`} />
      <SchedulePanel campaign={campaign} />
    </div>
  );
}

/** Devices tab: account level lists every campaign's device adjustments, inside a campaign shows its values. */
export function DevicesView() {
  const { data, campaign } = useGa();
  const setScope = useGoogleAds((s) => s.setScope);
  if (!campaign) {
    const device = (key: "mobile" | "desktop" | "tablet"): GaColumn<Campaign> => ({
      id: key,
      header: key === "mobile" ? "Mobile phones" : key === "desktop" ? "Computers" : "Tablets",
      align: "right",
      sortValue: (c) => c.devices[key],
      render: (c) => <span className={cn("font-semibold tabular-nums", !c.devices[key] && "font-normal text-muted-foreground")}>{adj(c.devices[key])}</span>,
    });
    const columns: GaColumn<Campaign>[] = [
      { id: "name", header: "Campaign", label: "Campaign", sticky: true, sortValue: (c) => c.name, render: (c) => <span className="font-semibold">{c.name}</span> },
      device("mobile"),
      device("desktop"),
      device("tablet"),
    ];
    return (
      <div>
        <ViewHeader title="Devices" subtitle="Bid adjustment per device, by campaign. Click a campaign to open it. To change them, ask the agent." />
        <GaTable rows={data.campaigns.filter((c) => c.status !== "REMOVED")} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => setScope({ campaignId: c.id }, "devices")} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ViewHeader title="Devices" subtitle={`Bid adjustments for ${campaign.name}. To change them, ask the agent.`} />
      <DevicesPanel campaign={campaign} />
    </div>
  );
}

function SchedulePanel({ campaign }: { campaign: Campaign }) {
  const allDay = campaign.schedule.length === 0;
  const active = (day: AdScheduleSlot["day"], h: number) => allDay || campaign.schedule.some((s) => s.day === day && h >= s.startHour && h < s.endHour);
  const bids = campaign.type !== "PERFORMANCE_MAX";
  const modifierFor = (day: AdScheduleSlot["day"], h: number) => (bids ? campaign.schedule.find((s) => s.day === day && h >= s.startHour && h < s.endHour)?.bidModifier : undefined);

  return (
    <Card className="p-4">
      <div className="mb-3">
        <p className="text-sm font-bold">Ad schedule</p>
        <p className="text-[11px] text-muted-foreground">{allDay ? "Ads run all day, every day." : `${campaign.schedule.length} rules. Hours shown on the top, days on the left.`}</p>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[#400095]/40 dark:bg-violet-500/40" /> Ads run</span>
        {bids && <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[#400095] dark:bg-violet-500" /> Ads run with a bid adjustment</span>}
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-muted" /> Ads off</span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-[48px_repeat(24,1fr)] gap-px text-[9px]">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center text-muted-foreground">{h % 3 === 0 ? h : ""}</span>
          ))}
          {WEEKDAYS.map((day) => (
            <div key={day} className="contents">
              <span className="pr-1 text-right font-semibold text-muted-foreground">{title(day)}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const on = active(day, h);
                const mod = modifierFor(day, h);
                return <span key={h} title={`${title(day)} ${h}:00${mod ? ` · ${pct(mod)}` : ""}`} className={cn("h-5 rounded-sm", on ? (mod ? "bg-[#400095] dark:bg-violet-500" : "bg-[#400095]/40 dark:bg-violet-500/40") : "bg-muted")} />;
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function DevicesPanel({ campaign }: { campaign: Campaign }) {
  const items = [
    { key: "mobile" as const, label: "Mobile phones", icon: Smartphone },
    { key: "desktop" as const, label: "Computers", icon: Laptop },
    { key: "tablet" as const, label: "Tablets", icon: Tablet },
  ];
  return (
    <Card className="p-4">
      <p className="text-sm font-bold">Bid adjustment by device</p>
      <p className="mb-3 text-[11px] text-muted-foreground">Smart Bidding sets these automatically, except -100% which blocks a device.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((d) => (
          <div key={d.key} className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
            <d.icon className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 text-xs font-semibold">{d.label}</span>
            <span className="text-xs font-semibold tabular-nums">{adj(campaign.devices[d.key])}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Languages: which languages the campaign targets. Ads show to people whose Google language matches. */
export function LanguagesView() {
  const { data, campaign } = useGa();
  const setScope = useGoogleAds((s) => s.setScope);
  if (campaign) {
    return (
      <div className="space-y-4">
        <ViewHeader title="Languages" subtitle={`Languages ${campaign.name} targets. To change them, ask the agent.`} />
        <Card className="p-4">
          <p className="mb-2 text-sm font-bold">Targeted languages</p>
          <div className="flex flex-wrap gap-1.5">
            {campaign.languages.length ? campaign.languages.map((l) => <Pill key={l} tone="brand">{l}</Pill>) : <span className="text-xs text-muted-foreground">All languages</span>}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Ads show to people whose Google language setting matches, or who use a matching language in their searches and browsing.</p>
        </Card>
      </div>
    );
  }
  const columns: GaColumn<Campaign>[] = [
    { id: "name", header: "Campaign", label: "Campaign", sticky: true, sortValue: (c) => c.name, render: (c) => <span className="font-semibold">{c.name}</span> },
    { id: "languages", header: "Languages", label: "Languages", render: (c) => <span className="flex flex-wrap gap-1">{c.languages.map((l) => <Pill key={l}>{l}</Pill>)}</span> },
  ];
  return (
    <div>
      <ViewHeader title="Languages" subtitle="Languages each campaign targets. Click a campaign to open it. To change them, ask the agent." />
      <GaTable rows={data.campaigns.filter((c) => c.status !== "REMOVED")} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => setScope({ campaignId: c.id }, "languages")} />
    </div>
  );
}