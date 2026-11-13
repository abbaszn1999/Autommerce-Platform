"use client";

import { useMemo } from "react";
import { ArrowLeft, Handshake, Pencil } from "lucide-react";
import { Card, Pill, ImageTile } from "@/components/google-ads/ga-ui";
import { GaTable, type GaColumn } from "@/components/google-ads/ga-table";
import { AD_FORMATS, CTAS, ENHANCEMENTS, OBJECTIVES } from "@/lib/meta-ads/constants";
import { adAssetRows, adPlacementRows, type AssetRow, type SegmentRow } from "@/lib/meta-ads/analytics";
import { adBase, derive, formatMetric } from "@/lib/meta-ads/metrics";
import { useMetaAds } from "@/lib/meta-ads/store";
import type { EnhancementKey, MetaAd } from "@/lib/meta-ads/types";
import { AdPreviewPanel } from "../ma-ad-preview";
import { AskButton, Note, Section } from "../ma-common";
import { metricColumns } from "../ma-columns";
import { DeliveryPill, RankingPill, ReviewPill, StatusDot } from "../ma-ui";
import { useMa } from "../use-ma";

/** Ad drill-down: preview per placement, text variants, enhancements, rankings, placement and asset results, review and partnership. */
export function AdDetail({ ad, onBack }: { ad: MetaAd; onBack: () => void }) {
  const { data, range, currency } = useMa();
  const setView = useMetaAds((s) => s.setView);
  const set = data.adSets.find((s) => s.id === ad.adSetId);
  const campaign = data.campaigns.find((c) => c.id === set?.campaignId);
  const objective = campaign?.objective ?? "SALES";
  const m = useMemo(() => derive(adBase(data, ad.id, range)), [data, ad.id, range]);
  const placements = useMemo(() => adPlacementRows(data, ad.id, range), [data, ad.id, range]);
  const assets = useMemo(() => adAssetRows(data, ad.id, range), [data, ad.id, range]);
  const issue = data.policyIssues.find((p) => p.entityId === ad.id && p.status !== "RESOLVED");
  const kpis = (objective === "LEADS" ? ["spend", "leads", "cpl", "ctr"] : objective === "SALES" ? ["spend", "purchases", "roas", "ctr"] : ["spend", "results", "costPerResult", "ctr"]) as (keyof typeof m)[];

  const placementColumns: GaColumn<SegmentRow>[] = [
    { id: "label", header: "Placement", sticky: true, sortValue: (r) => r.label, render: (r) => <span className="font-medium">{r.label}</span> },
    ...metricColumns<SegmentRow>((r) => r.metrics, currency, { keys: ["spend", "impressions", "ctr", "cpm", "results", "costPerResult"], resultLabel: OBJECTIVES[objective].resultLabel }),
  ];
  const assetColumns: GaColumn<AssetRow>[] = [
    { id: "kind", header: "Type", sortValue: (r) => r.kind, render: (r) => <Pill>{r.kind}</Pill> },
    { id: "label", header: "Asset", sticky: true, sortValue: (r) => r.label, render: (r) => <span className="line-clamp-2 max-w-96 font-medium">{r.label}</span> },
    ...metricColumns<AssetRow>((r) => r.metrics, currency, { keys: ["spend", "impressions", "ctr", "results", "costPerResult"], resultLabel: OBJECTIVES[objective].resultLabel }),
  ];

  const media = ad.mediaIds.map((id) => data.creatives.find((c) => c.id === id)).filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
          <ArrowLeft className="h-3.5 w-3.5" /> All ads
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-black tracking-tight">
            <StatusDot status={ad.status} />
            <span className="truncate">{ad.name}</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            {set?.name} · {campaign?.name} · {AD_FORMATS[ad.format].label}
          </p>
        </div>
        <DeliveryPill delivery={ad.delivery} />
        <ReviewPill review={ad.review} />
        <button type="button" onClick={() => useMetaAds.getState().openDialog({ kind: "rename", entity: "AD", id: ad.id })} className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
          <Pencil className="h-3 w-3" /> Rename
        </button>
      </div>

      {(ad.review === "REJECTED" || ad.review === "LIMITED") && (
        <Note tone="bad">
          <p className="font-semibold">{ad.review === "REJECTED" ? "This ad was rejected" : "This ad has limited delivery"}</p>
          <p className="text-muted-foreground">{ad.reviewReason ?? issue?.reason ?? "Meta did not share a reason."}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {issue && (
              <button type="button" onClick={() => setView("accountQuality")} className="rounded-lg border border-border/70 bg-background px-2.5 py-1 text-[11px] font-semibold hover:bg-muted">
                Open in Account quality
              </button>
            )}
            <AskButton prompt={`Why was the ad ${ad.name} ${ad.review === "REJECTED" ? "rejected" : "limited"} and how do I fix it?`}>Ask the agent how to fix it</AskButton>
          </div>
        </Note>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="p-4">
          <p className="mb-3 text-sm font-bold">Preview</p>
          <AdPreviewPanel ad={ad} creatives={data.creatives} />
        </Card>
        <div className="space-y-4">
          <Card className="grid grid-cols-2 md:grid-cols-4">
            {kpis.map((k, i) => (
              <div key={k} className={`p-4 ${i > 0 ? "md:border-l border-border/60" : ""}`}>
                <p className="text-[11px] font-semibold text-muted-foreground">{k === "results" ? OBJECTIVES[objective].resultLabel : k === "costPerResult" ? "Cost per result" : k}</p>
                <p className="text-xl font-black tabular-nums">{formatMetric(k as never, m[k] as number, currency)}</p>
              </div>
            ))}
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-sm font-bold">Ad rankings</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {([["Quality", ad.rankings.quality], ["Engagement rate", ad.rankings.engagement], ["Conversion rate", ad.rankings.conversion]] as const).map(([label, r]) => (
                <div key={label}>
                  <p className="mb-1 text-[11px] text-muted-foreground">{label} ranking</p>
                  <RankingPill ranking={r} />
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">Compared with ads competing for the same audience. Rankings appear after about 500 impressions.</p>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <p className="mb-2 text-sm font-bold">Text variants</p>
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Primary text ({ad.primaryTexts.length})</p>
              <ul className="mb-3 space-y-1.5">
                {ad.primaryTexts.map((t, i) => (
                  <li key={i} className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">{t}</li>
                ))}
              </ul>
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Headlines ({ad.headlines.length})</p>
              <ul className="space-y-1.5">
                {ad.headlines.map((t, i) => (
                  <li key={i} className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs font-medium">{t}</li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Button: <span className="font-semibold text-foreground">{ad.cta === "NO_BUTTON" ? "None" : CTAS[ad.cta]}</span> · {ad.link}
                {ad.urlParams ? ` · ${ad.urlParams}` : ""}
              </p>
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-sm font-bold">Advantage+ creative enhancements</p>
              <ul className="space-y-2">
                {(Object.keys(ENHANCEMENTS) as EnhancementKey[]).map((k) => (
                  <li key={k} className="flex items-start justify-between gap-3 text-xs">
                    <span>
                      <span className="block font-semibold">{ENHANCEMENTS[k].label}</span>
                      <span className="text-[11px] text-muted-foreground">{ENHANCEMENTS[k].blurb}</span>
                    </span>
                    <Pill tone={ad.enhancements[k] ? "good" : "neutral"}>{ad.enhancements[k] ? "On" : "Off"}</Pill>
                  </li>
                ))}
              </ul>
              {media.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">Creative</p>
                  <div className="flex gap-2">
                    {media.slice(0, 5).map((c) => (
                      <div key={c!.id} className="w-14">
                        <ImageTile label={c!.name} ratio="portrait" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {ad.partnership && (
            <Card className="p-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                <Handshake className="h-4 w-4 text-[#400095]" /> Partnership ad
              </p>
              <div className="grid gap-3 text-xs sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Creator</p>
                  <p className="font-semibold">{ad.partnership.creatorName}</p>
                  <p className="text-muted-foreground">{ad.partnership.creatorHandle}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Permission</p>
                  <Pill tone={ad.partnership.permission === "GRANTED" ? "good" : ad.partnership.permission === "PENDING" ? "warn" : "bad"}>{ad.partnership.permission.toLowerCase()}</Pill>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Boosted post</p>
                  <p className="font-mono text-muted-foreground">{ad.partnership.boostedPostId ?? "Not boosted"}</p>
                </div>
              </div>
              {ad.partnership.permission !== "GRANTED" && <p className="mt-2 text-[11px] text-muted-foreground">The ad cannot deliver until the creator grants permission. Ask them to approve in their Instagram Professional dashboard.</p>}
            </Card>
          )}
        </div>
      </div>

      <Section title="Results by placement" subtitle="Where this ad delivers and what it costs">
        <GaTable rows={placements} columns={placementColumns} rowKey={(r) => r.key} defaultSort={{ id: "spend", dir: "desc" }} empty="No placement data yet." />
      </Section>
      <Section title="Asset performance" subtitle="How each image, video, text and headline performs inside this ad">
        <GaTable rows={assets} columns={assetColumns} rowKey={(r) => `${r.kind}-${r.key}`} empty="No asset data yet." />
      </Section>
    </div>
  );
}
