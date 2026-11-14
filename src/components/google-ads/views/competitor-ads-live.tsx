"use client";

// Competitor ads: the search keywords each competitor's site pays for in a
// country, with the ad it shows on each, its landing page and what a click
// costs. Vera fills this page (from the competitors in the business profile and
// the ones she finds) and adds new ones when asked in the chat; there is no form
// here. SE Ranking's estimates, bought at cost: the page says the price before
// anything is charged, and a lookup this month's copy already has is free.
// Picked keywords go to Vera, who turns them into a plan.

import { useEffect, useState } from "react";
import { Bot, ClipboardList, ExternalLink, Search, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceContext } from "@/app/(dashboard)/w/[workspaceSlug]/workspace-context";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import type { CompetitorAnalysis, CompetitorKeyword } from "@/lib/google-ads/competitor-ads";
import { money, num } from "@/lib/google-ads/metrics";
import { useGoogleAds } from "@/lib/google-ads/store";
import { GaTable, type GaColumn } from "../ga-table";
import { EmptyState, Pill, Segmented, ViewHeader } from "../ga-ui";
import { RowsSkeleton } from "../ga-skeleton";

type Summary = { id: string; domain: string; country: string; month: string; pages: number; creditsCharged: number; totals: { keywords?: number; traffic?: number; cost?: number }; updatedAt: string };
type Quote = { credits: number; pagesToBuy: number; creditsPerPage: number };
type Asked = { domain: string; country: string; pages: number };
/** A competitor of the business: from the business profile (named by the owner or found by Vera) and/or a lookup already run. */
type Rival = { domain: string; name: string; country: string; summary: Summary | null };

const credits = (v: number) => `${v.toLocaleString("en-US", { maximumFractionDigits: 3 })} credit${v === 1 ? "" : "s"}`;
const regionName = (code: string) => new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const thisMonth = () => new Date().toISOString().slice(0, 7);
const domainOf = (raw: string): string | null => {
  const host = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
};

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
  const [profile, setProfile] = useState<{ competitors: { name: string; url: string }[]; market: string } | null>(null);
  const [history, setHistory] = useState<Summary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<(Asked & { quote: Quote }) | null>(null);
  const [analysis, setAnalysis] = useState<CompetitorAnalysis | null>(null);
  const [busy, setBusy] = useState<"quote" | "run" | null>(null);
  const [error, setError] = useState<LookupError | null>(null);
  const agentBusy = useGoogleAds((s) => s.agentBusy);

  const load = async () => {
    if (!workspaceId) return;
    const [h, p] = await Promise.all([
      fetch(`/api/google-ads/competitor-ads?workspaceId=${workspaceId}`).then((r) => r.json().catch(() => ({}))) as Promise<{ analyses?: Summary[] }>,
      fetch(`/api/business-profile?workspaceId=${workspaceId}`, { cache: "no-store" }).then((r) => r.json().catch(() => ({}))) as Promise<{ profile?: { values?: { competitors?: { name: string; url: string }[]; markets?: string[] } } }>,
    ]);
    setHistory(h.analyses ?? []);
    setProfile({ competitors: p.profile?.values?.competitors ?? [], market: p.profile?.values?.markets?.[0] ?? "" });
  };
  // Vera fills this page while the user is on it: read again every 20 s and when the tab comes back.
  useEffect(() => {
    void load();
    const again = () => document.visibilityState === "visible" && void load();
    const timer = setInterval(again, 20_000);
    window.addEventListener("focus", again);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", again);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // The competitors: the profile's list first, then any other site Vera looked up.
  const rivals: Rival[] = [];
  if (profile && history) {
    const latest = (domain: string) => history.filter((h) => h.domain === domain).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
    for (const c of profile.competitors) {
      const domain = domainOf(c.url || c.name);
      if (domain && !rivals.some((r) => r.domain === domain)) {
        const s = latest(domain);
        rivals.push({ domain, name: c.name, country: s ? regionName(s.country) : profile.market, summary: s });
      }
    }
    for (const h of history) {
      if (!rivals.some((r) => r.domain === h.domain)) rivals.push({ domain: h.domain, name: h.domain, country: regionName(h.country), summary: latest(h.domain) });
    }
  }

  const run = async (asked: Asked) => {
    setBusy("run");
    setError(null);
    setPending(null);
    try {
      const { analysis } = await call<{ analysis: CompetitorAnalysis }>(workspaceId, { mode: "run", ...asked });
      setAnalysis(analysis);
      void load();
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

  const open = (r: Rival) => {
    setSelected(r.domain);
    setAnalysis(null);
    if (!r.country) return setError(new LookupError("Ask Vera which country to look up this competitor in."));
    void lookUp({ domain: r.domain, country: r.country, pages: r.summary?.pages ?? 1 });
  };

  // Open the first competitor Vera already looked up this month (free) as soon as the list is known.
  const first = rivals.find((r) => r.summary?.month === thisMonth());
  useEffect(() => {
    if (selected || !first) return;
    open(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first?.domain]);

  return (
    <div className="space-y-5">
      <ViewHeader
        title="Competitor ads"
        subtitle="The searches each of your competitors pays Google to show up on, with the ad they run on each and what a click costs. Vera fills this page; pick keywords and she turns them into a plan."
        actions={
          <button
            type="button"
            disabled={agentBusy}
            onClick={() => runAgentTurn("I want to add a competitor to Competitor ads. Ask me for its website, then add it to my business profile and pull its paid keywords.")}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#400095] px-3 text-xs font-semibold text-white hover:bg-[#33007a] disabled:opacity-50 dark:bg-violet-600"
          >
            <Bot className="h-3.5 w-3.5" /> Add a competitor with Vera
          </button>
        }
      />

      {history === null || profile === null ? (
        <RowsSkeleton rows={4} />
      ) : rivals.length === 0 ? (
        <EmptyState
          icon={Swords}
          title="No competitors yet"
          body="Tell Vera who you compete with in the chat on the left. She adds them to your business profile and pulls the keywords each one pays for on Google, in your first country."
        />
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {rivals.map((r) => {
              const active = selected === r.domain;
              return (
                <button
                  key={r.domain}
                  type="button"
                  disabled={!!busy}
                  onClick={() => open(r)}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 disabled:opacity-70",
                    active ? "border-[#400095] bg-[#400095]/[0.05] shadow-[0_8px_24px_rgba(64,0,149,.12)] dark:border-violet-400" : "border-border/70 bg-card hover:border-[#400095]/40"
                  )}
                >
                  <p className="truncate text-sm font-bold" dir="ltr">
                    {r.domain}
                  </p>
                  {r.name !== r.domain && <p className="truncate text-[11px] text-muted-foreground">{r.name}</p>}
                  <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                    {r.summary ? (
                      <>
                        <b className="text-foreground">{(r.summary.totals.keywords ?? 0).toLocaleString()}</b> paid keyword{r.summary.totals.keywords === 1 ? "" : "s"} · {regionName(r.summary.country)} · {monthLabel(r.summary.month)}
                      </>
                    ) : (
                      "Not looked up yet. Ask Vera."
                    )}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Estimates from SE Ranking, which watches Google&apos;s results and records who advertises where. Billed at cost, and free when this month&apos;s data for the site is already here. Nothing changes in your account.
          </p>
        </>
      )}

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
          {(error.code === "no_credits" || error.code === "no_subscription") && <span className="ms-1">Top up from Billing, then open it again.</span>}
        </div>
      )}

      {busy === "run" ? (
        <RowsSkeleton rows={6} />
      ) : analysis ? (
        <Results analysis={analysis} busy={!!busy} onMore={() => void lookUp({ domain: analysis.domain, country: analysis.country, pages: analysis.pages + 1 })} />
      ) : null}
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
