"use client";

import { Bot, Search } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { runAgentTurn } from "@/lib/meta-ads/agent-runner";
import type { AdSet, EntityStatus, MetaAccountData, MetaAd, MetaCampaign } from "@/lib/meta-ads/types";
import { ACCENT_BTN, Card } from "@/components/google-ads/ga-ui";

/** Ads Manager's quick filters: everything, what delivered in the date range, what is on, what is off, and what needs attention. */
export type StatusFilter = "ALL" | "DELIVERED" | "ACTIVE" | "PAUSED" | "ACTIONS";

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "DELIVERED", label: "Had delivery" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Off" },
  { value: "ACTIONS", label: "Actions" },
];

/** What the date-based filters need from each page: did the row deliver, and does it need attention. */
export type FilterRules<T> = { delivered?: (row: T) => boolean; needsAction?: (row: T) => boolean };

export function filterByStatus<T extends { status: EntityStatus }>(rows: T[], filter: StatusFilter, rules: FilterRules<T> = {}) {
  const live = rows.filter((r) => r.status !== "ARCHIVED");
  switch (filter) {
    case "ALL":
      return live;
    case "ACTIVE":
    case "PAUSED":
      return live.filter((r) => r.status === filter);
    case "DELIVERED":
      return rules.delivered ? live.filter(rules.delivered) : live;
    case "ACTIONS":
      return rules.needsAction ? live.filter(rules.needsAction) : [];
  }
}

/** Quick filters with how many rows each holds, for the filter bar. */
export function statusFilterOptions<T extends { status: EntityStatus }>(rows: T[], noun: string, rules: FilterRules<T>) {
  return STATUS_FILTERS.map((f) => ({ ...f, label: f.value === "ALL" ? `All ${noun}` : f.value === "ACTIVE" ? `Active ${noun}` : f.label, count: filterByStatus(rows, f.value, rules).length }));
}
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

/** The dashboard is view-only: anything that changes the account is a question to the agent. */
export function AskButton({ prompt, children, primary, className }: { prompt: string; children?: ReactNode; primary?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => runAgentTurn(prompt)}
      className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold", primary ? ACCENT_BTN : "border border-border/70 bg-background hover:bg-muted", className)}
    >
      <Bot className="h-3.5 w-3.5" /> {children ?? "Ask the agent"}
    </button>
  );
}

/** Small labelled value, used in summary strips. */
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-semibold">{children}</div>
    </div>
  );
}

export function SummaryStrip({ children }: { children: ReactNode }) {
  return <Card className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 p-4">{children}</Card>;
}

export function Section({ title, subtitle, actions, children, className }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-bold">{title}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}

/** A note strip, e.g. "Advantage+ placements are chosen by Meta". */
export function Note({ children, tone = "info", icon }: { children: ReactNode; tone?: "info" | "warn" | "bad" | "good"; icon?: ReactNode }) {
  const tones = {
    info: "border-sky-500/30 bg-sky-500/5",
    warn: "border-amber-500/30 bg-amber-500/5",
    bad: "border-red-500/30 bg-red-500/5",
    good: "border-emerald-500/30 bg-emerald-500/5",
  };
  return (
    <div className={cn("mb-4 flex gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed", tones[tone])}>
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Horizontal share bar used by the breakdown pages. */
export function ShareBar({ value, max, color }: { value: number; max: number; color?: string }) {
  return (
    <span className="block h-2 overflow-hidden rounded-full bg-muted">
      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (value / Math.max(max, 1e-9)) * 100)}%`, background: color ?? "linear-gradient(90deg,#400095,#F76D01)" }} />
    </span>
  );
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

// What "Actions" means in the quick filter: a rejected or limited ad, or an ad set stuck in learning limited.
export const adNeedsAction = (a: MetaAd) => a.delivery === "REJECTED" || a.review === "REJECTED" || a.review === "LIMITED";

export const adSetNeedsAction = (data: MetaAccountData, s: AdSet) =>
  s.delivery === "REJECTED" || (s.status === "ACTIVE" && s.delivery === "LEARNING_LIMITED") || data.ads.some((a) => a.adSetId === s.id && a.status !== "ARCHIVED" && adNeedsAction(a));

export const campaignNeedsAction = (data: MetaAccountData, c: MetaCampaign) =>
  c.delivery === "REJECTED" || data.adSets.some((s) => s.campaignId === c.id && s.status !== "ARCHIVED" && adSetNeedsAction(data, s));