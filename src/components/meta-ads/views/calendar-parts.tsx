"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Bot, ChevronDown, Clock, ExternalLink, FlaskConical, Megaphone, Pause, Plus, Rocket, ShoppingBag, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/google-ads/ga-ui";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { runAgentTurn } from "@/lib/meta-ads/agent-runner";
import { flightBudget, flightDays, flightRange, postDay, postTime, type Flight, type FlightState, type PreviewAd } from "@/lib/meta-ads/calendar";
import { BID_STRATEGIES, CTAS, OBJECTIVES, OPTIMIZATION_GOALS, PLACEMENTS } from "@/lib/meta-ads/constants";
import { adBase, adSetBase, campaignBase, derive, isoDay, money, rangeFor } from "@/lib/meta-ads/metrics";
import { scheduleText } from "@/lib/meta-ads/mutations";
import type { CreativeAsset, OrganicPost, PostFormat, PostPlatform, PostStatus } from "@/lib/meta-ads/types";
import { AskButton } from "../ma-common";
import { AdPreviewPanel } from "../ma-ad-preview";
import { compactNumber, MediaThumb, PLATFORMS, PlatformIcons, POST_FORMATS, POST_STATUS, PostPreview } from "../ma-post-preview";
import { useMa } from "../use-ma";
import { ScheduleGrid } from "./settings";

// ─── Vocabulary ─────────────────────────────────────────────────────────────

export type ContentKind = "ADS" | "EXPERIMENTS" | PostFormat;
export type Selection = { type: "flight" | "post"; id: string } | null;

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const AD_STATES: FlightState[] = ["ACTIVE", "SCHEDULED", "DRAFT", "PAUSED", "ENDED"];
export const POST_STATUSES: PostStatus[] = ["PUBLISHED", "SCHEDULED", "DRAFT", "FAILED"];
export const ALL_PLATFORMS: PostPlatform[] = ["FACEBOOK", "INSTAGRAM"];
export const POST_KINDS: PostFormat[] = ["POST", "REEL", "STORY", "VIDEO", "CAROUSEL"];
export const ALL_KINDS: ContentKind[] = ["ADS", "EXPERIMENTS", ...POST_KINDS];

export const STATE: Record<FlightState, { label: string; badge: string; tone: "good" | "brand" | "warn" | "neutral" }> = {
  ACTIVE: { label: "Active", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", tone: "good" },
  SCHEDULED: { label: "Scheduled", badge: "bg-[#400095]/10 text-[#400095] dark:bg-violet-500/20 dark:text-violet-200", tone: "brand" },
  DRAFT: { label: "Needs approval", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300", tone: "warn" },
  PAUSED: { label: "Paused", badge: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300", tone: "neutral" },
  ENDED: { label: "Ended", badge: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400", tone: "neutral" },
};

/** The ad band: soft pills tinted by state. Drafts keep a dashed edge, like everything the agent has not applied yet. */
export const PILL: Record<FlightState, string> = {
  ACTIVE: "border-[#400095]/15 bg-[#400095]/[0.06] dark:border-violet-400/20 dark:bg-violet-500/10",
  SCHEDULED: "border-[#400095]/25 bg-card dark:border-violet-400/30",
  DRAFT: "border-dashed border-[#F76D01]/70 bg-[#F76D01]/[0.06]",
  PAUSED: "border-border/70 bg-muted/60 text-muted-foreground",
  ENDED: "border-border/50 bg-muted/40 text-muted-foreground/80",
};

/** Post cards are tinted by where they are in their life: out already, waiting, draft, or failed. */
export const POST_TINT: Record<PostStatus, { card: string; icon: string; label: string }> = {
  PUBLISHED: { card: "border-emerald-500/15 bg-emerald-500/[0.07] dark:bg-emerald-500/[0.09]", icon: "text-emerald-600 dark:text-emerald-400", label: "Published" },
  SCHEDULED: { card: "border-orange-500/20 bg-orange-500/[0.08] dark:bg-orange-500/[0.1]", icon: "text-orange-600 dark:text-orange-400", label: "Scheduled" },
  DRAFT: { card: "border-dashed border-border bg-muted/40", icon: "text-muted-foreground", label: "Draft" },
  FAILED: { card: "border-red-500/25 bg-red-500/[0.07]", icon: "text-red-600 dark:text-red-400", label: "Failed" },
};

export const KIND_LABEL: Record<Flight["kind"], string> = { CAMPAIGN: "Campaign", AD_SET: "Ad set", AD: "Ad", EXPERIMENT: "Experiment" };

export const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
export const shortDay = (d: string) => fmt(d, { month: "short", day: "numeric" });
export const longDay = (d: string) => fmt(d, { weekday: "long", month: "long", day: "numeric" });
export const time12 = (p: OrganicPost) => {
  const [h, m] = postTime(p).split(":").map(Number);
  return `${((h! + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h! < 12 ? "AM" : "PM"}`;
};
export const postWhen = (p: OrganicPost) => `${fmt(postDay(p), { weekday: "short", month: "short", day: "numeric" })} · ${time12(p)}`;

/** Art for one ad: its first creative's name (so it matches the creative library) and an icon for its format. */
export function adArt(ad: PreviewAd, creatives: CreativeAsset[]): { label: string; icon?: LucideIcon } {
  const first = creatives.find((c) => c.id === ad.mediaIds[0]);
  if (ad.format === "CATALOG" || ad.format === "COLLECTION") return { label: ad.name, icon: ShoppingBag };
  if (ad.format === "CAROUSEL") return { label: first?.name ?? ad.name, icon: POST_FORMATS.CAROUSEL.icon };
  return { label: first?.name ?? ad.name, icon: ad.format === "SINGLE_VIDEO" || first?.kind === "VIDEO" ? POST_FORMATS.REEL.icon : undefined };
}

export const toggle = <T,>(set: Set<T>, v: T) => {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
};

export type SelProps = { selection: Selection; onSelect: (s: Selection) => void };
export const isSel = (s: Selection, type: "flight" | "post", id: string) => s?.type === type && s.id === id;

export const summary = (on: number, all: number, single?: string) => (on === all ? "All" : on === 0 ? "None" : single ?? `${on} selected`);

// ─── Toolbar pieces ─────────────────────────────────────────────────────────

export function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
      {children}
    </button>
  );
}

export type FilterGroup = { title: string; items: { key: string; label: string; icon?: LucideIcon }[] };

export function FilterMenu({ label, summary, groups, selected, onToggle, onAll }: { label: string; summary: string; groups: FilterGroup[]; selected: Set<string>; onToggle: (key: string) => void; onAll: () => void }) {
  const active = summary !== "All";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn("inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition hover:bg-muted", active ? "border-[#400095]/40 bg-[#400095]/[0.06] text-[#400095] dark:text-violet-200" : "border-border/70")}>
          {label}: <span className={active ? "" : "font-medium text-muted-foreground"}>{summary}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        {groups.map((g, i) => (
          <div key={g.title}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{g.title}</DropdownMenuLabel>
            {g.items.map((it) => (
              <DropdownMenuCheckboxItem key={it.key} checked={selected.has(it.key)} onCheckedChange={() => onToggle(it.key)} onSelect={(e) => e.preventDefault()} className="text-xs">
                {it.icon && <it.icon className="h-3.5 w-3.5 text-muted-foreground" />}
                {it.label}
              </DropdownMenuCheckboxItem>
            ))}
          </div>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onAll} className="text-xs font-semibold">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Show all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CreateMenu({ postsHere }: { postsHere: boolean }) {
  const items: { label: string; icon: LucideIcon; prompt: string }[] = [
    ...(postsHere
      ? [
          { label: "Post", icon: POST_FORMATS.POST.icon, prompt: "Draft a post for this week and schedule it at the best time" },
          { label: "Reel", icon: POST_FORMATS.REEL.icon, prompt: "Draft a reel for this week and schedule it at the best time" },
          { label: "Story", icon: POST_FORMATS.STORY.icon, prompt: "Draft a story for tomorrow" },
        ]
      : []),
    { label: "Ad campaign", icon: Megaphone, prompt: "Plan a new campaign and schedule it" },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-xl bg-[#400095] px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-[#400095]/30 transition hover:bg-[#33007a]">
          <Plus className="h-4 w-4" /> Create <ChevronDown className="h-3.5 w-3.5 opacity-80" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-xl">
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">The agent drafts it for you</DropdownMenuLabel>
        {items.map((it) => (
          <DropdownMenuItem key={it.label} onSelect={() => runAgentTurn(it.prompt)} className="text-xs">
            <it.icon className="h-3.5 w-3.5" /> {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


// ─── Items ──────────────────────────────────────────────────────────────────

export function KindIcon({ flight }: { flight: Flight }) {
  const Icon = flight.kind === "EXPERIMENT" ? FlaskConical : flight.state === "DRAFT" ? Bot : flight.state === "PAUSED" ? Pause : flight.state === "SCHEDULED" ? Clock : Megaphone;
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", flight.kind === "EXPERIMENT" ? "text-sky-600" : flight.state === "DRAFT" ? "text-[#F76D01]" : "text-[#400095] dark:text-violet-300")} />;
}

export function StateBadge({ state, className }: { state: FlightState; className?: string }) {
  return <span className={cn("shrink-0 rounded-md px-1.5 py-px text-[10px] font-bold", STATE[state].badge, className)}>{STATE[state].label}</span>;
}

export function ExperimentTile({ className }: { className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600", className)}>
      <FlaskConical className="h-4 w-4" />
    </span>
  );
}


export function StatusIcon({ post }: { post: OrganicPost }) {
  const Icon = post.status === "SCHEDULED" ? Clock : post.status === "FAILED" ? TriangleAlert : post.status === "DRAFT" ? Bot : POST_FORMATS[post.format].icon;
  return <Icon className="h-3.5 w-3.5 shrink-0" />;
}

/** Media art with platform badges in the corner, a duration for video and a counter for carousels. */
export function PostMedia({ post, className, big }: { post: OrganicPost; className?: string; big?: boolean }) {
  const F = POST_FORMATS[post.format];
  const m = post.media[0];
  return (
    <MediaThumb label={m?.label ?? post.caption} icon={big ? undefined : F.icon} className={className} iconClassName={big ? undefined : "h-3.5 w-3.5"}>
      {big && (
        <>
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.28),transparent_55%)]" />
          <F.icon className="h-6 w-6 opacity-90 drop-shadow" />
          {m?.durationSec && <span className="absolute left-1.5 top-1.5 rounded-md bg-black/45 px-1.5 py-0.5 text-[9px] font-bold tabular-nums backdrop-blur-sm">0:{String(m.durationSec).padStart(2, "0")}</span>}
          {post.media.length > 1 && <span className="absolute left-1.5 top-1.5 rounded-md bg-black/45 px-1.5 py-0.5 text-[9px] font-bold backdrop-blur-sm">1/{post.media.length}</span>}
          <PlatformIcons platforms={post.platforms} className="absolute bottom-1.5 right-1.5" />
        </>
      )}
    </MediaThumb>
  );
}


// ─── Hover popups ───────────────────────────────────────────────────────────

const HOVER_DELAY = 420;
const POPUP_WIDTH = 320;

/**
 * A delayed glass tooltip pinned to where the pointer rested, not to the element: timeline bars can be
 * thousands of pixels wide and mostly off screen, so anchoring to them puts the popup in the wrong place.
 * It never follows the canvas: scrolling, pressing or leaving closes it. `suppress` keeps it shut while dragging.
 */
export function Hover({ content, children, suppress }: { content: () => ReactNode; children: ReactNode; suppress?: boolean }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("wheel", close);
      window.removeEventListener("resize", close);
    };
  }, [at]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const hide = () => {
    clearTimeout(timer.current);
    setAt(null);
  };

  return (
    // display: contents keeps the wrapper out of layout while it still hears the pointer.
    <span
      className="contents"
      onPointerEnter={(e: PointerEvent<HTMLSpanElement>) => {
        if (e.pointerType !== "mouse") return;
        pointer.current = { x: e.clientX, y: e.clientY };
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setAt({ ...pointer.current }), HOVER_DELAY);
      }}
      onPointerMove={(e: PointerEvent<HTMLSpanElement>) => {
        pointer.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
    >
      {children}
      {at && !suppress && createPortal(<HoverPopup at={at}>{content()}</HoverPopup>, document.body)}
    </span>
  );
}

/** Fixed to the viewport next to the pointer: above it when there is room, otherwise below, always fully on screen. */
function HoverPopup({ at, children }: { at: { x: number; y: number }; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    const left = Math.min(Math.max(12, at.x - 28), window.innerWidth - POPUP_WIDTH - 12);
    const below = at.y - h - 18 < 12;
    const top = below ? Math.min(at.y + 22, window.innerHeight - h - 12) : at.y - h - 18;
    setPos({ left, top: Math.max(12, top), below });
  }, [at]);
  return (
    <motion.div
      ref={ref}
      role="tooltip"
      initial={{ opacity: 0, scale: 0.96, y: 4 }}
      animate={pos ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: POPUP_WIDTH, transformOrigin: pos?.below ? "top left" : "bottom left" }}
      className="pointer-events-none z-[60] overflow-hidden rounded-2xl border border-black/[0.06] bg-popover/90 text-popover-foreground shadow-[0_24px_60px_-20px_rgba(15,10,40,0.45)] backdrop-blur-2xl dark:border-white/10"
    >
      {children}
    </motion.div>
  );
}

export function FlightHover({ flight, children, suppress }: { flight: Flight; children: ReactNode; suppress?: boolean }) {
  return (
    <Hover suppress={suppress} content={() => <FlightSummary flight={flight} />}>
      {children}
    </Hover>
  );
}

export function PostHover({ post, children, suppress }: { post: OrganicPost; children: ReactNode; suppress?: boolean }) {
  return (
    <Hover suppress={suppress} content={() => <PostSummary post={post} />}>
      {children}
    </Hover>
  );
}

/** Delivery from the start of a flight to today (or its end). Nothing before it starts. */
export function useFlightToDate(flight: Flight, today: string) {
  const { data } = useMa();
  if (flight.state === "DRAFT" || flight.start > today || flight.kind === "EXPERIMENT") return null;
  const end = flight.end && flight.end < today ? flight.end : today;
  const range = { ...rangeFor("LAST_30_DAYS", today), start: flight.start, end };
  const base = flight.kind === "CAMPAIGN" ? campaignBase(data, flight.id, range) : flight.kind === "AD_SET" ? adSetBase(data, flight.id, range) : adBase(data, flight.id, range);
  return base.spend > 0 ? derive(base) : null;
}

export function FlightSummary({ flight }: { flight: Flight }) {
  const { data, currency } = useMa();
  const today = isoDay(new Date());
  const budget = flightBudget(data, flight);
  const toDate = useFlightToDate(flight, today);
  const days = flightDays(flight);
  const first = flight.ads[0];
  const art = first ? adArt(first, data.creatives) : null;
  return (
    <div data-testid="meta-calendar-hover">
      <div className="flex gap-3 p-3">
        {art ? <MediaThumb label={art.label} icon={art.icon} className="h-16 w-16 rounded-xl" iconClassName="h-4 w-4" /> : <ExperimentTile className="h-16 w-16" />}
        <div className="min-w-0">
          <StateBadge state={flight.state} />
          <p className="mt-1 line-clamp-2 text-sm font-bold leading-snug">{flight.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {KIND_LABEL[flight.kind]} · {flight.detail}
          </p>
        </div>
      </div>
      {first?.primaryTexts[0] && (
        <div className="mx-3 mb-3 rounded-xl bg-muted/50 px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Ad copy</p>
          <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug">{first.primaryTexts[0]}</p>
          {first.headlines[0] && <p className="mt-1 text-[11px] font-bold">{first.headlines[0]}</p>}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-px border-y border-border/60 bg-border/60">
        <Fact label="Runs">{`${shortDay(flight.start)} → ${flight.end ? shortDay(flight.end) : "no end"}`}</Fact>
        <Fact label={budget?.kind === "LIFETIME" ? "Lifetime budget" : "Daily budget"}>{budget ? `${money(budget.amount, currency)}${budget.fromAdSets ? " (ad sets)" : ""}` : "—"}</Fact>
        <Fact label="Spent so far">{toDate ? money(toDate.spend, currency) : flight.state === "SCHEDULED" ? "Not started" : "—"}</Fact>
        <Fact label="Results">{toDate ? compactNumber(toDate.results) : days ? `${days}-day flight` : "Always on"}</Fact>
      </dl>
      {flight.ads.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span className="flex -space-x-2">
            {flight.ads.slice(0, 5).map((a) => {
              const x = adArt(a, data.creatives);
              return <MediaThumb key={a.key} label={x.label} icon={x.icon} className="h-8 w-8 rounded-lg ring-2 ring-popover" iconClassName="h-2.5 w-2.5" />;
            })}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {flight.ads.length} ad{flight.ads.length === 1 ? "" : "s"}
            {flight.ads.length > 5 ? ` (+${flight.ads.length - 5})` : ""}
          </span>
        </div>
      )}
      <p className="bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground">Click for full details</p>
    </div>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-popover px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="truncate text-xs font-bold tabular-nums">{children}</dd>
    </div>
  );
}

export function PostSummary({ post }: { post: OrganicPost }) {
  const F = POST_FORMATS[post.format];
  const m = post.metrics;
  return (
    <div>
      <div className="flex gap-3 p-3">
        <PostMedia post={post} big className={cn("rounded-xl", F.vertical ? "h-28 w-[70px]" : "h-20 w-20")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Pill tone={POST_STATUS[post.status].tone}>{POST_STATUS[post.status].label}</Pill>
            <span className="text-[11px] font-semibold text-muted-foreground">{F.label}</span>
          </div>
          <p className="mt-1 text-[11px] font-semibold">{postWhen(post)}</p>
          <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-muted-foreground">{post.caption}</p>
        </div>
      </div>
      {m ? (
        <dl className="grid grid-cols-4 gap-px border-t border-border/60 bg-border/60 text-center">
          {(
            [
              ["Reach", m.reach],
              [m.plays !== undefined ? "Plays" : "Likes", m.plays ?? m.likes],
              ["Comments", m.comments],
              ["Shares", m.shares],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="bg-popover py-2">
              <dd className="text-xs font-black tabular-nums">{compactNumber(v)}</dd>
              <dt className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
            </div>
          ))}
        </dl>
      ) : post.status === "FAILED" ? (
        <p className="border-t border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-700 dark:text-red-300">{post.error}</p>
      ) : (
        <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
          {post.createdBy === "AGENT" ? "Drafted by the agent. " : ""}
          {post.status === "DRAFT" ? "Not scheduled yet." : `Publishes automatically at ${time12(post)}.`}
        </p>
      )}
      <p className="bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground">Click for full details</p>
    </div>
  );
}

// ─── Slide-over with full details ───────────────────────────────────────────

/** The nearest ancestor that scrolls vertically: in the app that is the page area, not the window. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if ((y === "auto" || y === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

export function Drawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  // The part of the planner that is on screen right now. The panel fits exactly inside it, so its
  // whole body and buttons are reachable without scrolling the page first.
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const parent = scrollParent(el);
    const measure = () => {
      const r = el.getBoundingClientRect();
      const view = parent?.getBoundingClientRect();
      const top = Math.max(r.top, view?.top ?? 0, 0);
      const bottom = Math.min(r.bottom, view?.bottom ?? window.innerHeight, window.innerHeight);
      setBox({ top: top - r.top, height: Math.max(0, bottom - top) });
    };
    measure();
    const target: HTMLElement | Window = parent ?? window;
    target.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      target.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, []);

  return (
    // Contained: it fills its positioned parent (the planner card), not the window.
    <div ref={root} className="absolute inset-0 z-40 overflow-clip rounded-[inherit]" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close details" onClick={onClose} className="absolute inset-0 bg-white/30 backdrop-blur-[3px] animate-in fade-in-0 dark:bg-black/40" />
      <aside className="absolute inset-y-0 right-0 w-full max-w-[380px] border-l border-black/[0.06] bg-background/95 shadow-[-24px_0_60px_-30px_rgba(30,10,80,0.35)] backdrop-blur-xl animate-in slide-in-from-right duration-300 dark:border-white/10">
        <div className="absolute inset-x-0 flex flex-col" style={{ top: box?.top ?? 0, height: box ? box.height : "100%" }}>
          {children}
        </div>
      </aside>
    </div>
  );
}

export function DrawerHeader({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-start gap-3 border-b border-border/60 px-4 py-3">
      <div className="min-w-0 flex-1">{children}</div>
      <button type="button" aria-label="Close details" onClick={onClose} className="-mr-1 rounded-xl p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-border/50 rounded-2xl border border-border/60">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-4 px-3.5 py-2.5 text-xs">
          <dt className="shrink-0 text-muted-foreground">{k}</dt>
          <dd className="min-w-0 text-right font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-2.5 py-2">
      <p className="truncate text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-black tabular-nums">{value}</p>
    </div>
  );
}

/** Everything about one campaign, ad set, ad or experiment: delivery to date, budget, setup, schedule and a live preview of its ads. */
export function FlightDetail({ flight, today, onClose }: { flight: Flight; today: string; onClose: () => void }) {
  const { data, currency } = useMa();
  const [adKey, setAdKey] = useState<string | null>(null);
  const ad = flight.ads.find((a) => a.key === adKey) ?? flight.ads[0];
  const campaign = data.campaigns.find((c) => c.id === flight.campaignId);
  const adSet = data.adSets.find((s) => s.id === (flight.adSetId ?? (flight.kind === "AD_SET" ? flight.id : undefined)));
  const realAd = flight.kind === "AD" ? data.ads.find((a) => a.id === flight.id) : undefined;
  const budget = flightBudget(data, flight);
  const toDate = useFlightToDate(flight, today);
  const days = flightDays(flight);
  const daysLeft = flight.end && flight.end >= today ? Math.round((Date.parse(flight.end) - Date.parse(today > flight.start ? today : flight.start)) / 86_400_000) + 1 : undefined;
  const audienceNames = (ids: string[]) => ids.map((id) => data.audiences.find((a) => a.id === id)?.name ?? id).join(", ");

  const setup: [string, ReactNode][] = [];
  if (campaign) {
    setup.push(["Campaign", campaign.name], ["Objective", OBJECTIVES[campaign.objective].label]);
    if (campaign.advantageState === "ADVANTAGE_PLUS") setup.push(["Advantage+", "On (budget, audience and placements)"]);
  }
  if (adSet) {
    if (flight.kind !== "AD_SET") setup.push(["Ad set", adSet.name]);
    setup.push(["Optimised for", OPTIMIZATION_GOALS[adSet.optimizationGoal]?.label ?? adSet.optimizationGoal]);
    const bid = adSet.bidStrategy ?? campaign?.bidStrategy;
    if (bid) setup.push(["Bid strategy", BID_STRATEGIES[bid].label]);
    const t = adSet.targeting;
    setup.push(["Audience", t.advantageAudience ? "Advantage+ audience" : `${t.locations.map((l) => l.name).join(", ")} · ${t.ageMin}–${t.ageMax}${t.genders !== "ALL" ? ` · ${t.genders.toLowerCase()}` : ""}`]);
    if (t.includeAudienceIds.length) setup.push(["Includes", audienceNames(t.includeAudienceIds)]);
    if (t.excludeAudienceIds.length) setup.push(["Excludes", audienceNames(t.excludeAudienceIds)]);
    setup.push(["Placements", adSet.placements.advantage ? "Advantage+ placements" : adSet.placements.manual.map((p) => PLACEMENTS[p].label).join(", ")]);
  } else if (campaign && flight.kind === "CAMPAIGN") {
    setup.push(["Ad sets", String(data.adSets.filter((s) => s.campaignId === campaign.id && s.status !== "ARCHIVED").length)]);
  }
  if (realAd) {
    setup.push(["Review", realAd.review === "APPROVED" ? "Approved" : realAd.review === "IN_REVIEW" ? "In review" : realAd.review === "REJECTED" ? "Rejected" : "Limited"]);
    setup.push(["Call to action", realAd.cta === "NO_BUTTON" ? "None" : CTAS[realAd.cta]]);
  }

  return (
    <>
      <DrawerHeader onClose={onClose}>
        <div className="flex flex-wrap items-center gap-1.5">
          <StateBadge state={flight.state} />
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <KindIcon flight={flight} /> {KIND_LABEL[flight.kind]} · {flight.detail}
          </span>
        </div>
        <p className="mt-1 text-[15px] font-black leading-snug tracking-tight">{flight.name}</p>
        <p className="text-xs text-muted-foreground">{flightRange(flight)}</p>
      </DrawerHeader>

      <div className="scroll-slim min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4" data-testid="meta-calendar-panel">
        {flight.state === "DRAFT" && <p className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 text-xs">Drafted by the agent. Nothing runs until you approve it in Pending changes.</p>}
        {flight.state === "SCHEDULED" && <p className="rounded-2xl border border-[#400095]/25 bg-[#400095]/5 px-3.5 py-2.5 text-xs">Approved and waiting: delivery starts on {longDay(flight.start)}.</p>}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MiniStat label={budget?.kind === "LIFETIME" ? "Lifetime budget" : "Daily budget"} value={budget ? money(budget.amount, currency) : "—"} />
          <MiniStat label="Spent so far" value={toDate ? money(toDate.spend, currency) : flight.state === "SCHEDULED" ? "Not started" : "—"} />
          <MiniStat label={daysLeft !== undefined ? "Days left" : "Length"} value={daysLeft !== undefined ? String(daysLeft) : days ? `${days} days` : "Always on"} />
          {toDate && (
            <>
              <MiniStat label="Results" value={compactNumber(toDate.results)} />
              <MiniStat label="Cost / result" value={toDate.costPerResult ? money(toDate.costPerResult, currency) : "—"} />
              <MiniStat label={toDate.purchaseValue ? "ROAS" : "CTR"} value={toDate.purchaseValue ? `${toDate.roas.toFixed(2)}×` : `${(toDate.ctr * 100).toFixed(2)}%`} />
              <MiniStat label="Impressions" value={compactNumber(toDate.impressions)} />
              <MiniStat label="Reach" value={compactNumber(toDate.reach)} />
              <MiniStat label="Link clicks" value={compactNumber(toDate.linkClicks)} />
            </>
          )}
        </div>

        {setup.length > 0 && (
          <Section title="Setup">
            <Rows rows={setup} />
          </Section>
        )}

        {flight.kind === "AD_SET" && adSet && (
          <Section title="Ad schedule">
            <p className="text-xs">
              <span className="font-semibold">{scheduleText(adSet.schedule)}</span>
            </p>
            <ScheduleGrid schedule={adSet.schedule} />
          </Section>
        )}

        {flight.ads.length > 0 ? (
          <Section title={`${flight.ads.length} ad${flight.ads.length === 1 ? "" : "s"}`}>
            {flight.ads.length > 1 && (
              <div className="scroll-slim flex gap-2 overflow-x-auto pb-1">
                {flight.ads.map((a) => {
                  const art = adArt(a, data.creatives);
                  const on = a.key === ad?.key;
                  return (
                    <button key={a.key} type="button" title={a.name} onClick={() => setAdKey(a.key)} className={cn("w-20 shrink-0 rounded-2xl p-1 text-left transition", on ? "bg-[#400095]/[0.07] ring-2 ring-[#400095] dark:ring-violet-400" : "opacity-70 hover:opacity-100")}>
                      <MediaThumb label={art.label} icon={art.icon} className="h-16 w-full rounded-xl" iconClassName="h-4 w-4" />
                      <span className="mt-1 block truncate text-[10px] font-medium">{a.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {ad && (
              <div className="rounded-3xl bg-muted/40 p-3">
                <div style={{ zoom: 0.82 }}>
                  <AdPreviewPanel ad={ad} creatives={data.creatives} />
                </div>
                <dl className="mt-4 space-y-1 text-xs">
                  <p className="font-bold">{ad.name}</p>
                  <p className="text-muted-foreground">{ad.headlines[0]}</p>
                  <a href={ad.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#400095] hover:underline dark:text-violet-300">
                    {ad.link.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3" />
                  </a>
                </dl>
              </div>
            )}
          </Section>
        ) : (
          flight.kind === "EXPERIMENT" && <p className="text-xs text-muted-foreground">Experiments do not have ads of their own. Open Experiments for the results.</p>
        )}
      </div>

      {flight.kind !== "EXPERIMENT" && flight.state !== "DRAFT" && (
        <div className="flex flex-wrap gap-2 border-t border-border/60 px-4 py-2.5">
          <AskButton prompt={`Extend ${flight.name} by 2 weeks`}>Extend 2 weeks</AskButton>
          <AskButton prompt={`Change the dates of ${flight.name}`}>Reschedule</AskButton>
          <AskButton prompt={`How is ${flight.name} doing and what should I change?`}>Review performance</AskButton>
        </div>
      )}
    </>
  );
}

/** Everything about one post: the preview per platform, the full caption, engagement and where it stands. */
export function PostDetail({ post, onClose }: { post: OrganicPost; onClose: () => void }) {
  const { data } = useMa();
  const [platform, setPlatform] = useState<PostPlatform>(post.platforms.includes("INSTAGRAM") ? "INSTAGRAM" : post.platforms[0]!);
  const F = POST_FORMATS[post.format];
  const boostedBy = post.boostedAdId ? data.ads.find((a) => a.id === post.boostedAdId) : undefined;
  const m = post.metrics;
  const short = post.caption.length > 40 ? `${post.caption.slice(0, 40)}…` : post.caption;
  const engagement = m ? (m.likes + m.comments + m.shares + m.saves) / Math.max(1, m.reach) : 0;

  return (
    <>
      <DrawerHeader onClose={onClose}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone={POST_STATUS[post.status].tone}>{POST_STATUS[post.status].label}</Pill>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <F.icon className="h-3.5 w-3.5" /> {F.label}
          </span>
          {post.createdBy === "AGENT" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F76D01]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#b45309] dark:text-orange-300">
              <Bot className="h-3 w-3" /> Agent draft
            </span>
          )}
        </div>
        <p className="mt-1 text-[15px] font-black leading-snug tracking-tight">{postWhen(post)}</p>
        <p className="text-xs text-muted-foreground">Shared to {post.platforms.map((p) => PLATFORMS[p].label).join(" and ")}</p>
      </DrawerHeader>

      <div className="scroll-slim min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4" data-testid="meta-calendar-post-panel">
        {post.status === "FAILED" && <p className="rounded-2xl border border-red-500/30 bg-red-500/5 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300">{post.error}</p>}

        <div className="space-y-3 rounded-3xl bg-muted/40 p-3">
          {post.platforms.length > 1 && (
            <div className="flex justify-center">
              <div className="inline-flex rounded-xl bg-card p-1 shadow-sm">
                {post.platforms.map((p) => {
                  const P = PLATFORMS[p];
                  return (
                    <button key={p} type="button" onClick={() => setPlatform(p)} className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition", platform === p ? "bg-[#400095] text-white" : "text-muted-foreground hover:text-foreground")}>
                      <P.icon className="h-3.5 w-3.5" /> {P.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex justify-center">
            <div style={{ zoom: 0.82 }}>
              <PostPreview post={post} platform={platform} />
            </div>
          </div>
        </div>

        {m && (
          <Section title="Performance">
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Reach" value={compactNumber(m.reach)} />
              <MiniStat label={m.plays !== undefined ? "Plays" : "Impressions"} value={compactNumber(m.plays ?? m.impressions)} />
              <MiniStat label="Engagement" value={`${(engagement * 100).toFixed(1)}%`} />
              <MiniStat label="Likes" value={compactNumber(m.likes)} />
              <MiniStat label="Comments" value={compactNumber(m.comments)} />
              <MiniStat label="Shares" value={compactNumber(m.shares)} />
              <MiniStat label="Saves" value={compactNumber(m.saves)} />
            </div>
          </Section>
        )}

        <Section title="Caption">
          <p className="whitespace-pre-line rounded-2xl border border-border/60 px-3.5 py-3 text-sm leading-relaxed">{post.caption}</p>
        </Section>

        <Section title="Details">
          <Rows
            rows={[
              [post.status === "PUBLISHED" ? "Published" : "Publishes", postWhen(post)],
              ["Format", `${F.label}${post.media.length > 1 ? ` · ${post.media.length} slides` : ""}${post.media[0]?.durationSec ? ` · ${post.media[0].durationSec}s` : ""}`],
              ["Shared to", <PlatformIcons key="p" platforms={post.platforms} />],
              ["Account", `${post.identity.pageName}${post.identity.instagramHandle ? ` · ${post.identity.instagramHandle}` : ""}`],
              ["Created by", post.createdBy === "AGENT" ? "The agent" : "Your team"],
              ...(post.link ? ([["Link", post.link.replace(/^https?:\/\//, "")]] as [string, ReactNode][]) : []),
              ...(boostedBy
                ? ([
                    [
                      "Boosted by",
                      <span key="b" className="inline-flex items-center gap-1">
                        <Rocket className="h-3.5 w-3.5 text-[#400095] dark:text-violet-300" /> {boostedBy.name}
                      </span>,
                    ],
                  ] as [string, ReactNode][])
                : []),
            ]}
          />
        </Section>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border/60 px-4 py-2.5">
        {post.status === "PUBLISHED" && !boostedBy && <AskButton prompt={`Boost the ${F.label.toLowerCase()} "${short}" as an ad`}>Boost as an ad</AskButton>}
        {(post.status === "SCHEDULED" || post.status === "DRAFT") && <AskButton prompt={`Move the ${F.label.toLowerCase()} "${short}" to a better time`}>Find a better time</AskButton>}
        {post.status === "FAILED" && <AskButton prompt={`Fix and republish the ${F.label.toLowerCase()} "${short}"`}>Fix and republish</AskButton>}
        <AskButton prompt={`Write 3 caption ideas for the ${F.label.toLowerCase()} "${short}"`}>Caption ideas</AskButton>
      </div>
    </>
  );
}

