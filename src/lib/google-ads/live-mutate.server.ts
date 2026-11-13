// Applies an approved change to a workspace's Google Ads account. Order matters:
// claim the change id (no double send) → read Google's current state → plan →
// validate_only → apply → record result and inverse. Any failure stops the chain
// and is recorded; nothing is retried automatically.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ConnectionHttpError, batchMutate, searchGaql, type ConnectionRow } from "./connection.server";
import { forgetLiveAccount } from "./live-report.server";
import { forgetReports } from "./live-reports.server";
import { loadProfile } from "../business-profile.server";
import { LivePlanError, inverseForCreated, planLiveChange, resultNames, toMicros, type BeforeState, type SpendState } from "./live-mutate";
import type { GaqlRow } from "./live-report";
import { emptyCreateState, imageUrls, type CreateState } from "./live-create";
import { fetchImages } from "./image-fetch.server";
import { ExperimentPlanError, isExperimentOp, planExperiment } from "./live-experiment";
import { runExperiment } from "./live-experiment.server";
import { todayIn } from "./metrics";
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
  // A linked account Google can't reach: almost always a Merchant Center link that isn't active.
  const missing = /RESOURCE_NOT_FOUND[\s\S]{0,200}?"int64Value"\s*:\s*"(\d{6,15})"/.exec(detail);
  if (missing) return `Google can't reach account ${missing[1]} from this ad account. If it is your Merchant Center, the link isn't active yet: accept it in Merchant Center (Settings → Linked accounts), then try again.`;
  const messages = [...detail.matchAll(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]!.replace(/\\"/g, '"'));
  const specific = messages.filter((m) => !/invalid argument|request contains/i.test(m));
  const pick = [...new Set(specific.length ? specific : messages)].slice(0, 3).join(" ");
  return pick || "Google Ads refused the change.";
}

const status = (v: unknown): EntityStatus => (v === "PAUSED" ? "PAUSED" : v === "REMOVED" ? "REMOVED" : "ENABLED");
const micros = (v: unknown) => (v == null || v === "" || Number(v) === 0 ? undefined : Number(v) / 1_000_000);
const inList = (ids: Iterable<string>) => [...ids].filter((id) => ID.test(id)).join(", ");

/** The account's budgets, when a monthly cap is set and these ops could spend more; otherwise nothing to check. */
async function loadSpend(admin: SupabaseClient, row: ConnectionRow, customerId: string, ops: MutateOp[]): Promise<SpendState | "no-cap" | undefined> {
  if (!ops.some((op) => op.kind === "budget.update" || op.kind === "campaign.new" || (op.kind === "status.set" && op.entity === "CAMPAIGN" && op.status === "ENABLED"))) return undefined;
  const monthlyCap = (await loadProfile(admin, row.workspace_id)).values.monthlyBudgetCap;
  if (typeof monthlyCap !== "number" || monthlyCap <= 0) return "no-cap";
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
  const assetGroups = new Set<string>();
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
    else if ("campaignId" in op && typeof op.campaignId === "string") campaigns.add(op.campaignId);
    if (op.kind === "ad.new") adGroups.add(op.adGroupId);
    if ((op.kind === "asset.new" || op.kind === "audience.add") && op.parentId) (op.level === "CAMPAIGN" ? campaigns : op.level === "AD_GROUP" ? adGroups : new Set<string>()).add(String(op.parentId));
    if ((op.kind === "negativeList.new" || op.kind === "label.new") && Array.isArray(op.campaignIds)) op.campaignIds.forEach((id) => campaigns.add(String(id)));
    if (op.kind === "assetGroupAsset.add" || op.kind === "searchTheme.add") assetGroups.add(op.assetGroupId);
    if (op.kind === "assetGroupAsset.remove") op.ids.forEach((id) => assetGroups.add(String(id).split("~")[0] ?? ""));
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
             , campaign.advertising_channel_type, campaign.shopping_setting.merchant_id, campaign.targeting_setting.target_restrictions
           FROM campaign WHERE campaign.id IN (${campaignIds})`)
      : none,
    budgetIds ? q(`SELECT campaign_budget.id, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign_budget WHERE campaign_budget.id IN (${budgetIds})`) : none,
    adGroupIds
      ? q(`SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id, campaign.advertising_channel_type, ad_group.cpc_bid_micros, ad_group.target_cpa_micros, ad_group.targeting_setting.target_restrictions FROM ad_group WHERE ad_group.id IN (${adGroupIds})`)
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
    ...(spend === "no-cap" ? { capMissing: true } : spend ? { spend } : {}),
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
  if (ops.some((op) => !["status.set", "budget.update", "campaign.update", "adGroup.update", "keyword.create", "keyword.update", "negative.create", "negative.remove"].includes(op.kind)))
    before.create = await loadCreateState(row, customerId, ops, { campaignRows: cRows, adGroupRows: gRows, assetGroupIds: inList(assetGroups), created: (created.data ?? []).flatMap((r) => (Array.isArray(r.created_ids) ? (r.created_ids as string[]) : [])) });
  return before;
}

/** What creating things needs to know: campaign types, asset groups, targeting, images, what this app created. */
async function loadCreateState(
  row: ConnectionRow,
  customerId: string,
  ops: MutateOp[],
  given: { campaignRows: GaqlRow[]; adGroupRows: GaqlRow[]; assetGroupIds: string; created: string[] }
): Promise<CreateState> {
  const state = emptyCreateState();
  const q = (query: string) => searchGaql<GaqlRow>(row, customerId, query);
  const targetingCampaigns = inList(ops.flatMap((op) => (op.kind === "targeting.remove" || op.kind === "device.set" ? [op.campaignId] : [])));
  const [groups, links, criteria, downloaded] = await Promise.all([
    given.assetGroupIds ? q(`SELECT asset_group.id, asset_group.name, asset_group.campaign FROM asset_group WHERE asset_group.id IN (${given.assetGroupIds})`) : Promise.resolve([] as GaqlRow[]),
    given.assetGroupIds
      ? q(`SELECT asset_group.id, asset.id, asset_group_asset.field_type, asset.text_asset.text FROM asset_group_asset WHERE asset_group_asset.status != 'REMOVED' AND asset_group.id IN (${given.assetGroupIds})`)
      : Promise.resolve([] as GaqlRow[]),
    targetingCampaigns
      ? q(`SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.type, campaign_criterion.negative, campaign_criterion.bid_modifier,
             campaign_criterion.location.geo_target_constant, campaign_criterion.language.language_constant, campaign_criterion.device.type,
             campaign_criterion.ad_schedule.day_of_week, campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.end_hour
           FROM campaign_criterion WHERE campaign_criterion.type IN ('LOCATION', 'LANGUAGE', 'AD_SCHEDULE', 'DEVICE') AND campaign.id IN (${targetingCampaigns})`)
      : Promise.resolve([] as GaqlRow[]),
    fetchImages(imageUrls(ops)),
  ]);
  state.images = downloaded.images;
  if (ops.some((op) => op.kind === "campaign.new" && op.merchantId !== undefined)) {
    const links = await q("SELECT product_link.merchant_center.merchant_center_id FROM product_link").catch(() => null);
    state.merchantLinks = links ? links.map((r) => String(r.productLink?.merchantCenter?.merchantCenterId ?? "")).filter(Boolean) : null;
  }
  for (const r of given.campaignRows) {
    const id = String(r.campaign?.id);
    state.campaignTypes[id] = String(r.campaign?.advertisingChannelType ?? "");
    if (r.campaign?.shoppingSetting?.merchantId) state.retailCampaigns.add(id);
    state.restrictions[`CAMPAIGN:${id}`] = r.campaign?.targetingSetting?.targetRestrictions ?? [];
  }
  for (const r of given.adGroupRows) {
    if (r.campaign?.id) state.campaignTypes[String(r.campaign.id)] ??= String(r.campaign?.advertisingChannelType ?? "");
    state.restrictions[`AD_GROUP:${r.adGroup?.id}`] = r.adGroup?.targetingSetting?.targetRestrictions ?? [];
  }
  for (const r of groups) state.assetGroups[String(r.assetGroup?.id)] = { name: String(r.assetGroup?.name ?? ""), campaignId: String(r.assetGroup?.campaign ?? "").split("/").pop() ?? "" };
  for (const r of links) state.assetGroupAssets[`${r.assetGroup?.id}~${r.asset?.id}~${r.assetGroupAsset?.fieldType}`] = { text: r.asset?.textAsset?.text };
  for (const r of criteria) {
    const c = r.campaignCriterion ?? {};
    const s = c.adSchedule;
    state.targeting[`${r.campaign?.id}~${c.criterionId}`] = {
      type: String(c.type ?? ""),
      negative: !!c.negative,
      ...(c.bidModifier != null ? { bidModifier: Number(c.bidModifier) } : {}),
      ...(c.location?.geoTargetConstant ? { geoId: String(c.location.geoTargetConstant).split("/").pop() } : {}),
      ...(c.language?.languageConstant ? { languageId: String(c.language.languageConstant).split("/").pop() } : {}),
      ...(c.device?.type ? { device: String(c.device.type) } : {}),
      ...(s ? { slot: { day: String(s.dayOfWeek), startHour: Number(s.startHour ?? 0), endHour: Number(s.endHour ?? 24), ...(c.bidModifier != null && Number(c.bidModifier) !== 1 ? { bidModifier: Math.round((Number(c.bidModifier) - 1) * 100) / 100 } : {}) } } : {}),
    };
  }
  state.createdResources = new Set(given.created.filter((r) => r.startsWith(`customers/${customerId}/`)));
  state.names = await targetNames(row, customerId, ops, state);
  return state;
}

/** Names of the locations, languages and audience lists a change uses, for its card. Ids stay when Google doesn't answer. */
async function targetNames(row: ConnectionRow, customerId: string, ops: MutateOp[], state: CreateState): Promise<Record<string, string>> {
  const geo = new Set<string>();
  const languages = new Set<string>();
  const lists = new Set<string>();
  const add = (set: Set<string>, values: unknown) => (Array.isArray(values) ? values : []).forEach((v) => ID.test(String(v)) && set.add(String(v)));
  for (const op of ops) {
    if (op.kind === "campaign.new") {
      add(geo, op.locations);
      add(geo, op.excludedLocations);
      add(languages, op.languages);
    } else if (op.kind === "location.add") add(geo, op.geoIds);
    else if (op.kind === "language.add") add(languages, op.languageIds);
    else if (op.kind === "audience.add") add(lists, op.userListIds);
  }
  for (const t of Object.values(state.targeting)) {
    if (t.geoId) geo.add(t.geoId);
    if (t.languageId) languages.add(t.languageId);
  }
  const names: Record<string, string> = {};
  const read = async (query: string, put: (r: GaqlRow) => void) => {
    try {
      (await searchGaql<GaqlRow>(row, customerId, query, 2)).forEach(put);
    } catch {
      // The card shows ids instead.
    }
  };
  await Promise.all([
    geo.size
      ? read(`SELECT geo_target_constant.id, geo_target_constant.canonical_name FROM geo_target_constant WHERE geo_target_constant.id IN (${[...geo].slice(0, 300).join(", ")})`, (r) => {
          names[`location:${r.geoTargetConstant?.id}`] = String(r.geoTargetConstant?.canonicalName ?? "");
        })
      : null,
    languages.size
      ? read(`SELECT language_constant.id, language_constant.name FROM language_constant WHERE language_constant.id IN (${[...languages].join(", ")})`, (r) => {
          names[`language:${r.languageConstant?.id}`] = String(r.languageConstant?.name ?? "");
        })
      : null,
    lists.size
      ? read(`SELECT user_list.id, user_list.name FROM user_list WHERE user_list.id IN (${[...lists].join(", ")})`, (r) => {
          names[`list:${r.userList?.id}`] = String(r.userList?.name ?? "");
        })
      : null,
  ]);
  return names;
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
    if (ops.some(isExperimentOp)) {
      // Google's experiment steps, in order; a failed step removes what the earlier ones made.
      let experiment;
      try {
        experiment = planExperiment(ops, before, before.create?.campaignTypes ?? {}, todayIn(row.account_time_zone), (n) => toMicros(n, before.billableUnitMicros));
      } catch (err) {
        if (err instanceof ExperimentPlanError) throw new LivePlanError(err.message);
        throw err;
      }
      const ran = await runExperiment(row, customerId, experiment);
      await finish(admin, claimed.id, { status: "applied", inverse: ran.inverse, created_ids: ran.created });
      forgetLiveAccount(row.workspace_id);
      forgetReports(row.workspace_id);
      return { status: "applied", id: claimed.id, inverse: ran.inverse as MutateOp[], warnings: [] };
    }
    const plan = planLiveChange(customerId, ops, before, { undo: !!undoOf });
    await finish(admin, claimed.id, { google_operations: plan.operations, warnings: plan.warnings });
    await batchMutate(row, customerId, plan.operations, { validateOnly: true });
    const response = await batchMutate(row, customerId, plan.operations, { validateOnly: false });
    const created = inverseForCreated(plan.created, resultNames(response));
    const inverse = [...created.inverse, ...plan.inverse];
    // Keyword ids, and the full names of everything else this change created: only those may be removed by an undo.
    await finish(admin, claimed.id, { status: "applied", inverse, created_ids: [...created.keywordIds, ...created.resources] });
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
