"use client";

import { AlertTriangle, ArrowLeft, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { adBase, derive, formatMetric } from "@/lib/google-ads/metrics";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import type { Ad, AdText, AdTextRating } from "@/lib/google-ads/types";
import { SearchAdPreview } from "../ga-ad-preview";
import { AdStrengthMeter, Card, ImageTile, Pill, PolicyPill, StatusDot } from "../ga-ui";
import { useGa } from "../use-ga";

export const AD_TYPE_LABEL: Record<Ad["type"], string> = {
  RESPONSIVE_SEARCH_AD: "Responsive search ad",
  RESPONSIVE_DISPLAY_AD: "Responsive display ad",
  VIDEO_AD: "Video ad",
  DEMAND_GEN_AD: "Demand Gen ad",
  SHOPPING_PRODUCT_AD: "Product shopping ad",
};

const PIN_LABEL: Record<NonNullable<AdText["pinned"]>, string> = {
  HEADLINE_1: "Pinned to headline 1",
  HEADLINE_2: "Pinned to headline 2",
  HEADLINE_3: "Pinned to headline 3",
  DESCRIPTION_1: "Pinned to description 1",
  DESCRIPTION_2: "Pinned to description 2",
};

const RATING: Record<AdTextRating, { label: string; tone: "good" | "info" | "bad" | "neutral" }> = {
  BEST: { label: "Best", tone: "good" },
  GOOD: { label: "Good", tone: "info" },
  LOW: { label: "Low", tone: "bad" },
  LEARNING: { label: "Learning", tone: "neutral" },
};

/** One ad in detail: full preview, every headline and description with Google's rating and pins, policy and results. */
export function AdDetail({ ad, onBack }: { ad: Ad; onBack: () => void }) {
  const { data, range, currency } = useGa();
  const group = data.adGroups.find((g) => g.id === ad.adGroupId);
  const campaign = data.campaigns.find((c) => c.id === group?.campaignId);
  const m = derive(adBase(data, ad.id, range));
  const sitelinks = data.assets.filter((a) => a.type === "SITELINK" && a.status === "ENABLED" && (a.level === "ACCOUNT" || a.parentId === campaign?.id));
  const callouts = data.assets.filter((a) => a.type === "CALLOUT" && a.status === "ENABLED" && (a.level === "ACCOUNT" || a.parentId === campaign?.id));
  const isSearch = ad.type === "RESPONSIVE_SEARCH_AD";
  const low = [...ad.headlines, ...ad.descriptions].filter((t) => t.rating === "LOW");

  const textRows = [
    ...ad.headlines.map((t) => ({ kind: "Headline", t })),
    ...(ad.longHeadline ? [{ kind: "Long headline", t: { text: ad.longHeadline } as AdText }] : []),
    ...ad.descriptions.map((t) => ({ kind: "Description", t })),
  ];

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#400095] hover:underline dark:text-violet-300">
        <ArrowLeft className="h-3.5 w-3.5" /> All ads
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-black tracking-tight">
            <StatusDot status={ad.status} />
            {AD_TYPE_LABEL[ad.type]}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {campaign?.name} › {group?.name} · {ad.finalUrl.replace(/^https?:\/\//, "")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PolicyPill policy={ad.policy} />
          <AdStrengthMeter strength={ad.adStrength} />
          <button
            type="button"
            onClick={() => runAgentTurn(low.length ? `Replace the low-rated headlines and descriptions in the ad in ${group?.name}` : `Improve the ad in ${group?.name}`)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-xs font-semibold hover:bg-muted"
          >
            <Bot className="h-3.5 w-3.5" /> {low.length ? `Ask agent to replace ${low.length} low` : "Ask agent to improve"}
          </button>
        </div>
      </div>

      <Card className="grid grid-cols-2 divide-x divide-y divide-border/60 overflow-hidden md:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
        {(["impressions", "clicks", "ctr", "cost", "conversions", "cpa"] as const).map((k) => (
          <div key={k} className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground">{k === "ctr" ? "CTR" : k === "cpa" ? "Cost / conv." : k.charAt(0).toUpperCase() + k.slice(1)}</p>
            <p className="mt-1 text-xl font-black tabular-nums tracking-tight">{m[k] ? formatMetric(k, m[k], currency) : "—"}</p>
          </div>
        ))}
      </Card>

      {ad.policyTopics && ad.policyTopics.length > 0 && (
        <div className={cn("space-y-1 rounded-xl p-3 text-xs", ad.policy === "DISAPPROVED" ? "bg-red-500/10" : "bg-amber-500/10")}>
          {ad.policyTopics.map((p) => (
            <p key={p.topic} className="flex gap-1.5">
              <AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", ad.policy === "DISAPPROVED" ? "text-red-600" : "text-amber-600")} />
              <span>
                <span className="font-semibold">{p.topic}:</span> {p.detail}
              </span>
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 text-sm font-bold">Preview</p>
          {isSearch ? (
            <SearchAdPreview headlines={ad.headlines} descriptions={ad.descriptions} finalUrl={ad.finalUrl} path1={ad.path1} path2={ad.path2} sitelinks={sitelinks} callouts={callouts} />
          ) : (
            <div className="grid grid-cols-[120px_1fr] gap-3 rounded-xl border border-border/60 p-3">
              <ImageTile label={ad.headlines[0]?.text ?? "image"} />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{ad.headlines[0]?.text}</p>
                {ad.longHeadline && <p className="text-xs text-muted-foreground">{ad.longHeadline}</p>}
                <p className="mt-1 text-xs">{ad.descriptions[0]?.text}</p>
                <p className="mt-1 text-[10px] font-semibold text-muted-foreground">{ad.businessName}</p>
              </div>
            </div>
          )}
          {!isSearch && ad.imageUrls && ad.imageUrls.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {ad.imageUrls.map((u) => (
                <ImageTile key={u} label={u} />
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">Google combines these assets differently for each search, so people see different versions.</p>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">Headlines and descriptions</p>
            <span className="text-[11px] text-muted-foreground">
              {ad.headlines.length} headlines · {ad.descriptions.length} descriptions
            </span>
          </div>
          <div className="divide-y divide-border/50 text-xs">
            {textRows.map(({ kind, t }, i) => (
              <div key={`${kind}-${i}`} className="flex items-center gap-2 py-2">
                <span className="w-24 shrink-0 text-[10px] uppercase text-muted-foreground">{kind}</span>
                <span className="min-w-0 flex-1">
                  {t.text}
                  {t.pinned && <span className="ml-1.5 text-[10px] text-muted-foreground">{PIN_LABEL[t.pinned]}</span>}
                </span>
                {isSearch && <Pill tone={RATING[t.rating ?? "LEARNING"].tone}>{RATING[t.rating ?? "LEARNING"].label}</Pill>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
