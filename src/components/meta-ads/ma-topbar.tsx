"use client";

import { Bell, CalendarDays, Check, ChevronDown, ChevronRight, History, Infinity as InfinityIcon, Plug, RefreshCw, Settings2, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ATTRIBUTION, DATE_PRESETS } from "@/lib/meta-ads/constants";
import { formatRange } from "@/lib/meta-ads/metrics";
import { getDataSource } from "@/lib/meta-ads/data-source";
import { useAccountState, useMetaAds } from "@/lib/meta-ads/store";
import type { AttributionSetting, DateRangePreset } from "@/lib/meta-ads/types";
import { OBJECTIVES } from "@/lib/meta-ads/constants";
import { AdvantageBadge, StatusDot } from "./ma-ui";

export function MaTopbar() {
  const acc = useAccountState();
  const state = useMetaAds();
  const { scope, setScope, range, setRange, setView, refreshData, setAttribution, selectAccount, portfolios, facebookEmail, catalog } = state;
  if (!acc) return null;
  const { data } = acc;

  const campaign = data.campaigns.find((c) => c.id === scope.campaignId);
  const adSet = data.adSets.find((s) => s.id === scope.adSetId);
  const unread = data.alerts.filter((a) => !a.read).length;
  const attribution = range.attribution ?? "CLICK_7_VIEW_1";
  const accounts = portfolios.flatMap((p) => p.accounts.map((a) => ({ ...a, portfolio: p.portfolio.name })));

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-background px-3">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#400095]/10 text-[#400095] dark:bg-violet-500/15 dark:text-violet-300">
            <InfinityIcon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 text-left">
            <span className="block max-w-52 truncate text-xs font-semibold">{data.account.name}</span>
            <span className="block text-[10px] text-muted-foreground">
              {data.account.accountId} · {data.portfolio.name}
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">{facebookEmail}</DropdownMenuLabel>
          {accounts.map((a) => (
            <DropdownMenuItem key={a.accountId} onSelect={() => selectAccount(a.accountId)} className="gap-2 text-xs">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{a.name}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {a.accountId} · {a.portfolio}
                </span>
              </span>
              {a.accountId === data.account.accountId && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setScope({});
              setView("connections");
            }}
            className="gap-2 text-xs"
          >
            <Plug className="h-3.5 w-3.5" />
            <span className="flex-1">Connections</span>
            <span className={cn("text-[10px]", catalog.status === "connected" ? "text-emerald-600" : "text-muted-foreground")}>{catalog.status === "connected" ? "Catalog on" : "Catalog off"}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setScope({});
              setView("accountSettings");
            }}
            className="gap-2 text-xs"
          >
            <Settings2 className="h-3.5 w-3.5" /> Account settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="hidden min-w-0 items-center gap-1 text-xs md:flex">
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        <button type="button" onClick={() => setScope({})} className={cn("shrink-0 rounded-md px-1.5 py-0.5 hover:bg-muted", !campaign ? "font-semibold" : "text-muted-foreground")}>
          All campaigns
        </button>
        {campaign && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            <button type="button" onClick={() => setScope({ campaignId: campaign.id })} className={cn("flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-muted", !adSet ? "font-semibold" : "text-muted-foreground")}>
              <StatusDot status={campaign.status} className="h-2 w-2 ring-0" />
              <span className="truncate">{campaign.name}</span>
              <span className="shrink-0 rounded bg-muted px-1 text-[9px] font-semibold uppercase text-muted-foreground">{OBJECTIVES[campaign.objective].label}</span>
              <AdvantageBadge state={campaign.advantageState} />
            </button>
          </>
        )}
        {adSet && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            <span className="flex min-w-0 items-center gap-1.5 px-1.5 font-semibold">
              <StatusDot status={adSet.status} className="h-2 w-2 ring-0" />
              <span className="truncate">{adSet.name}</span>
            </span>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void refreshData()}
          disabled={acc.sync.status === "loading"}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 text-xs hover:bg-muted disabled:opacity-60"
          title={`${getDataSource().label}. Reload the latest numbers.`}
        >
          <RefreshCw className={cn("h-3.5 w-3.5 text-muted-foreground", acc.sync.status === "loading" && "animate-spin")} />
          <span className="hidden text-muted-foreground xl:inline">{acc.sync.status === "loading" ? "Refreshing" : `Updated ${new Date(acc.sync.refreshedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 text-xs hover:bg-muted" title="Attribution setting: how conversions are credited to ads">
            <Timer className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="hidden font-medium lg:inline">{ATTRIBUTION[attribution].short}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Attribution setting</DropdownMenuLabel>
            {(Object.keys(ATTRIBUTION) as AttributionSetting[]).map((a) => (
              <DropdownMenuItem key={a} onSelect={() => setAttribution(a)} className="gap-2 text-xs">
                {ATTRIBUTION[a].label}
                {attribution === a && <Check className="ml-auto h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
            <p className="px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">Changes every conversion number in the workspace, as in Ads Manager.</p>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 text-xs hover:bg-muted">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="hidden font-medium lg:inline">{DATE_PRESETS[range.preset].label}</span>
            <span className="text-muted-foreground">{formatRange(range)}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(DATE_PRESETS) as DateRangePreset[]).map((p) => (
              <DropdownMenuItem key={p} onSelect={() => setRange(p)} className="gap-2 text-xs">
                {DATE_PRESETS[p].label}
                {range.preset === p && <Check className="ml-auto h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button type="button" onClick={() => setView("history")} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 hover:bg-muted" title="Change history">
          <History className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            setScope({});
            setView("rules");
          }}
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 hover:bg-muted"
          title="Alerts"
        >
          <Bell className="h-3.5 w-3.5" />
          {unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F76D01] px-1 text-[9px] font-bold text-white">{unread}</span>}
        </button>
      </div>
    </div>
  );
}
