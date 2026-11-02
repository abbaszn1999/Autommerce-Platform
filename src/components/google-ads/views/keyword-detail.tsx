"use client";

import { ArrowLeft, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { MATCH_TYPES } from "@/lib/google-ads/constants";
import { derive, formatMetric, keywordBase, money, searchTermBase } from "@/lib/google-ads/metrics";
import { keywordLabel } from "@/lib/google-ads/mutations";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import type { Keyword } from "@/lib/google-ads/types";
import { Card, Pill, StatusDot } from "../ga-ui";
import { useGa } from "../use-ga";

const PART_LABEL = { ABOVE_AVERAGE: "Above average", AVERAGE: "Average", BELOW_AVERAGE: "Below average" } as const;
const PART_TONE = { ABOVE_AVERAGE: "bg-emerald-500", AVERAGE: "bg-amber-500", BELOW_AVERAGE: "bg-red-500" } as const;
const PART_FILL = { ABOVE_AVERAGE: "w-full", AVERAGE: "w-2/3", BELOW_AVERAGE: "w-1/3" } as const;

/** One keyword in detail: quality score parts, bid estimates, matched searches and results. */
export function KeywordDetail({ keyword, onBack }: { keyword: Keyword; onBack: () => void }) {
  const { data, range, currency } = useGa();
  const group = data.adGroups.find((g) => g.id === keyword.adGroupId);
  const campaign = data.campaigns.find((c) => c.id === group?.campaignId);
  const m = derive(keywordBase(data, keyword.id, range));
  const bid = keyword.cpcBid ?? group?.defaultCpcBid;
  const terms = data.searchTerms.filter((t) => t.keywordId === keyword.id);
  const below = bid !== undefined && keyword.firstPageBid !== undefined && bid < keyword.firstPageBid;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#400095] hover:underline dark:text-violet-300">
        <ArrowLeft className="h-3.5 w-3.5" /> All keywords
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-black tracking-tight">
            <StatusDot status={keyword.status} />
            <span className="truncate">{keywordLabel(keyword.text, keyword.matchType)}</span>
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {MATCH_TYPES[keyword.matchType].label} · {campaign?.name} › {group?.name}
          </p>
        </div>
        <button
          type="button"
          onClick={() => runAgentTurn(`How can I improve the keyword "${keyword.text}"? Check its quality score, bid and search terms`)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-xs font-semibold hover:bg-muted"
        >
          <Bot className="h-3.5 w-3.5" /> Ask agent to improve
        </button>
      </div>

      <Card className="grid grid-cols-2 divide-x divide-y divide-border/60 overflow-hidden md:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
        {(["impressions", "clicks", "ctr", "cost", "conversions", "cpa"] as const).map((k) => (
          <div key={k} className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground">{k === "ctr" ? "CTR" : k === "cpa" ? "Cost / conv." : k.charAt(0).toUpperCase() + k.slice(1)}</p>
            <p className="mt-1 text-xl font-black tabular-nums tracking-tight">{m[k] ? formatMetric(k, m[k], currency) : "—"}</p>
          </div>
        ))}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Quality Score</p>
            {keyword.qualityScore ? (
              <span className={cn("rounded px-2 py-0.5 text-xs font-bold text-white", keyword.qualityScore >= 7 ? "bg-emerald-500" : keyword.qualityScore >= 5 ? "bg-amber-500" : "bg-red-500")}>{keyword.qualityScore}/10</span>
            ) : (
              <Pill>Not enough data</Pill>
            )}
          </div>
          {keyword.qualityParts ? (
            (
              [
                ["Expected click-through rate", keyword.qualityParts.expectedCtr],
                ["Ad relevance", keyword.qualityParts.adRelevance],
                ["Landing page experience", keyword.qualityParts.landingPage],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold">{PART_LABEL[v]}</span>
                </div>
                <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className={cn("block h-full rounded-full", PART_TONE[v], PART_FILL[v])} />
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">Google shows the three parts once the keyword has enough traffic.</p>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <p className="text-sm font-bold">Bid and delivery</p>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <p className="text-muted-foreground">Max. CPC</p>
              <p className="text-sm font-semibold tabular-nums">{bid ? money(bid, currency) : "Auto"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">First page bid</p>
              <p className="text-sm font-semibold tabular-nums">{keyword.firstPageBid ? money(keyword.firstPageBid, currency) : "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Top of page bid</p>
              <p className="text-sm font-semibold tabular-nums">{keyword.topOfPageBid ? money(keyword.topOfPageBid, currency) : "—"}</p>
            </div>
          </div>
          {below && <p className="rounded-lg bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-300">The max. CPC is below the first page estimate, so ads may rarely show.</p>}
          <div className="space-y-1 text-[11px]">
            <p className="flex justify-between">
              <span className="text-muted-foreground">Policy</span>
              <span className="font-semibold">{keyword.policy === "APPROVED" ? "Eligible" : keyword.policy === "APPROVED_LIMITED" ? "Eligible (limited)" : keyword.policy === "UNDER_REVIEW" ? "Under review" : "Disapproved"}</span>
            </p>
            {keyword.finalUrl && (
              <p className="flex justify-between gap-3">
                <span className="text-muted-foreground">Final URL</span>
                <span className="truncate font-semibold">{keyword.finalUrl.replace(/^https?:\/\//, "")}</span>
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <p className="text-sm font-bold">Searches that matched this keyword</p>
        {terms.length ? (
          <div className="mt-2 divide-y divide-border/50 text-xs">
            {terms.map((t) => {
              const tm = derive(searchTermBase(data, t.id, range));
              return (
                <div key={t.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">{t.text}</span>
                  <span className="w-20 text-right tabular-nums text-muted-foreground">{formatMetric("clicks", tm.clicks, currency)} clicks</span>
                  <span className="w-20 text-right tabular-nums text-muted-foreground">{formatMetric("cost", tm.cost, currency)}</span>
                  <span className="w-20 text-right tabular-nums text-muted-foreground">{tm.conversions.toFixed(1)} conv.</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">No search terms are linked to this keyword yet.</p>
        )}
      </Card>
    </div>
  );
}
