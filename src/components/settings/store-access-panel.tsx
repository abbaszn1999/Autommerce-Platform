"use client";

import { useState } from "react";
import { Check, CheckCircle2, Copy, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ALL_SHOPIFY_SCOPES,
  SHOPIFY_TOOL_ACCESS,
  STORE_ACCESS_AREAS,
  hasShopifyScope,
  missingShopifyScopes,
  requiredShopifyScopes,
  scopeLabel,
  toolsUsingScope,
  type StoreScope,
} from "@/lib/integrations/shopify-access";

const PANEL = "overflow-hidden rounded-xl border bg-background";
const ICON = "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#400095]/10 text-[#6B358D] dark:bg-[#F76D01]/10 dark:text-[#F76D01]";
const HEADING = "border-b bg-muted/10 px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground";

/** The scopes of each area that a tool uses, in the order Shopify lists them. */
const AREAS = STORE_ACCESS_AREAS.map((area) => ({
  area,
  scopes: (area.edit ? [area.read, area.edit] : [area.read]).filter((scope): scope is StoreScope => ALL_SHOPIFY_SCOPES.includes(scope)),
})).filter((entry) => entry.scopes.length > 0);

const sentence = (scopes: readonly string[]) => scopes.map(scopeLabel).join(", ");

/**
 * "Autommerce access": everything the connected store lets Autommerce do, in
 * one place. On Shopify it shows each part of the store with the access it has
 * (before a check it is the list to enable), which tools a missing permission
 * holds back, and how to grant it. Other platforms have no separate permissions.
 */
export function StoreAccessPanel({
  provider,
  grantedScopes,
  loading = false,
  onRecheck,
  id,
  className,
}: {
  provider: string;
  /** Shopify only. undefined: not checked yet. null: Shopify did not say. */
  grantedScopes?: readonly string[] | null;
  loading?: boolean;
  onRecheck?: () => void;
  id?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (provider !== "shopify") {
    return (
      <div id={id} className={cn(PANEL, "scroll-mt-4", className)}>
        <div className="flex items-center gap-2.5 px-4 py-3">
          <span className={ICON}>
            <ShieldCheck className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-tight">Autommerce access</p>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              This platform does not split access into permissions: every tool works with what the connected WordPress user may do. For the tools that change the
              store, that user must be an Administrator or a Shop manager.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const checked = Array.isArray(grantedScopes);
  const granted = new Set(grantedScopes ?? []);
  const allMissing = checked ? missingShopifyScopes(granted, ALL_SHOPIFY_SCOPES) : [];
  const tools = SHOPIFY_TOOL_ACCESS.map((tool) => ({
    tool,
    missing: checked ? missingShopifyScopes(granted, tool.scopes) : [],
    // Without these the tool stays locked; other missing scopes only limit what it can do.
    blocking: checked ? missingShopifyScopes(granted, requiredShopifyScopes(tool)) : [],
  }));

  const copy = async (scopes: readonly string[]) => {
    try {
      await navigator.clipboard.writeText(scopes.join(","));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the scopes are on screen to copy by hand.
    }
  };

  return (
    <div id={id} className={cn(PANEL, "scroll-mt-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={ICON}>
            <ShieldCheck className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-tight">Autommerce access</p>
            <p className="text-[11px] text-muted-foreground">
              {checked
                ? allMissing.length
                  ? `${allMissing.length} of ${ALL_SHOPIFY_SCOPES.length} permissions not granted yet`
                  : "Your store grants everything Autommerce uses"
                : grantedScopes === null
                  ? "Shopify did not report this token's permissions"
                  : "The Admin API scopes to enable on your Shopify app"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {onRecheck && (
            <Button type="button" variant="ghost" size="sm" onClick={onRecheck} disabled={loading} className="h-7 gap-1.5 px-2 text-[11.5px]">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Recheck
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copy(allMissing.length ? allMissing : ALL_SHOPIFY_SCOPES)}
            className="h-7 gap-1.5 px-2 text-[11.5px]"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : allMissing.length ? "Copy missing scopes" : "Copy all scopes"}
          </Button>
        </div>
      </div>

      <p className={HEADING}>What your store allows</p>
      <ul className="divide-y">
        {AREAS.map(({ area, scopes }) => {
          const lacking = checked ? scopes.filter((scope) => !hasShopifyScope(granted, scope)) : [];
          const neededBy = [...new Set(lacking.flatMap((scope) => toolsUsingScope(scope).map((tool) => tool.name)))];
          return (
            <li key={area.id} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <p className="text-[12.5px] font-semibold">{area.name}</p>
                <div className="flex flex-wrap gap-1">
                  {scopes.map((scope) => {
                    const has = checked && hasShopifyScope(granted, scope);
                    return (
                      <code
                        key={scope}
                        title={`Permission to ${scopeLabel(scope)}`}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10.5px]",
                          !checked
                            ? "border-border bg-muted/40 text-foreground/80"
                            : has
                              ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-400"
                              : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                        )}
                      >
                        {checked && (has ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />)}
                        {scope}
                      </code>
                    );
                  })}
                </div>
              </div>
              {neededBy.length > 0 && (
                <p className="mt-1 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                  Not granted: {sentence(lacking)}. Needed by {neededBy.join(", ")}.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p className={cn(HEADING, "border-t")}>What each tool can do with it</p>
      <ul className="divide-y">
        {tools.map(({ tool, missing, blocking }) => {
          const ready = checked && missing.length === 0;
          const locked = blocking.length > 0;
          return (
            <li key={tool.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold">{tool.name}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{tool.summary}</p>
                {missing.length > 0 && (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-400">
                    {locked ? `Locked until it may ${sentence(blocking)}.` : `Open, but it may not ${sentence(missing)} yet.`}
                  </p>
                )}
              </div>
              {checked && (
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                    ready ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  )}
                >
                  {ready ? "Ready" : locked ? "Locked" : "Limited"}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="border-t bg-muted/10 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        {checked && !allMissing.length ? (
          <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> No changes needed in Shopify.
          </span>
        ) : (
          <>
            In Shopify: <span className="font-medium text-foreground">Settings → Apps → Develop apps → your app → Configuration</span>, enable these Admin API
            scopes, save, then install or update the app.{" "}
            {onRecheck ? "Press Recheck here when done; if Shopify gives a new token, reconnect with it." : "Use its Admin API access token above."} A tool
            stays locked until it has the scopes it cannot work without.
          </>
        )}
      </div>
    </div>
  );
}
