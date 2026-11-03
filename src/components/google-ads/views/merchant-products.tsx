"use client";

// Live mode: the connected Merchant Center account's products, their status and
// the issues Google reports, read straight from Merchant Center. Fixes go through
// Vera, who shows each one on an approval card.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Clock, ExternalLink, Loader2, RefreshCw, ShoppingBag, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { money } from "@/lib/google-ads/metrics";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import { liveApi } from "@/lib/google-ads/live-api";
import type { MerchantProduct, MerchantProductStatus, MerchantSnapshot } from "@/lib/google-ads/merchant-live";
import { useGoogleAds } from "@/lib/google-ads/store";
import { GaTable, type GaColumn } from "../ga-table";
import { Card, EmptyState, Pill, Segmented, ViewHeader } from "../ga-ui";
import { SearchBox } from "./campaigns";

const STATUS: Record<MerchantProductStatus, { label: string; tone: "good" | "warn" | "bad" | "info"; icon: typeof CheckCircle2 }> = {
  APPROVED: { label: "Approved", tone: "good", icon: CheckCircle2 },
  LIMITED: { label: "Limited", tone: "warn", icon: AlertTriangle },
  DISAPPROVED: { label: "Disapproved", tone: "bad", icon: XCircle },
  PENDING: { label: "Pending review", tone: "info", icon: Clock },
};

const TONE_BG = { good: "bg-emerald-500/10 text-emerald-600", warn: "bg-amber-500/10 text-amber-600", bad: "bg-red-500/10 text-red-600", info: "bg-sky-500/10 text-sky-600" };

function Thumb({ src, className }: { src: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken)
    return (
      <span className={cn("flex items-center justify-center rounded-md bg-muted text-muted-foreground", className)}>
        <ShoppingBag className="h-4 w-4" />
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element -- merchant image hosts are arbitrary
  return <img src={src} alt="" onError={() => setBroken(true)} className={cn("rounded-md object-cover", className)} />;
}

export function LiveProductsView() {
  const workspaceId = useGoogleAds((s) => s.workspaceId);
  const merchantId = useGoogleAds((s) => (s.merchant.status === "connected" ? s.merchant.merchantId : null));
  const setView = useGoogleAds((s) => s.setView);
  const [data, setData] = useState<MerchantSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "ISSUES" | "OUT">("ALL");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(
    async (force: boolean) => {
      if (!workspaceId || !merchantId) return;
      setLoading(true);
      setError(null);
      try {
        setData((await liveApi.merchant(workspaceId, force)).data);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, merchantId]
  );
  useEffect(() => {
    void load(false);
  }, [load]);

  const products = useMemo(() => data?.products ?? [], [data]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => !q || p.title.toLowerCase().includes(q) || p.offerId.toLowerCase().includes(q))
      .filter((p) => (filter === "ISSUES" ? p.issues.length > 0 : filter === "OUT" ? p.availability !== "IN_STOCK" : true));
  }, [products, query, filter]);

  if (!merchantId) {
    return (
      <div>
        <ViewHeader title="Products" />
        <EmptyState
          icon={ShoppingBag}
          title="Connect Merchant Center to see your products"
          body="Vera reads your products and the issues Google reports on them, and fixes titles, descriptions, images and identifiers after you approve each change."
          action={
            <button type="button" onClick={() => setView("connections")} className="rounded-lg bg-[#400095] px-3 py-2 text-xs font-semibold text-white hover:bg-[#33007a] dark:bg-violet-600">
              Connect Merchant Center
            </button>
          }
        />
      </div>
    );
  }

  const counts = (Object.keys(STATUS) as MerchantProductStatus[]).map((k) => [k, products.filter((p) => p.status === k).length] as const);
  const withIssues = products.filter((p) => p.issues.length).length;
  const open = products.find((p) => p.id === openId);

  const columns: GaColumn<MerchantProduct>[] = [
    {
      id: "title",
      header: "Product",
      label: "Product",
      sticky: true,
      sortValue: (p) => p.title,
      render: (p) => (
        <button type="button" onClick={() => setOpenId(openId === p.id ? null : p.id)} className="flex max-w-96 items-center gap-2.5 text-left">
          <Thumb src={p.imageLink} className="h-9 w-9 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-[#400095] hover:underline dark:text-violet-300">{p.title || p.offerId}</span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {p.offerId}
              {p.brand ? ` · ${p.brand}` : ""}
            </span>
          </span>
        </button>
      ),
    },
    {
      id: "status",
      header: "Status",
      label: "Status",
      sortValue: (p) => p.status,
      render: (p) => {
        const s = STATUS[p.status];
        return (
          <span className="flex flex-col items-start gap-0.5">
            <Pill tone={s.tone}>
              <s.icon className="h-3 w-3" /> {s.label}
            </Pill>
            {p.issues.length > 0 && <span className="text-[10px] text-muted-foreground">{p.issues.length} issue{p.issues.length > 1 ? "s" : ""}</span>}
          </span>
        );
      },
    },
    {
      id: "price",
      header: "Price",
      label: "Price",
      align: "right",
      sortValue: (p) => p.salePrice ?? p.price ?? 0,
      render: (p) =>
        p.price == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="whitespace-nowrap">
            {p.salePrice != null ? (
              <>
                <span className="font-semibold">{money(p.salePrice, p.currency)}</span> <span className="text-muted-foreground line-through">{money(p.price, p.currency)}</span>
              </>
            ) : (
              money(p.price, p.currency)
            )}
          </span>
        ),
    },
    {
      id: "stock",
      header: "Availability",
      label: "Availability",
      hideable: true,
      render: (p) => (p.availability === "IN_STOCK" ? <span className="text-muted-foreground">In stock</span> : <Pill tone="bad">{p.availability.replace(/_/g, " ").toLowerCase()}</Pill>),
    },
    {
      id: "gtin",
      header: "GTIN",
      label: "GTIN",
      hideable: true,
      render: (p) => (p.gtin ? <span className="tabular-nums">{p.gtin}</span> : <span className="text-muted-foreground">missing</span>),
    },
  ];

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Products"
        subtitle={`Merchant Center ${merchantId} · ${products.length} products${data?.truncated ? " (first ones only)" : ""}${data ? ` · updated ${new Date(data.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`}
        actions={
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Find a product or ID" />
            <button type="button" onClick={() => void load(true)} disabled={loading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-xs font-semibold hover:bg-muted disabled:opacity-60">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
            </button>
            <button type="button" onClick={() => runAgentTurn("Check my Merchant Center products and fix what you can")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-xs font-semibold hover:bg-muted">
              <Bot className="h-3.5 w-3.5" /> Ask Vera
            </button>
          </>
        }
      />
      {error && <p className="rounded-lg bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-400">{error}</p>}
      {!data && loading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading products from Merchant Center…
        </p>
      )}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {counts.map(([k, n]) => {
              const s = STATUS[k];
              return (
                <Card key={k} className="flex items-center gap-3 p-4">
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", TONE_BG[s.tone])}>
                    <s.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-2xl font-black tabular-nums">{n}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                </Card>
              );
            })}
          </div>
          {data.accountIssues.length > 0 && (
            <Card className="space-y-2 border-amber-500/30 bg-amber-500/[0.04] p-4">
              <p className="text-sm font-bold">Account issues in Merchant Center</p>
              {data.accountIssues.map((i) => (
                <p key={i.title} className="flex gap-2 text-xs">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span className="flex-1">
                    <span className="font-semibold">{i.title}.</span> {i.detail}
                  </span>
                  {i.documentation && (
                    <a href={i.documentation} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#400095] hover:underline dark:text-violet-300">
                      How to fix <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </p>
              ))}
            </Card>
          )}
          <Segmented
            value={filter}
            onChange={setFilter}
            size="xs"
            options={[
              { value: "ALL", label: "All products", count: products.length },
              { value: "ISSUES", label: "With issues", count: withIssues },
              { value: "OUT", label: "Out of stock", count: products.filter((p) => p.availability !== "IN_STOCK").length },
            ]}
          />
          {open && (
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <Thumb src={open.imageLink} className="h-16 w-16 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{open.title || open.offerId}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {open.offerId} · {open.brand || "no brand"} · GTIN {open.gtin || "missing"}
                    {open.link && (
                      <>
                        {" · "}
                        <a href={open.link} target="_blank" rel="noreferrer" className="hover:underline">
                          product page
                        </a>
                      </>
                    )}
                  </p>
                  {open.description && <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">{open.description}</p>}
                  {open.issues.length ? (
                    <div className="mt-2 space-y-1.5">
                      {open.issues.map((i) => (
                        <p key={i.code} className={cn("flex gap-2 rounded-lg p-2 text-[11px]", i.severity === "DISAPPROVED" ? "bg-red-500/10" : "bg-amber-500/10")}>
                          <AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", i.severity === "DISAPPROVED" ? "text-red-600" : "text-amber-600")} />
                          <span className="flex-1">
                            <span className="font-semibold">{i.description}.</span> {i.detail}
                          </span>
                          {i.resolution === "pending_processing" ? <Pill tone="info">Google is processing</Pill> : i.documentation && (
                            <a href={i.documentation} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-semibold text-[#400095] hover:underline dark:text-violet-300">
                              Help <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-emerald-600">No issues reported by Google.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => runAgentTurn(`Check the Merchant Center product "${open.title || open.offerId}" (${open.id}) and fix what you can`)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#400095] px-3 py-2 text-xs font-semibold text-white hover:bg-[#33007a] dark:bg-violet-600"
                >
                  <Bot className="h-3.5 w-3.5" /> Ask Vera to fix
                </button>
              </div>
            </Card>
          )}
          <GaTable
            rows={rows}
            columns={columns}
            rowKey={(p) => p.id}
            exportName="merchant-products"
            defaultSort={{ id: "status", dir: "desc" }}
            rowClassName={(p) => cn(p.status === "DISAPPROVED" && "bg-red-500/[0.03]")}
          />
        </>
      )}
    </div>
  );
}
