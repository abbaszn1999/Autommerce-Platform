"use client";

// Competitor ads: the search keywords a competitor's site pays for in a
// country, with the ad it shows on each, its landing page and what a click
// costs. SE Ranking's estimates, bought at cost: the page says the price before
// anything is charged, and a lookup this month's copy already has is free.
// Picked keywords go to Vera, who turns them into a plan.

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, ExternalLink, History, Loader2, Search, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceContext } from "@/app/(dashboard)/w/[workspaceSlug]/workspace-context";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import type { CompetitorAnalysis, CompetitorKeyword } from "@/lib/google-ads/competitor-ads";
import { money, num } from "@/lib/google-ads/metrics";
import { useGoogleAds } from "@/lib/google-ads/store";
import { GaTable, type GaColumn } from "../ga-table";
import { Card, EmptyState, Pill, Segmented, ViewHeader } from "../ga-ui";
import { RowsSkeleton } from "../ga-skeleton";
import { countryNames } from "../profile-setup";

type Summary = { id: string; domain: string; country: string; month: string; pages: number; creditsCharged: number; totals: { keywords?: number; traffic?: number; cost?: number }; updatedAt: string };
type Quote = { credits: number; pagesToBuy: number; creditsPerPage: number };
type Asked = { domain: string; country: string; pages: number };

const INPUT =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-[#400095]/50 focus:ring-[3px] focus:ring-[#400095]/15 dark:bg-input/30";

const credits = (v: number) => `${v.toLocaleString("en-US", { maximumFractionDigits: 3 })} credit${v === 1 ? "" : "s"}`;
const regionName = (code: string) => new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const thisMonth = () => new Date().toISOString().slice(0, 7);

class LookupError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
  }
}

async function call<T>(workspaceId: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/google-ads/competitor-ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...body }) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) {
    if (json.error === "forbidden") throw new LookupError("Viewers can't run competitor lookups. Ask an owner or admin.", json.error);
    throw new LookupError(json.message ?? "The lookup did not go through. Try again in a moment.", json.error);
  }
  return json;
}

export function LiveCompetitorAdsView() {
  const workspaceId = useWorkspaceContext().workspace?.id ?? "";
  const [domain, setDomain] = useState("");
  const [country, setCountry] = useState("");
  const [history, setHistory] = useState<Summary[] | null>(null);
  const [perPage, setPerPage] = useState<number | null>(null);
  const [pending, setPending] = useState<(Asked & { quote: Quote }) | null>(null);
  const [analysis, setAnalysis] = useState<CompetitorAnalysis | null>(null);
  const [busy, setBusy] = useState<"quote" | "run" | null>(null);
  const [error, setError] = useState<LookupError | null>(null);
  const options = useMemo(() => countryNames(), []);

  const loadHistory = async () => {
    if (!workspaceId) return;
    const res = await fetch(`/api/google-ads/competitor-ads?workspaceId=${workspaceId}`);
    const json = (await res.json().catch(() => ({}))) as { analyses?: Summary[]; creditsPerPage?: number | null };
    setHistory(json.analyses ?? []);
    setPerPage(json.creditsPerPage ?? null);
    // Start from the country of the last lookup.
    if (json.analyses?.[0]) setCountry((c) => c || regionName(json.analyses![0]!.country));
  };
  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const run = async (asked: Asked) => {
    setBusy("run");
    setError(null);
    setPending(null);
    try {
      const { analysis } = await call<{ analysis: CompetitorAnalysis }>(workspaceId, { mode: "run", ...asked });
      setAnalysis(analysis);
      void loadHistory();
    } catch (e) {
      setError(e as LookupError);
    } finally {
      setBusy(null);
    }
  };

  /** Price first; a lookup the month's copy already has runs straight away. */
  const lookUp = async (asked: Asked) => {
    setBusy("quote");
    setError(null);
    setPending(null);
    try {
      const { quote } = await call<{ quote: Quote }>(workspaceId, { mode: "quote", ...asked });
      if (quote.credits > 0) {
        setPending({ ...asked, quote });
        setBusy(null);
      } else await run(asked);
    } catch (e) {
      setError(e as LookupError);
      setBusy(null);
    }
  };

  const submit = () => {
    if (!domain.trim() || !country.trim()) return;
    void lookUp({ domain: domain.trim(), country: country.trim(), pages: 1 });
  };

  return (
    <div className="space-y-5">
      <ViewHeader
        title="Competitor ads"
        subtitle="The searches a competitor pays Google to show up on, with the ad they run on each and what a click costs. Pick keywords and Vera turns them into a plan."
      />

      <Card className="space-y-3 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="grid gap-3 lg:grid-cols-[1fr_220px_auto]"
        >
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Competitor&apos;s website</span>
            <input value={domain} onChange={(e) => setDomain(e.target.value)} dir="ltr" placeholder="competitor.com" className={INPUT} />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Country</span>
            <input value={country} onChange={(e) => setCountry(e.target.value)} list="competitor-countries" placeholder="e.g. Lebanon" className={INPUT} />
            <datalist id="competitor-countries">
              {options.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={!!busy || !domain.trim() || !country.trim()}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#400095] px-4 text-sm font-semibold text-white hover:bg-[#33007a] disabled:opacity-50 lg:w-auto dark:bg-violet-600"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} {busy === "run" ? "Looking up…" : busy === "quote" ? "Checking…" : "Look up"}
            </button>
          </div>
        </form>
        <p className="text-[11px] text-muted-foreground">
          Estimates from SE Ranking, which watches Google&apos;s results and records who advertises where. Billed at cost
          {perPage ? `: ${credits(perPage)} per 1,000 keywords` : ""}, and free when this month&apos;s data for the site is already here. Nothing changes in your account.
        </p>
      </Card>

      {pending && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#400095]/25 bg-[#400095]/[0.04] px-4 py-3 dark:border-violet-400/30">
          <p className="min-w-0 flex-1 text-[13px]">
            Looking up <b dir="ltr">{pending.domain}</b> in {pending.country} costs <b>{credits(pending.quote.credits)}</b>
            {pending.quote.pagesToBuy > 1 ? ` at most (${pending.quote.pagesToBuy} pages of 1,000 keywords; only what exists is charged)` : ""}. It is what the data costs us, with no margin.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPending(null)} className="rounded-lg border border-border/70 px-3 py-1.5 text-xs font-semibold hover:bg-muted">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void run({ domain: pending.domain, country: pending.country, pages: pending.pages })}
              className="rounded-lg bg-[#400095] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#33007a] dark:bg-violet-600"
            >
              Look up for {credits(pending.quote.credits)}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/[0.05] px-3 py-2 text-[12.5px] text-red-700 dark:text-red-300">
          {error.message}
          {(error.code === "no_credits" || error.code === "no_subscription") && <span className="ms-1">Top up from Billing, then look up again.</span>}
        </div>
      )}

      {busy === "run" ? (
        <RowsSkeleton rows={6} />
      ) : analysis ? (
        <Results analysis={analysis} busy={!!busy} onMore={() => void lookUp({ domain: analysis.domain, country: analysis.country, pages: analysis.pages + 1 })} />
      ) : (
        <EmptyState
          icon={Swords}
          title="See what a competitor pays for on Google"
          body="Enter their website and the country you sell in. You get the keywords their ads appear on, the ad text, the page each ad opens, and which of those keywords your account doesn't have yet."
        />
      )}

      <RecentLookups history={history} onOpen={(h) => void lookUp({ domain: h.domain, country: h.country, pages: h.pages })} busy={!!busy} />
    </div>
  );
}

function Results({ analysis, busy, onMore }: { analysis: CompetitorAnalysis; busy: boolean; onMore: () => void }) {
  const agentBusy = useGoogleAds((s) => s.agentBusy);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<"all" | "missing" | "shopping">("all");
  const where = regionName(analysis.country);
  const rows = analysis.keywords.filter(
    (k) => (!query || k.keyword.includes(query.toLowerCase())) && (show === "all" || (show === "missing" ? !k.inAccount : k.placement === "shopping"))
  );
  const missing = analysis.keywords.filter((k) => !k.inAccount).length;

  const askVera = (keywords: string[]) =>
    runAgentTurn(
      `${analysis.domain} pays for these Google searches in ${where} (competitor_ads, ${monthLabel(analysis.month)}): ${keywords.join(", ")}. Check which fit what my store sells and my margin (keyword_research for Google's volumes and bids), then make a plan with save_plan to add the right ones to my account, and say which to skip and why.`
    );

  const columns: GaColumn<CompetitorKeyword>[] = [
    {
      id: "keyword",
      header: "Keyword",
      label: "Keyword",
      sortValue: (r) => r.keyword,
      render: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span dir="auto" className="font-semibold">
            {r.keyword}
          </span>
          {r.placement === "shopping" && <Pill tone="info">Shopping ad</Pill>}
          {r.inAccount && <Pill tone="good">In your account</Pill>}
          {r.blockedByNegative && <Pill tone="bad">Your negative blocks it</Pill>}
        </span>
      ),
      csv: (r) => r.keyword,
    },
    {
      id: "volume",
      header: "Monthly searches",
      label: "Monthly searches",
      align: "right",
      sortValue: (r) => r.volume ?? -1,
      render: (r) => (r.volume === null ? "—" : num(r.volume, { compact: true })),
      csv: (r) => r.volume ?? "",
    },
    {
      id: "cpc",
      header: "Cost per click",
      label: "Cost per click (USD)",
      align: "right",
      sortValue: (r) => r.cpc ?? -1,
      render: (r) => (r.cpc ? money(r.cpc, "USD", { decimals: 2 }) : "—"),
      csv: (r) => r.cpc ?? "",
    },
    {
      id: "position",
      header: "Ad position",
      label: "Ad position",
      align: "right",
      sortValue: (r) => r.position ?? 99,
      render: (r) => (r.position === null ? "—" : `${r.position}${r.placement === "bottom" ? " (bottom)" : ""}`),
      csv: (r) => r.position ?? "",
    },
    {
      id: "ad",
      header: "Their ad",
      label: "Their ad",
      sortValue: (r) => r.ads[0]?.title ?? "",
      render: (r) => {
        const ad = r.ads[0];
        if (!ad) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="block max-w-[340px]">
            <span dir="auto" className="block truncate font-medium" title={ad.title}>
              {ad.title || ad.displayUrl}
            </span>
            {ad.description && (
              <span dir="auto" className="block truncate text-[11.5px] text-muted-foreground" title={ad.description}>
                {ad.description}
              </span>
            )}
            {r.ads.length > 1 && <span className="text-[11px] text-muted-foreground">+{r.ads.length - 1} more ad{r.ads.length > 2 ? "s" : ""}</span>}
          </span>
        );
      },
      csv: (r) => r.ads.map((a) => [a.title, a.description].filter(Boolean).join(" — ")).join(" | "),
    },
    {
      id: "page",
      header: "Landing page",
      label: "Landing page",
      sortValue: (r) => r.landingPages[0] ?? "",
      render: (r) => {
        const url = r.landingPages[0];
        if (!url) return <span className="text-muted-foreground">—</span>;
        let label = url;
        try {
          const u = new URL(url);
          label = `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
        } catch {
          // Shown as given.
        }
        return (
          <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-[220px] items-center gap-1 text-[#400095] hover:underline dark:text-violet-300" title={url}>
            <span className="truncate" dir="ltr">
              {label}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        );
      },
      csv: (r) => r.landingPages.join(" | "),
    },
    {
      id: "traffic",
      header: "Est. clicks/mo",
      label: "Estimated clicks a month",
      align: "right",
      sortValue: (r) => r.traffic ?? -1,
      render: (r) => (r.traffic ? num(r.traffic) : "—"),
      csv: (r) => r.traffic ?? "",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">
            <span dir="ltr">{analysis.domain}</span> · {analysis.totals.keywords.toLocaleString()} paid keyword{analysis.totals.keywords === 1 ? "" : "s"} in {where}
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            {analysis.totals.traffic > 0
              ? `About ${num(analysis.totals.traffic)} clicks and ${money(analysis.totals.cost, "USD", { decimals: 0 })} a month`
              : "Too few clicks to estimate their spend"}{" "}
            · {monthLabel(analysis.month)} · SE Ranking estimates
            {analysis.comparedWithAccount ? ` · ${missing.toLocaleString()} not in your account` : ""}
            {analysis.creditsCharged > 0 ? ` · you paid ${credits(analysis.creditsCharged)}` : " · free"}
          </p>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <label className="flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2 text-xs">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter" className="w-28 bg-transparent outline-none" />
          </label>
          <Segmented
            size="xs"
            value={show}
            onChange={setShow}
            options={[
              { value: "all", label: "All" },
              ...(analysis.comparedWithAccount ? [{ value: "missing" as const, label: "Not in my account" }] : []),
              { value: "shopping", label: "Shopping ads" },
            ]}
          />
        </div>
      </div>

      {analysis.freeListingsRemoved > 0 && (
        <p className="text-[11.5px] text-muted-foreground">
          {analysis.freeListingsRemoved.toLocaleString()} free Google product listing{analysis.freeListingsRemoved === 1 ? " was" : "s were"} left out: they are not ads, though the data
          source counts them as paid.
        </p>
      )}

      {analysis.keywords.length === 0 ? (
        <EmptyState
          icon={Swords}
          title={`No paid search keywords for ${analysis.domain} in ${where}`}
          body="It doesn't advertise on Google searches there, or too little to be seen. It may still run Performance Max, Shopping or video ads, which don't show up as keywords."
        />
      ) : (
        <GaTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.keyword}
          selectable
          selected={selected}
          onSelectedChange={setSelected}
          defaultSort={{ id: "volume", dir: "desc" }}
          exportName={`competitor-ads-${analysis.domain}-${analysis.country.toLowerCase()}-${analysis.month}`}
          bulkActions={(ids) => (
            <button
              type="button"
              disabled={agentBusy}
              onClick={() => askVera(ids)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#400095] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#33007a] disabled:opacity-50 dark:bg-violet-600"
            >
              <ClipboardList className="h-3.5 w-3.5" /> Ask Vera to plan {ids.length}
            </button>
          )}
          empty={<p className="py-10 text-center text-sm text-muted-foreground">No keyword matches these filters.</p>}
        />
      )}

      {analysis.hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={busy}
            onClick={onMore}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
          >
            Load 1,000 more keywords
          </button>
        </div>
      )}
    </div>
  );
}

function RecentLookups({ history, onOpen, busy }: { history: Summary[] | null; onOpen: (h: Summary) => void; busy: boolean }) {
  if (history === null) return <RowsSkeleton rows={2} />;
  if (!history.length) return null;
  const current = thisMonth();
  return (
    <Card className="p-4">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <History className="h-3.5 w-3.5" /> Recent lookups
      </p>
      <ul className="divide-y divide-border/60">
        {history.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[12.5px]">
            <span className="font-semibold" dir="ltr">
              {h.domain}
            </span>
            <span className="text-muted-foreground">
              {regionName(h.country)} · {monthLabel(h.month)} · {(h.totals.keywords ?? 0).toLocaleString()} keywords
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => onOpen(h)}
              className={cn("ms-auto rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50", h.month === current ? "text-[#400095] hover:bg-[#400095]/[0.07] dark:text-violet-300" : "border border-border/70 hover:bg-muted")}
            >
              {h.month === current ? "Open (free)" : "Look up again"}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
