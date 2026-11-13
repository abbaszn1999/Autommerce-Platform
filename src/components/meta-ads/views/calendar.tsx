"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MotionConfig, motion, type PanInfo } from "motion/react";
import { Bot, ChevronDown, ChevronLeft, ChevronRight, Clock, FlaskConical, GripVertical, Megaphone, Play, Plus, Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewHeader } from "@/components/google-ads/ga-ui";
import { runAgentTurn } from "@/lib/meta-ads/agent-runner";
import { buildFlights, byPriority, flightBudget, layoutRange, postsByDay, weekStart, type Bar, type Flight } from "@/lib/meta-ads/calendar";
import { PLACEMENTS } from "@/lib/meta-ads/constants";
import { addDays, isoDay, money } from "@/lib/meta-ads/metrics";
import { useMetaAds } from "@/lib/meta-ads/store";
import type { MetaAccountData, OrganicPost, PostPlatform, PostStatus } from "@/lib/meta-ads/types";
import { Note } from "../ma-common";
import { compactNumber, mediaBackground, PLATFORMS, POST_FORMATS } from "../ma-post-preview";
import { useMa } from "../use-ma";
import {
  AD_STATES,
  ALL_KINDS,
  ALL_PLATFORMS,
  CreateMenu,
  Drawer,
  FilterMenu,
  FlightDetail,
  FlightHover,
  KIND_LABEL,
  NavButton,
  POST_KINDS,
  POST_STATUSES,
  POST_TINT,
  PostDetail,
  PostHover,
  STATE,
  adArt,
  fmt,
  shortDay,
  summary,
  time12,
  toggle,
  type ContentKind,
  type Selection,
} from "./calendar-parts";

export { FlightDetail, PostDetail } from "./calendar-parts";

// ─── Canvas geometry ────────────────────────────────────────────────────────

type Density = "comfortable" | "compact";
const COL: Record<Density, number> = { comfortable: 248, compact: 188 };
const GAP = 12;
const LANE = 46;
/** Days added at an edge when the timeline scrolls close to it. */
const CHUNK = 28;
/** Ad lanes visible before the rest fold away (only while posts share the canvas). */
const LANE_CAP = 3;

/** Weighty but quick: cards settle into a day with a little overshoot. */
const SPRING = { type: "spring", stiffness: 380, damping: 30, mass: 0.9 } as const;

/** Frosted glass used by every floating surface on the canvas. */
const GLASS = "border border-black/[0.06] bg-white/75 backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.04]";

// ─── View ───────────────────────────────────────────────────────────────────

/** The planner: an endless, horizontally scrolling timeline of ads in flight and the posts going out each day. */
export function CalendarView() {
  const { acc, data, scope } = useMa();
  const reschedulePost = useMetaAds((s) => s.reschedulePost);
  const today = useMemo(() => isoDay(new Date()), []);

  const [density, setDensity] = useState<Density>("comfortable");
  const [kinds, setKinds] = useState<Set<ContentKind>>(() => new Set(ALL_KINDS));
  const [adStates, setAdStates] = useState(() => new Set(AD_STATES));
  const [postStatuses, setPostStatuses] = useState(() => new Set(POST_STATUSES));
  const [platforms, setPlatforms] = useState(() => new Set(ALL_PLATFORMS));
  const [selection, setSelection] = useState<Selection>(null);
  const [range, setRange] = useState(() => ({ from: addDays(weekStart(today), -14), count: 70 }));
  const [firstVisible, setFirstVisible] = useState(today);
  const [viewWidth, setViewWidth] = useState(1100);
  const [lanesOpen, setLanesOpen] = useState(false);
  const [drag, setDrag] = useState<{ id: string; over?: string } | null>(null);
  const [settling, setSettling] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Posts belong to the Page, not to a campaign: they only show at account level.
  const postsHere = !scope.campaignId && !scope.adSetId;
  const allFlights = useMemo(() => buildFlights(data, scope, acc.changes, today), [data, scope, acc.changes, today]);
  const flights = useMemo(() => allFlights.filter((f) => adStates.has(f.state) && kinds.has(f.kind === "EXPERIMENT" ? "EXPERIMENTS" : "ADS")), [allFlights, adStates, kinds]);
  const posts = useMemo(
    () => (postsHere ? data.posts.filter((p) => kinds.has(p.format) && postStatuses.has(p.status) && p.platforms.some((x) => platforms.has(x))) : []),
    [data.posts, postsHere, kinds, postStatuses, platforms]
  );
  const showingPosts = postsHere && POST_KINDS.some((k) => kinds.has(k));

  const col = COL[density];
  const stride = col + GAP;
  const timeline = useMemo(() => layoutRange(flights, range.from, range.count, byPriority), [flights, range]);
  const byDay = useMemo(() => postsByDay(posts, timeline.days[0]!, timeline.days.at(-1)!), [posts, timeline.days]);
  const launches = useMemo(() => {
    const out = new Map<string, Flight[]>();
    for (const f of flights) if (f.kind !== "EXPERIMENT" && f.start >= range.from) out.set(f.start, [...(out.get(f.start) ?? []), f]);
    return out;
  }, [flights, range.from]);
  const dailyBudget = useMemo(() => {
    const spend = flights.filter((f) => f.kind !== "EXPERIMENT" && (f.state === "ACTIVE" || f.state === "SCHEDULED")).map((f) => ({ f, b: flightBudget(data, f) })).filter((x) => x.b?.kind === "DAILY");
    return (day: string) => spend.reduce((t, { f, b }) => (f.start <= day && (!f.end || f.end >= day) ? t + b!.amount : t), 0);
  }, [flights, data]);

  const cap = showingPosts && !lanesOpen ? LANE_CAP : Infinity;
  const hiddenLanes = timeline.bars.filter((b) => b.lane >= LANE_CAP).length;
  const lanes = Math.min(timeline.lanes, cap);

  // ── Scrolling: start on this week, grow at either edge, keep the view still when days are added on the left.
  const scroller = useRef<HTMLDivElement>(null);
  const shift = useRef(0);
  const growing = useRef(false);
  const indexOf = (day: string) => Math.round((Date.parse(day) - Date.parse(range.from)) / 86_400_000);
  const scrollToDay = (day: string, smooth = true) => scroller.current?.scrollTo({ left: Math.max(0, (indexOf(day) - 1) * stride), behavior: smooth ? "smooth" : "auto" });

  useLayoutEffect(() => {
    scrollToDay(today, false);
    // Only on mount: later moves are the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (shift.current && scroller.current) scroller.current.scrollLeft += shift.current;
    shift.current = 0;
    growing.current = false;
  }, [range.from]);
  useLayoutEffect(() => {
    // Keep the same first day in view when the density changes.
    scrollToDay(addDays(firstVisible, 1), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [density]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const first = addDays(range.from, Math.max(0, Math.floor(el.scrollLeft / stride)));
    if (first !== firstVisible) setFirstVisible(first);
    if (growing.current) return;
    if (el.scrollLeft < stride * 5) {
      growing.current = true;
      shift.current = CHUNK * stride;
      setRange((r) => ({ from: addDays(r.from, -CHUNK), count: r.count + CHUNK }));
    } else if (el.scrollLeft + el.clientWidth > el.scrollWidth - stride * 5) {
      setRange((r) => ({ ...r, count: r.count + CHUNK }));
    }
  };

  // ── Drag and drop.
  const dayAt = (clientX: number) => {
    const inner = scroller.current?.firstElementChild?.getBoundingClientRect();
    if (!inner) return undefined;
    const i = Math.floor((clientX - inner.left - 16) / stride);
    return i >= 0 && i < timeline.days.length ? timeline.days[i] : undefined;
  };
  const dropPost = (post: OrganicPost, clientX: number) => {
    const day = dayAt(clientX);
    setDrag(null);
    if (!day || day === post.publishAt.slice(0, 10)) return;
    if (day < today) {
      setNotice("Posts can only move to today or later.");
      return;
    }
    setSettling(post.id);
    reschedulePost(post.id, day);
    setNotice(`Moved to ${fmt(day, { weekday: "long", month: "short", day: "numeric" })} at ${time12(post)}.`);
    setTimeout(() => setSettling((s) => (s === post.id ? null : s)), 900);
  };
  const moveFlight = (f: Flight, days: number) => {
    if (!days) return;
    const start = addDays(f.start, days);
    if (start < today) {
      setNotice("Ads can only be moved to start today or later.");
      return;
    }
    runAgentTurn(`Move ${f.name} to start on ${start}`);
    setNotice(`Asked the agent to move ${f.name} to ${shortDay(start)}. Approve it in Pending changes.`);
  };

  const drafts = allFlights.filter((f) => f.state === "DRAFT").length;
  const level = scope.adSetId ? "ad set" : scope.campaignId ? "campaign" : "account";
  const lastVisible = addDays(firstVisible, Math.max(1, Math.floor(viewWidth / stride)));

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-4">
        <ViewHeader
          title="Planner"
          subtitle={
            scope.adSetId
              ? "When this ad set and its ads run. Drag a scheduled ad set to propose new dates."
              : scope.campaignId
                ? "When each ad set in this campaign runs. Drag a scheduled one to propose new dates."
                : "Every ad in flight and every post going out, on one timeline. Drag to reschedule, hover for the copy, click for everything."
          }
          actions={<CreateMenu postsHere={postsHere} />}
        />

        {drafts > 0 && <Note tone="info">{drafts} item{drafts === 1 ? " is" : "s are"} drawn with a dashed outline: the agent drafted {drafts === 1 ? "it" : "them"} and {drafts === 1 ? "it is" : "they are"} waiting in Pending changes.</Note>}

        <div
          className={cn(
            "relative overflow-clip rounded-[28px] border border-black/[0.06] bg-[#f7f7f9] shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_30px_80px_-40px_rgba(30,10,80,0.35)] dark:border-white/[0.07] dark:bg-[#0b0b0f]",
            // Room for the details panel, which lives inside these borders.
            selection && "min-h-[760px]"
          )}
        >
          {/* Ambient light and a fine dot grid give the canvas depth without lines. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,10,40,0.07)_1px,transparent_0)] [background-size:18px_18px] dark:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)]" />
          <div aria-hidden className="pointer-events-none absolute -top-40 left-1/4 h-80 w-[38rem] rounded-full bg-[#7c3aed]/10 blur-3xl dark:bg-[#7c3aed]/20" />

          {/* Toolbar */}
          <div className="relative z-20 flex flex-wrap items-center gap-3 border-b border-black/[0.05] bg-white/60 px-4 py-3 backdrop-blur-xl sm:px-5 dark:border-white/[0.06] dark:bg-black/30">
            <button type="button" onClick={() => scrollToDay(today)} className={cn("rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:shadow", GLASS)}>
              Today
            </button>
            <div className="flex items-center">
              <NavButton label="Previous week" onClick={() => scroller.current?.scrollBy({ left: -7 * stride, behavior: "smooth" })}>
                <ChevronLeft className="h-4 w-4" />
              </NavButton>
              <NavButton label="Next week" onClick={() => scroller.current?.scrollBy({ left: 7 * stride, behavior: "smooth" })}>
                <ChevronRight className="h-4 w-4" />
              </NavButton>
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold tracking-tight" data-testid="meta-calendar-month">{fmt(addDays(firstVisible, 1), { month: "long", year: "numeric" })}</p>
              <p className="text-[11px] text-muted-foreground">
                {shortDay(addDays(firstVisible, 1))} – {shortDay(lastVisible)}
              </p>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className={cn("inline-flex rounded-xl p-0.5", GLASS)} role="group" aria-label="Density">
                {(["comfortable", "compact"] as Density[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={density === d}
                    onClick={() => setDensity(d)}
                    className={cn("rounded-[10px] px-2.5 py-1 text-[11px] font-semibold transition", density === d ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    {d === "comfortable" ? "Comfortable" : "Compact"}
                  </button>
                ))}
              </div>
              <FilterMenu
                label="Content type"
                summary={summary(kinds.size, ALL_KINDS.length)}
                groups={[
                  { title: "Ads", items: [{ key: "ADS", label: "Ads", icon: Megaphone }, ...(scope.adSetId ? [] : [{ key: "EXPERIMENTS", label: "Experiments", icon: FlaskConical }])] },
                  ...(postsHere ? [{ title: "Organic", items: POST_KINDS.map((k) => ({ key: k, label: POST_FORMATS[k].plural, icon: POST_FORMATS[k].icon })) }] : []),
                ]}
                selected={kinds}
                onToggle={(k) => setKinds((cur) => toggle(cur, k as ContentKind))}
                onAll={() => setKinds(new Set(ALL_KINDS))}
              />
              <FilterMenu
                label="Status"
                summary={summary(adStates.size + (postsHere ? postStatuses.size : 0), AD_STATES.length + (postsHere ? POST_STATUSES.length : 0))}
                groups={[
                  { title: "Ads", items: AD_STATES.map((s) => ({ key: `ad:${s}`, label: STATE[s].label })) },
                  ...(postsHere ? [{ title: "Posts", items: POST_STATUSES.map((s) => ({ key: `post:${s}`, label: POST_TINT[s].label })) }] : []),
                ]}
                selected={new Set([...[...adStates].map((s) => `ad:${s}`), ...[...postStatuses].map((s) => `post:${s}`)])}
                onToggle={(k) => {
                  const [kind, v] = k.split(":");
                  if (kind === "ad") setAdStates((cur) => toggle(cur, v as (typeof AD_STATES)[number]));
                  else setPostStatuses((cur) => toggle(cur, v as PostStatus));
                }}
                onAll={() => {
                  setAdStates(new Set(AD_STATES));
                  setPostStatuses(new Set(POST_STATUSES));
                }}
              />
              {postsHere && (
                <FilterMenu
                  label="Platform"
                  summary={summary(platforms.size, ALL_PLATFORMS.length, platforms.size === 1 ? PLATFORMS[[...platforms][0]!].label : undefined)}
                  groups={[{ title: "Shared to", items: ALL_PLATFORMS.map((p) => ({ key: p, label: PLATFORMS[p].label, icon: PLATFORMS[p].icon })) }]}
                  selected={platforms}
                  onToggle={(k) => setPlatforms((cur) => toggle(cur, k as PostPlatform))}
                  onAll={() => setPlatforms(new Set(ALL_PLATFORMS))}
                />
              )}
            </div>
          </div>

          {/* Timeline */}
          <div ref={scroller} onScroll={onScroll} className="relative z-10 scroll-slim snap-x snap-proximity overflow-x-auto overscroll-x-contain pb-3">
            <div className="relative px-4" style={{ width: timeline.days.length * stride + 32 - GAP }}>
              <TodayGlow left={16 + indexOf(today) * stride} width={col} visible={indexOf(today) >= 0 && indexOf(today) < timeline.days.length} />

              {/* Day ruler: quiet dates, louder numbers. */}
              <div className="sticky top-0 z-10 flex pt-4" style={{ gap: GAP }}>
                {timeline.days.map((d) => (
                  <DayHead key={d} day={d} today={today} width={col} budget={dailyBudget(d)} posts={byDay.get(d)?.length ?? 0} currency={data.account.currency} />
                ))}
              </div>

              {/* Ads in flight */}
              {timeline.lanes > 0 && (
                <div className="relative mt-3">
                  <SectionLabel icon={Megaphone} count={new Set(timeline.bars.map((b) => b.flight.id)).size} hint={scope.adSetId ? "This ad set and its ads, across the days they run" : scope.campaignId ? "Ad sets in this campaign, across the days they run" : "Campaigns and experiments, across the days they run"}>
                    Ads in flight
                  </SectionLabel>
                  <div className="relative mt-2" style={{ height: lanes * LANE }}>
                    {timeline.bars
                      .filter((b) => b.lane < cap)
                      .map((b) => (
                        <FlightBar key={b.flight.id} bar={b} stride={stride} data={data} today={today} selected={selection?.type === "flight" && selection.id === b.flight.id} dragging={!!drag} onSelect={setSelection} onMove={moveFlight} />
                      ))}
                  </div>
                  {(hiddenLanes > 0 || lanesOpen) && showingPosts && (
                    <button type="button" onClick={() => setLanesOpen((o) => !o)} className={cn("sticky left-4 mt-1 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold shadow-sm transition hover:shadow", GLASS)}>
                      <ChevronDown className={cn("h-3.5 w-3.5 transition", lanesOpen && "rotate-180")} />
                      {lanesOpen ? "Fold ads" : `Show ${hiddenLanes} more`}
                    </button>
                  )}
                </div>
              )}

              {/* Content per day */}
              {(showingPosts || launches.size > 0) && (
                <div className="mt-5">
                  <SectionLabel icon={Sparkles} count={[...byDay.values()].reduce((t, l) => t + l.length, 0) + [...launches.values()].reduce((t, l) => t + l.length, 0)} hint={showingPosts ? "Posts, reels and stories on the day they go out, and ads on the day they start" : "Ads on the day they start"}>
                    {showingPosts ? "Posts and ad launches" : "Ad launches"}
                  </SectionLabel>
                  <div className="mt-2 flex items-start" style={{ gap: GAP }}>
                    {timeline.days.map((d) => (
                      <DayColumn
                        key={d}
                        day={d}
                        today={today}
                        width={col}
                        compact={density === "compact"}
                        posts={byDay.get(d) ?? []}
                        launches={launches.get(d) ?? []}
                        drop={drag?.over === d ? (d < today ? "invalid" : "valid") : undefined}
                        dragId={drag?.id}
                        settling={settling}
                        selection={selection}
                        onSelect={setSelection}
                        onDragPost={(id, x) => {
                          const over = dayAt(x);
                          setDrag((cur) => (cur?.id === id && cur.over === over ? cur : { id, over }));
                        }}
                        onDropPost={dropPost}
                        data={data}
                        allowPosts={postsHere}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {!allFlights.length && !(postsHere && data.posts.length) && <p className="relative px-6 pb-8 text-center text-xs text-muted-foreground">Nothing is scheduled at this {level} level yet.</p>}

          {/* Footer hints and live feedback */}
          <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-black/[0.05] bg-white/50 px-5 py-2.5 text-[11px] text-muted-foreground backdrop-blur-xl dark:border-white/[0.06] dark:bg-black/20">
            {notice ? (
              <motion.span key={notice} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="font-medium text-foreground">
                {notice}
              </motion.span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <GripVertical className="h-3.5 w-3.5" /> Drag a scheduled post to another day
                </span>
                <span>Drag a scheduled campaign to propose new dates</span>
                <span className="ml-auto hidden sm:inline">Hover for the copy · click for every detail</span>
              </>
            )}
          </div>

          {/* Details open inside the planner, over its right side, so the page around it stays put. */}
          {(selection?.type === "flight" || selection?.type === "post") && <DetailDrawer selection={selection} flights={allFlights} data={data} today={today} onClose={() => setSelection(null)} />}
        </div>
      </div>
    </MotionConfig>
  );
}

function DetailDrawer({ selection, flights, data, today, onClose }: { selection: NonNullable<Selection>; flights: Flight[]; data: MetaAccountData; today: string; onClose: () => void }) {
  const flight = selection.type === "flight" ? flights.find((f) => f.id === selection.id) : undefined;
  const post = selection.type === "post" ? data.posts.find((p) => p.id === selection.id) : undefined;
  if (!flight && !post) return null;
  return <Drawer onClose={onClose}>{flight ? <FlightDetail key={flight.id} flight={flight} today={today} onClose={onClose} /> : <PostDetail key={post!.id} post={post!} onClose={onClose} />}</Drawer>;
}

// ─── Canvas pieces ──────────────────────────────────────────────────────────

/** Names a band of the timeline and says what sits in it. Sticks to the left while the days scroll. */
function SectionLabel({ icon: Icon, children, count, hint }: { icon: typeof Megaphone; children: ReactNode; count: number; hint: string }) {
  return (
    <div className="sticky left-4 inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/80 shadow-sm", GLASS)}>
        <Icon className="h-3 w-3 text-[#7c3aed] dark:text-violet-300" /> {children}
        <span className="rounded-full bg-foreground/[0.07] px-1.5 text-[10px] tracking-normal tabular-nums">{count}</span>
      </span>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </div>
  );
}

function TodayGlow({ left, width, visible }: { left: number; width: number; visible: boolean }) {
  if (!visible) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: left - 6, width: width + 12 }}>
      <div className="absolute inset-0 rounded-[24px] bg-[radial-gradient(120%_60%_at_50%_0%,rgba(124,58,237,0.14),transparent_70%)] dark:bg-[radial-gradient(120%_60%_at_50%_0%,rgba(139,92,246,0.22),transparent_70%)]" />
      <div className="absolute inset-y-6 left-0 w-px bg-gradient-to-b from-[#7c3aed]/50 via-[#7c3aed]/15 to-transparent" />
    </div>
  );
}

function DayHead({ day, today, width, budget, posts, currency }: { day: string; today: string; width: number; budget: number; posts: number; currency: string }) {
  const isToday = day === today;
  const first = day.endsWith("-01");
  return (
    <div className="flex shrink-0 snap-start scroll-ml-4 items-end justify-between px-1.5" style={{ width }}>
      <div>
        <p className={cn("h-3.5 text-[10px] font-semibold uppercase tracking-[0.14em]", first ? "text-[#7c3aed] dark:text-violet-300" : "text-transparent")}>{fmt(day, { month: "short" })}</p>
        <p className="mt-0.5 flex items-baseline gap-1.5">
          <span className={cn("text-[11px]", isToday ? "font-semibold text-[#7c3aed] dark:text-violet-300" : "text-muted-foreground/70")}>{fmt(day, { weekday: "short" })}</span>
          <span className={cn("text-[15px] tabular-nums tracking-tight", isToday ? "font-semibold text-foreground" : day < today ? "text-muted-foreground/60" : "text-foreground/80")}>{Number(day.slice(8, 10))}</span>
          {isToday && <span className="ml-0.5 rounded-full bg-[#7c3aed] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white shadow-[0_0_14px_rgba(124,58,237,0.6)]">Today</span>}
        </p>
      </div>
      <div className="text-right text-[10px] leading-tight tabular-nums text-muted-foreground/80">
        {budget > 0 && <p className="font-semibold text-foreground/70">{money(budget, currency)}</p>}
        {posts > 0 && (
          <p>
            {posts} post{posts === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </div>
  );
}

/** One ad (or campaign, or experiment) in flight: a glass bar across its days, glowing while it runs. Scheduled bars drag to propose new dates. */
function FlightBar({ bar, stride, data, today, selected, dragging, onSelect, onMove }: { bar: Bar; stride: number; data: MetaAccountData; today: string; selected: boolean; dragging: boolean; onSelect: (s: Selection) => void; onMove: (f: Flight, days: number) => void }) {
  const f = bar.flight;
  const [shiftDays, setShiftDays] = useState(0);
  const first = f.ads[0];
  const art = first ? adArt(first, data.creatives) : null;
  const budget = flightBudget(data, f);
  const movable = f.state === "SCHEDULED" && (f.kind === "CAMPAIGN" || f.kind === "AD_SET");
  const live = f.state === "ACTIVE";
  const test = f.kind === "EXPERIMENT";
  const fade = bar.open && bar.toNext;
  const select = () => onSelect({ type: "flight", id: f.id });

  return (
    <FlightHover flight={f} suppress={dragging || shiftDays !== 0}>
      <motion.div
        data-flight={f.id}
        role="button"
        tabIndex={0}
        aria-label={`${f.name}, ${STATE[f.state].label}`}
        onKeyDown={(e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && select()}
        onTap={select}
        drag={movable ? "x" : false}
        dragSnapToOrigin
        dragMomentum={false}
        dragElastic={0.06}
        onDrag={(_, info: PanInfo) => setShiftDays(Math.round(info.offset.x / stride))}
        onDragEnd={(_, info: PanInfo) => {
          setShiftDays(0);
          onMove(f, Math.round(info.offset.x / stride));
        }}
        whileHover={{ y: -1 }}
        whileDrag={{ scale: 1.02, zIndex: 30, cursor: "grabbing" }}
        transition={SPRING}
        className={cn("group absolute h-9 outline-none", movable ? "cursor-grab" : "cursor-pointer")}
        style={{ left: bar.col * stride, width: bar.span * stride - GAP, top: bar.lane * LANE }}
      >
        {live && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute -inset-x-2 -inset-y-3 -z-10 rounded-3xl blur-xl transition-opacity group-hover:opacity-100",
              test ? "bg-[radial-gradient(50%_70%_at_15%_50%,rgba(14,165,233,0.35),transparent_75%)]" : "bg-[radial-gradient(50%_70%_at_15%_50%,rgba(124,58,237,0.38),transparent_75%)]",
              "opacity-70"
            )}
          />
        )}
        <div
          className={cn(
            "relative flex h-full items-center gap-2 px-1.5 text-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-shadow group-hover:shadow-[0_8px_24px_-10px_rgba(30,10,80,0.35)] group-focus-visible:ring-2 group-focus-visible:ring-[#7c3aed]",
            GLASS,
            bar.fromPrev ? "rounded-l-md" : "rounded-l-xl",
            bar.toNext ? "rounded-r-md" : "rounded-r-xl",
            f.state === "DRAFT" && "border-dashed border-[#F76D01]/70 bg-[#F76D01]/[0.06] dark:bg-[#F76D01]/[0.08]",
            f.state === "SCHEDULED" && "border-[#7c3aed]/30 bg-[repeating-linear-gradient(135deg,transparent_0_7px,rgba(124,58,237,0.06)_7px_14px)] dark:border-violet-400/30",
            (f.state === "PAUSED" || f.state === "ENDED") && "opacity-60 saturate-50",
            selected && "ring-2 ring-[#7c3aed] dark:ring-violet-400"
          )}
          style={fade ? { maskImage: "linear-gradient(to right, black 85%, transparent)", WebkitMaskImage: "linear-gradient(to right, black 85%, transparent)" } : undefined}
        >
          {/* Long bars start or end off screen, so the label sticks to the visible edge of the timeline. */}
          <span className="sticky left-3 flex min-w-0 max-w-[min(100%,320px)] items-center gap-2">
            {art ? (
              <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/5 dark:ring-white/10" style={{ background: mediaBackground(art.label) }}>
                {art.icon && <art.icon className="absolute inset-0 m-auto h-3 w-3 text-white/90" />}
              </span>
            ) : (
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg", test ? "bg-sky-500/15 text-sky-600" : "bg-muted text-muted-foreground")}>{test ? <FlaskConical className="h-3.5 w-3.5" /> : <Megaphone className="h-3.5 w-3.5" />}</span>
            )}
            <span className="min-w-0 truncate font-medium text-foreground/90">{f.name}</span>
          </span>
          <span className="sticky right-3 ml-auto flex shrink-0 items-center gap-2 pl-2">
            {budget && bar.span > 1 && (
              <span className="text-[11px] font-semibold tabular-nums text-foreground">
                {money(budget.amount, data.account.currency)}
                <span className="font-normal text-muted-foreground">{budget.kind === "DAILY" ? "/day" : " total"}</span>
              </span>
            )}
            <span className="mr-1 inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", live ? (test ? "bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.9)]" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]") : f.state === "SCHEDULED" ? "bg-[#7c3aed]" : f.state === "DRAFT" ? "bg-[#F76D01]" : "bg-zinc-400")} />
              {bar.span > 2 && STATE[f.state].label}
            </span>
          </span>
        </div>
        {shiftDays !== 0 && (
          <span className={cn("absolute -top-7 left-2 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-semibold shadow-lg", addDays(f.start, shiftDays) < today ? "bg-red-600 text-white" : "bg-foreground text-background")}>
            Start {shortDay(addDays(f.start, shiftDays))}
          </span>
        )}
      </motion.div>
    </FlightHover>
  );
}

type ColumnProps = {
  day: string;
  today: string;
  width: number;
  compact: boolean;
  posts: OrganicPost[];
  launches: Flight[];
  drop?: "valid" | "invalid";
  dragId?: string;
  settling: string | null;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onDragPost: (id: string, clientX: number) => void;
  onDropPost: (post: OrganicPost, clientX: number) => void;
  data: MetaAccountData;
  allowPosts: boolean;
};

/** A day: a floating glass column that lifts on hover and opens a slot to plan something. */
function DayColumn({ day, today, width, compact, posts, launches, drop, dragId, settling, selection, onSelect, onDragPost, onDropPost, data, allowPosts }: ColumnProps) {
  const isToday = day === today;
  const past = day < today;
  const empty = !posts.length && !launches.length;
  return (
    <div
      data-day={day}
      className={cn(
        "group/day relative min-h-[380px] shrink-0 snap-start scroll-ml-4 rounded-[22px] p-1.5 transition-[background-color,box-shadow,transform] duration-300 ease-out",
        "border border-black/[0.04] bg-white/40 hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-[0_18px_40px_-24px_rgba(30,10,80,0.35)] dark:border-white/[0.04] dark:bg-white/[0.015] dark:hover:bg-white/[0.04]",
        isToday && "border-[#7c3aed]/20 bg-white/70 dark:border-violet-400/20 dark:bg-white/[0.035]",
        past && "opacity-[0.86]",
        drop === "valid" && "border-[#7c3aed]/50 bg-[#7c3aed]/[0.06] shadow-[0_0_0_4px_rgba(124,58,237,0.12)]",
        drop === "invalid" && "border-red-500/40 bg-red-500/[0.05]"
      )}
      style={{ width }}
    >
      {/* Paid and organic never share a group: each has its own heading, and a divider sits between them. */}
      {launches.length > 0 && (
        <section aria-label="Ads starting">
          <GroupHeading icon={Megaphone} tone="ad" count={launches.length}>
            Ad{launches.length === 1 ? "" : "s"} starting
          </GroupHeading>
          <div className="space-y-3">
            {launches.map((f) => (
              <LaunchCard key={f.id} flight={f} data={data} today={today} compact={compact} selected={selection?.type === "flight" && selection.id === f.id} suppress={!!dragId} onSelect={onSelect} />
            ))}
          </div>
        </section>
      )}
      {launches.length > 0 && posts.length > 0 && <div aria-hidden className="mx-2 my-3 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent dark:via-white/15" />}
      {posts.length > 0 && (
        <section aria-label="Posts">
          <GroupHeading icon={Sparkles} tone="post" count={posts.length}>
            Post{posts.length === 1 ? "" : "s"}
          </GroupHeading>
          <div className="space-y-3">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} today={today} compact={compact} selected={selection?.type === "post" && selection.id === p.id} dragging={dragId === p.id} suppress={!!dragId} shared={dragId === p.id || settling === p.id} onSelect={onSelect} onDrag={onDragPost} onDrop={onDropPost} />
            ))}
          </div>
        </section>
      )}

      {/* The column grows a planning slot when hovered. */}
      {allowPosts && !past && (
        <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-hover/day:grid-rows-[1fr]">
          <div className="overflow-hidden">
            <button
              type="button"
              onClick={() => runAgentTurn(`Plan a post for ${fmt(day, { weekday: "long", month: "long", day: "numeric" })} at the best time`)}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-black/10 py-2.5 text-[11px] font-medium text-muted-foreground transition hover:border-[#7c3aed]/40 hover:text-[#7c3aed] dark:border-white/10 dark:hover:text-violet-300"
            >
              <Plus className="h-3.5 w-3.5" /> Plan something
            </button>
          </div>
        </div>
      )}
      {empty && past && <div className="mt-24 text-center text-[10px] text-muted-foreground/40">—</div>}
    </div>
  );
}

function GroupHeading({ icon: Icon, tone, count, children }: { icon: typeof Megaphone; tone: "ad" | "post"; count: number; children: ReactNode }) {
  return (
    <p className={cn("mb-1.5 flex items-center gap-1.5 px-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]", tone === "ad" ? "text-[#7c3aed] dark:text-violet-300" : "text-muted-foreground")}>
      <Icon className="h-3 w-3" />
      {children}
      {count > 1 && <span className="tabular-nums opacity-70">{count}</span>}
    </p>
  );
}

/** Platform badges in frosted glass, laid over media. */
function GlassPlatforms({ platforms, size = 22 }: { platforms: PostPlatform[]; size?: number }) {
  return (
    <span className="flex gap-1">
      {platforms.map((p) => {
        const P = PLATFORMS[p];
        return (
          <span key={p} title={P.label} className="flex items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/35 backdrop-blur-md" style={{ width: size, height: size }}>
            <P.icon className="h-3 w-3" />
          </span>
        );
      })}
    </span>
  );
}

const glassChip = "rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/15 backdrop-blur-md";

/** Where an ad shows, from its ad sets' placements. */
function adPlatforms(data: MetaAccountData, f: Flight): PostPlatform[] {
  const sets = data.adSets.filter((s) => (f.kind === "CAMPAIGN" ? s.campaignId === f.id : s.id === (f.adSetId ?? f.id)));
  if (!sets.length || sets.some((s) => s.placements.advantage)) return ["FACEBOOK", "INSTAGRAM"];
  const keys = new Set(sets.flatMap((s) => s.placements.manual.map((p) => PLACEMENTS[p].platform)));
  const out = ALL_PLATFORMS.filter((p) => keys.has(p));
  return out.length ? out : ["FACEBOOK"];
}

function LaunchCard({ flight, data, today, compact, selected, suppress, onSelect }: { flight: Flight; data: MetaAccountData; today: string; compact: boolean; selected: boolean; suppress: boolean; onSelect: (s: Selection) => void }) {
  const first = flight.ads[0];
  const art = first ? adArt(first, data.creatives) : { label: flight.name, icon: Megaphone };
  const budget = flightBudget(data, flight);
  const live = flight.state === "ACTIVE";
  const select = () => onSelect({ type: "flight", id: flight.id });
  return (
    <FlightHover flight={flight} suppress={suppress}>
      <motion.div
        data-flight={flight.id}
        role="button"
        tabIndex={0}
        onKeyDown={(e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && select()}
        onTap={select}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.99 }}
        transition={SPRING}
        className={cn("group relative cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]", selected && "ring-2 ring-[#7c3aed] dark:ring-violet-400")}
      >
        {(live || flight.state === "SCHEDULED") && <span aria-hidden className="pointer-events-none absolute -inset-2 -z-10 rounded-3xl bg-[radial-gradient(60%_60%_at_50%_30%,rgba(124,58,237,0.35),transparent_75%)] opacity-60 blur-xl transition-opacity group-hover:opacity-100" />}
        <div className={cn("overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.05),0_0_0_1px_rgba(124,58,237,0.12)]", GLASS, "border-[#7c3aed]/35 dark:border-violet-400/35", flight.state === "DRAFT" && "border-dashed border-[#F76D01]/70")}>
          <div className={cn("relative", compact ? "aspect-[16/10]" : "aspect-[16/11]")} style={{ background: mediaBackground(art.label) }}>
            <span aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.3),transparent_55%)]" />
            {art.icon && <art.icon className="absolute inset-0 m-auto h-6 w-6 text-white/85 drop-shadow" />}
            <span className="absolute left-2 top-2 flex items-center gap-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#7c3aed] px-2 py-0.5 text-[10px] font-bold text-white shadow-[0_0_12px_rgba(124,58,237,0.55)]">
                <Megaphone className="h-3 w-3" /> Ad
              </span>
            </span>
            <span className="absolute right-2 top-2">
              <GlassPlatforms platforms={adPlatforms(data, flight)} />
            </span>
          </div>
          <div className="px-2.5 py-2">
            <p className="truncate text-[12px] font-medium">{flight.name}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              {budget ? (
                <span className="text-[13px] font-semibold tabular-nums">
                  {money(budget.amount, data.account.currency)}
                  <span className="text-[10px] font-normal text-muted-foreground">{budget.kind === "DAILY" ? " / day" : " lifetime"}</span>
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">{KIND_LABEL[flight.kind]}</span>
              )}
              <span className={cn("ml-auto rounded-md px-1.5 py-px text-[9px] font-bold", STATE[flight.state].badge)}>{STATE[flight.state].label}</span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {flight.start > today ? "Starts" : "Started"} 12:00 AM · {flight.ads.length} ad{flight.ads.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </motion.div>
    </FlightHover>
  );
}

const DOT: Record<PostStatus, string> = { PUBLISHED: "bg-emerald-500", SCHEDULED: "bg-orange-500", DRAFT: "bg-zinc-400", FAILED: "bg-red-500" };

/** A post, reel or story as a rich media card. Anything not yet published can be dragged to another day. */
function PostCard({ post, today, compact, selected, dragging, suppress, shared, onSelect, onDrag, onDrop }: { post: OrganicPost; today: string; compact: boolean; selected: boolean; dragging: boolean; suppress: boolean; shared: boolean; onSelect: (s: Selection) => void; onDrag: (id: string, clientX: number) => void; onDrop: (post: OrganicPost, clientX: number) => void }) {
  const F = POST_FORMATS[post.format];
  const m = post.media[0];
  const movable = post.status !== "PUBLISHED";
  const select = () => onSelect({ type: "post", id: post.id });
  const clientX = (info: PanInfo) => info.point.x - (typeof window === "undefined" ? 0 : window.scrollX);
  const video = m?.kind === "VIDEO";

  return (
    <PostHover post={post} suppress={suppress}>
      <motion.div
        data-post={post.id}
        layoutId={shared ? `post-${post.id}` : undefined}
        role="button"
        tabIndex={0}
        aria-label={`${F.label} at ${time12(post)}: ${post.caption}`}
        onKeyDown={(e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && select()}
        onTap={select}
        drag={movable}
        dragSnapToOrigin
        dragMomentum={false}
        dragElastic={0.14}
        onDragStart={(_, info: PanInfo) => onDrag(post.id, clientX(info))}
        onDrag={(_, info: PanInfo) => onDrag(post.id, clientX(info))}
        onDragEnd={(_, info: PanInfo) => onDrop(post, clientX(info))}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.99 }}
        whileDrag={{ scale: 1.05, rotate: -1.5, zIndex: 50, boxShadow: "0 30px 60px -18px rgba(64,0,149,0.45)" }}
        transition={SPRING}
        className={cn(
          "relative overflow-hidden rounded-2xl outline-none shadow-[0_1px_2px_rgba(0,0,0,0.05)] focus-visible:ring-2 focus-visible:ring-[#7c3aed]",
          GLASS,
          movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          post.status === "DRAFT" && "border-dashed border-black/15 dark:border-white/20",
          post.status === "FAILED" && "border-red-500/40",
          selected && "ring-2 ring-[#7c3aed] dark:ring-violet-400",
          dragging && "z-50"
        )}
      >
        <div className={cn("relative", F.vertical ? (compact ? "aspect-[4/4.4]" : "aspect-[4/5]") : compact ? "aspect-[16/10]" : "aspect-[16/11]")} style={{ background: mediaBackground(m?.label ?? post.caption) }}>
          <span aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.3),transparent_55%)]" />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/35 to-transparent" />
          {video && (
            <span className="absolute inset-0 m-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/40 backdrop-blur-md">
              <Play className="ml-0.5 h-4 w-4 text-white" fill="currentColor" />
            </span>
          )}
          <span className={cn(glassChip, "absolute left-2 top-2 tabular-nums")}>{time12(post)}</span>
          <span className="absolute right-2 top-2">
            <GlassPlatforms platforms={post.platforms} />
          </span>
          <span className={cn(glassChip, "absolute bottom-2 left-2 inline-flex items-center gap-1")}>
            <F.icon className="h-3 w-3" /> {F.label}
            {m?.durationSec ? ` · 0:${String(m.durationSec).padStart(2, "0")}` : post.media.length > 1 ? ` · ${post.media.length}` : ""}
          </span>
          {post.status === "FAILED" && (
            <span className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow-lg">
              <TriangleAlert className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
        <div className="px-2.5 py-2">
          {!compact && <p className="truncate text-[12px] font-medium text-foreground/90">{post.caption}</p>}
          {post.metrics ? (
            <p className="mt-0.5 flex items-center gap-2.5 text-[11px] tabular-nums text-muted-foreground">
              <span>
                <span className="font-semibold text-foreground">{compactNumber(post.metrics.reach)}</span> reach
              </span>
              <span>
                <span className="font-semibold text-foreground">{compactNumber(post.metrics.plays ?? post.metrics.likes)}</span> {post.metrics.plays !== undefined ? "plays" : "likes"}
              </span>
            </p>
          ) : (
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", DOT[post.status])} />
              {post.status === "FAILED" ? <span className="font-medium text-red-600 dark:text-red-400">Failed to publish</span> : POST_TINT[post.status].label}
              {post.status === "SCHEDULED" && post.publishAt.slice(0, 10) >= today && <Clock className="ml-auto h-3 w-3 opacity-60" />}
              {post.createdBy === "AGENT" && <Bot className="ml-auto h-3 w-3 text-[#F76D01]" aria-label="Drafted by the agent" />}
            </p>
          )}
        </div>
      </motion.div>
    </PostHover>
  );
}
