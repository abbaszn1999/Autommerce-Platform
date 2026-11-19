// Live Meta data for the connection screen and the stage A panel, read through
// Meta's Ads MCP server (and the Graph API for Page posts, which the MCP server
// doesn't cover). Server only.

import { pagePosts, type MetaConnectionRow, type PagePost } from "./connection.server";
import { PANEL_METRICS, campaignFields, conversationId, pickAssets, type Asset } from "./mcp-tools";
import { callTool, parseJson } from "./mcp.server";

export type AssetLists = {
  adAccounts: Array<{ id: string; name: string; currency: string | null; status: string | null; mcpEnabled: boolean | null }>;
  businesses: Array<{ id: string; name: string }>;
  pages: Array<{ id: string; name: string }>;
  catalogs: Array<{ id: string; name: string }>;
  /** Lists Meta could not give, with the reason (shown, never fatal). */
  errors: Partial<Record<"adAccounts" | "businesses" | "pages" | "catalogs", string>>;
};

/** Meta's per-conversation id for the page's own reads (one per workspace, never personal data). */
const panelArgs = (workspaceId: string, args: Record<string, unknown> = {}) => ({ ...args, client_conversation_id: conversationId(`panel:${workspaceId}`), scheduled_task_run: false });

async function read(token: string, tool: string, args: Record<string, unknown>, prefix: string): Promise<Asset[]> {
  const out = await callTool(token, tool, args);
  if (out.isError) throw new Error(out.text.slice(0, 300) || "Meta returned an error");
  return pickAssets(parseJson(out.text), prefix);
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Everything the person can pick from, each list on its own so one failure doesn't hide the rest. */
export async function listAssets(token: string, workspaceId: string): Promise<AssetLists> {
  const args = panelArgs(workspaceId, { limit: 100 });
  const errors: AssetLists["errors"] = {};
  const settle = async <T,>(key: keyof AssetLists["errors"], run: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await run();
    } catch (error) {
      errors[key] = (error as Error).message.slice(0, 300);
      return [];
    }
  };
  const [adAccounts, businesses, pages, catalogs] = await Promise.all([
    settle("adAccounts", async () =>
      (await read(token, "ads_get_ad_accounts", args, "ad_account")).map((a) => ({
        id: a.id,
        name: a.name,
        currency: str(a.extra.currency),
        status: str(a.extra.account_status),
        mcpEnabled: typeof a.extra.is_ads_mcp_enabled === "boolean" ? a.extra.is_ads_mcp_enabled : null,
      }))
    ),
    settle("businesses", async () => (await read(token, "ads_catalog_get_businesses", args, "business")).map(({ id, name }) => ({ id, name }))),
    settle("pages", async () => (await read(token, "ads_get_user_pages", args, "page")).map(({ id, name }) => ({ id, name }))),
    settle("catalogs", async () => (await read(token, "ads_catalog_list_catalogs", args, "catalog")).map(({ id, name }) => ({ id, name }))),
  ]);
  return { adAccounts, businesses, pages, catalogs, errors };
}

/** One section of the panel: its data, or why Meta couldn't give it. */
type Section<T> = { ok: true; data: T } | { ok: false; error: string };

export type PanelData = {
  campaigns: Section<{ rows: Array<Record<string, unknown>>; raw?: string; range: PanelRange }>;
  posts: Section<PagePost[]>;
  products: Section<{ rows: Array<Record<string, unknown>>; total: number | null }>;
  catalogs: Section<Array<{ id: string; name: string; products: number | null; business: string | null }>>;
};

const section = async <T,>(run: () => Promise<T>): Promise<Section<T>> => {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    return { ok: false, error: (error as Error).message.slice(0, 300) };
  }
};

/** The first list of objects in a tool's JSON answer, as plain rows. */
function rowsOf(json: unknown): Array<Record<string, unknown>> {
  const walk = (v: unknown, depth: number): Array<Record<string, unknown>> => {
    // Meta sometimes sends the list as a JSON string inside the JSON (ads_get_ad_entities does).
    if (typeof v === "string" && /^\s*\[/.test(v)) v = parseJson(v);
    if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>;
    if (!v || typeof v !== "object" || depth > 3) return [];
    for (const child of Object.values(v as Record<string, unknown>)) {
      const found = walk(child, depth + 1);
      if (found.length) return found;
    }
    return [];
  };
  return walk(json, 0);
}

async function readRows(token: string, tool: string, args: Record<string, unknown>) {
  const out = await callTool(token, tool, args);
  if (out.isError) throw new Error(out.text.slice(0, 300) || "Meta returned an error");
  const json = parseJson(out.text);
  return { json, rows: rowsOf(json), text: out.text };
}

/** Periods the panel offers (Meta's date presets). */
export const PANEL_RANGES = { last_30d: "Last 30 days", last_90d: "Last 90 days", maximum: "All time" } as const;
export type PanelRange = keyof typeof PANEL_RANGES;
export const isPanelRange = (v: unknown): v is PanelRange => typeof v === "string" && v in PANEL_RANGES;

/** Canonical metric names per token, looked up once an hour (Meta asks to use ads_get_field_context for fields). */
const fieldCache = new Map<string, { fields: string[]; at: number }>();
const FIELDS_TTL_MS = 60 * 60 * 1000;

async function metricFields(token: string, workspaceId: string): Promise<string[]> {
  const key = token.slice(-24);
  const cached = fieldCache.get(key);
  if (cached && Date.now() - cached.at < FIELDS_TTL_MS) return cached.fields;
  let fields: string[] = [];
  try {
    const out = await callTool(token, "ads_get_field_context", panelArgs(workspaceId, { field_names: [...PANEL_METRICS] }));
    if (!out.isError) fields = campaignFields(parseJson(out.text));
  } catch {
    // Not fatal: the table falls back to Meta's default columns.
  }
  fieldCache.set(key, { fields, at: Date.now() });
  return fields;
}

/**
 * The stage A panel: campaigns with their numbers (ads_read), the Page's latest
 * posts (pages_read_engagement), the catalogs and the selected catalog's products
 * (catalog_management). Each section fails on its own.
 */
export async function panelData(row: MetaConnectionRow, token: string, range: PanelRange = "last_30d"): Promise<PanelData> {
  const [campaigns, posts, products, catalogs] = await Promise.all([
    section(async () => {
      if (!row.ad_account_id) throw new Error("Pick an ad account first.");
      const metrics = await metricFields(token, row.workspace_id);
      const base = { ad_account_id: row.ad_account_id, level: "campaign", date_preset: range, reporting_purpose: ["key_performance"], limit: 50 };
      const read = (args: Record<string, unknown>) => readRows(token, "ads_get_ad_entities", panelArgs(row.workspace_id, args));
      // With Meta's own metric names; if Meta refuses them, Meta's default columns.
      const result = metrics.length
        ? await read({ ...base, fields: ["id", "name", "status", "effective_status", ...metrics] }).catch(() => read(base))
        : await read(base);
      return { rows: result.rows.slice(0, 50), raw: result.rows.length ? undefined : result.text.slice(0, 1000), range };
    }),
    section(async () => {
      if (!row.page_id) throw new Error("Pick a Page first.");
      return pagePosts(token, row.page_id, 6);
    }),
    section(async () => {
      if (!row.catalog_id) throw new Error("Pick a catalog first.");
      const { json, rows } = await readRows(token, "ads_catalog_list_products", panelArgs(row.workspace_id, { entity_id: row.catalog_id, limit: 10 }));
      const info = json && typeof json === "object" ? ((json as Record<string, unknown>).page_info as Record<string, unknown> | undefined) : undefined;
      const total = Number(info?.total_count ?? (json as Record<string, unknown> | null)?.total_count);
      return { rows: rows.slice(0, 10), total: Number.isFinite(total) ? total : null };
    }),
    section(async () => {
      // Every catalog the person shared, so one Vera creates, renames or deletes shows up here whatever business owns it.
      const { rows } = await readRows(token, "ads_catalog_list_catalogs", panelArgs(row.workspace_id, { limit: 50 }));
      return rows.slice(0, 50).map((c) => ({
        id: String(c.catalog_id ?? c.id ?? ""),
        name: String(c.name ?? c.catalog_id ?? ""),
        products: typeof c.product_count === "number" ? c.product_count : null,
        business: c.business && typeof c.business === "object" ? String((c.business as Record<string, unknown>).name ?? "") || null : null,
      }));
    }),
  ]);
  return { campaigns, posts, products, catalogs };
}
