"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Lock, Settings } from "lucide-react";
import { PageLoader } from "@/components/brand/page-loader";
import { Button } from "@/components/ui/button";
import { useWorkspaceContext } from "@/app/(dashboard)/w/[workspaceSlug]/workspace-context";
import { storeAccessHref, storeConnectionHref } from "@/lib/integrations/access-links";
import { scopeLabel, storeToolAccess, type StoreToolId, type ToolLock } from "@/lib/integrations/shopify-access";

/** Why a tool is locked and what to do about it: the sidebar's popover and the page's lock screen. */
export function ToolLockDetails({
  tool,
  lock,
  canAdmin,
  workspaceSlug,
}: {
  tool: StoreToolId;
  lock: NonNullable<ToolLock>;
  canAdmin: boolean;
  workspaceSlug: string;
}) {
  const name = storeToolAccess(tool).name;
  const needsAccess = lock.reason === "missing-scopes";
  return (
    <div className="space-y-3 text-start">
      <div>
        <p className="text-[13px] font-semibold">{needsAccess ? `${name} needs more access` : "Connect your store first"}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {needsAccess ? "Your Shopify store has not given Autommerce permission to:" : `${name} works on your store. Connect one in Settings to open it.`}
        </p>
      </div>
      {needsAccess && (
        <ul className="space-y-1">
          {lock.missing.map((scope) => (
            <li key={scope} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              <span className="first-letter:uppercase">{scopeLabel(scope)}</span>
              <code className="rounded border border-amber-500/40 bg-amber-500/10 px-1 py-px font-mono text-[10px] text-amber-800 dark:text-amber-300">{scope}</code>
            </li>
          ))}
        </ul>
      )}
      {canAdmin ? (
        <Button asChild size="sm" className="h-8 w-full gap-1.5 rounded-lg bg-[#400095] text-[12px] text-white hover:bg-[#6B358D] dark:bg-[#F76D01] dark:hover:bg-[#F76D01]/90">
          <Link href={needsAccess ? storeAccessHref(workspaceSlug) : storeConnectionHref(workspaceSlug)}>
            <Settings className="h-3.5 w-3.5" />
            {needsAccess ? "Review access in Settings" : "Connect in Settings"}
          </Link>
        </Button>
      ) : (
        <p className="text-[12px] text-muted-foreground">Ask the workspace owner or an admin to do this.</p>
      )}
    </div>
  );
}

/** Opens the tool's page only when the tool is open: a direct link gets the same lock as the sidebar. */
export function ToolGate({ tool, children }: { tool: StoreToolId; children: ReactNode }) {
  const { workspace, role, wsLoading, toolLocks } = useWorkspaceContext();
  if (wsLoading || !workspace) return <PageLoader />;
  const lock = toolLocks[tool];
  if (!lock) return <>{children}</>;
  return (
    <div className="autommerce-dashboard flex h-full min-h-0 flex-1 items-center justify-center p-8 [font-family:var(--brand-font)]">
      <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-sm">
        <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#400095]/10 text-[#6B358D] dark:bg-[#F76D01]/10 dark:text-[#F76D01]">
          <Lock className="h-5 w-5" />
        </span>
        <ToolLockDetails tool={tool} lock={lock} canAdmin={role === "owner" || role === "admin"} workspaceSlug={workspace.slug} />
      </div>
    </div>
  );
}
