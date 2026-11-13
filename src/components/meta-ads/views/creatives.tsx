"use client";

import { useMemo, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, ChevronDown, CircleCheck, Eye, Film, Flame, GalleryHorizontal, Image as ImageIcon, LayoutGrid, Layers, Play, ShoppingBag, Sparkles, Table2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill, ViewHeader } from "@/components/google-ads/ga-ui";
import { GaTable, type GaColumn } from "@/components/google-ads/ga-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { adAssetRows, adPlacementRows, creativeRows, type CreativeHealth, type CreativeRow } from "@/lib/meta-ads/analytics";
import { formatMetric } from "@/lib/meta-ads/metrics";
import { interactionsOf, publishedIn } from "@/lib/meta-ads/organic";
import type { CreativeAsset, CreativeConcept, DateRange, MetaAccountData, MetaAd, OrganicPost, Ranking } from "@/lib/meta-ads/types";
import { AdPreviewPanel } from "../ma-ad-preview";
import { metricColumns } from "../ma-columns";
import { AskButton } from "../ma-common";
import { compactNumber, mediaBackground, PLATFORMS, POST_FORMATS } from "../ma-post-preview";
import { DeliveryPill } from "../ma-ui";
import { scopedAdSetIds, useMa } from "../use-ma";
import { Drawer, DrawerHeader, MiniStat, PostDetail, Rows, Section } from "./calendar-parts";

// ─── Vocabulary ─────────────────────────────────────────────────────────────

type Tab = "gallery" | "table" | "concepts";
type Source = "ALL" | "ADS" | "POSTS";
type Kind = "IMAGE" | "VIDEO" | "CAROUSEL" | "CATALOG";
type SortKey = "spend" | "results" | "efficiency" | "ctr" | "hookRate" | "newest";
type Selection = { type: "ad" | "post"; id: string } | null;

const GLASS = "border border-black/[0.06] bg-white/80 backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.035]";
const FROST = "rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/15 backdrop-blur-md";

/** Status palette (never reused for series), always with a word next to the colour. */
const HEALTH: Record<CreativeHealth, { label: string; dot: string; chip: string; hint: string }> = {
  FRESH: { label: "Fresh", dot: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", hint: "Click-through is holding and people aren't seeing it too often." },
  WATCH: { label: "Watch", dot: "bg-amber-500", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300", hint: "Starting to slip or shown very often. Line up a new concept." },
  FATIGUED: { label: "Fatigued", dot: "bg-red-500", chip: "bg-red-500/15 text-red-700 dark:text-red-300", hint: "People are tuning out: click-through is falling while frequency climbs. Replace it." },
};

const RANK: Record<Ranking, { label: string; cls: string }> = {
  ABOVE_AVERAGE: { label: "Above average", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  AVERAGE: { label: "Average", cls: "bg-muted text-muted-foreground" },
  BELOW_AVERAGE: { label: "Below average", cls: "bg-red-500/15 text-red-700 dark:text-red-300" },
  UNKNOWN: { label: "Not enough data", cls: "bg-muted/60 text-muted-foreground/70" },
};

const KIND_META: Record<Kind, { label: string; icon: LucideIcon }> = {
  IMAGE: { label: "Image", icon: ImageIcon },
  VIDEO: { label: "Video", icon: Film },
  CAROUSEL: { label: "Carousel", icon: GalleryHorizontal },
  CATALOG: { label: "Catalog", icon: ShoppingBag },
};

/** Concepts keep their colour slot by their place in the library; past the fifth they fold into "Other". */
const CONCEPT_SLOTS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)"];
const conceptColor = (data: MetaAccountData, conceptId?: string) => {
  const i = data.concepts.findIndex((c) => c.id === conceptId);
  return i >= 0 && i < CONCEPT_SLOTS.length ? CONCEPT_SLOTS[i]! : "var(--viz-muted)";
};

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

function kindOf(ad: MetaAd, creatives: CreativeAsset[]): Kind {
  if (ad.format === "CATALOG" || ad.format === "COLLECTION") return "CATALOG";
  if (ad.format === "CAROUSEL") return "CAROUSEL";
  return ad.format === "SINGLE_VIDEO" || creatives.find((c) => c.id === ad.mediaIds[0])?.kind === "VIDEO" ? "VIDEO" : "IMAGE";
}

const firstAsset = (ad: MetaAd, creatives: CreativeAsset[]) => creatives.find((c) => c.id === ad.mediaIds[0]);

// ─── View ───────────────────────────────────────────────────────────────────

/** Creative library: every ad creative and organic post as media, how healthy each is, and which concepts carry the account. */
export function CreativesView() {
  const { data, range, currency, scope } = useMa();
  const [tab, setTab] = useState<Tab>("gallery");
  const [source, setSource] = useState<Source>("ALL");
  const [kind, setKind] = useState<Kind | "ALL">("ALL");
  const [health, setHealth] = useState<CreativeHealth | "ALL">("ALL");
  const [sort, setSort] = useState<SortKey>("spend");
  const [selection, setSelection] = useState<Selection>(null);

  const postsHere = !scope.campaignId && !scope.adSetId;
  const adIds = useMemo(() => {
    const sets = new Set(scopedAdSetIds(data, scope));
    return data.ads.filter((a) => sets.has(a.adSetId) && a.status !== "ARCHIVED").map((a) => a.id);
  }, [data, scope]);
  const rows = useMemo(() => creativeRows(data, range, adIds), [data, range, adIds]);
  const posts = useMemo(() => (postsHere ? publishedIn(data.posts, range) : []), [postsHere, data.posts, range]);
  const useRoas = rows.some((r) => r.metrics.purchaseValue > 0);

  const shownAds = useMemo(() => {
    if (source === "POSTS") return [];
    const list = rows.filter((r) => (kind === "ALL" || kindOf(r.ad, data.creatives) === kind) && (health === "ALL" || r.health === health));
    const by: Record<SortKey, (r: CreativeRow) => number> = {
      spend: (r) => r.metrics.spend,
      results: (r) => r.metrics.results,
      efficiency: (r) => (useRoas ? r.metrics.roas : r.metrics.costPerResult ? -r.metrics.costPerResult : -Infinity),
      ctr: (r) => r.metrics.ctr,
      hookRate: (r) => r.metrics.hookRate,
      newest: (r) => -r.ageDays,
    };
    return [...list].sort((a, b) => by[sort](b) - by[sort](a));
  }, [rows, source, kind, health, sort, data.creatives, useRoas]);
  const shownPosts = useMemo(() => {
    if (source === "ADS" || health !== "ALL" || kind === "CATALOG") return [];
    return posts
      .filter((p) => kind === "ALL" || (kind === "VIDEO" ? p.media[0]?.kind === "VIDEO" : kind === "CAROUSEL" ? p.format === "CAROUSEL" : p.media[0]?.kind === "IMAGE" && p.format !== "CAROUSEL"))
      .sort((a, b) => (sort === "newest" ? b.publishAt.localeCompare(a.publishAt) : (b.metrics?.reach ?? 0) - (a.metrics?.reach ?? 0)));
  }, [posts, source, health, kind, sort]);

  const selectedRow = selection?.type === "ad" ? rows.find((r) => r.ad.id === selection.id) : undefined;
  const selectedPost = selection?.type === "post" ? data.posts.find((p) => p.id === selection.id) : undefined;

  return (
    <div className="viz relative space-y-5 overflow-clip">
      <ViewHeader
        title="Creative library"
        subtitle={postsHere ? "Every ad creative and organic post, how each one is holding up, and which concepts carry the account." : "The creatives in this part of the account and how each one is holding up."}
        actions={
          <>
            <AskButton prompt="Which creatives are fatigued, and what should replace them?">Check fatigue</AskButton>
            <AskButton primary prompt="Write a creative brief for new concepts">Brief new creative</AskButton>
          </>
        }
      />

      <Summary data={data} rows={rows} posts={posts} currency={currency} onHealth={(h) => { setTab("gallery"); setSource("ADS"); setHealth(h); }} />

      {/* Toolbar */}
      <div className={cn("flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5 shadow-sm", GLASS)}>
        <Segment value={tab} onChange={setTab} options={[["gallery", "Gallery", LayoutGrid], ["table", "Table", Table2], ["concepts", "Concepts", Layers]]} />
        {tab !== "concepts" && postsHere && <Segment value={source} onChange={setSource} options={[["ALL", "Everything"], ["ADS", "Ads"], ["POSTS", "Posts"]]} />}
        {tab === "gallery" && (
          <>
            <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
            <ChipRow>
              <Chip on={kind === "ALL"} onClick={() => setKind("ALL")}>All formats</Chip>
              {(Object.keys(KIND_META) as Kind[]).map((k) => {
                const K = KIND_META[k];
                return (
                  <Chip key={k} on={kind === k} onClick={() => setKind(kind === k ? "ALL" : k)}>
                    <K.icon className="h-3 w-3" /> {K.label}
                  </Chip>
                );
              })}
            </ChipRow>
            {source !== "POSTS" && (
              <ChipRow>
                {(Object.keys(HEALTH) as CreativeHealth[]).map((h) => (
                  <Chip key={h} on={health === h} onClick={() => setHealth(health === h ? "ALL" : h)}>
                    <span className={cn("h-2 w-2 rounded-full", HEALTH[h].dot)} /> {HEALTH[h].label}
                  </Chip>
                ))}
              </ChipRow>
            )}
            <SortMenu value={sort} onChange={setSort} useRoas={useRoas} />
          </>
        )}
      </div>

      {tab === "gallery" && (
        <>
          {shownAds.length + shownPosts.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-4">
              {shownAds.map((r) => (
                <AdCard key={r.ad.id} row={r} data={data} currency={currency} useRoas={useRoas} onOpen={() => setSelection({ type: "ad", id: r.ad.id })} />
              ))}
              {shownPosts.map((p) => (
                <PostCard key={p.id} post={p} onOpen={() => setSelection({ type: "post", id: p.id })} />
              ))}
            </div>
          ) : (
            <p className={cn("rounded-3xl px-6 py-14 text-center text-sm text-muted-foreground", GLASS)}>No creatives match these filters.</p>
          )}
        </>
      )}

      {tab === "table" && <CreativeTable rows={source === "POSTS" ? [] : rows} data={data} currency={currency} onOpen={(id) => setSelection({ type: "ad", id })} />}

      {tab === "concepts" && <ConceptsView data={data} rows={rows} currency={currency} useRoas={useRoas} />}

      {(selectedRow || selectedPost) && (
        <Drawer onClose={() => setSelection(null)}>
          {selectedRow ? <CreativeDetail key={selectedRow.ad.id} row={selectedRow} data={data} range={range} currency={currency} onClose={() => setSelection(null)} /> : <PostDetail key={selectedPost!.id} post={selectedPost!} onClose={() => setSelection(null)} />}
        </Drawer>
      )}
    </div>
  );
}

// ─── Toolbar pieces ─────────────────────────────────────────────────────────

function Segment<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string, LucideIcon?][] }) {
  return (
    <div className="inline-flex rounded-xl bg-muted/70 p-0.5">
      {options.map(([v, label, Icon]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={cn("inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1 text-xs font-semibold transition", value === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </button>
      ))}
    </div>
  );
}

const ChipRow = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center gap-1">{children}</div>;

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition", on ? "border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#5b21b6] dark:text-violet-200" : "border-transparent text-muted-foreground hover:bg-muted")}>
      {children}
    </button>
  );
}

function SortMenu({ value, onChange, useRoas }: { value: SortKey; onChange: (v: SortKey) => void; useRoas: boolean }) {
  const labels: Record<SortKey, string> = { spend: "Most spend", results: "Most results", efficiency: useRoas ? "Best ROAS" : "Lowest cost per result", ctr: "Best CTR", hookRate: "Best hook rate", newest: "Newest" };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground">
          Sort: <span className="text-foreground">{labels[value]}</span> <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-xl">
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sort creatives</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as SortKey)}>
          {(Object.keys(labels) as SortKey[]).map((k) => (
            <DropdownMenuRadioItem key={k} value={k} className="text-xs">
              {labels[k]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Summary ────────────────────────────────────────────────────────────────

function Tile({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-3xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]", GLASS, className)}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Summary({ data, rows, posts, currency, onHealth }: { data: MetaAccountData; rows: CreativeRow[]; posts: OrganicPost[]; currency: string; onHealth: (h: CreativeHealth) => void }) {
  const live = rows.filter((r) => r.ad.status === "ACTIVE");
  const delivering = rows.filter((r) => r.metrics.spend > 0);
  const counts = { FRESH: 0, WATCH: 0, FATIGUED: 0 } as Record<CreativeHealth, number>;
  for (const r of delivering) counts[r.health]++;
  const conceptsLive = new Set(live.map((r) => r.ad.conceptId).filter(Boolean)).size;
  const spend = delivering.reduce((t, r) => t + r.metrics.spend, 0);
  const byConcept = new Map<string, number>();
  for (const r of delivering) byConcept.set(r.ad.conceptId ?? "none", (byConcept.get(r.ad.conceptId ?? "none") ?? 0) + r.metrics.spend);
  const mix = [...byConcept.entries()].sort((a, b) => b[1] - a[1]);
  const videos = delivering.filter((r) => r.metrics.video3s > 0);
  const bestHook = [...videos].sort((a, b) => b.metrics.hookRate - a.metrics.hookRate)[0];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Tile label="Creative health">
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
          {counts.FRESH}
          <span className="text-sm font-medium text-muted-foreground"> of {delivering.length} fresh</span>
        </p>
        <div className="mt-3 flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-muted" role="img" aria-label="Creative health split">
          {(Object.keys(counts) as CreativeHealth[]).map((h) => counts[h] > 0 && <span key={h} className={cn("h-full first:rounded-l-full last:rounded-r-full", HEALTH[h].dot)} style={{ width: `${(counts[h] / delivering.length) * 100}%` }} />)}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {(Object.keys(counts) as CreativeHealth[]).map((h) => (
            <button key={h} type="button" onClick={() => onHealth(h)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <span className={cn("h-2 w-2 rounded-full", HEALTH[h].dot)} /> {counts[h]} {HEALTH[h].label.toLowerCase()}
            </button>
          ))}
        </div>
      </Tile>

      <Tile label="Concepts live">
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
          {conceptsLive}
          <span className="text-sm font-medium text-muted-foreground"> of 4+ recommended</span>
        </p>
        <div className="mt-3 flex gap-1" aria-hidden>
          {Array.from({ length: Math.max(4, conceptsLive) }, (_, i) => (
            <span key={i} className={cn("h-2 flex-1 rounded-full", i < conceptsLive ? "bg-[var(--viz-brand)]" : "bg-muted")} />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{conceptsLive >= 4 ? "Enough different angles for Meta to find winners." : "Meta picks winners across concepts, not variants. Add new angles."}</p>
      </Tile>

      <Tile label="Where the spend goes, by concept">
        <div className="mt-2 flex h-2 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Spend share by concept">
          {mix.map(([id, v]) => (
            <span key={id} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(v / spend) * 100}%`, background: conceptColor(data, id) }} />
          ))}
        </div>
        <ul className="mt-2 space-y-0.5">
          {mix.slice(0, 3).map(([id, v]) => (
            <li key={id} className="flex items-center gap-1.5 text-[11px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: conceptColor(data, id) }} />
              <span className="min-w-0 flex-1 truncate">{data.concepts.find((c) => c.id === id)?.name ?? "No concept (catalog)"}</span>
              <span className="tabular-nums text-muted-foreground">{pct(v / spend, 0)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">{formatMetric("spend", spend, currency)} this period</p>
      </Tile>

      <Tile label="Best hook rate">
        {bestHook ? (
          <div className="mt-1 flex items-center gap-3">
            <span className="relative h-14 w-11 shrink-0 overflow-hidden rounded-xl" style={{ background: mediaBackground(firstAsset(bestHook.ad, data.creatives)?.name ?? bestHook.ad.name) }}>
              <Play className="absolute inset-0 m-auto h-4 w-4 text-white/90" fill="currentColor" />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight tabular-nums">{pct(bestHook.metrics.hookRate)}</p>
              <p className="truncate text-[11px] text-muted-foreground">{bestHook.ad.name}</p>
              <p className="text-[10px] text-muted-foreground">stop the scroll in the first 3 seconds</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">No video delivered this period.</p>
        )}
        {posts.length > 0 && <p className="mt-2 border-t border-black/[0.05] pt-2 text-[11px] text-muted-foreground dark:border-white/[0.06]">Plus {posts.length} organic post{posts.length === 1 ? "" : "s"} published this period</p>}
      </Tile>
    </div>
  );
}

// ─── Gallery cards ──────────────────────────────────────────────────────────

function HealthBadge({ health, className }: { health: CreativeHealth; className?: string }) {
  return (
    <span title={HEALTH[health].hint} className={cn(FROST, "inline-flex items-center gap-1", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", HEALTH[health].dot)} /> {HEALTH[health].label}
    </span>
  );
}

function CardShell({ onOpen, label, children }: { onOpen: () => void; label: string; children: ReactNode }) {
  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={label}
      onTap={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={cn("group cursor-pointer overflow-hidden rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-shadow hover:shadow-[0_24px_50px_-28px_rgba(30,10,80,0.45)] focus-visible:ring-2 focus-visible:ring-[#7c3aed]", GLASS)}
    >
      {children}
    </motion.div>
  );
}

function AdCard({ row, data, currency, useRoas, onOpen }: { row: CreativeRow; data: MetaAccountData; currency: string; useRoas: boolean; onOpen: () => void }) {
  const { ad, metrics: m } = row;
  const kind = kindOf(ad, data.creatives);
  const asset = firstAsset(ad, data.creatives);
  const K = KIND_META[kind];
  const concept = data.concepts.find((c) => c.id === ad.conceptId);
  const set = data.adSets.find((s) => s.id === ad.adSetId);
  const campaign = data.campaigns.find((c) => c.id === set?.campaignId);
  const delivering = m.spend > 0;
  return (
    <CardShell onOpen={onOpen} label={`${ad.name}, ${HEALTH[row.health].label}`}>
      <div data-creative={ad.id} className="relative aspect-[4/5]" style={{ background: mediaBackground(asset?.name ?? ad.name) }}>
        <span aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.3),transparent_55%)]" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/50 to-transparent" />
        {kind === "VIDEO" ? (
          <span className="absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/40 backdrop-blur-md transition group-hover:scale-110">
            <Play className="ml-0.5 h-5 w-5 text-white" fill="currentColor" />
          </span>
        ) : (
          <K.icon className="absolute inset-0 m-auto h-7 w-7 text-white/80 drop-shadow" />
        )}
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">{delivering ? <HealthBadge health={row.health} /> : <span className={FROST}>Not delivering</span>}</div>
        <span className={cn(FROST, "absolute right-2.5 top-2.5 inline-flex items-center gap-1")}>
          <K.icon className="h-3 w-3" />
          {kind === "VIDEO" && asset?.durationSec ? `0:${String(asset.durationSec).padStart(2, "0")}` : kind === "CAROUSEL" ? ad.cards?.length ?? ad.mediaIds.length : asset?.ratio ?? K.label}
        </span>
        <div className="absolute inset-x-2.5 bottom-2.5 flex items-end justify-between gap-2">
          {concept ? (
            <span className={cn(FROST, "inline-flex min-w-0 items-center gap-1")}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: conceptColor(data, concept.id) }} />
              <span className="truncate">{concept.name}</span>
            </span>
          ) : (
            <span />
          )}
          {ad.partnership && <span className={FROST}>Partnership</span>}
        </div>
      </div>
      <div className="space-y-2.5 p-3.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{ad.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{campaign?.name}</p>
        </div>
        <dl className="grid grid-cols-3 gap-2">
          <CardStat label="Spent" value={formatMetric("spend", m.spend, currency)} />
          <CardStat label="Results" value={formatMetric("results", m.results, currency)} />
          <CardStat label={useRoas ? "ROAS" : "Cost/res."} value={useRoas ? formatMetric("roas", m.roas, currency) : m.costPerResult ? formatMetric("costPerResult", m.costPerResult, currency) : "—"} />
        </dl>
        <div className="flex items-center gap-3 border-t border-black/[0.05] pt-2.5 text-[11px] tabular-nums text-muted-foreground dark:border-white/[0.06]">
          <span title={`Link CTR ${pct(row.ctrStart, 2)} at the start of the period, ${pct(row.ctrNow, 2)} now`} className="inline-flex items-center gap-0.5">
            CTR <span className="font-semibold text-foreground">{pct(m.ctr, 2)}</span>
            {row.ctrDrop >= 0.005 && (
              <span className="inline-flex items-center text-red-600 dark:text-red-400">
                <ArrowDownRight className="h-3 w-3" />
                {pct(row.ctrDrop, 0)}
              </span>
            )}
          </span>
          {kind === "VIDEO" ? (
            <span>
              Hook <span className="font-semibold text-foreground">{pct(m.hookRate, 0)}</span>
            </span>
          ) : (
            <span>
              Freq. <span className="font-semibold text-foreground">{row.frequency.toFixed(1)}</span>
            </span>
          )}
          <Rankings rankings={ad.rankings} compact />
        </div>
      </div>
    </CardShell>
  );
}

function CardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="truncate text-[13px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** Meta's three relevance rankings. Compact: three ticks with the words in a tooltip. */
function Rankings({ rankings, compact }: { rankings: MetaAd["rankings"]; compact?: boolean }) {
  const items: [string, Ranking][] = [
    ["Quality", rankings.quality],
    ["Engagement", rankings.engagement],
    ["Conversion", rankings.conversion],
  ];
  if (compact) {
    return (
      <span className="ml-auto inline-flex gap-0.5" title={items.map(([k, v]) => `${k}: ${RANK[v].label}`).join(" · ")} aria-label={items.map(([k, v]) => `${k} ranking ${RANK[v].label}`).join(", ")}>
        {items.map(([k, v]) => (
          <span key={k} className={cn("flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold", RANK[v].cls)}>
            {k[0]}
          </span>
        ))}
      </span>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-2xl bg-muted/50 px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{k}</p>
          <span className={cn("mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold", RANK[v].cls)}>{RANK[v].label}</span>
        </div>
      ))}
    </div>
  );
}

function PostCard({ post, onOpen }: { post: OrganicPost; onOpen: () => void }) {
  const F = POST_FORMATS[post.format];
  const m = post.metrics!;
  const video = post.media[0]?.kind === "VIDEO";
  return (
    <CardShell onOpen={onOpen} label={`${F.label}: ${post.caption}`}>
      <div data-post={post.id} className="relative aspect-[4/5]" style={{ background: mediaBackground(post.media[0]?.label ?? post.caption) }}>
        <span aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.3),transparent_55%)]" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/50 to-transparent" />
        {video ? (
          <span className="absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/40 backdrop-blur-md transition group-hover:scale-110">
            <Play className="ml-0.5 h-5 w-5 text-white" fill="currentColor" />
          </span>
        ) : (
          <F.icon className="absolute inset-0 m-auto h-7 w-7 text-white/80 drop-shadow" />
        )}
        <span className={cn(FROST, "absolute left-2.5 top-2.5 inline-flex items-center gap-1")}>
          <Sparkles className="h-3 w-3" /> Organic
        </span>
        <span className="absolute right-2.5 top-2.5 flex gap-1">
          {post.platforms.map((p) => {
            const P = PLATFORMS[p];
            return (
              <span key={p} title={P.label} className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/35 backdrop-blur-md">
                <P.icon className="h-3 w-3" />
              </span>
            );
          })}
        </span>
        <span className={cn(FROST, "absolute bottom-2.5 left-2.5 inline-flex items-center gap-1")}>
          <F.icon className="h-3 w-3" /> {F.label}
        </span>
      </div>
      <div className="space-y-2.5 p-3.5">
        <p className="line-clamp-2 min-h-[2.4em] text-[13px] font-medium leading-snug">{post.caption}</p>
        <dl className="grid grid-cols-3 gap-2">
          <CardStat label="Reach" value={compactNumber(m.reach)} />
          <CardStat label="Engagement" value={pct(interactionsOf(post) / Math.max(1, m.reach))} />
          <CardStat label={m.plays !== undefined ? "Plays" : "Likes"} value={compactNumber(m.plays ?? m.likes)} />
        </dl>
      </div>
    </CardShell>
  );
}

// ─── Table ──────────────────────────────────────────────────────────────────

function CreativeTable({ rows, data, currency, onOpen }: { rows: CreativeRow[]; data: MetaAccountData; currency: string; onOpen: (id: string) => void }) {
  const columns: GaColumn<CreativeRow>[] = [
    {
      id: "name",
      header: "Ad",
      sticky: true,
      sortValue: (r) => r.ad.name,
      render: (r) => (
        <button type="button" onClick={() => onOpen(r.ad.id)} className="flex max-w-64 items-center gap-2 text-left hover:underline">
          <span className="h-9 w-9 shrink-0 rounded-lg" style={{ background: mediaBackground(firstAsset(r.ad, data.creatives)?.name ?? r.ad.name) }} />
          <span className="truncate font-semibold">{r.ad.name}</span>
        </button>
      ),
    },
    { id: "concept", header: "Concept", sortValue: (r) => data.concepts.find((c) => c.id === r.ad.conceptId)?.name ?? "", render: (r) => <span className="whitespace-nowrap text-muted-foreground">{data.concepts.find((c) => c.id === r.ad.conceptId)?.name ?? "—"}</span> },
    { id: "delivery", header: "Delivery", render: (r) => <DeliveryPill delivery={r.ad.delivery} /> },
    { id: "age", header: "Age", align: "right", sortValue: (r) => r.ageDays, render: (r) => <span className="whitespace-nowrap">{r.ageDays} d</span> },
    {
      id: "ctrdrop",
      header: "CTR change",
      align: "right",
      sortValue: (r) => r.ctrDrop,
      // ctrDrop is a fraction (0.21 = 21%): pct() does the ×100.
      render: (r) => <span className={r.ctrDrop >= 0.2 ? "font-semibold text-red-600" : "text-muted-foreground"}>{r.ctrNow ? (r.ctrDrop >= 0.005 ? `−${pct(r.ctrDrop, 0)}` : "steady") : "—"}</span>,
    },
    { id: "health", header: "Health", sortValue: (r) => (r.health === "FATIGUED" ? 2 : r.health === "WATCH" ? 1 : 0), render: (r) => <Pill tone={r.health === "FATIGUED" ? "bad" : r.health === "WATCH" ? "warn" : "good"}>{HEALTH[r.health].label}</Pill> },
    ...metricColumns<CreativeRow>((r) => r.metrics, currency, { keys: ["spend", "impressions", "frequency", "ctr", "hookRate", "holdRate", "results", "costPerResult"] }),
  ];
  return <GaTable rows={rows} columns={columns} rowKey={(r) => r.ad.id} exportName="creatives" defaultSort={{ id: "spend", dir: "desc" }} empty="No ad creatives here." />;
}

// ─── Concepts ───────────────────────────────────────────────────────────────

/** Each concept: what it costs and earns, whether it has media for both feed and vertical placements, and its assets. */
function ConceptsView({ data, rows, currency, useRoas }: { data: MetaAccountData; rows: CreativeRow[]; currency: string; useRoas: boolean }) {
  const spendAll = rows.reduce((t, r) => t + r.metrics.spend, 0);
  if (!data.concepts.length) return <p className={cn("rounded-3xl px-6 py-14 text-center text-sm text-muted-foreground", GLASS)}>No creative concepts yet.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {data.concepts.map((concept) => (
        <ConceptCard key={concept.id} concept={concept} data={data} rows={rows.filter((r) => r.ad.conceptId === concept.id)} spendAll={spendAll} currency={currency} useRoas={useRoas} />
      ))}
    </div>
  );
}

function ConceptCard({ concept, data, rows, spendAll, currency, useRoas }: { concept: CreativeConcept; data: MetaAccountData; rows: CreativeRow[]; spendAll: number; currency: string; useRoas: boolean }) {
  const assets = data.creatives.filter((c) => c.conceptId === concept.id);
  const live = rows.filter((r) => r.ad.status === "ACTIVE").length;
  const spend = rows.reduce((t, r) => t + r.metrics.spend, 0);
  const results = rows.reduce((t, r) => t + r.metrics.results, 0);
  const value = rows.reduce((t, r) => t + r.metrics.purchaseValue, 0);
  const tired = rows.filter((r) => r.health === "FATIGUED").length;
  const feed = assets.some((a) => a.ratio === "1:1" || a.ratio === "4:5");
  const vertical = assets.some((a) => a.ratio === "9:16");
  return (
    <div className={cn("flex flex-col rounded-3xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]", GLASS)}>
      <div className="flex items-start gap-3">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: conceptColor(data, concept.id) }} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {concept.name}
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{concept.angle}</span>
            {tired > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
                <Flame className="h-3 w-3" /> {tired} fatigued
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">&ldquo;{concept.hook}&rdquo;</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-4 gap-2">
        <CardStat label="Live ads" value={String(live)} />
        <CardStat label="Spent" value={formatMetric("spend", spend, currency)} />
        <CardStat label="Results" value={formatMetric("results", results, currency)} />
        <CardStat label={useRoas ? "ROAS" : "Cost/res."} value={useRoas ? (spend ? `${(value / spend).toFixed(2)}x` : "—") : results ? formatMetric("costPerResult", spend / results, currency) : "—"} />
      </dl>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted" title={`${spendAll ? pct(spend / spendAll, 0) : "0%"} of creative spend`}>
        <span className="block h-full rounded-full" style={{ width: `${spendAll ? (spend / spendAll) * 100 : 0}%`, background: conceptColor(data, concept.id) }} />
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">{spendAll ? pct(spend / spendAll, 0) : "0%"} of creative spend</p>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <FitChip ok={feed} label="Feed (1:1, 4:5)" />
        <FitChip ok={vertical} label="Reels & Stories (9:16)" />
      </div>

      {assets.length ? (
        <div className="mt-4 grid grid-cols-5 gap-2">
          {assets.slice(0, 5).map((a) => (
            <div key={a.id} title={a.name} className={cn("relative overflow-hidden rounded-xl", a.ratio === "9:16" ? "aspect-[9/16]" : a.ratio === "4:5" ? "aspect-[4/5]" : "aspect-square")} style={{ background: mediaBackground(a.name) }}>
              {a.kind === "VIDEO" && <Play className="absolute inset-0 m-auto h-3.5 w-3.5 text-white/90" fill="currentColor" />}
              <span className="absolute bottom-1 left-1 rounded bg-black/40 px-1 text-[9px] font-semibold text-white">{a.ratio}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">No images or videos for this concept yet.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-black/[0.05] pt-3 dark:border-white/[0.06]">
        <AskButton prompt={`Brief new creative for the "${concept.name}" concept`}>Brief creative</AskButton>
        {!vertical && <AskButton prompt={`Make a 9:16 version of the "${concept.name}" concept for Reels and Stories`}>Add a 9:16 version</AskButton>}
      </div>
    </div>
  );
}

function FitChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300")}>
      {ok ? <CircleCheck className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      {label}
      {!ok && " missing"}
    </span>
  );
}

// ─── Detail slide-over ──────────────────────────────────────────────────────

/** Everything about one ad creative: preview, why it is fresh or tired, retention, Meta's rankings, placements and copy variations. */
export function CreativeDetail({ row, data, range, currency, onClose }: { row: CreativeRow; data: MetaAccountData; range: DateRange; currency: string; onClose: () => void }) {
  const { ad, metrics: m } = row;
  const kind = kindOf(ad, data.creatives);
  const concept = data.concepts.find((c) => c.id === ad.conceptId);
  const set = data.adSets.find((s) => s.id === ad.adSetId);
  const campaign = data.campaigns.find((c) => c.id === set?.campaignId);
  const placements = useMemo(() => adPlacementRows(data, ad.id, range).filter((p) => p.base.spend > 0).slice(0, 6), [data, ad.id, range]);
  const copy = useMemo(() => adAssetRows(data, ad.id, range).filter((a) => a.kind === "Text" || a.kind === "Headline"), [data, ad.id, range]);
  const placementSpend = placements.reduce((t, p) => t + p.base.spend, 0);
  const copyMax = Math.max(...copy.map((c) => c.metrics.results), 0);
  const useRoas = m.purchaseValue > 0;
  const freqShare = Math.min(1, row.frequency / (row.frequencyLimit * 2));

  return (
    <>
      <DrawerHeader onClose={onClose}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold", HEALTH[row.health].chip)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", HEALTH[row.health].dot)} /> {HEALTH[row.health].label}
          </span>
          <DeliveryPill delivery={ad.delivery} />
          <span className="text-[11px] text-muted-foreground">
            {KIND_META[kind].label}
            {concept ? ` · ${concept.name}` : ""}
          </span>
        </div>
        <p className="mt-1 text-[15px] font-black leading-snug tracking-tight">{ad.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {campaign?.name} › {set?.name}
        </p>
      </DrawerHeader>

      <div className="scroll-slim min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4" data-testid="meta-creative-panel">
        <div className="rounded-3xl bg-muted/40 p-3">
          <div style={{ zoom: 0.82 }}>
            <AdPreviewPanel ad={ad} creatives={data.creatives} />
          </div>
        </div>

        <Section title="Health">
          <div className="space-y-3 rounded-2xl border border-border/60 p-3.5">
            <p className="text-xs leading-relaxed">{HEALTH[row.health].hint}</p>
            <div>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="text-muted-foreground">Frequency</span>
                <span className="font-semibold tabular-nums">
                  {row.frequency.toFixed(1)} <span className="font-normal text-muted-foreground">· tires around {row.frequencyLimit}</span>
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-muted">
                <span className={cn("absolute inset-y-0 left-0 rounded-full", row.frequency > row.frequencyLimit ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${freqShare * 100}%` }} />
                <span className="absolute inset-y-[-3px] w-0.5 rounded bg-foreground/50" style={{ left: "50%" }} title="Where this audience starts to tire" />
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Link CTR, start of period → now</span>
              <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
                {pct(row.ctrStart, 2)} → {pct(row.ctrNow, 2)}
                {row.ctrDrop >= 0.005 ? (
                  <span className={cn("inline-flex items-center", row.ctrDrop >= 0.2 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                    <ArrowDownRight className="h-3 w-3" />
                    {pct(row.ctrDrop, 0)}
                  </span>
                ) : (
                  <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400">
                    <ArrowUpRight className="h-3 w-3" /> steady
                  </span>
                )}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">Live for {row.ageDays} days.</p>
          </div>
        </Section>

        <Section title="Performance">
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Spent" value={formatMetric("spend", m.spend, currency)} />
            <MiniStat label="Results" value={formatMetric("results", m.results, currency)} />
            <MiniStat label={useRoas ? "ROAS" : "Cost/result"} value={useRoas ? formatMetric("roas", m.roas, currency) : m.costPerResult ? formatMetric("costPerResult", m.costPerResult, currency) : "—"} />
            <MiniStat label="CTR (link)" value={pct(m.ctr, 2)} />
            <MiniStat label="CPM" value={formatMetric("cpm", m.cpm, currency)} />
            <MiniStat label="Impressions" value={compactNumber(m.impressions)} />
          </div>
        </Section>

        {kind === "VIDEO" && m.impressions > 0 && (
          <Section title="Video retention">
            <div className="space-y-2.5 rounded-2xl border border-border/60 p-3.5">
              {(
                [
                  ["Impressions", m.impressions, 1, "Shown on screen"],
                  ["3-second plays", m.video3s, m.hookRate, "Hook rate: stopped the scroll"],
                  ["ThruPlays", m.thruPlays, m.thruPlays / m.impressions, `Hold rate ${pct(m.holdRate, 0)} of those who stopped`],
                ] as const
              ).map(([label, v, share, hint]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className="font-medium">{label}</span>
                    <span className="tabular-nums">
                      <span className="font-semibold">{compactNumber(v)}</span> <span className="text-muted-foreground">· {pct(share, 0)}</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(2, share * 100)}%`, background: "var(--viz-brand)" }} />
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Meta's relevance rankings">
          <Rankings rankings={ad.rankings} />
          <p className="text-[11px] text-muted-foreground">Compared with ads competing for the same audience. Meta needs about 500 impressions to rank an ad.</p>
        </Section>

        {placements.length > 0 && (
          <Section title="Where it runs">
            <ul className="space-y-2 rounded-2xl border border-border/60 p-3.5">
              {placements.map((p) => (
                <li key={p.key}>
                  <div className="mb-1 flex justify-between gap-3 text-[11px]">
                    <span className="truncate font-medium">{p.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">{formatMetric("spend", p.base.spend, currency)}</span> · {p.metrics.costPerResult ? `${formatMetric("costPerResult", p.metrics.costPerResult, currency)} each` : "no results"}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <span className="block h-full rounded-full" style={{ width: `${(p.base.spend / placementSpend) * 100}%`, background: "var(--viz-brand)" }} />
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {copy.length > 0 && (
          <Section title="Copy variations">
            <ul className="space-y-2">
              {copy.map((c) => (
                <li key={c.key} className="rounded-2xl border border-border/60 px-3.5 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{c.kind}</p>
                  <p className="mt-0.5 text-xs leading-snug">{c.label}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-muted">
                      <span className="block h-full rounded-full" style={{ width: `${copyMax ? (c.metrics.results / copyMax) * 100 : 0}%`, background: "var(--viz-brand)" }} />
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatMetric("results", c.metrics.results, currency)} results</span>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Details">
          <Rows
            rows={[
              ["Format", `${KIND_META[kind].label}${firstAsset(ad, data.creatives)?.ratio ? ` · ${firstAsset(ad, data.creatives)!.ratio}` : ""}`],
              ["Concept", concept ? `${concept.name} · ${concept.angle}` : "None"],
              ["Review", ad.review === "APPROVED" ? "Approved" : ad.review === "IN_REVIEW" ? "In review" : ad.review === "REJECTED" ? "Rejected" : "Limited"],
              ["Runs as", `${ad.identity.pageName}${ad.identity.instagramHandle ? ` · ${ad.identity.instagramHandle}` : ""}`],
              ...(ad.partnership ? ([["Partnership", `${ad.partnership.creatorName} (${ad.partnership.creatorHandle})`]] as [string, ReactNode][]) : []),
            ]}
          />
        </Section>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border/60 px-4 py-2.5">
        {row.health !== "FRESH" && <AskButton prompt={`Replace the fatigued ad ${ad.name} with a new concept`}>Replace with a new concept</AskButton>}
        <AskButton prompt={`Make a new variation of ${ad.name}`}>New variation</AskButton>
        {ad.status === "ACTIVE" && <AskButton prompt={`Pause the ad ${ad.name}`}>Pause</AskButton>}
      </div>
    </>
  );
}
