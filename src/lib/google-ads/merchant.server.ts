// Merchant Center through Composio: read a workspace's products and issues, and
// apply approved product fixes. Same order as Google Ads changes: claim the
// change id (no double send) → read the products from Google → plan and check →
// write → record the result and how to undo it. Nothing is retried automatically.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ConnectionHttpError, execute, type ConnectionRow } from "./connection.server";
import { googleMessage } from "./live-mutate.server";
import {
  MerchantPlanError,
  mapProduct,
  planMerchantChange,
  toApiAttributes,
  type ApiProduct,
  type MerchantAccountIssue,
  type MerchantAttributes,
  type MerchantOp,
  type MerchantProduct,
  type MerchantSnapshot,
} from "./merchant-live";

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 100;
const PAGE_SIZE = 250;
const MAX_PAGES = 8;
/** Our supplemental data source in each merchant's account. */
export const SUPPLEMENTAL_NAME = "Autommerce";

const cache = new Map<string, { at: number; data: MerchantSnapshot }>();

function merchantOf(row: ConnectionRow): string {
  if (row.kind !== "merchant" || !row.account_id || !row.composio_connected_account_id) throw new ConnectionHttpError(409, "not_connected");
  return row.account_id;
}

type Page<K extends string, T> = { [key in K]?: T[] } & { has_more?: boolean; next_cursor?: string | null };

async function allPages<K extends string, T>(row: ConnectionRow, slug: string, key: K, args: Record<string, unknown>, maxPages: number) {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const data = await execute<Page<K, T>>(row, slug, { ...args, ...(cursor ? { cursor } : {}) });
    items.push(...((data[key] as T[] | undefined) ?? []));
    if (!data.has_more || !data.next_cursor) return { items, more: false };
    cursor = data.next_cursor;
  }
  return { items, more: true };
}

export async function loadMerchantSnapshot(row: ConnectionRow, opts: { force?: boolean } = {}): Promise<MerchantSnapshot> {
  const merchantId = merchantOf(row);
  const key = `${row.workspace_id}:${merchantId}`;
  const hit = cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const parent = `accounts/${merchantId}`;
  type ApiAccountIssue = { title?: string; detail?: string; severity?: string; documentation_uri?: string };
  const [products, issues] = await Promise.all([
    allPages<"products", ApiProduct>(row, "GOOGLE_MERCHANT_LIST_PRODUCTS", "products", { parent_account_name: parent, page_size: PAGE_SIZE }, MAX_PAGES),
    allPages<"account_issues", ApiAccountIssue>(row, "GOOGLE_MERCHANT_LIST_ACCOUNT_ISSUES", "account_issues", { parent_account_name: parent }, 2),
  ]);
  const at = Date.now();
  const data: MerchantSnapshot = {
    merchantId,
    products: products.items.map(mapProduct).filter((p): p is MerchantProduct => !!p),
    accountIssues: issues.items.map(
      (i): MerchantAccountIssue => ({ title: i.title ?? "", detail: i.detail ?? "", severity: i.severity ?? "", documentation: i.documentation_uri || undefined })
    ),
    truncated: products.more,
    fetchedAt: new Date(at).toISOString(),
  };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { at, data });
  return data;
}

/** Drop cached snapshots for a workspace (after a fix, disconnecting or picking another account). */
export function forgetMerchant(workspaceId: string) {
  for (const key of cache.keys()) if (key.startsWith(`${workspaceId}:`)) cache.delete(key);
}

// ─── Our supplemental data source ───────────────────────────────────────────

type TakeFrom = { self?: boolean | null; primary_data_source_name?: string | null; supplemental_data_source_name?: string | null };
type ApiDataSource = {
  name?: string;
  display_name?: string;
  input?: string;
  primary_product_data_source?: { default_rule?: { take_from_data_sources?: TakeFrom[] } | null } | null;
  supplemental_product_data_source?: Record<string, unknown> | null;
};

/**
 * Find or create Autommerce's supplemental data source in the merchant's account,
 * and make sure every primary product source takes values from it first (keeping
 * the merchant's own order after it). Until something is written to it, it
 * changes nothing.
 */
export async function ensureSupplementalSource(row: ConnectionRow): Promise<string> {
  const merchantId = merchantOf(row);
  const parent = `accounts/${merchantId}`;
  const { items: sources } = await allPages<"data_sources", ApiDataSource>(row, "GOOGLE_MERCHANT_LIST_DATA_SOURCES", "data_sources", { parent_account_name: parent, page_size: 200 }, 5);
  let ours = sources.find((s) => s.supplemental_product_data_source && s.input === "API" && s.display_name === SUPPLEMENTAL_NAME)?.name;
  if (!ours) {
    const created = await execute<ApiDataSource>(row, "GOOGLE_MERCHANT_CREATE_DATA_SOURCE", {
      parent_account_name: parent,
      body: { display_name: SUPPLEMENTAL_NAME, supplemental_product_data_source: {} },
    });
    ours = created.name;
    if (!ours) throw new ConnectionHttpError(502, "google_request_failed", "Merchant Center didn't return the new data source.");
  }
  for (const source of sources) {
    const primary = source.primary_product_data_source;
    if (!primary || !source.name) continue;
    const rule = primary.default_rule?.take_from_data_sources?.length ? primary.default_rule.take_from_data_sources : [{ self: true }];
    if (rule.some((r) => r.supplemental_data_source_name === ours)) continue;
    const next = [{ supplemental_data_source_name: ours }, ...rule.map((r) => (r.self ? { self: true } : r.primary_data_source_name ? { primary_data_source_name: r.primary_data_source_name } : { supplemental_data_source_name: r.supplemental_data_source_name }))];
    await execute(row, "GOOGLE_MERCHANT_UPDATE_DATA_SOURCE", {
      data_source_name: source.name,
      update_mask: "primaryProductDataSource.defaultRule",
      body: { name: source.name, display_name: source.display_name, primary_product_data_source: { default_rule: { take_from_data_sources: next } } },
    });
  }
  return ours;
}

async function writeOverride(row: ConnectionRow, dataSource: string, w: { productId: string; offerId: string; contentLanguage: string; feedLabel: string; attributes: MerchantAttributes | null }) {
  const merchantId = merchantOf(row);
  if (w.attributes && Object.keys(w.attributes).length) {
    await execute(row, "GOOGLE_MERCHANT_UPSERT_PRODUCT_INPUT", {
      parent_account_name: `accounts/${merchantId}`,
      data_source: dataSource,
      body: { offer_id: w.offerId, content_language: w.contentLanguage, feed_label: w.feedLabel, product_attributes: toApiAttributes(w.attributes) },
    });
    return;
  }
  try {
    await execute(row, "GOOGLE_MERCHANT_DELETE_PRODUCT_INPUT", { data_source: dataSource, product_input_name: `accounts/${merchantId}/productInputs/${w.productId}` });
  } catch (err) {
    // Already gone from our source: that is the state undo wants.
    if (!(err instanceof ConnectionHttpError && /NOT_FOUND|not found|404/i.test(err.detail ?? ""))) throw err;
  }
}

// ─── Applying a fix ─────────────────────────────────────────────────────────

export type MerchantChangeInput = { clientChangeId: string; title: string; source: "AGENT" | "USER"; ops: MerchantOp[] };
export type MerchantChangeResult = { status: "applied"; id: string; inverse: MerchantOp[]; warnings: string[] } | { status: "failed"; id: string; error: string };

type ChangeRow = { id: string; status: string; inverse: MerchantOp[] | null; error: string | null; warnings: string[] | null; title: string };
const CHANGE_COLUMNS = "id, status, inverse, error, warnings, title";

async function finish(admin: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await admin.from("google_ads_changes").update(patch).eq("id", id);
  if (error) throw new ConnectionHttpError(500, "save_failed");
}

async function loadOverrides(admin: SupabaseClient, workspaceId: string, merchantId: string, productIds: string[]) {
  const { data, error } = await admin
    .from("merchant_product_overrides")
    .select("product_id, attributes")
    .eq("workspace_id", workspaceId)
    .eq("merchant_id", merchantId)
    .in("product_id", productIds);
  if (error) throw new ConnectionHttpError(500, "load_failed");
  return new Map((data ?? []).map((r) => [String(r.product_id), r.attributes as MerchantAttributes]));
}

/** Check a fix without writing anything: the card shows exactly this. */
export async function previewMerchantChange(admin: SupabaseClient, row: ConnectionRow, ops: MerchantOp[]) {
  const merchantId = merchantOf(row);
  const snapshot = await loadMerchantSnapshot(row, { force: true });
  const products = new Map(snapshot.products.map((p) => [p.id, p]));
  const overrides = await loadOverrides(admin, row.workspace_id, merchantId, ops.map((o) => o.productId));
  return planMerchantChange(ops, products, overrides);
}

/**
 * Apply a fix, or undo an earlier one (`undoOf`: the server uses its own stored
 * inverse, never ops from the caller). Returns the stored result.
 */
export async function applyMerchantChange(opts: {
  admin: SupabaseClient;
  row: ConnectionRow;
  userId: string;
  input: MerchantChangeInput | { clientChangeId: string; undoOf: string };
}): Promise<MerchantChangeResult> {
  const { admin, row, userId, input } = opts;
  const merchantId = merchantOf(row);

  const { data: existing } = await admin
    .from("google_ads_changes")
    .select(CHANGE_COLUMNS)
    .eq("workspace_id", row.workspace_id)
    .eq("client_change_id", input.clientChangeId)
    .maybeSingle<ChangeRow>();
  if (existing) return asResult(existing);

  let ops: MerchantOp[];
  let title: string;
  let source: string;
  let undoOf: string | null = null;
  if ("undoOf" in input) {
    const { data: original } = await admin
      .from("google_ads_changes")
      .update({ undone_at: new Date().toISOString() })
      .eq("id", input.undoOf)
      .eq("workspace_id", row.workspace_id)
      .eq("customer_id", merchantId)
      .eq("target", "merchant")
      .eq("status", "applied")
      .is("undone_at", null)
      .select(CHANGE_COLUMNS)
      .maybeSingle<ChangeRow>();
    if (!original?.inverse?.length) throw new ConnectionHttpError(409, "cannot_undo");
    ops = original.inverse;
    title = `Undo: ${original.title}`.slice(0, 300);
    source = "UNDO";
    undoOf = original.id;
  } else {
    ops = input.ops;
    title = input.title;
    source = input.source;
  }

  const { data: claimed, error: claimError } = await admin
    .from("google_ads_changes")
    .insert({
      workspace_id: row.workspace_id,
      customer_id: merchantId,
      target: "merchant",
      client_change_id: input.clientChangeId,
      title,
      source,
      status: "applying",
      ops,
      undo_of: undoOf,
      actor_id: userId,
    })
    .select("id")
    .single<{ id: string }>();
  if (claimError || !claimed) {
    if (undoOf) await admin.from("google_ads_changes").update({ undone_at: null }).eq("id", undoOf);
    const { data: other } = await admin.from("google_ads_changes").select(CHANGE_COLUMNS).eq("workspace_id", row.workspace_id).eq("client_change_id", input.clientChangeId).maybeSingle<ChangeRow>();
    if (other) return asResult(other);
    throw new ConnectionHttpError(500, "save_failed");
  }

  const fail = async (error: string): Promise<MerchantChangeResult> => {
    await finish(admin, claimed.id, { status: "failed", error });
    if (undoOf) await admin.from("google_ads_changes").update({ undone_at: null }).eq("id", undoOf);
    return { status: "failed", id: claimed.id, error };
  };

  const written: string[] = [];
  let inverse: MerchantOp[] = [];
  try {
    const plan = await previewMerchantChange(admin, row, ops);
    inverse = plan.inverse;
    await finish(admin, claimed.id, { google_operations: plan.writes, warnings: plan.warnings });
    const dataSource = await ensureSupplementalSource(row);
    for (const w of plan.writes) {
      await writeOverride(row, dataSource, w);
      written.push(w.productId);
      const saved = w.attributes
        ? await admin.from("merchant_product_overrides").upsert({ workspace_id: row.workspace_id, merchant_id: merchantId, product_id: w.productId, attributes: w.attributes, updated_at: new Date().toISOString() })
        : await admin.from("merchant_product_overrides").delete().eq("workspace_id", row.workspace_id).eq("merchant_id", merchantId).eq("product_id", w.productId);
      if (saved.error) throw new ConnectionHttpError(500, "save_failed");
    }
    await finish(admin, claimed.id, { status: "applied", inverse: plan.inverse });
    forgetMerchant(row.workspace_id);
    return { status: "applied", id: claimed.id, inverse: plan.inverse, warnings: plan.warnings };
  } catch (err) {
    if (err instanceof MerchantPlanError) return fail(err.message);
    const reason = err instanceof ConnectionHttpError && err.message === "google_request_failed" ? googleMessage(err.detail).replace("Google Ads", "Merchant Center") : "The rest couldn't be sent.";
    if (written.length) {
      // Products already written stay written: record them as applied, so they can be undone.
      const done = inverse.filter((op) => written.includes(op.productId));
      const warning = `Only ${written.length} of ${ops.length} products were updated (${written.join(", ")}). ${reason}`;
      await finish(admin, claimed.id, { status: "applied", inverse: done, warnings: [warning] });
      forgetMerchant(row.workspace_id);
      return { status: "applied", id: claimed.id, inverse: done, warnings: [warning] };
    }
    if (err instanceof ConnectionHttpError && err.message === "google_request_failed") return fail(reason);
    await fail("The change couldn't be completed. Nothing was changed; refresh to check.").catch(() => undefined);
    throw err;
  }
}

function asResult(r: ChangeRow): MerchantChangeResult {
  if (r.status === "applied") return { status: "applied", id: r.id, inverse: r.inverse ?? [], warnings: r.warnings ?? [] };
  if (r.status === "failed") return { status: "failed", id: r.id, error: r.error ?? "The change failed." };
  return { status: "failed", id: r.id, error: "This change is still being applied. Refresh in a moment." };
}
