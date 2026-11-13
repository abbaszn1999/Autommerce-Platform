"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { CartesianGrid, ComposedChart, Area, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  Columns3,
  Download,
  FileSpreadsheet,
  FileText,
  Flame,
  GalleryHorizontal,
  Layers,
  Mail,
  Megaphone,
  Minus,
  Play,
  Plus,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewHeader } from "@/components/google-ads/ga-ui";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { runAgentTurn } from "@/lib/meta-ads/agent-runner";
import { SEGMENTS, creativeRows, segmentRows, type SegmentRow } from "@/lib/meta-ads/analytics";
import { EMPTY_BASE, METRICS, accountBase, addBase, dailySeries, derive, formatMetric, previousRange } from "@/lib/meta-ads/metrics";
import { formatStats, interactionsOf, organicDaily, organicTotals, topPosts, type OrganicTotals } from "@/lib/meta-ads/organic";
import type { BreakdownKey, MetaAccountData, MetricKey, Metrics, OrganicPost, ScheduledReport } from "@/lib/meta-ads/types";
import { AskButton } from "../ma-common";
import { MediaThumb, PlatformIcons, POST_FORMATS, compactNumber } from "../ma-post-preview";
import { scopedCampaignIds, useMa } from "../use-ma";

// ─── Vocabulary ─────────────────────────────────────────────────────────────

type Source = "ALL" | "PAID" | "ORGANIC";

const PICKABLE: MetricKey[] = ["spend", "impressions", "reach", "frequency", "cpm", "linkClicks", "ctr", "cpc", "results", "costPerResult", "purchases", "purchaseValue", "roas", "leads", "cpl", "hookRate"];
const TIME_BREAKDOWNS: BreakdownKey[] = ["day", "week", "dayOfWeek", "hour"];

/** Platforms keep the same colour slot everywhere, whatever is filtered. */
const PLATFORM_SLOT: Record<string, string> = { Facebook: "var(--viz-1)", Instagram: "var(--viz-2)", Messenger: "var(--viz-3)", "Audience Network": "var(--viz-4)", Threads: "var(--viz-5)" };

/** Frosted glass, as on the planner. */
const GLASS = "border border-black/[0.06] bg-white/80 backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.035]";

const fmtDay = (d: string, o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const change = (cur: number, prev: number) => (prev ? (cur - prev) / Math.abs(prev) : undefined);

// ─── View ───────────────────────────────────────────────────────────────────

/** Reports: paid and social performance side by side, a breakdown explorer, the top ads and posts, and scheduled reports. */
export function ReportsView() {
  const { data, range, currency, campaign } = useMa();
  const [source, setSource] = useState<Source>("ALL");
  const ids = useMemo(() => scopedCampaignIds(data, campaign), [data, campaign]);
  const prev = useMemo(() => previousRange(range), [range]);

  // Posts belong to the Page, not to a campaign: social reporting only exists at account level.
  const organicHere = !campaign;
  const showPaid = source !== "ORGANIC" || !organicHere;
  const showOrganic = organicHere && source !== "PAID";

  const cur = useMemo(() => derive(accountBase(data, range, ids)), [data, range, ids]);
  const before = useMemo(() => derive(accountBase(data, prev, ids)), [data, prev, ids]);
  const series = useMemo(() => dailySeries(data, range, ids), [data, range, ids]);
  const prevSeries = useMemo(() => dailySeries(data, prev, ids), [data, prev, ids]);
  const social = useMemo(() => organicTotals(data.posts, range), [data.posts, range]);
  const socialBefore = useMemo(() => organicTotals(data.posts, prev), [data.posts, prev]);

  return (
    <div className="viz space-y-6">
      <ViewHeader
        title="Reports"
        subtitle={campaign ? `How ${campaign.name} is performing, and where.` : "Paid and social performance in one place. Explore any breakdown, export it, or have the agent write and schedule it."}
        actions={<AskButton primary prompt={campaign ? `Write a performance report for ${campaign.name}` : "Write a monthly performance report for my Meta account, paid and organic"}>Write a report</AskButton>}
      />

      {/* Toolbar */}
      <div className={cn("flex flex-wrap items-center gap-3 rounded-2xl px-3 py-2.5 shadow-sm", GLASS)}>
        {organicHere && (
          <div className="inline-flex rounded-xl bg-muted/70 p-0.5" role="group" aria-label="What to report on">
            {(
              [
                ["ALL", "Everything"],
                ["PAID", "Ads"],
                ["ORGANIC", "Social"],
              ] as [Source, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={source === k}
                onClick={() => setSource(k)}
                className={cn("rounded-[10px] px-3 py-1 text-xs font-semibold transition", source === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            {fmtDay(range.start)} – {fmtDay(range.end, { month: "short", day: "numeric", year: "numeric" })}
          </span>{" "}
          compared with {fmtDay(prev.start)} – {fmtDay(prev.end)}
        </p>
        <p className="ml-auto hidden text-[11px] text-muted-foreground md:block">Change the period and attribution in the bar at the top.</p>
      </div>

      {showPaid && (
        <section className="space-y-4" aria-label="Paid performance">
          <BandTitle icon={Megaphone} title="Paid performance" hint={campaign ? campaign.name : "Every campaign in the account"} />
          <PaidKpis cur={cur} before={before} series={series} currency={currency} />
          <div className="grid gap-4 xl:grid-cols-3">
            <TrendCard className="xl:col-span-2" cur={cur} before={before} series={series} prevSeries={prevSeries} currency={currency} />
            <MixCard data={data} range={range} ids={ids} currency={currency} />
          </div>
          <Explorer data={data} range={range} ids={ids} currency={currency} hideObjective={!!campaign} />
          <div className="grid gap-4 xl:grid-cols-3">
            <TopAds className="xl:col-span-2" data={data} range={range} campaignId={campaign?.id} currency={currency} />
            <Highlights data={data} range={range} ids={ids} cur={cur} before={before} currency={currency} social={showOrganic ? data.posts : undefined} />
          </div>
        </section>
      )}

      {showOrganic && (
        <section className="space-y-4" aria-label="Social performance">
          <BandTitle icon={Sparkles} title="Social performance" hint="Organic posts, reels and stories on your Page and Instagram" />
          <SocialKpis cur={social} before={socialBefore} posts={data.posts} range={range} />
          <div className="grid gap-4 xl:grid-cols-3">
            <TopPosts className="xl:col-span-2" posts={data.posts} range={range} />
            <FormatCard posts={data.posts} range={range} />
          </div>
          {!showPaid && <Highlights data={data} range={range} ids={ids} cur={cur} before={before} currency={currency} social={data.posts} socialOnly />}
        </section>
      )}

      <Scheduled reports={data.scheduledReports} />
    </div>
  );
}

// ─── Building blocks ────────────────────────────────────────────────────────

function BandTitle({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#7c3aed]/10 text-[#7c3aed] dark:text-violet-300">
          <Icon className="h-3.5 w-3.5" />
        </span>
        {title}
      </h2>
      <p className="truncate text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Panel({ title, subtitle, actions, children, className, bodyClassName }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_20px_50px_-30px_rgba(30,10,80,0.25)]", GLASS, className)}>
      <div className="flex flex-wrap items-start gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={cn("min-w-0 flex-1 px-5 pb-5", bodyClassName)}>{children}</div>
    </div>
  );
}

/** Change against the previous period. Green when it moved the right way, red when not, grey for spend (neither good nor bad). */
function Delta({ cur, prev, higherIsBetter, neutral }: { cur: number; prev: number; higherIsBetter: boolean; neutral?: boolean }) {
  const ch = change(cur, prev);
  if (ch === undefined) return <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">{cur ? "New" : "—"}</span>;
  if (Math.abs(ch) < 0.005)
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
        <Minus className="h-3 w-3" /> 0%
      </span>
    );
  const good = neutral ? undefined : ch > 0 === higherIsBetter;
  const Icon = ch > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums",
        good === undefined ? "bg-muted text-muted-foreground" : good ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400"
      )}
      title={good === undefined ? "Change vs the previous period" : good ? "Better than the previous period" : "Worse than the previous period"}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(ch * 100).toFixed(1)}%
    </span>
  );
}

/** A tiny trend line with a hover readout. One series, so the tile's label names it. */
function Sparkline({ points, format, color = "var(--viz-brand)" }: { points: { date: string; value: number }[]; format: (v: number) => string; color?: string }) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const values = points.map((p) => p.value);
  const n = values.length;
  if (n < 2) return <div className="h-10" />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const x = (i: number) => (i / (n - 1)) * 100;
  const y = (v: number) => 29 - ((v - min) / (max - min || 1)) * 25;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const area = `${line} L100,32 L0,32 Z`;
  return (
    <div
      className="relative h-10 cursor-crosshair"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setHover(Math.min(n - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
      }}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#spark-${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {hover !== null && (
        <>
          <span className="pointer-events-none absolute inset-y-0 w-px bg-foreground/15" style={{ left: `${x(hover)}%` }} />
          <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card" style={{ left: `${x(hover)}%`, top: `${(y(values[hover]!) / 32) * 100}%`, background: color }} />
          <span className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background tabular-nums shadow" style={{ left: `${Math.min(85, Math.max(15, x(hover)))}%` }}>
            {fmtDay(points[hover]!.date)} · {format(values[hover]!)}
          </span>
        </>
      )}
    </div>
  );
}

function KpiTile({ label, value, delta, spark, glow }: { label: string; value: string; delta: ReactNode; spark?: ReactNode; glow?: boolean }) {
  return (
    <div className={cn("group relative min-w-0 overflow-hidden rounded-3xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(30,10,80,0.35)]", GLASS)}>
      {glow && <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[#7c3aed]/20 blur-2xl" />}
      <p className="relative text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="relative mt-1 flex items-end justify-between gap-2">
        <p className="truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <div className="mb-1 shrink-0">{delta}</div>
      </div>
      {spark && <div className="relative mt-2">{spark}</div>}
    </div>
  );
}

// ─── Paid ───────────────────────────────────────────────────────────────────

type Series = (Metrics & { date: string })[];

function PaidKpis({ cur, before, series, currency }: { cur: Metrics; before: Metrics; series: Series; currency: string }) {
  const keys: MetricKey[] = ["spend", "results", "costPerResult", cur.purchaseValue > 0 ? "roas" : "cpm", "ctr", "reach"];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {keys.map((k, i) => (
        <KpiTile
          key={k}
          glow={i === 0}
          label={METRICS[k].label}
          value={formatMetric(k, cur[k], currency)}
          delta={<Delta cur={cur[k]} prev={before[k]} higherIsBetter={METRICS[k].higherIsBetter} neutral={k === "spend"} />}
          spark={<Sparkline points={series.map((p) => ({ date: p.date, value: p[k] }))} format={(v) => formatMetric(k, v, currency)} />}
        />
      ))}
    </div>
  );
}

const TREND_METRICS: MetricKey[] = ["spend", "results", "costPerResult", "roas", "ctr", "cpm", "reach"];

/** One metric over the period against the same days of the previous period. Same unit, so one axis. */
function TrendCard({ cur, before, series, prevSeries, currency, className }: { cur: Metrics; before: Metrics; series: Series; prevSeries: Series; currency: string; className?: string }) {
  const [metric, setMetric] = useState<MetricKey>("spend");
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const options = TREND_METRICS.filter((k) => k !== "roas" || cur.purchaseValue > 0);
  const rows = series.map((p, i) => ({ date: p.date, label: fmtDay(p.date), cur: p[metric], prev: prevSeries[i]?.[metric] ?? null, prevDate: prevSeries[i]?.date }));
  const brand = dark ? "#8b5cf6" : "#7c3aed";
  const muted = dark ? "#71717a" : "#a1a1aa";
  return (
    <Panel
      className={className}
      title="Performance over time"
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold tabular-nums text-foreground">{formatMetric(metric, cur[metric], currency)}</span>
          <Delta cur={cur[metric]} prev={before[metric]} higherIsBetter={METRICS[metric].higherIsBetter} neutral={metric === "spend"} />
          <span>{METRICS[metric].label} this period</span>
        </span>
      }
      actions={
        <div className="inline-flex flex-wrap rounded-xl bg-muted/70 p-0.5">
          {options.map((k) => (
            <button key={k} type="button" aria-pressed={metric === k} onClick={() => setMetric(k)} className={cn("rounded-[10px] px-2.5 py-1 text-[11px] font-semibold transition", metric === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {METRICS[k].short}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-2 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: brand }} /> This period
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: muted }} /> Previous period
        </span>
      </div>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="report-trend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={brand} stopOpacity={0.25} />
                <stop offset="100%" stopColor={brand} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: muted }} tickLine={false} axisLine={false} minTickGap={32} />
            <YAxis tick={{ fontSize: 10, fill: muted }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => formatMetric(metric, v, currency)} />
            <Tooltip
              cursor={{ stroke: muted, strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0]!.payload as (typeof rows)[number];
                return (
                  <div className={cn("min-w-48 rounded-xl px-3 py-2 text-xs shadow-xl", GLASS)}>
                    <p className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: brand }} />
                      <span className="text-muted-foreground">{fmtDay(r.date, { weekday: "short", month: "short", day: "numeric" })}</span>
                      <span className="ml-auto pl-3 font-semibold tabular-nums">{formatMetric(metric, r.cur, currency)}</span>
                    </p>
                    {r.prev !== null && r.prevDate && (
                      <p className="mt-1 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: muted }} />
                        <span className="text-muted-foreground">{fmtDay(r.prevDate, { weekday: "short", month: "short", day: "numeric" })}</span>
                        <span className="ml-auto pl-3 font-semibold tabular-nums">{formatMetric(metric, r.prev, currency)}</span>
                      </p>
                    )}
                  </div>
                );
              }}
            />
            <Line type="monotone" dataKey="prev" stroke={muted} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="cur" stroke={brand} strokeWidth={2} fill="url(#report-trend)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: dark ? "#0b0b0f" : "#ffffff" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

/** Where the budget goes by platform: one stacked bar plus a labelled list (the labels carry the values, not the colours). */
function MixCard({ data, range, ids, currency }: { data: MetaAccountData; range: ReturnType<typeof previousRange>; ids: string[]; currency: string }) {
  const rows = useMemo(() => segmentRows(data, range, "platform", ids).filter((r) => r.base.spend > 0), [data, range, ids]);
  const [hover, setHover] = useState<string | null>(null);
  const total = rows.reduce((t, r) => t + r.base.spend, 0);
  return (
    <Panel title="Where the money goes" subtitle={`${formatMetric("spend", total, currency)} across ${rows.length} platform${rows.length === 1 ? "" : "s"}`}>
      {rows.length ? (
        <>
          <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Spend share by platform">
            {rows.map((r) => (
              <span
                key={r.key}
                onMouseEnter={() => setHover(r.key)}
                onMouseLeave={() => setHover(null)}
                className={cn("h-full transition-opacity first:rounded-l-full last:rounded-r-full", hover && hover !== r.key && "opacity-35")}
                style={{ width: `${(r.base.spend / total) * 100}%`, background: PLATFORM_SLOT[r.label] ?? "var(--viz-muted)" }}
              />
            ))}
          </div>
          <ul className="mt-4 space-y-1">
            {rows.map((r) => (
              <li
                key={r.key}
                onMouseEnter={() => setHover(r.key)}
                onMouseLeave={() => setHover(null)}
                className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl px-2 py-2 transition", hover === r.key ? "bg-muted/70" : hover ? "opacity-50" : "")}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: PLATFORM_SLOT[r.label] ?? "var(--viz-muted)" }} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{r.label}</span>
                  <span className="block text-[11px] text-muted-foreground tabular-nums">
                    {formatMetric("results", r.metrics.results, currency)} results · {formatMetric("costPerResult", r.metrics.costPerResult, currency)} each
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  <span className="block text-[13px] font-semibold">{formatMetric("spend", r.base.spend, currency)}</span>
                  <span className="block text-[11px] text-muted-foreground">{pct(r.base.spend / total, 0)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Empty>No spend in this period.</Empty>
      )}
    </Panel>
  );
}

function csvOf(rows: SegmentRow[], keys: MetricKey[], label: string, currency: string) {
  const head = [label, ...keys.map((k) => METRICS[k].label)];
  const lines = rows.map((r) => [r.label, ...keys.map((k) => formatMetric(k, r.metrics[k], currency))]);
  return [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

/** Any breakdown as a sortable table. The first metric column carries an in-cell bar so the shape reads before the numbers. */
function Explorer({ data, range, ids, currency, hideObjective }: { data: MetaAccountData; range: ReturnType<typeof previousRange>; ids: string[]; currency: string; hideObjective: boolean }) {
  const [by, setBy] = useState<BreakdownKey>("placement");
  const [keys, setKeys] = useState<MetricKey[]>(["spend", "impressions", "ctr", "results", "costPerResult"]);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const rows = useMemo(() => segmentRows(data, range, by, ids), [data, range, by, ids]);
  const timeLike = TIME_BREAKDOWNS.includes(by);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => (sort.key === "label" ? a.label.localeCompare(b.label) : a.metrics[sort.key as MetricKey] - b.metrics[sort.key as MetricKey]) * sort.dir);
  }, [rows, sort]);
  const total = useMemo(() => derive(rows.reduce((t, r) => addBase(t, r.base), EMPTY_BASE)), [rows]);
  const barKey = keys[0];
  const barMax = barKey ? Math.max(...rows.map((r) => r.metrics[barKey]), 0) : 0;
  const breakdowns = (Object.keys(SEGMENTS) as BreakdownKey[]).filter((b) => !(hideObjective && b === "objective"));

  const download = () => {
    const blob = new Blob([csvOf(sorted, keys, SEGMENTS[by].label, currency)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `meta-report-${by}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const sortBy = (key: string) => setSort((s) => (s?.key === key ? (s.dir === -1 ? { key, dir: 1 } : null) : { key, dir: -1 }));

  return (
    <Panel
      title="Explore"
      subtitle={`${SEGMENTS[by].hint}. ${rows.length} row${rows.length === 1 ? "" : "s"}${timeLike ? "" : ", biggest first"}.`}
      bodyClassName="px-0 pb-0"
      actions={
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn("inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:shadow", GLASS)}>
                <Layers className="h-3.5 w-3.5 text-muted-foreground" /> By <span className="text-[#7c3aed] dark:text-violet-300">{SEGMENTS[by].label}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-xl">
              <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Break down by</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={by}
                onValueChange={(v) => {
                  setBy(v as BreakdownKey);
                  setSort(null);
                }}
              >
                {breakdowns.map((b) => (
                  <DropdownMenuRadioItem key={b} value={b} className="flex-col items-start gap-0 text-xs">
                    <span className="font-medium">{SEGMENTS[b].label}</span>
                    <span className="text-[10px] text-muted-foreground">{SEGMENTS[b].hint}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn("inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:shadow", GLASS)}>
                <Columns3 className="h-3.5 w-3.5 text-muted-foreground" /> Columns <span className="rounded-full bg-foreground/[0.07] px-1.5 tabular-nums">{keys.length}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto rounded-xl">
              <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Metrics</DropdownMenuLabel>
              {PICKABLE.map((k) => (
                <DropdownMenuCheckboxItem
                  key={k}
                  checked={keys.includes(k)}
                  disabled={keys.length === 1 && keys.includes(k)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => setKeys((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))}
                  className="text-xs"
                >
                  {METRICS[k].label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" onClick={download} title="Download this table as CSV" className={cn("inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:shadow", GLASS)}>
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </>
      }
    >
      {rows.length ? (
        <div className="scroll-slim max-h-[520px] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <Th sticky onSort={() => sortBy("label")} active={sort?.key === "label"} dir={sort?.dir} align="left">
                  {SEGMENTS[by].label}
                </Th>
                {keys.map((k) => (
                  <Th key={k} onSort={() => sortBy(k)} active={sort?.key === k} dir={sort?.dir} align="right">
                    {METRICS[k].short}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.key} className="group">
                  <td className="sticky left-0 z-[1] max-w-72 truncate border-b border-black/[0.04] bg-white/90 px-5 py-2.5 font-medium backdrop-blur group-hover:bg-muted/80 dark:border-white/[0.05] dark:bg-[#111114]/90">
                    {by === "platform" && <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: PLATFORM_SLOT[r.label] ?? "var(--viz-muted)" }} />}
                    {r.label}
                  </td>
                  {keys.map((k, i) => {
                    const v = r.metrics[k];
                    return (
                      <td key={k} className="relative border-b border-black/[0.04] px-5 py-2.5 text-right tabular-nums group-hover:bg-muted/50 dark:border-white/[0.05]">
                        {i === 0 && barMax > 0 && v > 0 && <span aria-hidden className="absolute inset-y-2 right-3 rounded-md bg-[#7c3aed]/[0.09] dark:bg-violet-400/[0.12]" style={{ width: `calc(${(v / barMax) * 100}% - 1.5rem)` }} />}
                        <span className="relative">{v ? formatMetric(k, v, currency) : <span className="text-muted-foreground/50">—</span>}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky bottom-0 left-0 z-[2] border-t border-black/[0.08] bg-white/95 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur dark:border-white/10 dark:bg-[#111114]/95">Total</td>
                {keys.map((k) => (
                  <td key={k} className="sticky bottom-0 z-[1] border-t border-black/[0.08] bg-white/95 px-5 py-3 text-right font-semibold tabular-nums backdrop-blur dark:border-white/10 dark:bg-[#111114]/95">
                    {total[k] ? formatMetric(k, total[k], currency) : "—"}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <Empty>No data for this period.</Empty>
      )}
    </Panel>
  );
}

function Th({ children, onSort, active, dir, align, sticky }: { children: ReactNode; onSort: () => void; active: boolean; dir?: 1 | -1; align: "left" | "right"; sticky?: boolean }) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 1 ? "ascending" : "descending") : "none"}
      className={cn("sticky top-0 z-[2] border-b border-black/[0.06] bg-white/90 px-5 py-2.5 text-[11px] font-semibold text-muted-foreground backdrop-blur dark:border-white/10 dark:bg-[#111114]/90", sticky && "left-0 z-[3]", align === "right" ? "text-right" : "text-left")}
    >
      <button type="button" onClick={onSort} className={cn("inline-flex items-center gap-1 transition hover:text-foreground", active && "text-foreground")}>
        {children}
        {active ? dir === 1 ? <ArrowUpRight className="h-3 w-3 -rotate-45" /> : <ArrowDownRight className="h-3 w-3 rotate-45" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">{children}</p>;
}

/** The ads that brought the most results, with their share of spend and a fatigue flag. */
function TopAds({ data, range, campaignId, currency, className }: { data: MetaAccountData; range: ReturnType<typeof previousRange>; campaignId?: string; currency: string; className?: string }) {
  const adIds = useMemo(() => (campaignId ? data.ads.filter((a) => data.adSets.find((s) => s.id === a.adSetId)?.campaignId === campaignId).map((a) => a.id) : undefined), [data, campaignId]);
  const all = useMemo(() => creativeRows(data, range, adIds).filter((r) => r.metrics.spend > 0), [data, range, adIds]);
  const rows = [...all].sort((a, b) => b.metrics.results - a.metrics.results).slice(0, 5);
  const spend = all.reduce((t, r) => t + r.metrics.spend, 0);
  const useRoas = rows.some((r) => r.metrics.purchaseValue > 0);
  return (
    <Panel className={className} title="Top ads" subtitle="Most results this period" actions={<AskButton prompt="Which of my ads should I scale, and which should I pause?">Ask what to scale</AskButton>}>
      {rows.length ? (
        <ol className="space-y-1">
          {rows.map((r, i) => {
            const set = data.adSets.find((s) => s.id === r.ad.adSetId);
            const c = data.campaigns.find((x) => x.id === set?.campaignId);
            const creative = data.creatives.find((x) => x.id === r.ad.mediaIds[0]);
            const Icon = r.ad.format === "CATALOG" || r.ad.format === "COLLECTION" ? ShoppingBag : r.ad.format === "CAROUSEL" ? GalleryHorizontal : r.ad.format === "SINGLE_VIDEO" || creative?.kind === "VIDEO" ? Play : undefined;
            return (
              <li key={r.ad.id} className="grid grid-cols-[1.25rem_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-muted/60">
                <span className="text-center text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                <MediaThumb label={creative?.name ?? r.ad.name} icon={Icon} className="h-11 w-11 rounded-xl" iconClassName="h-4 w-4" />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                    <span className="truncate">{r.ad.name}</span>
                    {r.fatigued && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:text-amber-300" title="Frequency is high or click-through is falling">
                        <Flame className="h-3 w-3" /> Fatigue
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{c?.name}</p>
                  <div className="mt-1 h-1 w-full max-w-56 overflow-hidden rounded-full bg-muted" title={`${pct(r.metrics.spend / spend, 0)} of spend`}>
                    <span className="block h-full rounded-full" style={{ width: `${(r.metrics.spend / spend) * 100}%`, background: "var(--viz-brand)" }} />
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-4 text-right tabular-nums">
                  <Stat label="Spent" value={formatMetric("spend", r.metrics.spend, currency)} />
                  <Stat label="Results" value={formatMetric("results", r.metrics.results, currency)} />
                  <Stat label={useRoas ? "ROAS" : "Cost/result"} value={useRoas ? formatMetric("roas", r.metrics.roas, currency) : formatMetric("costPerResult", r.metrics.costPerResult, currency)} />
                </dl>
              </li>
            );
          })}
        </ol>
      ) : (
        <Empty>No ad delivered in this period.</Empty>
      )}
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="text-[13px] font-semibold">{value}</dd>
    </div>
  );
}

/** What stands out, in plain sentences, each with a question for the agent. */
function Highlights({ data, range, ids, cur, before, currency, social, socialOnly }: { data: MetaAccountData; range: ReturnType<typeof previousRange>; ids: string[]; cur: Metrics; before: Metrics; currency: string; social?: OrganicPost[]; socialOnly?: boolean }) {
  const items = useMemo(() => {
    const out: { icon: LucideIcon; tone: "good" | "bad" | "info"; text: string; prompt: string }[] = [];
    if (!socialOnly) {
      const movers = (["results", "costPerResult", "ctr", "cpm", ...(cur.purchaseValue > 0 ? (["roas"] as MetricKey[]) : [])] as MetricKey[])
        .map((k) => ({ k, ch: change(cur[k], before[k]) }))
        .filter((x): x is { k: MetricKey; ch: number } => x.ch !== undefined && Math.abs(x.ch) >= 0.03)
        .sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch));
      const top = movers[0];
      if (top) {
        const good = top.ch > 0 === METRICS[top.k].higherIsBetter;
        out.push({ icon: top.ch > 0 ? TrendingUp : TrendingDown, tone: good ? "good" : "bad", text: `${METRICS[top.k].label} ${top.ch > 0 ? "rose" : "fell"} ${pct(Math.abs(top.ch))} against the previous period.`, prompt: `Why did my ${METRICS[top.k].label.toLowerCase()} ${top.ch > 0 ? "rise" : "fall"} this period?` });
      }
      const platforms = segmentRows(data, range, "platform", ids).filter((r) => r.base.spend > 0 && r.base.results > 0);
      const spend = platforms.reduce((t, r) => t + r.base.spend, 0);
      const best = platforms.filter((r) => r.base.spend / spend > 0.05).sort((a, b) => a.metrics.costPerResult - b.metrics.costPerResult)[0];
      if (best && cur.costPerResult) {
        const gap = 1 - best.metrics.costPerResult / cur.costPerResult;
        if (gap > 0.03) out.push({ icon: Sparkles, tone: "info", text: `${best.label} delivers results ${pct(gap, 0)} cheaper than your average (${formatMetric("costPerResult", best.metrics.costPerResult, currency)} each).`, prompt: `Should I shift more budget to ${best.label}?` });
      }
      const fatigued = creativeRows(data, range).filter((r) => r.fatigued && r.metrics.spend > 0 && ids.includes(data.adSets.find((s) => s.id === r.ad.adSetId)?.campaignId ?? ""));
      if (fatigued.length) out.push({ icon: Flame, tone: "bad", text: `${fatigued.length} ad${fatigued.length === 1 ? " shows" : "s show"} creative fatigue: frequency is up or click-through is falling.`, prompt: "Which ads are fatigued and what should I replace them with?" });
    }
    if (social) {
      const formats = formatStats(social, range);
      const [first, second] = formats;
      if (first && second && second.avgReach > 0) out.push({ icon: Sparkles, tone: "info", text: `${POST_FORMATS[first.format].plural} reach ${(first.avgReach / second.avgReach).toFixed(1)}× more people per post than ${POST_FORMATS[second.format].plural.toLowerCase()}.`, prompt: `Plan more ${POST_FORMATS[first.format].plural.toLowerCase()} for next week` });
    }
    return out;
  }, [data, range, ids, cur, before, currency, social, socialOnly]);

  return (
    <Panel title="What stands out" subtitle="Read from this period's numbers">
      {items.length ? (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.text} className="rounded-2xl bg-muted/50 p-3">
              <p className="flex gap-2.5 text-[13px] leading-snug">
                <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg", it.tone === "good" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : it.tone === "bad" ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-[#7c3aed]/10 text-[#7c3aed] dark:text-violet-300")}>
                  <it.icon className="h-3.5 w-3.5" />
                </span>
                {it.text}
              </p>
              <button type="button" onClick={() => runAgentTurn(it.prompt)} className="ml-[2.125rem] mt-1.5 text-[11px] font-semibold text-[#7c3aed] hover:underline dark:text-violet-300">
                Ask the agent →
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nothing unusual this period.</Empty>
      )}
    </Panel>
  );
}

// ─── Social ─────────────────────────────────────────────────────────────────

function SocialKpis({ cur, before, posts, range }: { cur: OrganicTotals; before: OrganicTotals; posts: OrganicPost[]; range: ReturnType<typeof previousRange> }) {
  const tiles: { label: string; value: string; cur: number; prev: number; pick?: (p: OrganicPost) => number; fmt: (v: number) => string }[] = [
    { label: "Posts published", value: String(cur.posts), cur: cur.posts, prev: before.posts, pick: () => 1, fmt: (v) => `${v} post${v === 1 ? "" : "s"}` },
    { label: "Organic reach", value: compactNumber(cur.reach), cur: cur.reach, prev: before.reach, pick: (p) => p.metrics?.reach ?? 0, fmt: compactNumber },
    { label: "Engagement rate", value: pct(cur.engagementRate), cur: cur.engagementRate, prev: before.engagementRate, fmt: (v) => pct(v) },
    { label: "Interactions", value: compactNumber(cur.interactions), cur: cur.interactions, prev: before.interactions, pick: interactionsOf, fmt: compactNumber },
    { label: "Video plays", value: compactNumber(cur.plays), cur: cur.plays, prev: before.plays, pick: (p) => p.metrics?.plays ?? 0, fmt: compactNumber },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((t, i) => (
        <KpiTile
          key={t.label}
          glow={i === 1}
          label={t.label}
          value={t.value}
          delta={<Delta cur={t.cur} prev={t.prev} higherIsBetter />}
          spark={t.pick ? <Sparkline points={organicDaily(posts, range, t.pick)} format={t.fmt} color="var(--viz-2)" /> : <div className="flex h-10 items-end text-[11px] text-muted-foreground">{cur.likes ? `${compactNumber(cur.likes)} likes · ${compactNumber(cur.comments)} comments` : "No posts yet"}</div>}
        />
      ))}
    </div>
  );
}

/** The posts people engaged with most, as rich rows with their numbers. */
function TopPosts({ posts, range, className }: { posts: OrganicPost[]; range: ReturnType<typeof previousRange>; className?: string }) {
  const list = topPosts(posts, range);
  const maxEr = Math.max(...list.map((p) => interactionsOf(p) / Math.max(1, p.metrics!.reach)), 0);
  return (
    <Panel className={className} title="Top posts" subtitle="Most interactions this period" actions={<AskButton prompt="What do my best posts have in common, and what should I post next?">Ask what works</AskButton>}>
      {list.length ? (
        <ol className="space-y-1">
          {list.map((p, i) => {
            const F = POST_FORMATS[p.format];
            const m = p.metrics!;
            const er = interactionsOf(p) / Math.max(1, m.reach);
            return (
              <li key={p.id} className="grid grid-cols-[1.25rem_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-muted/60">
                <span className="text-center text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                <MediaThumb label={p.media[0]?.label ?? p.caption} icon={F.icon} className={cn("rounded-xl", F.vertical ? "h-14 w-9" : "h-11 w-11")} iconClassName="h-4 w-4" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{p.caption}</p>
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {F.label} · {fmtDay(p.publishAt)}
                    <PlatformIcons platforms={p.platforms} size="xs" className="ml-1" />
                  </p>
                  <div className="mt-1 h-1 w-full max-w-56 overflow-hidden rounded-full bg-muted" title={`Engagement rate ${pct(er)}`}>
                    <span className="block h-full rounded-full" style={{ width: `${maxEr ? (er / maxEr) * 100 : 0}%`, background: "var(--viz-2)" }} />
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-4 text-right tabular-nums">
                  <Stat label="Reach" value={compactNumber(m.reach)} />
                  <Stat label="Engagement" value={pct(er)} />
                  <Stat label={m.plays !== undefined ? "Plays" : "Likes"} value={compactNumber(m.plays ?? m.likes)} />
                </dl>
              </li>
            );
          })}
        </ol>
      ) : (
        <Empty>Nothing was published in this period.</Empty>
      )}
    </Panel>
  );
}

/** Average reach per post for each format: one hue, labelled bars, hover for the detail. */
function FormatCard({ posts, range }: { posts: OrganicPost[]; range: ReturnType<typeof previousRange> }) {
  const stats = formatStats(posts, range);
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...stats.map((s) => s.avgReach), 0);
  const focus = stats.find((s) => s.format === hover);
  return (
    <Panel title="What format works" subtitle="Average reach per post">
      {stats.length ? (
        <>
          <ul className="space-y-3">
            {stats.map((s) => {
              const F = POST_FORMATS[s.format];
              return (
                <li key={s.format} onMouseEnter={() => setHover(s.format)} onMouseLeave={() => setHover(null)} className={cn("transition-opacity", hover && hover !== s.format && "opacity-40")}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <F.icon className="h-3.5 w-3.5 text-muted-foreground" /> {F.plural}
                    </span>
                    <span className="font-semibold tabular-nums">{compactNumber(s.avgReach)}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${max ? (s.avgReach / max) * 100 : 0}%`, background: "var(--viz-2)" }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 min-h-8 rounded-xl bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
            {focus ? (
              <>
                <span className="font-semibold text-foreground">{POST_FORMATS[focus.format].plural}</span>: {focus.posts} post{focus.posts === 1 ? "" : "s"}, {compactNumber(focus.avgReach)} average reach, {pct(focus.engagementRate)} engagement rate.
              </>
            ) : (
              "Hover a format for its posts and engagement rate."
            )}
          </p>
        </>
      ) : (
        <Empty>Nothing was published in this period.</Empty>
      )}
    </Panel>
  );
}

// ─── Scheduled ──────────────────────────────────────────────────────────────

const FORMAT_ICON: Record<ScheduledReport["format"], LucideIcon> = { PDF: FileText, CSV: FileSpreadsheet, EMAIL: Mail };

function Scheduled({ reports }: { reports: ScheduledReport[] }) {
  return (
    <section className="space-y-4" aria-label="Scheduled reports">
      <BandTitle icon={CalendarClock} title="Scheduled reports" hint="Written and sent by the agent. Ask it to add, change or stop one." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((r) => {
          const Icon = FORMAT_ICON[r.format];
          return (
            <div key={r.id} className={cn("group flex flex-col rounded-3xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(30,10,80,0.35)]", GLASS)}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#7c3aed]/10 text-[#7c3aed] dark:text-violet-300">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.frequency.charAt(0) + r.frequency.slice(1).toLowerCase()} · {r.format} · next {fmtDay(r.nextRun, { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">By {SEGMENTS[r.breakdown].label.toLowerCase()}</span>
                {r.metrics.map((m) => (
                  <span key={m} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {METRICS[m].short}
                  </span>
                ))}
              </div>
              <p className="mt-3 truncate text-[11px] text-muted-foreground">To {r.recipients.join(", ")}</p>
              <div className="mt-3 flex gap-2 border-t border-black/[0.05] pt-3 dark:border-white/[0.06]">
                <AskButton prompt={`Send the ${r.name} report now`}>Send now</AskButton>
                <AskButton prompt={`Change the ${r.name} report`}>Edit</AskButton>
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => runAgentTurn("Schedule a weekly performance report, paid and organic, every Monday at 9am")}
          className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-black/15 p-4 text-center text-muted-foreground transition hover:border-[#7c3aed]/50 hover:bg-[#7c3aed]/[0.03] hover:text-[#7c3aed] dark:border-white/15 dark:hover:text-violet-300"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
            <Plus className="h-5 w-5" />
          </span>
          <span className="text-[13px] font-semibold">New scheduled report</span>
          <span className="max-w-56 text-[11px]">Pick what, how often and who gets it. The agent sets it up.</span>
        </button>
      </div>
    </section>
  );
}
