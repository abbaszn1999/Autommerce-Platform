import { describe, expect, it, vi } from "vitest";
import { aggregateWooOrders, createStoreSalesTools, shopifyRows, shopifyqlFor, type WooOrder } from "../../../src/agents/google-ads/store-sales";
import type { ToolContext } from "../../../src/core/tool-helpers";

// A Shopify store that lets the app read the catalogue but not its sales totals.
const shopify = vi.hoisted(() => ({ queries: 0 }));
vi.mock("../../../src/core/store-access/shopify/client", async (original) => ({
  ...(await original<typeof import("../../../src/core/store-access/shopify/client")>()),
  grantedScopes: async () => new Set(["read_products"]),
  shopifyGraphql: async () => {
    shopify.queries++;
    return { data: null };
  },
}));

const orders: WooOrder[] = [
  { date_created: "2026-10-01T10:00:00", total: "100.00", currency: "AED", billing: { country: "AE" }, line_items: [{ product_id: 1, name: "Oud", quantity: 2, total: "80.00" }, { product_id: 2, name: "Musk", quantity: 1, total: "10.00" }] },
  { date_created: "2026-10-01T12:00:00", total: "50.00", currency: "AED", billing: { country: "SA" }, line_items: [{ product_id: 1, name: "Oud", quantity: 1, total: "40.00" }] },
  { date_created: "2026-10-03T12:00:00", total: "30.00", currency: "AED", billing: { country: "AE" }, line_items: [{ product_id: 2, name: "Musk", quantity: 3, total: "27.00" }] },
];

describe("store_sales: WooCommerce totals", () => {
  it("adds up by product with units and line revenue", () => {
    const { rows, totals, currency } = aggregateWooOrders(orders, "product");
    expect(currency).toBe("AED");
    expect(totals).toEqual({ orders: 3, units: 7, revenue: 180, averageOrderValue: 60 });
    expect(rows[0]).toEqual({ label: "Oud (#1)", orders: 2, units: 3, revenue: 120 });
    expect(rows[1]).toEqual({ label: "Musk (#2)", orders: 2, units: 4, revenue: 37 });
  });

  it("adds up by country, best first, and by day, oldest first", () => {
    expect(aggregateWooOrders(orders, "country").rows.map((r) => [r.label, r.revenue])).toEqual([["AE", 130], ["SA", 50]]);
    expect(aggregateWooOrders(orders, "day").rows.map((r) => r.label)).toEqual(["2026-10-01", "2026-10-03"]);
    expect(aggregateWooOrders(orders, "month").rows).toHaveLength(1);
  });

  it("keeps nothing about a person in its rows", () => {
    const withPerson = [{ ...orders[0]!, billing: { country: "AE", email: "a@b.c", first_name: "Sara" } as never }];
    expect(JSON.stringify(aggregateWooOrders(withPerson, "country"))).not.toMatch(/a@b\.c|Sara/);
  });
});

describe("store_sales: Shopify queries", () => {
  it("builds ShopifyQL with only sales columns", () => {
    expect(shopifyqlFor("product", 30, 20)).toBe("FROM sales SHOW orders, net_items_sold, total_sales, average_order_value GROUP BY product_title SINCE -30d UNTIL today ORDER BY total_sales DESC LIMIT 20");
    expect(shopifyqlFor("day", 7)).toContain("ORDER BY day ASC");
    expect(shopifyqlFor(null, 90)).not.toContain("GROUP BY");
    for (const by of ["product", "country", "day", "month", "customer_type"] as const) expect(shopifyqlFor(by, 90)).not.toMatch(/email|customer_name|address|phone/i);
  });

  it("reads rows given as objects or as arrays", () => {
    const columns = [{ name: "product_title" }, { name: "orders" }, { name: "net_items_sold" }, { name: "total_sales" }];
    expect(shopifyRows({ columns, rows: [{ product_title: "Oud", orders: "4", net_items_sold: "6", total_sales: "310.5" }] }, "product")).toEqual([{ label: "Oud", orders: 4, units: 6, revenue: 310.5 }]);
    expect(shopifyRows({ columns, rows: [["Musk", 1, 2, 20]] }, "product")[0]).toEqual({ label: "Musk", orders: 1, units: 2, revenue: 20 });
    expect(shopifyRows(null, null)).toEqual([]);
  });

  it("asks for the sales-totals permission with a card instead of running a query Shopify would refuse", async () => {
    const emitted: unknown[] = [];
    const ctx = { platform: "shopify", connection: async () => ({ workspaceId: "w1" }), run: { emit: (event: unknown) => emitted.push(event) } } as unknown as ToolContext;
    const result = (await createStoreSalesTools(ctx).store_sales!.execute({ by: "product" } as never, {} as never)) as { content: Array<{ text: string }>; isError?: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("permission to read sales totals");
    expect(emitted).toEqual([{ type: "access", reason: "missing_access", scopes: ["read_reports"] }]);
    expect(shopify.queries).toBe(0);
  });
});