"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CheckCircle2, KeyRound, Loader2, PlugZap, RefreshCw, Settings, X } from "lucide-react";
import { useWorkspaceContext } from "@/app/(dashboard)/w/[workspaceSlug]/workspace-context";
import { Button } from "@/components/ui/button";
import { refreshWorkspace } from "@/hooks/use-workspace";
import { storeAccessHref, storeConnectionHref } from "@/lib/integrations/access-links";
import { missingShopifyScopes, scopeLabel } from "@/lib/integrations/shopify-access";
import { accessCardState } from "@/lib/store-agent/access-state";
import type { MessageBlock } from "@/lib/store-agent/blocks";
import { getWorkspaceIntegrationScopes } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type AccessBlock = Extract<MessageBlock, { type: "access" }>;

const TEXT: Record<AccessBlock["reason"], { title: string; body: string; action: string; done: string }> = {
  no_store: {
    title: "Connect your store",
    body: "No store is connected to this workspace yet. Connect your Shopify or WooCommerce store and Vera can work on it.",
    action: "Connect a store",
    done: "A store is connected now. Send your request again and Vera will use it.",
  },
  store_problem: {
    title: "Your store's connection needs attention",
    body: "A store is connected, but its connection could not be read. Reconnecting it in Settings usually fixes this.",
    action: "Open the store connection",
    done: "",
  },
  missing_access: {
    title: "Your store has not given this access yet",
    body: "Vera needs permission to:",
    action: "Review access in Settings",
    done: "Your store grants this now. Send your request again and Vera will carry on.",
  },
};

/**
 * What an agent asked for and does not have: a store, or a permission on it.
 * It shows what is true now, not what was true when the agent asked, so a card
 * in an older reply turns green once the access is there.
 */
export function AccessCard({ block }: { block: AccessBlock }) {
  const { workspace, role, hasStoreAgentStore, storeAccess } = useWorkspaceContext();
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState("");
  const canAdmin = role === "owner" || role === "admin";
  const text = TEXT[block.reason];

  const { resolved, scopes } = accessCardState(block, { hasStore: hasStoreAgentStore, ...storeAccess });

  const recheck = async () => {
    if (!workspace || checking) return;
    setChecking(true);
    setCheckNote("");
    try {
      // Owners and admins ask the store itself; everyone else gets what the workspace last saw.
      if (canAdmin && block.reason !== "no_store") {
        const now = await getWorkspaceIntegrationScopes(workspace.id);
        if (block.reason === "missing_access" && now && missingShopifyScopes(now, block.scopes).length) setCheckNote("Checked just now: still not granted.");
      }
    } catch {
      setCheckNote("Could not check right now. Try again in a moment.");
    } finally {
      refreshWorkspace();
      setChecking(false);
    }
  };

  const href = workspace ? (block.reason === "missing_access" ? storeAccessHref(workspace.slug) : storeConnectionHref(workspace.slug)) : null;
  const Icon = resolved ? CheckCircle2 : block.reason === "missing_access" ? KeyRound : PlugZap;

  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3",
        resolved ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-amber-500/40 bg-amber-500/[0.05]"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            resolved ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold">{resolved ? (block.reason === "no_store" ? "Store connected" : "Access granted") : text.title}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{resolved ? text.done : text.body}</p>

          {scopes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {scopes.map(({ scope, granted }) => (
                <li key={scope} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px]">
                  {granted ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <X className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />}
                  <span className="first-letter:uppercase">{scopeLabel(scope)}</span>
                  <code className="rounded border bg-muted/50 px-1 py-px font-mono text-[10.5px] text-muted-foreground">{scope}</code>
                </li>
              ))}
            </ul>
          )}

          {block.note && !resolved && (
            <p dir="auto" className="mt-2 text-[12.5px] leading-relaxed">
              {block.note}
            </p>
          )}

          {!resolved && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {canAdmin && href ? (
                <Button asChild size="sm" className="h-8 gap-1.5 rounded-lg bg-[#400095] text-[12px] text-white hover:bg-[#6B358D] dark:bg-[#F76D01] dark:hover:bg-[#F76D01]/90">
                  <Link href={href}>
                    <Settings className="h-3.5 w-3.5" />
                    {text.action}
                  </Link>
                </Button>
              ) : (
                <p className="text-[12.5px] text-muted-foreground">Ask the workspace owner or an admin to do this in Settings.</p>
              )}
              {block.reason !== "store_problem" && (
                <Button type="button" variant="outline" size="sm" onClick={() => void recheck()} disabled={checking || !workspace} className="h-8 gap-1.5 rounded-lg text-[12px]">
                  {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Check again
                </Button>
              )}
              {checkNote && <span className="text-[12px] text-muted-foreground">{checkNote}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
