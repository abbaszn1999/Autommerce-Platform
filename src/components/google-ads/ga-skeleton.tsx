"use client";

import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGoogleAds } from "@/lib/google-ads/store";
import type { GaView } from "@/lib/google-ads/types";

/** One grey placeholder bar or box. */
export function Bone({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-zinc-200/80 dark:bg-zinc-800", className)} />;
}

function CardBones({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-2xl border border-border/60 bg-card p-4 shadow-sm", className)}>{children}</div>;
}

/** Rows of a list or table while it loads. */
export function RowsSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm", className)} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border/50 px-4 py-3.5 last:border-b-0">
          <Bone className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bone className="h-3.5 w-3/4" />
            <Bone className={cn("h-3", i % 2 ? "w-2/3" : "w-1/2")} />
          </div>
          <Bone className="hidden h-3 w-28 md:block" />
          <Bone className="hidden h-3 w-16 sm:block" />
        </div>
      ))}
    </div>
  );
}

/** A plan or report while it loads. */
export function DocSkeleton() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-5 pb-10" aria-busy="true">
      <Bone className="h-7 w-72" />
      <CardBones className="flex gap-3.5">
        <Bone className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Bone className="h-3 w-16" />
          <Bone className="h-5 w-1/2" />
          <Bone className="h-3 w-2/3" />
        </div>
      </CardBones>
      <CardBones className="space-y-3">
        <Bone className="h-4 w-48" />
        <Bone className="h-2 w-full" />
      </CardBones>
      {[0, 1].map((i) => (
        <CardBones key={i} className="space-y-3">
          <Bone className="h-3.5 w-28" />
          <Bone className="h-3 w-full" />
          <Bone className="h-3 w-11/12" />
          <Bone className="h-3 w-3/4" />
        </CardBones>
      ))}
    </div>
  );
}

/** The account page while its numbers load for the first time: the layout, not zeros. */
export function AccountSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading the account">
      <div className="space-y-2">
        <Bone className="h-6 w-48" />
        <Bone className="h-3 w-72" />
      </div>
      <CardBones className="p-0">
        <div className="grid grid-cols-2 border-b border-border/60 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2.5 border-border/60 p-4 [&:not(:last-child)]:border-e">
              <Bone className="h-3 w-20" />
              <Bone className="h-7 w-24" />
              <Bone className="h-2.5 w-28" />
            </div>
          ))}
        </div>
        <div className="flex h-64 items-end gap-2 p-5">
          {/* A quiet chart outline: bars of varied height. */}
          {[38, 52, 45, 60, 55, 70, 64, 58, 72, 66, 80, 74, 68, 77, 85, 79, 72, 88, 83, 76, 90, 84, 92, 87].map((h, i) => (
            <div key={i} className="flex h-full flex-1 items-end">
              <div className="w-full animate-pulse rounded-sm bg-zinc-200/60 dark:bg-zinc-800/80" style={{ height: `${h}%` }} />
            </div>
          ))}
        </div>
      </CardBones>
      <div className="grid gap-4 lg:grid-cols-3">
        <CardBones className="space-y-3 lg:col-span-2">
          <Bone className="h-4 w-32" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Bone className="h-3 w-3 rounded-full" />
              <Bone className="h-3 flex-1" />
              <Bone className="h-3 w-16" />
            </div>
          ))}
        </CardBones>
        <CardBones className="space-y-3">
          <Bone className="h-4 w-36" />
          <Bone className="mx-auto h-20 w-20 rounded-full" />
          <Bone className="h-8 w-full rounded-lg" />
        </CardBones>
      </div>
    </div>
  );
}

/** The whole workspace before it opens: the chat column, the menu and the account page. */
export function WorkspaceSkeleton() {
  return (
    <div className="flex h-full min-h-0 w-full bg-background" aria-busy="true" aria-label="Loading">
      <div className="flex w-[440px] shrink-0 flex-col border-e">
        <div className="flex h-11 items-center gap-2 border-b px-3">
          <Bone className="h-6 w-28" />
          <Bone className="h-6 w-24" />
        </div>
        <div className="flex-1 space-y-4 p-4">
          <Bone className="h-10 w-10 rounded-xl" />
          <Bone className="h-5 w-3/4" />
          <Bone className="h-3 w-full" />
          <Bone className="h-3 w-5/6" />
          <div className="space-y-2 pt-4">
            {[0, 1, 2, 3].map((i) => (
              <Bone key={i} className="h-11 w-full rounded-xl" />
            ))}
          </div>
        </div>
        <div className="p-3">
          <Bone className="h-[92px] w-full rounded-2xl" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-[#F6F4FA] dark:bg-background">
        <div className="flex h-12 items-center gap-3 border-b border-border/60 bg-background px-4">
          <Bone className="h-7 w-40" />
          <Bone className="ms-auto h-8 w-28" />
          <Bone className="h-8 w-44" />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="w-[216px] shrink-0 space-y-2.5 border-e border-border/60 p-3">
            {Array.from({ length: 14 }, (_, i) => (
              <Bone key={i} className={cn("h-4", i % 4 === 3 ? "mt-4 w-20" : "w-36")} />
            ))}
          </div>
          <div className="min-w-0 flex-1 px-5 py-5">
            <AccountSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Pages that do not need the account's numbers open at once. */
const WITHOUT_NUMBERS: GaView[] = ["documents", "profile", "connections"];

/** The first load of a live account failed: no numbers to show yet, so offer to try again. */
function FirstLoadFailed({ error }: { error?: string }) {
  const refresh = useGoogleAds((s) => s.refreshData);
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm">
      <p className="text-sm font-semibold">The account could not be loaded</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{error ?? "Google Ads did not answer."}</p>
      <button type="button" onClick={() => void refresh({ force: true })} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-1.5 text-xs font-semibold hover:bg-muted">
        <RefreshCw className="h-3.5 w-3.5" /> Try again
      </button>
    </div>
  );
}

/** What to show instead of a page while a live account's numbers have never loaded, or null to show the page. */
export function firstLoadPlaceholder(view: GaView, sync: { status: string; pending?: boolean; error?: string } | undefined) {
  if (!sync?.pending || WITHOUT_NUMBERS.includes(view)) return null;
  return sync.status === "error" ? <FirstLoadFailed error={sync.error} /> : <AccountSkeleton />;
}
