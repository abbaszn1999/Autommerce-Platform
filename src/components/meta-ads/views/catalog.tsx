"use client";

import { useMemo, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { Card, EmptyState, Pill, Segmented, ViewHeader } from "@/components/google-ads/ga-ui";
import { GaTable, type GaColumn } from "@/components/google-ads/ga-table";
import { productMetrics } from "@/lib/meta-ads/analytics";
import { money } from "@/lib/meta-ads/metrics";
import { useMetaAds } from "@/lib/meta-ads/store";
import type { MetaProduct, Metrics } from "@/lib/meta-ads/types";
import { metricColumns } from "../ma-columns";
import { AskButton, SearchBox } from "../ma-common";
import { ACCENT_BTN } from "../ma-ui";
import { useMa } from "../use-ma";

type Filter = "ALL" | "ISSUES" | "OUT";

/** Catalog from Commerce Manager: product health, product sets, and what dynamic ads spend on each product. */
export function CatalogView() {
  const { data, range, currency } = useMa();
  const catalog = useMetaAds((s) => s.catalog);
  const startConnect = useMetaAds((s) => s.startCatalogConnect);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const metrics = useMemo(() => productMetrics(data, range), [data, range]);

  if (catalog.status !== "connected") {
    return (
      <div>
        <ViewHeader title="Catalog" subtitle="Connect your Commerce Manager catalog to run catalog and Advantage+ Sales ads." />
        <EmptyState
          icon={ShoppingBag}
          title="No catalog connected"
          body="Connecting is separate from the ad account and read-only for ads: the agent can fix product data issues as pending changes you approve."
          action={
            <button type="button" onClick={startConnect} className={`rounded-lg px-3 py-2 text-xs font-semibold ${ACCENT_BTN}`}>
              Connect a catalog
            </button>
          }
        />
      </div>
    );
  }

  const issues = data.products.filter((p) => p.status !== "ACTIVE").length;
  const out = data.products.filter((p) => p.availability === "OUT_OF_STOCK").length;
  const rows = data.products
    .filter((p) => (filter === "ISSUES" ? p.status !== "ACTIVE" : filter === "OUT" ? p.availability === "OUT_OF_STOCK" : true))
    .filter((p) => p.title.toLowerCase().includes(query.toLowerCase()));

  const columns: GaColumn<MetaProduct>[] = [
    { id: "title", header: "Product", sticky: true, sortValue: (p) => p.title, render: (p) => <span className="block max-w-64 truncate font-semibold">{p.title}</span>, total: <span>{rows.length} products</span> },
    { id: "brand", header: "Brand", sortValue: (p) => p.brand, render: (p) => <span className="text-muted-foreground">{p.brand}</span> },
    { id: "category", header: "Category", sortValue: (p) => p.category, render: (p) => <span className="whitespace-nowrap text-muted-foreground">{p.category || "—"}</span> },
    { id: "price", header: "Price", align: "right", sortValue: (p) => p.price, render: (p) => <span>{money(p.price, currency)}</span> },
    { id: "stock", header: "Availability", sortValue: (p) => p.availability, render: (p) => <Pill tone={p.availability === "IN_STOCK" ? "good" : "neutral"}>{p.availability === "IN_STOCK" ? "In stock" : "Out of stock"}</Pill> },
    {
      id: "status",
      header: "Status",
      sortValue: (p) => p.status,
      render: (p) => (
        <span className="flex max-w-64 flex-wrap gap-1">
          <Pill tone={p.status === "ACTIVE" ? "good" : p.status === "ISSUES" ? "warn" : "bad"}>{p.status === "ACTIVE" ? "Active" : p.status === "ISSUES" ? "Issues" : "Rejected"}</Pill>
          {p.issues.map((i) => (
            <Pill key={i.code} tone={i.severity === "ERROR" ? "bad" : "warn"}>
              {i.label}
            </Pill>
          ))}
        </span>
      ),
    },
    ...metricColumns<MetaProduct>((p) => (metrics.get(p.id) ?? ({} as Metrics)), currency, { keys: ["spend", "impressions", "linkClicks", "purchases", "roas"] }),
  ];

  return (
    <div>
      <ViewHeader
        title="Catalog"
        subtitle={`${catalog.accounts.find((a) => a.catalogId === catalog.catalogId)?.name ?? "Catalog"} · ${data.products.length} products`}
        actions={
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Find a product" />
            {issues > 0 && <AskButton primary prompt="Fix the product data issues in my catalog">Fix issues</AskButton>}
          </>
        }
      >
        <Segmented value={filter} onChange={setFilter} size="xs" options={[{ value: "ALL", label: "All", count: data.products.length }, { value: "ISSUES", label: "With issues", count: issues }, { value: "OUT", label: "Out of stock", count: out }]} />
      </ViewHeader>
      {data.productSets.length > 0 && (
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Product sets · the groups catalog ads draw from</p>
      )}
      {data.productSets.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.productSets.map((s) => (
            <Card key={s.id} className="p-3">
              <p className="truncate text-xs font-semibold">{s.name}</p>
              <p className="text-[11px] text-muted-foreground">{s.count} products · {s.rule}</p>
            </Card>
          ))}
        </div>
      )}
      <GaTable rows={rows} columns={columns} rowKey={(p) => p.id} exportName="catalog" defaultSort={{ id: "spend", dir: "desc" }} empty="No products match." />
    </div>
  );
}
