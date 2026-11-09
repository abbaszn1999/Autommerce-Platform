// Applies an approved change to a workspace's Google Ads account. Order matters:
// claim the change id (no double send) → read Google's current state → plan →
// validate_only → apply → record result and inverse. Any failure stops the chain
// and is recorded; nothing is retried automatically.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ConnectionHttpError, batchMutate, searchGaql, type ConnectionRow } from "./connection.server";
import { forgetLiveAccount } from "./live-report.server";
import { forgetReports } from "./live-reports.server";
import { loadProfile } from "../business-profile.server";
import { LivePlanError, inverseForCreated, planLiveChange, resultNames, type BeforeState, type SpendState } from "./live-mutate";
import type { GaqlRow } from "./live-report";
import type { EntityStatus, MatchType, MutateOp } from "./types";

export type LiveChangeInput = {
  clientChangeId: string;
  title: string;
  source: "AGENT" | "USER" | "RECOMMENDATION";
  ops: MutateOp[];
};

export type LiveChangeResult =
  | { status: "applied"; id: string; inverse: MutateOp[]; warnings: string[] }
  | { status: "failed"; id: string; error: string };

type ChangeRow = { id: string; status: string; inverse: MutateOp[] | null; error: string | null; warnings: string[] | null; undone_at: string | null; title: string; customer_id: string };

const ID = /^\d{1,20}$/;
const PAIR = /^\d{1,20}~\d{1,20}$/;

/** Google's own words from a failed request, without the generic wrapper text. */
export function googleMessage(detail: string | undefined): string {
  if (!detail) return "Google Ads refused the change.";
  const messages = [...detail.matchAll(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]!.replace(/\\"/g, '"'));
  const specific = messages.filter((m) => !/invalid argument|request contains/i.test(m));
  const pick = [...new Set(specific.length ? specific : messages)].slice(0, 3).join(" ");
  return pick || "Google Ads refused the change.";
}

const status = (v: unknown): EntityStatus => (v === "PAUSED" ? "PAUSED" : v === "REMOVED" ? "REMOVED" : "ENABLED");
const micros = (v: unknown) => (v == null || v === "" || Number(v) === 0 ? undefined : Number(v) / 1_000_000);
const inList = (ids: Iterable<string>) => [...ids].filter((id) => ID.test(id)).join(", ");

/** The account's budgets, when a monthly cap is set and these ops could spend more; otherwise nothing to check. */
async function loadSpend(admin: SupabaseClient, row: ConnectionRow, customerId: string, ops: MutateOp[]): Promise<SpendState | undefined> {
  if (!ops.some((op) => op.kind === "budget.update" || (op.kind === "status.set" && op.entity === "CAMPAIGN" && op.status === "ENABLED"))) return undefined;
  const monthlyCap = (await loadProfile(admin, row.workspace_id)).values.monthlyBudgetCap;
  if (typeof monthlyCap !== "number" || monthlyCap <= 0) return undefined;
  const rows = await searchGaql<GaqlRow>(row, customerId, "SELECT campaign.id, campaign.status, campaign_budget.id, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'");
  const spend: SpendState = { monthlyCap, budgets: {}, campaigns: {} };
  for (const r of rows) {
    const budgetId = String(r.campaignBudget?.id ?? "");
    if (!budgetId) continue;
    spend.budgets[budgetId] = Number(r.campaignBudget?.amountMicros ?? 0) / 1_000_000;
    spend.campaigns[String(r.campaign?.id)] = { budgetId, enabled: r.campaign?.status === "ENABLED" };
  }
  return spend;
}

/** Read, from Google, the current state of everything a change touches. */
export async function fetchBefore(admin: SupabaseClient, row: ConnectionRow, customerId: string, ops: MutateOp[]): Promise<BeforeState> {
  const campaigns = new Set<string>();
  const budgets = new Set<string>();
  const adGroups = new Set<string>();
  const parentOf = (pair: string) => (PAIR.test(pair) ? pair.split("~")[0]! : "");
  for (const op of ops) {
    if (op.kind === "status.set") {
      for (const id of op.ids) {
        if (op.entity === "CAMPAIGN") campaigns.add(id);
        else if (op.entity === "AD_GROUP") adGroups.add(id);
        else if (op.entity === "AD" || op.entity === "KEYWORD") adGroups.add(parentOf(id));
      }
    } else if (op.kind === "budget.update") budgets.add(op.budgetId);
    else if (op.kind === "campaign.update") campaigns.add(op.campaignId);
    else if (op.kind === "adGroup.update") adGroups.add(op.adGroupId);
    else if (op.kind === "keyword.create") op.keywords.forEach((k) => adGroups.add(k.adGroupId));
    else if (op.kind === "keyword.update") adGroups.add(parentOf(op.keywordId));
    else if (op.kind === "negative.create") op.negatives.forEach((n) => (n.level === "CAMPAIGN" ? campaigns : adGroups).add(n.parentId));
    else if (op.kind === "negative.remove")
      op.ids.forEach((id) => {
        // A negative's parent may be an ad group or a campaign: look in both.
        campaigns.add(parentOf(id));
        adGroups.add(parentOf(id));
      });
  }

  const currency = /^[A-Z]{3}$/.test(row.account_currency ?? "") ? row.account_currency! : "USD";
  const q = (query: string) => searchGaql<GaqlRow>(row, customerId, query);
  const none = Promise.resolve([] as GaqlRow[]);
  const campaignIds = inList(campaigns);
  const budgetIds = inList(budgets);
  const adGroupIds = inList(adGroups);
  // Campaigns that use a budget being changed: their names go on the card, and a budget shared by several shows so.
  const budgetNames = [...budgets].filter((id) => ID.test(id)).map((id) => `'customers/${customerId}/campaignBudgets/${id}'`);
  const budgetCampaigns = budgetNames.length
    ? q(`SELECT campaign.id, campaign.name, campaign.status, campaign.campaign_budget, campaign.bidding_strategy_type FROM campaign WHERE campaign.campaign_budget IN (${budgetNames.join(", ")}) AND campaign.status != 'REMOVED'`)
    : none;
  const [unit, cRows, bRows, gRows, kRows, aRows, nRows, created, bcRows, spend] = await Promise.all([
    q(`SELECT currency_constant.billable_unit_micros FROM currency_constant WHERE currency_constant.code = '${currency}'`),
    campaignIds
      ? q(`SELECT campaign.id, campaign.name, campaign.status, campaign.campaign_budget, campaign.bidding_strategy_type, campaign.target_cpa.target_cpa_micros,
             campaign.maximize_conversions.target_cpa_micros, campaign.target_roas.target_roas, campaign.maximize_conversion_value.target_roas
           FROM campaign WHERE campaign.id IN (${campaignIds})`)
      : none,
    budgetIds ? q(`SELECT campaign_budget.id, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign_budget WHERE campaign_budget.id IN (${budgetIds})`) : none,
    adGroupIds
      ? q(`SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id, ad_group.cpc_bid_micros, ad_group.target_cpa_micros FROM ad_group WHERE ad_group.id IN (${adGroupIds})`)
      : none,
    adGroupIds
      ? q(`SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.negative,
             ad_group_criterion.status, ad_group_criterion.cpc_bid_micros, ad_group_criterion.final_urls
           FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED' AND ad_group.id IN (${adGroupIds})`)
      : none,
    adGroupIds ? q(`SELECT ad_group.id, ad_group_ad.ad.id, ad_group_ad.status FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED' AND ad_group.id IN (${adGroupIds})`) : none,
    campaignIds
      ? q(`SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion
           WHERE campaign_criterion.type = 'KEYWORD' AND campaign_criterion.negative = TRUE AND campaign.id IN (${campaignIds})`)
      : none,
    admin.from("google_ads_changes").select("created_ids").eq("workspace_id", row.workspace_id).eq("customer_id", customerId).eq("status", "applied"),
    budgetCampaigns,
    loadSpend(admin, row, customerId, ops),
  ]);

  const before: BeforeState = {
    billableUnitMicros: Number(unit[0]?.currencyConstant?.billableUnitMicros) || 10_000,
    campaigns: {},
    budgets: {},
    adGroups: {},
    criteria: {},
    ads: {},
    campaignNegatives: {},
    createdKeywordIds: new Set((created.data ?? []).flatMap((r) => (Array.isArray(r.created_ids) ? (r.created_ids as string[]) : []))),
    ...(spend ? { spend } : {}),
  };
  if (created.error) throw new ConnectionHttpError(500, "load_failed");
  for (const r of [...bcRows, ...cRows]) {
    const c = r.campaign ?? {};
    before.campaigns[String(c.id)] = {
      name: String(c.name ?? ""),
      status: status(c.status),
      budgetId: String(c.campaignBudget ?? "").split("/").pop() ?? "",
      biddingType: String(c.biddingStrategyType ?? ""),
      targetCpa: micros(c.targetCpa?.targetCpaMicros ?? c.maximizeConversions?.targetCpaMicros),
      targetRoas: c.targetRoas?.targetRoas ?? c.maximizeConversionValue?.targetRoas ?? undefined,
    };
  }
  for (const r of bRows) {
    const b = r.campaignBudget ?? {};
    before.budgets[String(b.id)] = { amount: Number(b.amountMicros ?? 0) / 1_000_000, shared: !!b.explicitlyShared };
  }
  for (const r of gRows) {
    const g = r.adGroup ?? {};
    before.adGroups[String(g.id)] = { name: String(g.name ?? ""), status: status(g.status), campaignId: String(r.campaign?.id ?? ""), cpcBid: micros(g.cpcBidMicros), targetCpa: micros(g.targetCpaMicros) };
  }
  for (const r of kRows) {
    const k = r.adGroupCriterion ?? {};
    before.criteria[`${r.adGroup?.id}~${k.criterionId}`] = {
      text: String(k.keyword?.text ?? ""),
      matchType: String(k.keyword?.matchType ?? "") as MatchType,
      negative: !!k.negative,
      status: status(k.status),
      cpcBid: micros(k.cpcBidMicros),
      finalUrl: Array.isArray(k.finalUrls) ? k.finalUrls[0] : undefined,
    };
  }
  for (const r of aRows) before.ads[`${r.adGroup?.id}~${r.adGroupAd?.ad?.id}`] = { status: status(r.adGroupAd?.status) };
  for (const r of nRows) {
    const k = r.campaignCriterion ?? {};
    before.campaignNegatives[`${r.campaign?.id}~${k.criterionId}`] = { text: String(k.keyword?.text ?? ""), matchType: String(k.keyword?.matchType ?? "") as MatchType };
  }
  return before;
}

async function finish(admin: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await admin.from("google_ads_changes").update(patch).eq("id", id);
  if (error) throw new ConnectionHttpError(500, "save_failed");
}

/**
 * Apply a change, or undo an earlier one (`undoOf`: the server uses its own stored
 * inverse, never ops from the browser). Returns the stored result.
 */
export async function applyLiveChange(opts: {
  admin: SupabaseClient;
  row: ConnectionRow;
  userId: string;
  input: LiveChangeInput | { clientChangeId: string; undoOf: string };
}): Promise<LiveChangeResult> {
  const { admin, row, userId, input } = opts;
  const customerId = row.account_id;
  if (row.kind !== "ads" || !customerId || !row.composio_connected_account_id) throw new ConnectionHttpError(409, "not_connected");

  // Same change id again (double click, retry): return what happened the first time.
  const { data: existing } = await admin
    .from("google_ads_changes")
    .select("id, status, inverse, error, warnings, undone_at, title, customer_id")
    .eq("workspace_id", row.workspace_id)
    .eq("client_change_id", input.clientChangeId)
    .maybeSingle<ChangeRow>();
  // An undo that failed can be tried again, under the same id: the failed attempt stays in the history.
  if (existing && "undoOf" in input && existing.status === "failed") await admin.from("google_ads_changes").update({ client_change_id: `${input.clientChangeId}:failed:${existing.id}` }).eq("id", existing.id);
  else if (existing) return asResult(existing);

  let ops: MutateOp[];
  let title: string;
  let source: string;
  let undoOf: string | null = null;
  if ("undoOf" in input) {
    // Claim the original atomically so two undo clicks can't both run.
    const { data: original } = await admin
      .from("google_ads_changes")
      .update({ undone_at: new Date().toISOString() })
      .eq("id", input.undoOf)
      .eq("workspace_id", row.workspace_id)
      .eq("customer_id", customerId)
      .eq("status", "applied")
      .is("undone_at", null)
      .select("id, status, inverse, error, warnings, undone_at, title, customer_id")
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
    .insert({ workspace_id: row.workspace_id, customer_id: customerId, client_change_id: input.clientChangeId, title, source, status: "applying", ops, undo_of: undoOf, actor_id: userId })
    .select("id")
    .single<{ id: string }>();
  if (claimError || !claimed) {
    if (undoOf) await admin.from("google_ads_changes").update({ undone_at: null }).eq("id", undoOf);
    // Lost a race with the same id: report the other request's result.
    const { data: other } = await admin
      .from("google_ads_changes")
      .select("id, status, inverse, error, warnings, undone_at, title, customer_id")
      .eq("workspace_id", row.workspace_id)
      .eq("client_change_id", input.clientChangeId)
      .maybeSingle<ChangeRow>();
    if (other) return asResult(other);
    throw new ConnectionHttpError(500, "save_failed");
  }

  const fail = async (error: string): Promise<LiveChangeResult> => {
    await finish(admin, claimed.id, { status: "failed", error });
    if (undoOf) await admin.from("google_ads_changes").update({ undone_at: null }).eq("id", undoOf);
    return { status: "failed", id: claimed.id, error };
  };

  try {
    const before = await fetchBefore(admin, row, customerId, ops);
    const plan = planLiveChange(customerId, ops, before, { undo: !!undoOf });
    await finish(admin, claimed.id, { google_operations: plan.operations, warnings: plan.warnings });
    await batchMutate(row, customerId, plan.operations, { validateOnly: true });
    const response = await batchMutate(row, customerId, plan.operations, { validateOnly: false });
    const created = inverseForCreated(plan.created, resultNames(response));
    const inverse = [...created.inverse, ...plan.inverse];
    await finish(admin, claimed.id, { status: "applied", inverse, created_ids: created.keywordIds });
    forgetLiveAccount(row.workspace_id);
    forgetReports(row.workspace_id);
    return { status: "applied", id: claimed.id, inverse, warnings: plan.warnings };
  } catch (err) {
    if (err instanceof LivePlanError) return fail(err.message);
    if (err instanceof ConnectionHttpError && err.message === "google_request_failed") return fail(googleMessage(err.detail));
    await fail("The change couldn't be completed. Nothing was changed if Google didn't confirm it; refresh to check.").catch(() => undefined);
    throw err;
  }
}

function asResult(r: ChangeRow): LiveChangeResult {
  if (r.status === "applied") return { status: "applied", id: r.id, inverse: r.inverse ?? [], warnings: r.warnings ?? [] };
  if (r.status === "failed") return { status: "failed", id: r.id, error: r.error ?? "The change failed." };
  return { status: "failed", id: r.id, error: "This change is still being applied. Refresh in a moment." };
}
