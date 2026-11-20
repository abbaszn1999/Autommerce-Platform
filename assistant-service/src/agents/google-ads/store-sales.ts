// What the store sold, as totals only. Vera needs it to find the products and
// countries that earn money. Nothing about a person ever leaves this file:
// Shopify answers a ShopifyQL totals query (no customer fields exist in it), and
// a WooCommerce store's orders are added up here, keeping only a product, a
// country, a day and numbers.

import type { SDKCustomTool } from "@cursor/sdk";
import { emitMissingAccess, missingStoreAccess } from "../../core/store-access/access-request";
import { shopifyGraphql } from "../../core/store-access/shopify/client";
import { wooRequest } from "../../core/store-access/woocommerce/client";
import { failure, text, type ToolContext } from "../../core/tool-helpers";

export const SALES_BY = ["product", "country", "day", "month", "customer_type"] as const;
export type SalesBy = (typeof SALES_BY)[number];

export type SalesRow = { label: string; orders: number; units: number; revenue: number };
export type SalesTotals = { orders: number; units: number; revenue: number; averageOrderValue: number };

const MAX_DAYS = 365;
const MAX_ROWS = 500;
/** Most orders read from a WooCommerce store in one call (100 per page). */
const WOO_MAX_PAGES = 40;
/** Orders that count as sales (paid or about to be). */
const WOO_SALE_STATUSES = "completed,processing,on-hold";

const round = (n: number) => Math.round(n * 100) / 100;

const SHOPIFYQL_GROUP: Record<SalesBy, string> = {
  product: "product_title",
  country: "billing_country",
  day: "day",
  month: "month",
  customer_type: "customer_type",
};
const SHOPIFYQL_SHOW = "orders, net_items_sold, total_sales, average_order_value";

/** The one ShopifyQL query for a grouping (or for the grand totals when `by` is null). */
export function shopifyqlFor(by: SalesBy | null, days: number, limit = 50): string {
  const period = `SINCE -${days}d UNTIL today`;
  if (!by) return `FROM sales SHOW ${SHOPIFYQL_SHOW} ${period}`;
  const order = by === "day" || by === "month" ? `ORDER BY ${SHOPIFYQL_GROUP[by]} ASC` : "ORDER BY total_sales DESC";
  return `FROM sales SHOW ${SHOPIFYQL_SHOW} GROUP BY ${SHOPIFYQL_GROUP[by]} ${period} ${order} LIMIT ${limit}`;
}

type TableData = { columns?: { name: string }[]; rows?: unknown } | null;

/** ShopifyQL's table (rows as objects, or arrays in column order) as plain rows. */
export function shopifyRows(table: TableData, by: SalesBy | null): SalesRow[] {
  const columns = (table?.columns ?? []).map((c) => c.name);
  const rows = Array.isArray(table?.rows) ? (table.rows as unknown[]) : [];
  const group = by ? SHOPIFYQL_GROUP[by] : null;
  return rows.map((row) => {
    const record: Record<string, unknown> = Array.isArray(row) ? Object.fromEntries(columns.map((name, i) => [name, row[i]])) : (row as Record<string, unknown>);
    const num = (key: string) => {
      const value = Number(record[key]);
      return Number.isFinite(value) ? value : 0;
    };
    return {
      label: group ? String(record[group] ?? "(none)") : "all",
      orders: num("orders"),
      units: num("net_items_sold"),
      revenue: round(num("total_sales")),
    };
  });
}

export type WooOrder = {
  date_created?: string;
  total?: string;
  currency?: string;
  billing?: { country?: string } | null;
  line_items?: { product_id?: number; name?: string; quantity?: number; total?: string }[] | null;
};

/** Add up a WooCommerce store's orders by product, country, day or month. */
export function aggregateWooOrders(orders: WooOrder[], by: Exclude<SalesBy, "customer_type">): { rows: SalesRow[]; totals: SalesTotals; currency: string } {
  const groups = new Map<string, SalesRow>();
  const bump = (label: string, orders: number, units: number, revenue: number) => {
    const row = groups.get(label) ?? { label, orders: 0, units: 0, revenue: 0 };
    row.orders += orders;
    row.units += units;
    row.revenue += revenue;
    groups.set(label, row);
  };
  let orderCount = 0;
  let units = 0;
  let revenue = 0;
  let currency = "";
  for (const order of orders) {
    const total = Number(order.total) || 0;
    const items = order.line_items ?? [];
    const itemUnits = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    orderCount += 1;
    units += itemUnits;
    revenue += total;
    currency ||= order.currency ?? "";
    if (by === "product") {
      for (const item of items) bump(`${item.name ?? "(unnamed)"}${item.product_id ? ` (#${item.product_id})` : ""}`, 1, Number(item.quantity) || 0, Number(item.total) || 0);
    } else if (by === "country") {
      bump(order.billing?.country || "(unknown)", 1, itemUnits, total);
    } else {
      const date = String(order.date_created ?? "").slice(0, by === "day" ? 10 : 7);
      bump(date || "(unknown)", 1, itemUnits, total);
    }
  }
  const rows = [...groups.values()]
    .map((row) => ({ ...row, revenue: round(row.revenue) }))
    .sort((a, b) => (by === "day" || by === "month" ? a.label.localeCompare(b.label) : b.revenue - a.revenue));
  return { rows, totals: { orders: orderCount, units, revenue: round(revenue), averageOrderValue: orderCount ? round(revenue / orderCount) : 0 }, currency };
}

function clampDays(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_DAYS) : 90;
}

export function createStoreSalesTools(ctx: ToolContext): Record<string, SDKCustomTool> {
  return {
    store_sales: {
      description:
        "What the connected store sold, as totals only (no names, emails or addresses): revenue, orders and units grouped by product, country, day or month" +
        (ctx.platform === "shopify" ? ", or new vs returning customers (customer_type)" : "") +
        ". Use it to find the products and countries that earn money, the average order value, the trend and the seasonality, before you plan or size a campaign. " +
        "Revenue is the store's own money, not what ads brought: for ad results use ads_report. Never use it to look up one customer or order.",
      inputSchema: {
        type: "object",
        properties: {
          by: { type: "string", enum: [...SALES_BY], description: "How to group the totals. Default product." },
          days: { type: "number", description: `How many days back from today (1 to ${MAX_DAYS}). Default 90.` },
          limit: { type: "number", description: `Rows to return (1 to ${MAX_ROWS}). Default 50.` },
        },
      },
      execute: async (args) => {
        const by: SalesBy = (SALES_BY as readonly string[]).includes(String(args.by)) ? (args.by as SalesBy) : "product";
        const days = clampDays(args.days);
        const limit = Math.min(Math.max(Math.floor(Number(args.limit)) || 50, 1), MAX_ROWS);
        try {
          if (ctx.platform === "woocommerce") {
            if (by === "customer_type") return failure("New vs returning customers is not available for a WooCommerce store. Group by product, country, day or month.");
            const conn = await ctx.woo();
            const after = new Date(Date.now() - days * 86_400_000).toISOString();
            const orders: WooOrder[] = [];
            let pages = 0;
            let truncated = false;
            for (let page = 1; ; page++) {
              const res = await wooRequest(
                conn,
                { method: "GET", path: "orders", query: { after, status: WOO_SALE_STATUSES, per_page: 100, page, orderby: "date", order: "desc", _fields: "date_created,total,currency,billing,line_items" } },
                ctx.run.signal
              );
              if (!res.ok) return failure(`The store refused the sales read${res.message ? `: ${res.message}` : ""}. The store connection may lack access to orders; ask the owner to check it in Settings.`);
              orders.push(...((Array.isArray(res.data) ? res.data : []) as WooOrder[]));
              pages = res.totalPages ?? page;
              if (page >= pages) break;
              if (page >= WOO_MAX_PAGES) {
                truncated = true;
                break;
              }
            }
            const { rows, totals, currency } = aggregateWooOrders(orders, by);
            return text(
              JSON.stringify({
                source: "WooCommerce orders (completed, processing, on hold)",
                period: `last ${days} days`,
                currency,
                totals,
                groupedBy: by,
                rows: rows.slice(0, limit),
                rowsTotal: rows.length,
                note:
                  (truncated ? `Only the newest ${orders.length} orders were read, so older days in this period are missing. ` : "") +
                  "Revenue by product is the line totals before tax; by country, day and month it is the order total (tax and shipping included). Units are items sold.",
              })
            );
          }

          const conn = await ctx.connection();
          const missing = await missingStoreAccess(conn, ["read_reports"]);
          if (missing.length) {
            emitMissingAccess(ctx.run, missing);
            return failure(
              "The store has not given this app permission to read sales totals. A card asking for it is on the user's screen, with a button to the access settings. " +
                "Tell the user in one line, and plan from the catalogue and the ads data until they grant it."
            );
          }
          const query = `query($q: String!) { shopifyqlQuery(query: $q) { tableData { columns { name } rows } parseErrors } }`;
          const run = async (ql: string) => {
            const res = await shopifyGraphql(conn, query, { q: ql }, ctx.run.signal);
            const message = res.errors?.map((e) => e.message).join("; ") ?? "";
            if (message) throw new Error(`Shopify refused the sales report: ${message}`);
            const data = (res.data as { shopifyqlQuery?: { tableData?: TableData; parseErrors?: unknown } } | null)?.shopifyqlQuery;
            const parseErrors = data?.parseErrors;
            if (Array.isArray(parseErrors) ? parseErrors.length : parseErrors) throw new Error(`The sales query was not understood by Shopify: ${JSON.stringify(parseErrors)}`);
            return data?.tableData ?? null;
          };
          const [totalTable, rowTable] = await Promise.all([run(shopifyqlFor(null, days)), run(shopifyqlFor(by, days, limit))]);
          const total = shopifyRows(totalTable, null)[0] ?? { label: "all", orders: 0, units: 0, revenue: 0 };
          return text(
            JSON.stringify({
              source: "Shopify sales report (ShopifyQL)",
              period: `last ${days} days`,
              currency: "the store's currency",
              totals: { orders: total.orders, units: total.units, revenue: total.revenue, averageOrderValue: total.orders ? round(total.revenue / total.orders) : 0 },
              groupedBy: by,
              rows: shopifyRows(rowTable, by),
              note: "Revenue is total sales (after discounts and returns, with taxes and shipping). Units are net items sold.",
            })
          );
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },
  };
}
