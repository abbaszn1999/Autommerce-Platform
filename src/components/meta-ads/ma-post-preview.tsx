"use client";

import type { ReactNode } from "react";
import { Bookmark, CircleDashed, Clapperboard, Facebook, GalleryHorizontal, Heart, Image as ImageIcon, Instagram, MessageCircle, MoreHorizontal, Play, Send, Share2, ThumbsUp, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrganicPost, PostFormat, PostPlatform, PostStatus } from "@/lib/meta-ads/types";
import { Avatar, Phone } from "./ma-ad-preview";

export const POST_FORMATS: Record<PostFormat, { label: string; plural: string; icon: LucideIcon; vertical: boolean }> = {
  POST: { label: "Post", plural: "Posts", icon: ImageIcon, vertical: false },
  CAROUSEL: { label: "Carousel", plural: "Carousels", icon: GalleryHorizontal, vertical: false },
  REEL: { label: "Reel", plural: "Reels", icon: Clapperboard, vertical: true },
  STORY: { label: "Story", plural: "Stories", icon: CircleDashed, vertical: true },
  VIDEO: { label: "Video", plural: "Videos", icon: Video, vertical: false },
};

export const PLATFORMS: Record<PostPlatform, { label: string; icon: LucideIcon; className: string }> = {
  FACEBOOK: { label: "Facebook", icon: Facebook, className: "bg-[#1877F2] text-white" },
  INSTAGRAM: { label: "Instagram", icon: Instagram, className: "bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white" },
};

export const POST_STATUS: Record<PostStatus, { label: string; tone: "good" | "info" | "neutral" | "bad" }> = {
  PUBLISHED: { label: "Published", tone: "good" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  DRAFT: { label: "Draft", tone: "neutral" },
  FAILED: { label: "Failed", tone: "bad" },
};

/** Same hue rule as the ad image tiles, so one piece of media keeps its colour everywhere. */
export function mediaBackground(label: string): string {
  const hue = [...label].reduce((s, c) => s + c.charCodeAt(0), 0) % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 48%), hsl(${(hue + 50) % 360} 75% 28%))`;
}

/** A small square of media art with an icon for its format (play for video, stack for carousel). */
export function MediaThumb({ label, icon: Icon, className, iconClassName, children }: { label: string; icon?: LucideIcon; className?: string; iconClassName?: string; children?: ReactNode }) {
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden text-white", className)} style={{ background: mediaBackground(label) }}>
      {Icon && <Icon className={cn("h-3 w-3 drop-shadow", iconClassName)} />}
      {children}
    </span>
  );
}

export function PlatformIcons({ platforms, size = "sm", className }: { platforms: PostPlatform[]; size?: "xs" | "sm"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center -space-x-1", className)}>
      {platforms.map((p) => {
        const P = PLATFORMS[p];
        return (
          <span key={p} title={P.label} className={cn("inline-flex items-center justify-center rounded-full ring-2 ring-card", P.className, size === "xs" ? "h-3.5 w-3.5" : "h-4.5 w-4.5")}>
            <P.icon className={size === "xs" ? "h-2 w-2" : "h-2.5 w-2.5"} />
          </span>
        );
      })}
    </span>
  );
}

const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export { compact as compactNumber };

/** The post as it shows in the app. Reels and stories get a full-height frame; the rest show as a feed post. */
export function PostPreview({ post, platform }: { post: OrganicPost; platform: PostPlatform }) {
  const ig = platform === "INSTAGRAM";
  const handle = ig ? post.identity.instagramHandle ?? post.identity.pageName : post.identity.pageName;
  const first = post.media[0];
  const label = first?.label ?? post.caption;
  const video = first?.kind === "VIDEO";

  if (POST_FORMATS[post.format].vertical) {
    return (
      <Phone tall>
        <div className="relative h-full w-full" style={{ background: mediaBackground(label) }}>
          {post.format === "STORY" && (
            <div className="absolute inset-x-2 top-2 flex gap-1">
              {post.media.map((m, i) => (
                <span key={i} className={cn("h-0.5 flex-1 rounded-full", i === 0 ? "bg-white" : "bg-white/40")} />
              ))}
            </div>
          )}
          {video && <Play className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-white/80" fill="currentColor" />}
          <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/45 to-transparent p-3 pt-4 text-white">
            <Avatar name={post.identity.pageName} small />
            <span className="text-[11px] font-semibold">{handle}</span>
            <span className="text-[9px] text-white/70">{POST_FORMATS[post.format].label}</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/75 to-transparent p-3 text-white">
            <p className="line-clamp-3 pr-8 text-[11px] leading-snug">{post.caption}</p>
            {post.format === "STORY" && post.link && <div className="mx-auto w-fit rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-black">🔗 {hostOf(post.link)}</div>}
          </div>
          {post.format === "REEL" && (
            <div className="absolute bottom-20 right-2 flex flex-col items-center gap-3.5 text-white">
              <Heart className="h-5 w-5" />
              <MessageCircle className="h-5 w-5" />
              <Send className="h-5 w-5" />
            </div>
          )}
        </div>
      </Phone>
    );
  }

  return (
    <Phone>
      <div className="bg-background text-foreground">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Avatar name={post.identity.pageName} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[12px] font-semibold">{handle}</p>
            <p className="text-[10px] text-muted-foreground">{post.status === "PUBLISHED" ? "Published" : "Scheduled"}</p>
          </div>
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </div>
        {!ig && <p className="line-clamp-3 px-3 pb-2 text-[12px] leading-snug">{post.caption}</p>}
        {post.format === "CAROUSEL" ? (
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2">
            {post.media.map((m, i) => (
              <div key={i} className="flex aspect-[4/5] w-40 shrink-0 items-end overflow-hidden rounded-lg text-[9px] font-semibold text-white" style={{ background: mediaBackground(m.label) }}>
                <span className="m-1.5 truncate rounded bg-black/25 px-1 py-0.5">{m.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={cn("relative flex items-end text-[9px] font-semibold text-white", ig ? "aspect-[4/5]" : post.format === "VIDEO" ? "aspect-video" : "aspect-square")} style={{ background: mediaBackground(label) }}>
            {video && <Play className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-white/85" fill="currentColor" />}
            <span className="m-1.5 truncate rounded bg-black/25 px-1 py-0.5">{label}</span>
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
        {ig && (
          <p className="line-clamp-2 px-3 pb-3 text-[12px] leading-snug">
            <span className="font-semibold">{handle}</span> {post.caption}
          </p>
        )}
      </div>
    </Phone>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
