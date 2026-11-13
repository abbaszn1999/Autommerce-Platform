"use client";

import { useState } from "react";
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Play, Send, ThumbsUp, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageTile } from "@/components/google-ads/ga-ui";
import { CTAS } from "@/lib/meta-ads/constants";
import type { CreativeAsset, MetaAd } from "@/lib/meta-ads/types";

export type PreviewKey = "FB_FEED" | "IG_FEED" | "STORIES" | "REELS";

export const PREVIEW_OPTIONS: { key: PreviewKey; label: string }[] = [
  { key: "FB_FEED", label: "Facebook Feed" },
  { key: "IG_FEED", label: "Instagram Feed" },
  { key: "STORIES", label: "Stories" },
  { key: "REELS", label: "Reels" },
];

type Props = { ad: Pick<MetaAd, "format" | "identity" | "primaryTexts" | "headlines" | "description" | "cta" | "link" | "mediaIds" | "cards">; creatives: CreativeAsset[]; placement: PreviewKey; variant?: number };

/** Preview of one ad in a placement. Mirrors how Meta's preview switcher works: same ad, different frame. */
export function AdPreview({ ad, creatives, placement, variant = 0 }: Props) {
  const text = ad.primaryTexts[variant % Math.max(1, ad.primaryTexts.length)] ?? "";
  const headline = ad.headlines[variant % Math.max(1, ad.headlines.length)] ?? "";
  const host = hostOf(ad.link);
  const cta = ad.cta === "NO_BUTTON" ? null : CTAS[ad.cta];
  const media = ad.mediaIds.map((id) => creatives.find((c) => c.id === id)).filter(Boolean) as CreativeAsset[];
  const first = media[0];
  const isVideo = ad.format === "SINGLE_VIDEO" || first?.kind === "VIDEO";
  const vertical = placement === "STORIES" || placement === "REELS";
  const label = first?.name ?? headline ?? "Creative";

  if (vertical) {
    return (
      <Phone tall>
        <div className="relative h-full w-full" style={{ background: "#111" }}>
          <ImageTile label={label} ratio="portrait" className="absolute inset-0 h-full w-full rounded-none" />
          {isVideo && <Play className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-white/80" fill="currentColor" />}
          <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/50 to-transparent p-3 text-white">
            <Avatar name={ad.identity.pageName} small />
            <span className="text-[11px] font-semibold">{placement === "REELS" ? ad.identity.instagramHandle ?? ad.identity.pageName : ad.identity.pageName}</span>
            <span className="text-[9px] text-white/70">Sponsored</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
            <p className="line-clamp-3 text-[11px] leading-snug">{text}</p>
            {cta && <div className="rounded-lg bg-white py-1.5 text-center text-[11px] font-semibold text-black">{cta}</div>}
          </div>
          {placement === "REELS" && (
            <div className="absolute bottom-24 right-2 flex flex-col items-center gap-3 text-white">
              <Heart className="h-5 w-5" />
              <MessageCircle className="h-5 w-5" />
              <Send className="h-5 w-5" />
            </div>
          )}
        </div>
      </Phone>
    );
  }

  const ig = placement === "IG_FEED";
  return (
    <Phone>
      <div className="bg-background text-foreground">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Avatar name={ad.identity.pageName} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[12px] font-semibold">{ig ? ad.identity.instagramHandle ?? ad.identity.pageName : ad.identity.pageName}</p>
            <p className="text-[10px] text-muted-foreground">Sponsored</p>
          </div>
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </div>
        {!ig && text && <p className="line-clamp-3 px-3 pb-2 text-[12px] leading-snug">{text}</p>}
        {ad.format === "CAROUSEL" && ad.cards?.length ? (
          <div className="flex gap-2 overflow-x-auto px-3 pb-2">
            {ad.cards.slice(0, 4).map((c, i) => (
              <div key={i} className="w-40 shrink-0 overflow-hidden rounded-lg border border-border/60">
                <ImageTile label={creatives.find((a) => a.id === c.mediaId)?.name ?? c.headline} ratio="square" className="rounded-none" />
                <p className="truncate px-2 py-1.5 text-[11px] font-semibold">{c.headline}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="relative">
            <ImageTile label={label} ratio={ig ? "portrait" : "landscape"} className="rounded-none" />
            {isVideo && <Play className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-white/85" fill="currentColor" />}
          </div>
        )}
        {!ig && (
          <div className="flex items-center gap-2 bg-muted/50 px-3 py-2">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[10px] uppercase text-muted-foreground">{host}</p>
              <p className="truncate text-[12px] font-semibold">{headline}</p>
            </div>
            {cta && <span className="shrink-0 rounded-md bg-muted px-2.5 py-1.5 text-[11px] font-semibold">{cta}</span>}
          </div>
        )}
        {ig && cta && (
          <div className="flex items-center justify-between bg-[#1877F2] px-3 py-2 text-[12px] font-semibold text-white">
            {cta} <span>›</span>
          </div>
        )}
        <div className="flex items-center gap-4 px-3 py-2 text-muted-foreground">
          {ig ? (
            <>
              <Heart className="h-4 w-4" />
              <MessageCircle className="h-4 w-4" />
              <Send className="h-4 w-4" />
              <Bookmark className="ml-auto h-4 w-4" />
            </>
          ) : (
            <>
              <ThumbsUp className="h-4 w-4" />
              <MessageCircle className="h-4 w-4" />
              <Share2 className="h-4 w-4" />
            </>
          )}
        </div>
        {ig && text && (
          <p className="line-clamp-2 px-3 pb-3 text-[12px] leading-snug">
            <span className="font-semibold">{ad.identity.instagramHandle ?? ad.identity.pageName}</span> {text}
          </p>
        )}
      </div>
    </Phone>
  );
}

/** Switcher + preview in one block. */
export function AdPreviewPanel({ ad, creatives, className }: { ad: Props["ad"]; creatives: CreativeAsset[]; className?: string }) {
  const [placement, setPlacement] = useState<PreviewKey>("FB_FEED");
  const [variant, setVariant] = useState(0);
  const variants = Math.max(ad.primaryTexts.length, ad.headlines.length, 1);
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-1">
        {PREVIEW_OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setPlacement(o.key)}
            className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium", placement === o.key ? "border-[#400095] bg-[#400095]/10 text-[#400095] dark:text-violet-300" : "border-border/70 text-muted-foreground hover:bg-muted")}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex justify-center">
        <AdPreview ad={ad} creatives={creatives} placement={placement} variant={variant} />
      </div>
      {variants > 1 && (
        <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          Text variant
          {Array.from({ length: variants }, (_, i) => (
            <button key={i} type="button" onClick={() => setVariant(i)} className={cn("h-6 w-6 rounded-md border text-[11px] font-medium", variant === i ? "border-[#400095] bg-[#400095]/10 text-[#400095] dark:text-violet-300" : "border-border/70 hover:bg-muted")}>
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Phone({ children, tall }: { children: React.ReactNode; tall?: boolean }) {
  return (
    <div className={cn("w-[260px] overflow-hidden rounded-[22px] border-[5px] border-neutral-800 bg-background shadow-md", tall && "h-[460px]")}>
      {children}
    </div>
  );
}

export function Avatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-[#400095] font-bold text-white", small ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs")}>{name.slice(0, 1).toUpperCase()}</span>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
