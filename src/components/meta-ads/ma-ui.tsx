"use client";

// Meta-specific building blocks: status, delivery, review, rankings, learning.
// Generic pieces (Pill, Card, Toggle…) come from the Google Ads kit.

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pill } from "@/components/google-ads/ga-ui";
import { ADVANTAGE_STATES, DELIVERY, OBJECTIVES, RANKINGS } from "@/lib/meta-ads/constants";
import type { AdSetLearning, AdvantageState, DeliveryStatus, EntityStatus, Objective, Ranking, ReviewStatus } from "@/lib/meta-ads/types";

export { ACCENT_BTN } from "@/components/google-ads/ga-ui";

export const STATUS_META: Record<EntityStatus, { label: string; dot: string }> = {
  ACTIVE: { label: "Active", dot: "bg-emerald-500" },
  PAUSED: { label: "Off", dot: "bg-zinc-400 dark:bg-zinc-500" },
  ARCHIVED: { label: "Archived", dot: "bg-red-500" },
};

export function StatusDot({ status, className }: { status: EntityStatus; className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background", STATUS_META[status].dot, status === "PAUSED" && "rounded-[3px]", className)} aria-label={STATUS_META[status].label} />;
}

/** The on/off dot that opens On / Off, like Ads Manager's toggle column. */
export function StatusMenu({ status, onChange, disabled }: { status: EntityStatus; onChange: (status: EntityStatus) => void; disabled?: boolean }) {
  if (disabled || status === "ARCHIVED") return <StatusDot status={status} />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted" onClick={(e) => e.stopPropagation()} aria-label={`Status: ${STATUS_META[status].label}`}>
        <StatusDot status={status} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-36" onClick={(e) => e.stopPropagation()}>
        {(["ACTIVE", "PAUSED"] as EntityStatus[]).map((s) => (
          <DropdownMenuItem key={s} onSelect={() => s !== status && onChange(s)} className="gap-2 text-xs">
            <StatusDot status={s} />
            {s === "ACTIVE" ? "Turn on" : "Turn off"}
            {s === status && <span className="ml-auto text-[10px] text-muted-foreground">current</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DeliveryPill({ delivery, className }: { delivery: DeliveryStatus; className?: string }) {
  const d = DELIVERY[delivery];
  return (
    <span title={d.hint}>
      <Pill tone={d.tone} className={className}>
        {d.label}
      </Pill>
    </span>
  );
}

export function ReviewPill({ review }: { review: ReviewStatus }) {
  const map: Record<ReviewStatus, { label: string; tone: "good" | "warn" | "bad" | "info" }> = {
    APPROVED: { label: "Approved", tone: "good" },
    IN_REVIEW: { label: "In review", tone: "info" },
    REJECTED: { label: "Rejected", tone: "bad" },
    LIMITED: { label: "Limited", tone: "warn" },
  };
  return <Pill tone={map[review].tone}>{map[review].label}</Pill>;
}

export function RankingPill({ ranking }: { ranking: Ranking }) {
  const r = RANKINGS[ranking];
  return <Pill tone={r.tone}>{r.label}</Pill>;
}

export function ObjectivePill({ objective }: { objective: Objective }) {
  return <Pill tone="neutral">{OBJECTIVES[objective].label}</Pill>;
}

export function AdvantageBadge({ state }: { state: AdvantageState }) {
  if (state === "MANUAL") return null;
  const meta = ADVANTAGE_STATES[state];
  return (
    <Pill tone={state === "ADVANTAGE_PLUS" ? "brand" : "warn"}>
      {state === "ADVANTAGE_PLUS" && <Sparkles className="h-2.5 w-2.5" />}
      {state === "ADVANTAGE_PLUS" ? "Advantage+" : "Legacy · view only"}
      <span className="sr-only">{meta.blurb}</span>
    </Pill>
  );
}

/** Learning progress: results so far out of the 50 Meta wants in 7 days. */
export function LearningBar({ learning, compact }: { learning: AdSetLearning; compact?: boolean }) {
  const share = Math.min(1, learning.events / learning.target);
  const label = learning.phase === "SUCCESS" ? "Learning complete" : learning.phase === "LIMITED" ? "Learning limited" : "Learning";
  const color = learning.phase === "SUCCESS" ? "bg-emerald-500" : learning.phase === "LIMITED" ? "bg-amber-500" : "bg-sky-500";
  return (
    <div className={cn("min-w-0", compact ? "w-28" : "w-full")}>
      {!compact && (
        <div className="mb-1 flex justify-between text-[11px]">
          <span className="font-semibold">{label}</span>
          <span className="tabular-nums text-muted-foreground">
            {learning.events} / {learning.target} results in 7 days
          </span>
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${share * 100}%` }} />
      </div>
      {compact && (
        <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
          {learning.events}/{learning.target}
        </p>
      )}
    </div>
  );
}
