"use client";

// Keyword Planner on a live account: Google's own search volumes, competition
// and bid ranges. Discover ideas (from keywords, a page, or a whole site, a
// competitor's included), check volumes for a list, or forecast a budget. Picked
// keywords go to Vera, who turns them into a plan the owner applies.

import { useMemo, useState } from "react";
import { BarChart3, ClipboardList, Globe, KeyRound, Loader2, Search, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceContext } from "@/app/(dashboard)/w/[workspaceSlug]/workspace-context";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import type { Forecast, KeywordResearch, KeywordRow } from "@/lib/google-ads/keyword-planner";
import { money, num } from "@/lib/google-ads/metrics";
import { useGoogleAds } from "@/lib/google-ads/store";
import { GaTable, type GaColumn } from "../ga-table";
import { Card, EmptyState, Pill, Segmented, ViewHeader } from "../ga-ui";
import { RowsSkeleton } from "../ga-skeleton";
import { ChipsInput, countryNames } from "../profile-setup";

type Tab = "discover" | "volume" | "forecast";
type SeedKind = "keywords" | "site" | "url";

const LANGUAGES = ["All languages", "Arabic", "English", "French", "German", "Spanish", "Turkish", "Italian", "Portuguese", "Russian", "Hindi", "Urdu", "Persian", "Dutch", "Greek"];

const INPUT =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-[#400095]/50 focus:ring-[3px] focus:ring-[#400095]/15 dark:bg-input/30";

async function post<T>(workspaceId: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/google-ads/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...body }) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw new Error(json.message ?? (json.error === "not_connected" ? "Google Ads is not connected." : "Google did not answer. Try again in a moment."));
  return json;
}

const splitList = (s: string) => [...new Set(s.split(/[,،\n]/).map((k) => k.trim()).filter(Boolean))];

export function LiveKeywordPlannerView() {
  const workspaceId = useWorkspaceContext().workspace?.id ?? "";
  const [tab, setTab] = useState<Tab>("discover");
  const [countries, setCountries] = useState<string[]>([]);
  const [language, setLanguage] = useState("All languages");
  const [seedKind, setSeedKind] = useState<SeedKind>("keywords");
  const [seedText, setSeedText] = useState("");
  const [volumeText, setVolumeText] = useState("");
  const [research, setResearch] = useState<KeywordResearch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [forecastSeed, setForecastSeed] = useState<string[] | null>(null);
  const options = useMemo(() => countryNames(), []);

  const targeting = () => ({
    ...(countries.length ? { countries } : {}),
    ...(language !== "All languages" ? { language } : { language: "all" }),
  });

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setSelected(new Set());
    try {
      const { research } = await post<{ research: KeywordResearch }>(workspaceId, { ...body, ...targeting() });
      setResearch(research);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const discover = () => {
    const text = seedText.trim();
    if (!text) return;
    void run(seedKind === "keywords" ? { mode: "ideas", keywords: splitList(text).slice(0, 20) } : seedKind === "site" ? { mode: "ideas", site: text } : { mode: "ideas", url: text });
  };
  const measure = () => {
    const list = splitList(volumeText);
    if (list.length) void run({ mode: "metrics", keywords: list.slice(0, 1000) });
  };

  return (
    <div className="space-y-5">
      <ViewHeader
        title="Keyword Planner"
        subtitle="Google's own numbers: how often people search, how competitive it is and what the top of the page costs, by country. Pick keywords and Vera turns them into a plan."
      />

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            value={tab}
            onChange={(t) => setTab(t)}
            options={[
              { value: "discover", label: "Discover new keywords" },
              { value: "volume", label: "Search volume" },
              { value: "forecast", label: "Forecast a budget" },
            ]}
          />
          <span className="text-[11px] text-muted-foreground">Reading only: nothing changes in your account.</span>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Countries</p>
            <ChipsInput value={countries} onChange={setCountries} options={options} placeholder="Your markets from the business profile, or type a country" />
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Language</p>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className={INPUT}>
              {LANGUAGES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        {tab === "discover" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "keywords", label: "From keywords", icon: KeyRound },
                  { id: "site", label: "From a website", icon: Globe },
                  { id: "url", label: "From one page", icon: Search },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSeedKind(o.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                    seedKind === o.id ? "border-[#400095] bg-[#400095]/[0.07] text-[#400095] dark:border-violet-400 dark:text-violet-300" : "border-border/70 text-muted-foreground hover:bg-muted"
                  )}
                >
                  <o.icon className="h-3.5 w-3.5" /> {o.label}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                discover();
              }}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <input
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
                dir="auto"
                placeholder={
                  seedKind === "keywords"
                    ? "Products or services, separated by commas, e.g. glass cups, wool throw"
                    : seedKind === "site"
                      ? "A whole site: yours or a competitor's, e.g. competitor.com"
                      : "One page address, e.g. https://store.com/collections/cups"
                }
                className={INPUT}
              />
              <RunButton busy={busy} disabled={!seedText.trim()} label="Get ideas" />
            </form>
            {seedKind === "site" && (
              <p className="text-[11px] text-muted-foreground">With a competitor&apos;s site you see the searches its pages answer. Google does not show which keywords a competitor pays for.</p>
            )}
          </div>
        )}

        {tab === "volume" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              measure();
            }}
            className="space-y-2"
          >
            <textarea
              value={volumeText}
              onChange={(e) => setVolumeText(e.target.value)}
              dir="auto"
              rows={4}
              placeholder="One keyword per line, or separated by commas (up to 1,000)"
              className={cn(INPUT, "h-auto py-2")}
            />
            <div className="flex justify-end">
              <RunButton busy={busy} disabled={!volumeText.trim()} label="Get search volume" />
            </div>
          </form>
        )}

        {tab === "forecast" && <ForecastPanel workspaceId={workspaceId} targeting={targeting} seed={forecastSeed} />}
      </Card>

      {tab !== "forecast" && (
        <>
          {error && (
            <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/[0.05] px-3 py-2 text-[12.5px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          {busy ? (
            <RowsSkeleton rows={6} />
          ) : research ? (
            <Results
              research={research}
              selected={selected}
              onSelected={setSelected}
              onForecast={(keywords) => {
                setForecastSeed(keywords);
                setTab("forecast");
              }}
            />
          ) : (
            <EmptyState icon={BarChart3} title="Start with a product, a website or a list" body="You will see monthly searches, competition, the cost of the top of the page, seasonality, and which keywords your account already has." />
          )}
        </>
      )}
    </div>
  );
}

function RunButton({ busy, disabled, label }: { busy: boolean; disabled: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#400095] px-4 text-sm font-semibold text-white hover:bg-[#33007a] disabled:opacity-50 dark:bg-violet-600"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} {busy ? "Asking Google…" : label}
    </button>
  );
}

function Sparkline({ points }: { points: { month: string; searches: number }[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.searches)) || 1;
  return (
    <span className="flex h-5 items-end gap-px" title={points.map((p) => `${p.month}: ${num(p.searches)}`).join("\n")}>
      {points.map((p) => (
        <span key={p.month} className="w-1 rounded-sm bg-[#400095]/55 dark:bg-violet-400/60" style={{ height: `${Math.max(8, (p.searches / max) * 100)}%` }} />
      ))}
    </span>
  );
}

function Results({
  research,
  selected,
  onSelected,
  onForecast,
}: {
  research: KeywordResearch;
  selected: Set<string>;
  onSelected: (s: Set<string>) => void;
  onForecast: (keywords: string[]) => void;
}) {
  const agentBusy = useGoogleAds((s) => s.agentBusy);
  const [query, setQuery] = useState("");
  const [hideOwned, setHideOwned] = useState(false);
  const [competition, setCompetition] = useState<"ALL" | "LOW" | "MEDIUM" | "HIGH">("ALL");
  const cur = research.currency;
  const rows = research.rows.filter(
    (r) => (!query || r.text.includes(query.toLowerCase())) && (!hideOwned || !r.inAccount) && (competition === "ALL" || r.competition === competition)
  );
  const owned = research.rows.filter((r) => r.inAccount).length;
  const where = `${research.countries.length ? research.countries.map((c) => c.name).join(", ") : "All countries"} · ${research.language?.name ?? "All languages"}`;

  const askVera = (keywords: string[]) =>
    runAgentTurn(
      `From Keyword Planner (${where}), I picked these keywords: ${keywords.join(", ")}. Check how they fit my account and make a plan with save_plan to add the right ones (match types, the ad group each belongs to, bids within my margin), and say which to skip and why.`
    );

  const columns: GaColumn<KeywordRow>[] = [
    {
      id: "text",
      header: "Keyword",
      label: "Keyword",
      sortValue: (r) => r.text,
      render: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span dir="auto" className="font-semibold">
            {r.text}
          </span>
          {r.inAccount && <Pill tone="good">In account</Pill>}
          {r.blockedByNegative && <Pill tone="bad">Blocked by a negative</Pill>}
        </span>
      ),
      csv: (r) => r.text,
    },
    {
      id: "searches",
      header: "Avg. monthly searches",
      label: "Avg. monthly searches",
      align: "right",
      sortValue: (r) => r.searches ?? -1,
      render: (r) => (
        <span className="flex items-center justify-end gap-2">
          <Sparkline points={r.trend} />
          <span className="w-14 tabular-nums">{r.searches === null ? "—" : num(r.searches, { compact: true })}</span>
        </span>
      ),
      csv: (r) => r.searches ?? "",
    },
    {
      id: "change",
      header: "Last 3 months",
      label: "Last 3 months vs average",
      align: "right",
      sortValue: (r) => r.recentChange ?? -99,
      render: (r) =>
        r.recentChange === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={cn("inline-flex items-center gap-1 tabular-nums", r.recentChange >= 0.1 ? "text-emerald-600" : r.recentChange <= -0.1 ? "text-red-600" : "text-muted-foreground")}>
            {r.recentChange >= 0.1 ? <TrendingUp className="h-3 w-3" /> : r.recentChange <= -0.1 ? <TrendingDown className="h-3 w-3" /> : null}
            {r.recentChange > 0 ? "+" : ""}
            {Math.round(r.recentChange * 100)}%
          </span>
        ),
      csv: (r) => (r.recentChange === null ? "" : Math.round(r.recentChange * 100)),
    },
    {
      id: "peak",
      header: "Peak",
      label: "Peak month",
      sortValue: (r) => r.peakMonth ?? "",
      render: (r) => <span className="text-muted-foreground">{r.peakMonth ?? "Steady"}</span>,
      csv: (r) => r.peakMonth ?? "",
    },
    {
      id: "competition",
      header: "Competition",
      label: "Competition",
      sortValue: (r) => r.competitionIndex ?? -1,
      render: (r) =>
        r.competition === "UNKNOWN" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <Pill tone={r.competition === "HIGH" ? "bad" : r.competition === "MEDIUM" ? "warn" : "good"}>
            {r.competition.toLowerCase()}
            {r.competitionIndex !== null ? ` · ${r.competitionIndex}` : ""}
          </Pill>
        ),
      csv: (r) => r.competition,
    },
    {
      id: "bidLow",
      header: "Top of page (low)",
      label: "Top of page bid (low)",
      align: "right",
      sortValue: (r) => r.bidLow ?? -1,
      render: (r) => (r.bidLow === null ? "—" : money(r.bidLow, cur || "USD", { decimals: 2 })),
      csv: (r) => r.bidLow ?? "",
    },
    {
      id: "bidHigh",
      header: "Top of page (high)",
      label: "Top of page bid (high)",
      align: "right",
      sortValue: (r) => r.bidHigh ?? -1,
      render: (r) => (r.bidHigh === null ? "—" : money(r.bidHigh, cur || "USD", { decimals: 2 })),
      csv: (r) => r.bidHigh ?? "",
    },
  ];

  const seedLabel = research.seed
    ? research.seed.kind === "site"
      ? `ideas from ${research.seed.site}`
      : research.seed.kind === "url" || research.seed.kind === "keywords_and_url"
        ? `ideas from ${research.seed.url}`
        : `ideas from ${research.seed.keywords.join(", ")}`
    : "search volume";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p dir="auto" className="truncate text-sm font-bold">
            {research.rows.length.toLocaleString()} keywords · <span className="font-medium text-muted-foreground">{seedLabel}</span>
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            {where} · last 12 months · {owned > 0 ? `${owned} already in your account · ` : ""}Google Keyword Planner
          </p>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <label className="flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2 text-xs">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter" className="w-28 bg-transparent outline-none" />
          </label>
          <Segmented
            size="xs"
            value={competition}
            onChange={setCompetition}
            options={[
              { value: "ALL", label: "All" },
              { value: "LOW", label: "Low" },
              { value: "MEDIUM", label: "Medium" },
              { value: "HIGH", label: "High" },
            ]}
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={hideOwned} onChange={(e) => setHideOwned(e.target.checked)} className="accent-[#400095]" /> Hide ones I have
          </label>
        </div>
      </div>

      <GaTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.text}
        selectable
        selected={selected}
        onSelectedChange={onSelected}
        defaultSort={{ id: "searches", dir: "desc" }}
        exportName={`keywords-${research.fetchedAt.slice(0, 10)}`}
        bulkActions={(ids) => (
          <span className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={agentBusy}
              onClick={() => askVera(ids)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#400095] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#33007a] disabled:opacity-50 dark:bg-violet-600"
            >
              <ClipboardList className="h-3.5 w-3.5" /> Ask Vera to plan {ids.length}
            </button>
            <button type="button" onClick={() => onForecast(ids)} className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-1.5 text-xs font-semibold hover:bg-muted">
              <Sparkles className="h-3.5 w-3.5" /> Forecast {ids.length}
            </button>
          </span>
        )}
        empty={<p className="py-10 text-center text-sm text-muted-foreground">No keyword matches these filters.</p>}
      />
    </div>
  );
}

function ForecastPanel({ workspaceId, targeting, seed }: { workspaceId: string; targeting: () => Record<string, unknown>; seed: string[] | null }) {
  const [text, setText] = useState(() => (seed ?? []).join("\n"));
  const [match, setMatch] = useState<"EXACT" | "PHRASE" | "BROAD">("PHRASE");
  const [budget, setBudget] = useState("20");
  const [maxCpc, setMaxCpc] = useState("");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Forecast | null>(null);

  const run = async () => {
    const keywords = splitList(text).map((t) => ({ text: t, matchType: match }));
    if (!keywords.length) return;
    setBusy(true);
    setError(null);
    try {
      const { forecast } = await post<{ forecast: Forecast }>(workspaceId, {
        mode: "forecast",
        keywords,
        dailyBudget: Number(budget),
        ...(maxCpc ? { maxCpc: Number(maxCpc) } : {}),
        days: Number(days) || 30,
        ...targeting(),
      });
      setResult(forecast);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const cur = result?.currency || "USD";

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        className="space-y-3"
      >
        <textarea value={text} onChange={(e) => setText(e.target.value)} dir="auto" rows={4} placeholder="Keywords to forecast, one per line (up to 200)" className={cn(INPUT, "h-auto py-2")} />
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Match type</span>
            <select value={match} onChange={(e) => setMatch(e.target.value as typeof match)} className={INPUT}>
              <option value="EXACT">Exact</option>
              <option value="PHRASE">Phrase</option>
              <option value="BROAD">Broad</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Daily budget</span>
            <input value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={INPUT} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Max cost per click (optional)</span>
            <input value={maxCpc} onChange={(e) => setMaxCpc(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Maximize clicks" className={INPUT} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Days</span>
            <select value={days} onChange={(e) => setDays(e.target.value)} className={INPUT}>
              <option value="7">Next 7 days</option>
              <option value="30">Next 30 days</option>
              <option value="90">Next 90 days</option>
            </select>
          </label>
        </div>
        <div className="flex justify-end">
          <RunButton busy={busy} disabled={!text.trim() || !Number(budget)} label="Forecast" />
        </div>
      </form>
      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/[0.05] px-3 py-2 text-[12.5px] text-red-700 dark:text-red-300">{error}</p>}
      {result && !result.clicks && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[12.5px]">
          Google expects almost no clicks for these keywords here. Usually they are searched too rarely in these countries, or they are another brand&apos;s name. Try broader keywords, phrase or broad match, or more countries.
        </p>
      )}
      {result && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Clicks", value: result.clicks === null ? "—" : num(result.clicks) },
              { label: "Cost", value: result.cost === null ? "—" : money(result.cost, cur, { decimals: 0 }) },
              { label: "Avg. cost per click", value: result.averageCpc === null ? "—" : money(result.averageCpc, cur, { decimals: 2 }) },
              { label: "Per day", value: result.cost === null ? "—" : money(result.cost / result.days, cur, { decimals: 2 }) },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-border/60 bg-background p-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <p className="mt-1 text-xl font-black tabular-nums">{k.value}</p>
              </div>
            ))}
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            Google&apos;s forecast for {result.keywords} keyword{result.keywords > 1 ? "s" : ""} over the next {result.days} days
            {result.countries.length ? ` in ${result.countries.map((c) => c.name).join(", ")}` : ""}, with {money(result.dailyBudget, cur, { decimals: 2 })} a day
            {result.maxCpc ? ` and at most ${money(result.maxCpc, cur, { decimals: 2 })} a click` : " on Maximize clicks"}. An estimate, not a promise.
          </p>
        </div>
      )}
    </div>
  );
}
