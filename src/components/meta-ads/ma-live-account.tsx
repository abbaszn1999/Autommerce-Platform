"use client";

// The account side of the real Meta workspace: the demo's look (top bar, side
// navigation, views) with only live data read from Meta, and only the pages
// the connection actually uses: overview, campaigns, Page posts, catalog and
// the connection itself.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  FolderKanban,
  ImageIcon,
  Infinity as InfinityIcon,
  LayoutDashboard,
  Loader2,
  Newspaper,
  Plug,
  RefreshCw,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, EmptyState, Pill, ViewHeader } from "@/components/google-ads/ga-ui";
import { onAccountChanged } from "@/lib/store-agent/change-signal";
import { SearchBox, Section } from "./ma-common";
import { errorText, fmtDate, Notice, type LiveConnection } from "./ma-live-common";

// ── Data ────────────────────────────────────────────────────────────────────

type SectionData<T> = { ok: true; data: T } | { ok: false; error: string };
type Post = { id: string; message: string | null; createdTime: string; permalink: string | null; picture: string | null };
type PanelData = {
  campaigns: SectionData<{ rows: Array<Record<string, unknown>>; raw?: string }>;
  posts: SectionData<Post[]>;
  products: SectionData<{ rows: Array<Record<string, unknown>>; total: number | null }>;
  catalogs?: SectionData<Array<{ id: string; name: string; products: number | null; business: string | null }>>;
};

const RANGES = [
  { id: "last_30d", label: "Last 30 days" },
  { id: "last_90d", label: "Last 90 days" },
  { id: "maximum", label: "All time" },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

/** Column titles in plain words (Meta's field names otherwise). */
const COLUMN_LABELS: Record<string, string> = {
  amount_spent: "Spend",
  spend: "Spend",
  impressions: "Impressions",
  reach: "Reach",
  clicks: "Clicks",
  results: "Results",
  conversions: "Conversions",
  actions: "Conversions",
  ctr: "CTR",
  cpc: "CPC",
  cpm: "CPM",
  effective_status: "Delivery",
  status: "Status",
  name: "Campaign",
  objective: "Objective",
  cost_per_result: "Cost per result",
};
/** Columns worth showing first, when Meta's answer has them. */
const CAMPAIGN_COLUMNS = ["name", "effective_status", "impressions", "reach", "clicks", "amount_spent", "spend", "results", "conversions", "actions", "ctr", "cpc", "cpm", "cost_per_result", "objective", "status"];

/** A value from Meta: money comes as { value, unit } or { amount, currency }. */
const cell = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  // JSON text (results from Meta's MCP server): shown as its number, never as code.
  if (typeof v === "string" && parseJsonText(v) !== undefined) {
    const n = num(v);
    return n === null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const amount = o.value ?? o.amount;
    const unit = o.unit ?? o.currency;
    if (amount !== undefined) return `${typeof amount === "number" ? amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : amount}${unit ? ` ${unit}` : ""}`;
    // A result: { indicator, values: [{ value }] } → its number ("—" when Meta has none).
    if ("values" in o || "indicator" in o) {
      const n = num(o);
      return n === null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
  }
  // Conversions and results come as lists (actions, or { indicator, values: [{ value }] }): show their total.
  if (Array.isArray(v)) {
    const n = num(v);
    return n === null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v);
};

/** The number in a value from Meta, or null when there is none ("Not available"). */
const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    // Meta's MCP server can send results as JSON text: '{"indicator":"actions:…","values":[{"value":"12"}]}'.
    const parsed = parseJsonText(v);
    if (parsed !== undefined) return num(parsed);
    return v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
  }
  if (Array.isArray(v)) {
    // An item is { value } (actions) or { indicator, values: [{ value }] } (results).
    const parts = v
      .map((x) => num(x && typeof x === "object" ? ((x as Record<string, unknown>).value ?? (x as Record<string, unknown>).values) : x))
      .filter((n): n is number => n !== null);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return num(o.value ?? o.amount ?? o.values);
  }
  return null;
};

/** JSON written as text ("{…}" or "[…]"), parsed; undefined when it isn't. */
function parseJsonText(s: string): unknown {
  const t = s.trim();
  if (!/^[[{]/.test(t)) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

const firstKey = (row: Record<string, unknown>, keys: string[]) => keys.find((k) => k in row);

/** Account total of one metric over the campaign rows (null when Meta gave no number). */
function total(rows: Array<Record<string, unknown>>, keys: string[]): number | null {
  let sum = 0;
  let any = false;
  for (const r of rows) {
    const k = firstKey(r, keys);
    const n = k ? num(r[k]) : null;
    if (n !== null) {
      sum += n;
      any = true;
    }
  }
  return any ? sum : null;
}

const SPEND = ["amount_spent", "spend"];
const RESULTS = ["results", "conversions", "actions"];

const fmtNum = (n: number | null) => (n === null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 0 }));
const fmtMoney = (n: number | null, currency: string | null) =>
  n === null ? "—" : currency ? n.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 2 }) : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function StatusPill({ status }: { status: unknown }) {
  const s = typeof status === "string" ? status : "";
  if (!s) return <span className="text-muted-foreground">—</span>;
  const tone = s === "ACTIVE" ? "good" : /PAUSED/.test(s) ? "neutral" : /DISAPPROVED|ERROR|DELETED/.test(s) ? "bad" : "info";
  const label = s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
  return <Pill tone={tone}>{label}</Pill>;
}

// ── Area ────────────────────────────────────────────────────────────────────

type LiveView = "overview" | "campaigns" | "posts" | "catalog" | "connection";

const NAV: Array<{ title?: string; items: Array<{ view: LiveView; label: string; icon: LucideIcon }> }> = [
  { items: [{ view: "overview", label: "Overview", icon: LayoutDashboard }] },
  { title: "Ads", items: [{ view: "campaigns", label: "Campaigns", icon: FolderKanban }] },
  {
    title: "Content",
    items: [
      { view: "posts", label: "Page posts", icon: Newspaper },
      { view: "catalog", label: "Catalog", icon: ShoppingBag },
    ],
  },
  { title: "Setup", items: [{ view: "connection", label: "Connection", icon: Plug }] },
];

export function LiveAccountArea({ workspaceId, connection, connectionCard }: { workspaceId: string; connection: LiveConnection; connectionCard: React.ReactNode }) {
  const [view, setView] = useState<LiveView>("overview");
  const [range, setRange] = useState<RangeId>("last_30d");
  const [data, setData] = useState<PanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meta-ads/panel?workspaceId=${encodeURIComponent(workspaceId)}&range=${range}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? "network");
      else {
        setData(json);
        setUpdatedAt(new Date());
      }
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, range]);
  useEffect(() => {
    void load();
  }, [load, connection.adAccount?.id, connection.page?.id, connection.catalog?.id]);
  // A change Vera applied after approval: read Meta again so the pages show it.
  useEffect(() => onAccountChanged(() => void load()), [load]);

  const rangeLabel = RANGES.find((r) => r.id === range)?.label ?? "";
  const ctx: ViewCtx = { data, connection, rangeLabel, setView };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Top bar: the account, the period and a refresh, like the demo's. */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-background px-3">
        <div className="flex min-w-0 items-center gap-2 px-2 py-1">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#400095]/10 text-[#400095] dark:bg-violet-500/15 dark:text-violet-300">
            <InfinityIcon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 text-left">
            <span className="block max-w-64 truncate text-xs font-semibold">{connection.adAccount?.name}</span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {connection.adAccount?.id}
              {connection.business ? ` · ${connection.business.name}` : ""}
            </span>
          </span>
        </div>
        <Pill tone="good" className="hidden sm:inline-flex">
          Live from Meta
        </Pill>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 text-xs hover:bg-muted disabled:opacity-60"
            title="Read the latest numbers from Meta"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 text-muted-foreground", loading && "animate-spin")} />
            <span className="hidden text-muted-foreground xl:inline">
              {loading ? "Refreshing" : updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Refresh"}
            </span>
          </button>
          <label className="relative inline-flex h-8 items-center rounded-lg border border-border/70 text-xs hover:bg-muted">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeId)}
              aria-label="Period"
              className="h-full cursor-pointer appearance-none rounded-lg bg-transparent pe-7 ps-2.5 font-medium outline-none"
            >
              {RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute end-2 h-3 w-3 text-muted-foreground" />
          </label>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Meta Ads pages" className="flex w-52 shrink-0 flex-col overflow-y-auto border-e border-border/60 bg-muted/20 px-2 py-3">
          {NAV.map((g, gi) => (
            <div key={gi} className={cn(gi > 0 && "mt-3")}>
              {g.title && <p className="mb-1 px-2.5 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">{g.title}</p>}
              {g.items.map((item) => (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => setView(item.view)}
                  aria-current={view === item.view ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                    view === item.view ? "bg-[#400095]/10 text-[#400095] dark:bg-violet-500/15 dark:text-violet-300" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] space-y-4 px-5 py-5">
            {view === "connection" ? (
              <>
                <ViewHeader title="Connection" subtitle="What Autommerce can reach in your Meta accounts, and how to remove it." />
                {connectionCard}
              </>
            ) : error ? (
              <Notice>{errorText(error)}</Notice>
            ) : !data ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Reading live data from Meta…
              </div>
            ) : view === "overview" ? (
              <OverviewView {...ctx} data={data} />
            ) : view === "campaigns" ? (
              <CampaignsView {...ctx} data={data} />
            ) : view === "posts" ? (
              <PostsView {...ctx} data={data} />
            ) : (
              <CatalogView {...ctx} data={data} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

type ViewCtx = { data: PanelData | null; connection: LiveConnection; rangeLabel: string; setView: (v: LiveView) => void };
type ReadyCtx = ViewCtx & { data: PanelData };

function Failed({ error }: { error: string }) {
  return <p className="px-4 py-6 text-[12px] text-muted-foreground">{error}</p>;
}

// ── Overview ────────────────────────────────────────────────────────────────

function OverviewView({ data, connection, rangeLabel, setView }: ReadyCtx) {
  const rows = data.campaigns.ok ? data.campaigns.data.rows : [];
  const currency = connection.adAccount?.currency ?? null;
  const tiles = [
    { label: "Amount spent", value: fmtMoney(total(rows, SPEND), currency) },
    { label: "Impressions", value: fmtNum(total(rows, ["impressions"])) },
    { label: "Reach", value: fmtNum(total(rows, ["reach"])) },
    { label: "Clicks", value: fmtNum(total(rows, ["clicks"])) },
    { label: "Results", value: fmtNum(total(rows, RESULTS)) },
  ];
  const top = [...rows].sort((a, b) => (num(b[firstKey(b, SPEND) ?? ""]) ?? 0) - (num(a[firstKey(a, SPEND) ?? ""]) ?? 0)).slice(0, 5);
  const posts = data.posts.ok ? data.posts.data.slice(0, 3) : [];

  return (
    <>
      <ViewHeader title="Overview" subtitle={`${connection.adAccount?.name ?? ""} · all campaigns · ${rangeLabel.toLowerCase()}`} />
      {!data.campaigns.ok ? (
        <Notice>{data.campaigns.error}</Notice>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-testid="meta-kpis">
          {tiles.map((t) => (
            <Card key={t.label} className="p-4">
              <p className="text-[11px] font-semibold text-muted-foreground">{t.label}</p>
              <p className="mt-1 text-xl font-black tabular-nums tracking-tight">{t.value}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{rangeLabel}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Section
          title="Top campaigns by spend"
          subtitle={rangeLabel}
          actions={
            <button type="button" onClick={() => setView("campaigns")} className="text-[11px] font-semibold text-[#400095] hover:underline dark:text-violet-300">
              All campaigns
            </button>
          }
        >
          {top.length ? (
            <ul className="divide-y divide-border/50">
              {top.map((r, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-[12px]">
                  <span className="min-w-0 flex-1 truncate font-medium">{cell(r.name)}</span>
                  <StatusPill status={r.effective_status ?? r.status} />
                  <span className="w-24 shrink-0 text-end tabular-nums text-muted-foreground">{fmtNum(num(r.impressions))} impr.</span>
                  <span className="w-24 shrink-0 text-end font-semibold tabular-nums">{fmtMoney(num(r[firstKey(r, SPEND) ?? ""]), currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Failed error={data.campaigns.ok ? "No campaigns in this ad account yet." : data.campaigns.error} />
          )}
        </Section>

        <Section
          title="Latest Page posts"
          subtitle={connection.page?.name ?? "No Page selected"}
          actions={
            <button type="button" onClick={() => setView("posts")} className="text-[11px] font-semibold text-[#400095] hover:underline dark:text-violet-300">
              All posts
            </button>
          }
        >
          {posts.length ? (
            <ul className="divide-y divide-border/50">
              {posts.map((p) => (
                <li key={p.id} className="flex gap-3 px-4 py-2.5">
                  {p.picture ? <img src={p.picture} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" /> : <div className="h-10 w-10 shrink-0 rounded-lg bg-muted" />}
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[12px]" dir="auto">
                      {p.message ?? "(no text)"}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-muted-foreground">{fmtDate(p.createdTime)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Failed error={data.posts.ok ? "This Page has no posts yet." : data.posts.error} />
          )}
        </Section>
      </div>
    </>
  );
}

// ── Campaigns ───────────────────────────────────────────────────────────────

function CampaignsView({ data, connection, rangeLabel }: ReadyCtx) {
  const [query, setQuery] = useState("");
  const section = data.campaigns;
  const rows = useMemo(() => (section.ok ? section.data.rows : []), [section]);
  const shown = useMemo(() => rows.filter((r) => !query || String(r.name ?? "").toLowerCase().includes(query.toLowerCase())), [rows, query]);
  // Every key any row has (Meta leaves a metric out of a row that has none).
  const cols = useMemo(() => {
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const seen = new Set<string>();
    return [...CAMPAIGN_COLUMNS.filter((c) => keys.includes(c)), ...keys.filter((k) => !CAMPAIGN_COLUMNS.includes(k) && !/id$/.test(k))]
      .filter((c) => {
        const label = COLUMN_LABELS[c] ?? c;
        if (seen.has(label)) return false;
        seen.add(label);
        return true;
      })
      .slice(0, 10);
  }, [rows]);

  return (
    <>
      <ViewHeader title="Campaigns" subtitle={`${connection.adAccount?.name ?? ""} · ${rangeLabel.toLowerCase()} · read live from Meta`} actions={<SearchBox value={query} onChange={setQuery} placeholder="Search campaigns" />} />
      <Section title={`${rows.length} campaign${rows.length === 1 ? "" : "s"}`} subtitle="Results as reported by Meta">
        {!section.ok ? (
          <Failed error={section.error} />
        ) : !rows.length ? (
          <EmptyState icon={FolderKanban} title="No campaigns yet" body={section.data.raw ? "Meta's answer had no campaign list." : "This ad account has no campaigns yet."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]" data-testid="meta-campaigns">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30 text-[11px] text-muted-foreground">
                  {cols.map((c) => (
                    <th key={c} className={cn("whitespace-nowrap px-3 py-2 font-semibold", c !== "name" && "text-end", (c === "effective_status" || c === "status") && "text-start")}>
                      {COLUMN_LABELS[c] ?? c.replace(/_/g, " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={i} className="border-b border-border/40 transition-colors last:border-0 hover:bg-muted/30">
                    {cols.map((c) => (
                      <td
                        key={c}
                        className={cn(
                          "whitespace-nowrap px-3 py-2.5",
                          c === "name" ? "max-w-[280px] truncate font-medium" : c === "effective_status" || c === "status" ? "" : "text-end tabular-nums"
                        )}
                        dir={c === "name" ? "auto" : undefined}
                      >
                        {c === "effective_status" || c === "status" ? <StatusPill status={r[c]} /> : cell(r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

// ── Page posts ──────────────────────────────────────────────────────────────

function PostsView({ data, connection }: ReadyCtx) {
  return (
    <>
      <ViewHeader title="Page posts" subtitle={`${connection.page?.name ?? "No Page selected"} · the latest posts, read from Meta`} />
      {!data.posts.ok ? (
        <Notice>{data.posts.error}</Notice>
      ) : !data.posts.data.length ? (
        <EmptyState icon={Newspaper} title="No posts yet" body="This Page has no posts yet." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="meta-posts">
          {data.posts.data.map((p) => (
            <Card key={p.id} className="flex flex-col overflow-hidden">
              {p.picture ? (
                <img src={p.picture} alt="" className="aspect-[1.91/1] w-full object-cover" />
              ) : (
                <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-muted">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex flex-1 flex-col p-4">
                <p className="line-clamp-4 flex-1 text-[12.5px] leading-relaxed" dir="auto">
                  {p.message ?? "(no text)"}
                </p>
                <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{fmtDate(p.createdTime)}</span>
                  {p.permalink && (
                    <a href={p.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold hover:text-foreground">
                      Open on Facebook <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// ── Catalog ─────────────────────────────────────────────────────────────────

function CatalogView({ data, connection }: ReadyCtx) {
  return (
    <>
      <ViewHeader title="Catalog" subtitle="Your product catalogs on Meta. Vera creates, renames and deletes catalogs only after your approval." />
      <Section title={connection.catalog?.name ?? "No catalog selected"} subtitle={data.products.ok && data.products.data.total !== null ? `${data.products.data.total.toLocaleString()} products` : "Products"}>
        {!data.products.ok ? (
          <Failed error={data.products.error} />
        ) : !data.products.data.rows.length ? (
          <Failed error="This catalog has no products yet." />
        ) : (
          <table className="w-full text-left text-[12px]" data-testid="meta-products">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-[11px] text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Product</th>
                <th className="px-4 py-2 font-semibold">Availability</th>
                <th className="px-4 py-2 text-end font-semibold">Price</th>
              </tr>
            </thead>
            <tbody>
              {data.products.data.rows.map((r, i) => (
                <tr key={i} className="border-b border-border/40 last:border-0">
                  <td className="max-w-[360px] truncate px-4 py-2.5 font-medium" dir="auto">
                    {cell(r.name ?? r.title ?? r.retailer_id ?? r.id)}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{cell(r.availability)}</td>
                  <td className="px-4 py-2.5 text-end tabular-nums">{cell(r.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {data.catalogs && (
        <Section title="Product catalogs" subtitle="Every catalog you shared with Autommerce">
          {!data.catalogs.ok ? (
            <Failed error={data.catalogs.error} />
          ) : !data.catalogs.data.length ? (
            <Failed error="No catalogs shared yet." />
          ) : (
            <ul className="divide-y divide-border/50" data-testid="meta-catalogs">
              {data.catalogs.data.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-[12px]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block text-[10.5px] text-muted-foreground">
                      {c.business ? `${c.business} · ` : ""}
                      {c.id}
                    </span>
                  </span>
                  {c.products !== null && <span className="shrink-0 tabular-nums text-muted-foreground">{c.products.toLocaleString()} products</span>}
                  {connection.catalog?.id === c.id && <Pill tone="brand">Selected</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}
