"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown, LayoutGrid, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getWorkspaces, type WorkspaceWithRole } from "@/lib/supabase";

/**
 * The workspace badge in the app header. Opening it lists every workspace the
 * user belongs to so they can jump straight to another one, without going
 * through the account menu.
 */
export function WorkspaceSwitcher({
  currentSlug,
  currentName,
}: {
  currentSlug: string;
  currentName: string | undefined;
}) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceWithRole[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setLoading(true);
    setFailed(false);
    getWorkspaces()
      .then((rows) => setWorkspaces(rows))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        // Fresh list on every open: a workspace may have been created or left elsewhere.
        if (open) load();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch workspace"
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-muted data-[state=open]:bg-muted"
        >
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="max-w-[10rem] truncate text-xs font-medium">{currentName ?? "..."}</span>
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Workspaces
        </DropdownMenuLabel>
        {loading && !workspaces ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading workspaces…
          </div>
        ) : failed && !workspaces ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">Could not load your workspaces.</div>
        ) : (
          (workspaces ?? []).map((workspace) => {
            const isCurrent = workspace.slug === currentSlug;
            return (
              <DropdownMenuItem
                key={workspace.id}
                onSelect={() => {
                  if (!isCurrent) router.push(`/w/${workspace.slug}`);
                }}
                className="gap-2"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold uppercase text-primary">
                  {workspace.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{workspace.name}</span>
                {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/workspaces")} className="gap-2">
          <LayoutGrid className="h-3.5 w-3.5" />
          <span className="text-xs">All workspaces</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
