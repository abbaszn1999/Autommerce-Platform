"use client";

import { Check, KeyRound, Lock, Megaphone, RefreshCw, ShoppingBag, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, Pill, ViewHeader } from "@/components/google-ads/ga-ui";
import { useMetaAds } from "@/lib/meta-ads/store";
import { META_PERMISSIONS } from "../ma-connect";
import { useMa } from "../use-ma";

const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-1.5 text-xs font-semibold hover:bg-muted";
const BTN_PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-[#400095] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#340079] dark:bg-[#F76D01] dark:hover:bg-[#d85f00]";

/**
 * Where the user reviews and changes what is connected. The Meta ad account and the
 * Commerce Manager catalog are separate connections with their own sign-in.
 */
export function ConnectionsView() {
  const { data } = useMa();
  const email = useMetaAds((s) => s.facebookEmail);
  const catalog = useMetaAds((s) => s.catalog);
  const disconnect = useMetaAds((s) => s.disconnect);
  const startConnect = useMetaAds((s) => s.startConnect);
  const startCatalogConnect = useMetaAds((s) => s.startCatalogConnect);
  const changeCatalog = useMetaAds((s) => s.changeCatalog);
  const disconnectCatalog = useMetaAds((s) => s.disconnectCatalog);

  const cat = catalog.accounts.find((a) => a.catalogId === catalog.catalogId);
  const connected = catalog.status === "connected" && cat;

  const reconnect = () => {
    disconnect();
    startConnect();
  };

  return (
    <div className="space-y-4">
      <ViewHeader title="Connections" subtitle="Review what the agent can reach. The Meta ad account and the catalog are connected separately, so you can change or reconnect either one at any time." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1877F2]/10 text-[#1877F2]">
              <Megaphone className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Meta ad account</p>
              <p className="text-[11px] text-muted-foreground">Campaigns, ad sets, ads, audiences, insights and Events Manager.</p>
            </div>
            <Pill tone="good">Connected</Pill>
          </div>
          <dl className="space-y-2 text-xs">
            <Row k="Signed in as" v={email ?? "-"} />
            <Row k="Business portfolio" v={`${data.portfolio.name}${data.portfolio.verified ? " · verified" : ""}`} />
            <Row k="Ad account" v={`${data.account.name} · ${data.account.accountId}`} />
            <Row k="Page" v={data.linkedAssets.find((a) => a.kind === "PAGE")?.name ?? "-"} />
            <Row k="Instagram" v={data.linkedAssets.find((a) => a.kind === "INSTAGRAM")?.name ?? "-"} />
            <Row k="Dataset" v={data.datasets[0]?.name ?? "-"} />
          </dl>
          <div className="space-y-1.5 rounded-xl bg-muted/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Permissions granted</p>
            <div className="flex flex-wrap gap-1">
              {META_PERMISSIONS.map((p) => (
                <code key={p.scope} className="rounded bg-background px-1.5 py-0.5 text-[10px]">
                  {p.scope}
                </code>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
            <button type="button" onClick={reconnect} className={BTN}>
              <RefreshCw className="h-3 w-3" /> Reconnect
            </button>
            <button type="button" onClick={disconnect} className={cn(BTN, "text-red-600")}>
              <Unplug className="h-3 w-3" /> Disconnect
            </button>
          </div>
        </Card>

        <Card className="space-y-4 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F76D01]/10 text-[#F76D01]">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Commerce Manager catalog</p>
              <p className="text-[11px] text-muted-foreground">Your products: statuses, issues and fixes.</p>
            </div>
            {connected ? <Pill tone="good">Connected</Pill> : <Pill>Not connected</Pill>}
          </div>
          {connected && cat ? (
            <>
              <dl className="space-y-2 text-xs">
                <Row k="Signed in as" v={catalog.email ?? "-"} />
                <Row k="Catalog" v={`${cat.name} · ${cat.catalogId}`} />
                <Row k="Store" v={cat.website} />
                <Row k="Products" v={String(data.products.length)} />
                <Row k="Access" v={<code className="rounded bg-muted px-1 text-[10px]">catalog_management</code>} />
              </dl>
              <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
                <button type="button" onClick={changeCatalog} className={BTN}>
                  Change catalog
                </button>
                <button type="button" onClick={startCatalogConnect} className={BTN}>
                  <RefreshCw className="h-3 w-3" /> Reconnect
                </button>
                <button type="button" onClick={disconnectCatalog} className={cn(BTN, "text-red-600")}>
                  <Unplug className="h-3 w-3" /> Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">Optional. Connect it so the agent can read every product and propose data fixes (category, availability, image size), always after you approve. Unlocks the Catalog page and catalog ads.</p>
              <div className="border-t border-border/60 pt-3">
                <button type="button" onClick={startCatalogConnect} className={BTN_PRIMARY}>
                  <ShoppingBag className="h-3.5 w-3.5" /> Connect a catalog
                </button>
              </div>
            </>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold">
          <KeyRound className="h-4 w-4 text-muted-foreground" /> What the agent can use right now
        </p>
        <div className="grid gap-2 md:grid-cols-3">
          <Access on title="Meta Ads tools" body="Insights, campaign structure, audiences, creatives, Events Manager. Changes wait for your approval." />
          <Access on={!!connected} title="Catalog tools" body={connected ? "Read product statuses and issues, propose data fixes. Fixes wait for your approval." : "Locked until a catalog is connected."} />
          <Access on={false} title="Billing & payments" body="Never available. The agent cannot change payment methods or the spending limit. Use Meta Billing." />
        </div>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{v}</dd>
    </div>
  );
}

function Access({ on, title, body }: { on: boolean; title: string; body: string }) {
  return (
    <div className={cn("flex gap-3 rounded-xl border p-3", on ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/60 bg-muted/30")}>
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", on ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground")}>{on ? <Check className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}</span>
      <div>
        <p className="text-xs font-semibold">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
