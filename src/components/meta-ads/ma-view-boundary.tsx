"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useAccountState, useMetaAds } from "@/lib/meta-ads/store";
import { Card } from "@/components/google-ads/ga-ui";

type Props = { children?: ReactNode; /** Changes when the user moves somewhere else, which clears a previous error. */ resetKey: string };
type State = { error: Error | null; resetKey: string };

/** One broken page must not blank the workspace: it shows an error with Try again while the rest keeps working. */
export class MaViewBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Card className="mx-auto mt-10 flex max-w-md flex-col items-center gap-2 p-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10 text-red-600">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <p className="text-sm font-semibold">This page could not be shown</p>
        <p className="text-xs leading-relaxed text-muted-foreground">Something in the data of this page was not what it expected. The rest of the workspace is fine.</p>
        <button type="button" onClick={() => this.setState({ error: null })} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-1.5 text-xs font-semibold hover:bg-muted">
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      </Card>
    );
  }
}

/** Thin banner above the page: shown while the account reloads, or when the reload failed (the old numbers stay visible). */
export function MaSyncBanner() {
  const acc = useAccountState();
  const refresh = useMetaAds((s) => s.refreshData);
  const sync = acc?.sync;
  if (!sync || sync.status === "ready") return null;
  if (sync.status === "loading") {
    return (
      <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the latest numbers from Meta
      </div>
    );
  }
  return (
    <div role="alert" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs">
      <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">Could not refresh.</span> <span className="text-muted-foreground">{sync.error ?? "Meta did not answer."} Showing the numbers from {new Date(sync.refreshedAt).toLocaleTimeString()}.</span>
      </span>
      <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 font-semibold hover:bg-muted">
        <RefreshCw className="h-3 w-3" /> Retry
      </button>
    </div>
  );
}

