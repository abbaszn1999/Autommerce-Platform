// The Google Ads agent's expert reports: each one names the GAQL it needs and turns
// Google's rows into findings the agent can act on (checks, tiers, verdicts), so
// the model reasons over computed facts instead of raw rows. Pure: no network.
//
// The decision rules follow common senior-PPC practice (conversion hygiene first,
// enough data before Smart Bidding targets, product tiers against target cost per
// sale, recommendation tests on the account's own numbers). Thresholds are starting
// heuristics and are labelled as such in the output.

import type { GaqlRow } from "./live-report";

export const REPORTS = ["conversions", "shopping_pmax", "products", "recommendations", "reach"] as const;
export type ReportName = (typeof REPORTS)[number];
export const isReportName = (v: unknown): v is ReportName => typeof v === "string" && (REPORTS as readonly string[]).includes(v);

export const REPORT_DAYS = [7, 14, 30, 90] as const;
export type ReportDays = (typeof REPORT_DAYS)[number];

export type Severity = "high" | "medium" | "low" | "info";
export type Finding = { severity: Severity; check: string; detail: string; entity?: string };

/**
 * The queries each check reads. A check whose data Google didn't return would
 * report an absence that isn't real ("tracking is not set up"), so it is dropped.
 */
const CHECK_NEEDS: Record<string, string[]> = {
  "Conversion tracking": ["settings"],
  "Primary conversion": ["actions"],
  "Purchase tracking": ["actions", "campaigns"],
  "Double counting": ["actions"],
  Counting: ["actions"],
  "Purchase value": ["actions"],
  "No recent data": ["actions", "byAction"],
  Attribution: ["actions"],
  "Micro conversion as primary": ["actions"],
  "Bidding volume": ["campaigns", "campaignPerf"],
  "Bidding without signal": ["campaigns", "campaignPerf"],
  "Missing assets": ["assetGroups", "assetGroupAssets"],
  "Ad strength": ["assetGroups", "assetGroupAssets"],
  Signals: ["assetGroups", "signals"],
  "Catch-all": ["assetGroups", "listingGroups"],
  Overlap: ["listingGroups"],
  "Custom labels": ["listingGroups"],
  "Thin asset group": ["assetGroups", "assetGroupPerf"],
  "Spend concentration": ["assetGroups", "assetGroupPerf"],
  "Shopping vs PMax": ["campaigns"],
  "Not eligible": ["catalog"],
  "Eligible but barely shown": ["catalog", "performance"],
  "Products spending without sales": ["performance"],
  "Auto-apply": ["autoApply"],
  Assets: ["campaignAssets", "accountAssets"],
  Device: ["devices"],
  "Location option": ["locations"],
  Locations: ["locations", "geo"],
};

/** Drops checks built on data Google didn't return and says what couldn't be read. */
export function withoutUnreadChecks(findings: Finding[], unavailable: Record<string, string>): Finding[] {
  const failed = Object.keys(unavailable).filter((k) => !k.startsWith("pmaxSearch:"));
  if (!failed.length) return findings;
  const kept = findings.filter((f) => !(CHECK_NEEDS[f.check] ?? []).some((q) => failed.includes(q)));
  return [
    { severity: "high", check: "Incomplete data", detail: `Google Ads didn't return: ${failed.join(", ")}. Checks that depend on it were skipped; don't read their absence as "nothing wrong" or as "not set up".` },
    ...kept,
  ];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => Math.round(n * 1000) / 10;
const micros = (v: unknown) => (v == null || v === "" ? 0 : Number(v) / 1_000_000);
const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);
const str = (v: unknown) => (v == null ? "" : String(v));
const lastId = (resource: unknown) => str(resource).split("/").pop() ?? "";
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

// ─── Dates ──────────────────────────────────────────────────────────────────

/** GAQL date condition for the last N complete days (Google's presets where they exist). */
export function during(days: ReportDays, today = new Date()): string {
  if (days === 7) return "segments.date DURING LAST_7_DAYS";
  if (days === 14) return "segments.date DURING LAST_14_DAYS";
  if (days === 30) return "segments.date DURING LAST_30_DAYS";
  const day = (offset: number) => new Date(today.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
  return `segments.date BETWEEN '${day(days)}' AND '${day(1)}'`;
}

// ─── Queries ────────────────────────────────────────────────────────────────

const CAMPAIGNS = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type,
  campaign.target_cpa.target_cpa_micros, campaign.target_roas.target_roas, campaign.maximize_conversions.target_cpa_micros,
  campaign.maximize_conversion_value.target_roas, campaign.shopping_setting.merchant_id, campaign.shopping_setting.campaign_priority,
  campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'`;

const campaignPerf = (when: string) =>
  `SELECT campaign.id, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value, metrics.all_conversions,
   metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share
   FROM campaign WHERE campaign.status != 'REMOVED' AND ${when}`;

/** Queries per report. `pmaxSearch` is run once per Performance Max campaign (Google allows one campaign per query). */
export function reportQueries(report: ReportName, days: ReportDays, today = new Date()): Record<string, string> {
  const when = during(days, today);
  switch (report) {
    case "conversions":
      return {
        campaigns: CAMPAIGNS,
        campaignPerf: campaignPerf(when),
        settings: `SELECT customer.conversion_tracking_setting.conversion_tracking_status, customer.conversion_tracking_setting.accepted_customer_data_terms,
          customer.conversion_tracking_setting.google_ads_conversion_customer FROM customer`,
        actions: `SELECT conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.type, conversion_action.category,
          conversion_action.origin, conversion_action.primary_for_goal, conversion_action.counting_type, conversion_action.include_in_conversions_metric,
          conversion_action.attribution_model_settings.attribution_model, conversion_action.click_through_lookback_window_days,
          conversion_action.view_through_lookback_window_days, conversion_action.value_settings.default_value,
          conversion_action.value_settings.always_use_default_value FROM conversion_action WHERE conversion_action.status != 'REMOVED'`,
        byAction: `SELECT segments.conversion_action, segments.conversion_action_name, metrics.all_conversions, metrics.all_conversions_value,
          metrics.conversions, metrics.conversions_value FROM customer WHERE ${when}`,
        byCampaignAction: `SELECT campaign.id, segments.conversion_action, metrics.conversions, metrics.conversions_value, metrics.all_conversions
          FROM campaign WHERE ${when} AND metrics.all_conversions > 0`,
      };
    case "shopping_pmax":
      return {
        campaigns: CAMPAIGNS,
        campaignPerf: campaignPerf(when),
        assetGroups: `SELECT asset_group.id, asset_group.name, asset_group.status, asset_group.primary_status, asset_group.primary_status_reasons,
          asset_group.ad_strength, asset_group.final_urls, campaign.id FROM asset_group WHERE asset_group.status != 'REMOVED'`,
        assetGroupPerf: `SELECT asset_group.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
          FROM asset_group WHERE asset_group.status != 'REMOVED' AND ${when}`,
        assetGroupAssets: `SELECT asset_group.id, asset_group_asset.field_type, asset_group_asset.status FROM asset_group_asset WHERE asset_group_asset.status != 'REMOVED'`,
        listingGroups: `SELECT asset_group.id, asset_group_listing_group_filter.id, asset_group_listing_group_filter.type,
          asset_group_listing_group_filter.parent_listing_group_filter, asset_group_listing_group_filter.case_value.product_brand.value,
          asset_group_listing_group_filter.case_value.product_type.value, asset_group_listing_group_filter.case_value.product_item_id.value,
          asset_group_listing_group_filter.case_value.product_custom_attribute.index, asset_group_listing_group_filter.case_value.product_custom_attribute.value
          FROM asset_group_listing_group_filter`,
        signals: `SELECT asset_group.id, asset_group_signal.audience.audience, asset_group_signal.search_theme.text FROM asset_group_signal`,
        pmaxSearch: `SELECT campaign_search_term_insight.category_label, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
          FROM campaign_search_term_insight WHERE ${when} AND campaign_search_term_insight.campaign_id = '{campaignId}' ORDER BY metrics.impressions DESC LIMIT 50`,
      };
    case "products":
      return {
        campaigns: CAMPAIGNS,
        performance: `SELECT segments.product_item_id, segments.product_title, segments.product_brand, segments.product_type_l1, campaign.id,
          metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
          FROM shopping_performance_view WHERE ${when} ORDER BY metrics.cost_micros DESC LIMIT 5000`,
        catalog: `SELECT shopping_product.item_id, shopping_product.title, shopping_product.status, shopping_product.availability, shopping_product.issues,
          shopping_product.brand, shopping_product.product_type_level1, shopping_product.price_micros FROM shopping_product LIMIT 5000`,
      };
    case "recommendations":
      return {
        campaigns: CAMPAIGNS,
        campaignPerf: campaignPerf(during(30, today)),
        recommendations: `SELECT recommendation.resource_name, recommendation.type, recommendation.campaign, recommendation.impact,
          recommendation.campaign_budget_recommendation, recommendation.forecasting_campaign_budget_recommendation,
          recommendation.marginal_roi_campaign_budget_recommendation, recommendation.move_unused_budget_recommendation,
          recommendation.raise_budget_performance_too_low_recommendation, recommendation.keyword_recommendation,
          recommendation.use_broad_match_keyword_recommendation, recommendation.target_cpa_opt_in_recommendation,
          recommendation.target_roas_opt_in_recommendation, recommendation.set_target_cpa_recommendation, recommendation.set_target_roas_recommendation,
          recommendation.maximize_conversions_opt_in_recommendation, recommendation.maximize_conversion_value_opt_in_recommendation,
          recommendation.maximize_clicks_opt_in_recommendation, recommendation.raise_target_cpa_recommendation, recommendation.lower_target_roas_recommendation
          FROM recommendation WHERE recommendation.dismissed = FALSE`,
        autoApply: `SELECT recommendation_subscription.type, recommendation_subscription.status FROM recommendation_subscription`,
      };
    case "reach":
      return {
        campaigns: CAMPAIGNS,
        devices: `SELECT campaign.id, segments.device, metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.conversions_value
          FROM campaign WHERE campaign.status != 'REMOVED' AND ${when}`,
        geo: `SELECT geographic_view.country_criterion_id, geographic_view.location_type, metrics.cost_micros, metrics.clicks, metrics.conversions,
          metrics.conversions_value FROM geographic_view WHERE ${when}`,
        locations: `SELECT campaign.id, campaign_criterion.negative, campaign_criterion.location.geo_target_constant, campaign_criterion.proximity.radius,
          campaign_criterion.type FROM campaign_criterion WHERE campaign_criterion.type IN ('LOCATION', 'PROXIMITY') AND campaign.status != 'REMOVED'`,
        audiences: `SELECT campaign.id, ad_group.id, ad_group_criterion.type, ad_group_criterion.display_name, metrics.cost_micros, metrics.conversions,
          metrics.conversions_value FROM ad_group_audience_view WHERE ${when}`,
        campaignAssets: `SELECT campaign.id, campaign.status, campaign_asset.field_type FROM campaign_asset WHERE campaign_asset.status = 'ENABLED' AND campaign.status != 'REMOVED'`,
        accountAssets: `SELECT customer_asset.field_type FROM customer_asset WHERE customer_asset.status = 'ENABLED'`,
        changes: `SELECT change_event.change_date_time, change_event.change_resource_type, change_event.resource_change_operation, change_event.client_type,
          change_event.user_email, campaign.id FROM change_event WHERE change_event.change_date_time >= '{since}' AND change_event.change_date_time <= '{until}'
          ORDER BY change_event.change_date_time DESC LIMIT 200`,
      };
  }
}

// ─── Shared: campaigns ──────────────────────────────────────────────────────

export type CampaignFacts = {
  id: string;
  name: string;
  status: string;
  type: string;
  bidding: string;
  targetCpa?: number;
  targetRoas?: number;
  dailyBudget?: number;
  merchantId?: string;
  cost: number;
  clicks: number;
  impressions: number;
  conversions: number;
  value: number;
  allConversions: number;
  impressionShare?: number;
  lostToBudget?: number;
  lostToRank?: number;
};

const share = (v: unknown) => (v == null || v === "" ? undefined : pct(num(v)));

export function campaignFacts(campaigns: GaqlRow[], perf: GaqlRow[] = []): Map<string, CampaignFacts> {
  const out = new Map<string, CampaignFacts>();
  for (const r of campaigns) {
    const c = r.campaign ?? {};
    const id = str(c.id);
    if (!id) continue;
    const tcpa = micros(c.targetCpa?.targetCpaMicros) || micros(c.maximizeConversions?.targetCpaMicros);
    const troas = num(c.targetRoas?.targetRoas) || num(c.maximizeConversionValue?.targetRoas);
    out.set(id, {
      id,
      name: str(c.name),
      status: str(c.status),
      type: str(c.advertisingChannelType),
      bidding: str(c.biddingStrategyType),
      targetCpa: tcpa || undefined,
      targetRoas: troas || undefined,
      dailyBudget: r.campaignBudget?.amountMicros != null ? r2(micros(r.campaignBudget.amountMicros)) : undefined,
      merchantId: c.shoppingSetting?.merchantId ? str(c.shoppingSetting.merchantId) : undefined,
      cost: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      value: 0,
      allConversions: 0,
    });
  }
  for (const r of perf) {
    const f = out.get(str(r.campaign?.id));
    if (!f) continue;
    const m = r.metrics ?? {};
    f.cost += micros(m.costMicros);
    f.clicks += num(m.clicks);
    f.impressions += num(m.impressions);
    f.conversions += num(m.conversions);
    f.value += num(m.conversionsValue);
    f.allConversions += num(m.allConversions);
    f.impressionShare ??= share(m.searchImpressionShare);
    f.lostToBudget ??= share(m.searchBudgetLostImpressionShare);
    f.lostToRank ??= share(m.searchRankLostImpressionShare);
  }
  return out;
}

const SMART_CPA = new Set(["TARGET_CPA", "MAXIMIZE_CONVERSIONS"]);
const SMART_VALUE = new Set(["TARGET_ROAS", "MAXIMIZE_CONVERSION_VALUE"]);

const campaignOut = (f: CampaignFacts) => ({
  id: f.id,
  name: f.name,
  status: f.status,
  type: f.type,
  bidding: f.bidding,
  targetCpa: f.targetCpa ?? null,
  targetRoas: f.targetRoas ?? null,
  dailyBudget: f.dailyBudget ?? null,
  cost: r2(f.cost),
  conversions: r2(f.conversions),
  value: r2(f.value),
  cpa: f.conversions > 0 ? r2(f.cost / f.conversions) : null,
  roas: f.cost > 0 ? r2(f.value / f.cost) : null,
  lostToBudgetPercent: f.lostToBudget ?? null,
  lostToRankPercent: f.lostToRank ?? null,
});

// ─── Conversions ────────────────────────────────────────────────────────────

/** Actions that count a sale; anything else marked primary on a store is a proxy. */
const SALE = new Set(["PURCHASE", "STORE_SALE"]);
const MICRO = new Set(["PAGE_VIEW", "ADD_TO_CART", "BEGIN_CHECKOUT", "ENGAGEMENT", "DEFAULT", "STORE_VISIT", "GET_DIRECTIONS", "OUTBOUND_CLICK"]);

export function conversionsReport(rows: Record<string, GaqlRow[]>, days: number) {
  const facts = campaignFacts(rows.campaigns ?? [], rows.campaignPerf ?? []);
  const setting = rows.settings?.[0]?.customer?.conversionTrackingSetting ?? {};
  const byAction = new Map<string, { conversions: number; value: number; all: number; allValue: number }>();
  for (const r of rows.byAction ?? []) {
    const id = lastId(r.segments?.conversionAction);
    const m = r.metrics ?? {};
    const prev = byAction.get(id) ?? { conversions: 0, value: 0, all: 0, allValue: 0 };
    byAction.set(id, {
      conversions: prev.conversions + num(m.conversions),
      value: prev.value + num(m.conversionsValue),
      all: prev.all + num(m.allConversions),
      allValue: prev.allValue + num(m.allConversionsValue),
    });
  }
  const actions = (rows.actions ?? []).map((r) => {
    const a = r.conversionAction ?? {};
    const id = str(a.id);
    const stats = byAction.get(id) ?? { conversions: 0, value: 0, all: 0, allValue: 0 };
    return {
      id,
      name: str(a.name),
      status: str(a.status),
      type: str(a.type),
      category: str(a.category),
      origin: str(a.origin),
      primary: a.primaryForGoal === true,
      includedInConversions: a.includeInConversionsMetric === true,
      counting: str(a.countingType),
      attribution: str(a.attributionModelSettings?.attributionModel),
      clickWindowDays: num(a.clickThroughLookbackWindowDays) || null,
      viewWindowDays: num(a.viewThroughLookbackWindowDays) || null,
      defaultValue: num(a.valueSettings?.defaultValue),
      alwaysDefaultValue: a.valueSettings?.alwaysUseDefaultValue === true,
      conversions: r2(stats.conversions),
      value: r2(stats.value),
      allConversions: r2(stats.all),
      allValue: r2(stats.allValue),
    };
  });

  const findings: Finding[] = [];
  const enabled = actions.filter((a) => a.status === "ENABLED");
  const primary = enabled.filter((a) => a.primary && a.includedInConversions);
  const sales = primary.filter((a) => SALE.has(a.category));
  const tracking = str(setting.conversionTrackingStatus);
  if (!tracking || tracking === "NOT_CONVERSION_TRACKED")
    findings.push({ severity: "high", check: "Conversion tracking", detail: "Conversion tracking is not set up on this account, so Smart Bidding and every CPA/ROAS figure are blind." });
  if (!primary.length)
    findings.push({ severity: "high", check: "Primary conversion", detail: "No enabled conversion action counts in the Conversions column. Bidding has nothing to optimise for." });
  const hasRetail = [...facts.values()].some((f) => f.type === "SHOPPING" || (f.type === "PERFORMANCE_MAX" && f.merchantId));
  if (hasRetail && !sales.length)
    findings.push({ severity: "high", check: "Purchase tracking", detail: "Shopping/retail campaigns exist but no primary Purchase action counts in Conversions: the store optimises for something other than sales." });
  if (sales.length > 1)
    findings.push({
      severity: "high",
      check: "Double counting",
      detail: `${sales.length} primary purchase actions count in Conversions (${sales.map((a) => `"${a.name}" ${a.type}`).join(", ")}). If they track the same sale (for example a Google Ads tag and a GA4 import), each sale is counted twice and bidding overpays.`,
    });
  for (const a of sales) {
    if (a.counting === "ONE_PER_CLICK") findings.push({ severity: "medium", check: "Counting", entity: a.name, detail: `"${a.name}" counts one purchase per click; purchases should count every conversion.` });
    if (a.conversions > 0 && a.value === 0)
      findings.push({ severity: "high", check: "Purchase value", entity: a.name, detail: `"${a.name}" records purchases with no value, so ROAS and value-based bidding can't work. Send the order value with the tag.` });
    else if (a.alwaysDefaultValue) findings.push({ severity: "medium", check: "Purchase value", entity: a.name, detail: `"${a.name}" always uses a fixed default value instead of the real order value.` });
  }
  for (const a of primary)
    if (MICRO.has(a.category))
      findings.push({
        severity: "medium",
        check: "Micro conversion as primary",
        entity: a.name,
        detail: `"${a.name}" (${a.category}) is primary: bidding treats it like a result. Make it secondary unless purchase volume is too low and this proxy is deliberate.`,
      });
  for (const a of primary)
    if (a.allConversions === 0)
      findings.push({ severity: "medium", check: "No recent data", entity: a.name, detail: `"${a.name}" recorded nothing in the last ${days} days. Check the tag still fires.` });
  for (const a of enabled)
    if (a.attribution && !/DATA_DRIVEN/.test(a.attribution) && a.primary)
      findings.push({ severity: "low", check: "Attribution", entity: a.name, detail: `"${a.name}" uses ${a.attribution.replace(/_/g, " ").toLowerCase()} attribution; data-driven is Google's default and usually better for Smart Bidding.` });

  // Smart Bidding needs volume: about 30 conversions a month for target CPA, 50 for target ROAS (heuristics).
  const scale = 30 / days;
  for (const f of facts.values()) {
    if (f.status !== "ENABLED") continue;
    const monthly = f.conversions * scale;
    if (f.bidding === "TARGET_CPA" || (f.bidding === "MAXIMIZE_CONVERSIONS" && f.targetCpa)) {
      if (monthly < 30) findings.push({ severity: "medium", check: "Bidding volume", entity: f.name, detail: `"${f.name}" uses a CPA target with about ${Math.round(monthly)} conversions a month; targets work best from about 30.` });
    } else if (f.bidding === "TARGET_ROAS" || (f.bidding === "MAXIMIZE_CONVERSION_VALUE" && f.targetRoas)) {
      if (monthly < 50) findings.push({ severity: "medium", check: "Bidding volume", entity: f.name, detail: `"${f.name}" uses a ROAS target with about ${Math.round(monthly)} conversions a month; ROAS targets work best from about 50.` });
    }
    if ((SMART_VALUE.has(f.bidding) || SMART_CPA.has(f.bidding)) && f.cost > 0 && f.allConversions === 0)
      findings.push({ severity: "high", check: "Bidding without signal", entity: f.name, detail: `"${f.name}" uses Smart Bidding but recorded no conversions at all in ${days} days.` });
  }

  const perCampaign = new Map<string, Record<string, number>>();
  const actionName = new Map(actions.map((a) => [a.id, a.name]));
  for (const r of rows.byCampaignAction ?? []) {
    const cid = str(r.campaign?.id);
    const name = actionName.get(lastId(r.segments?.conversionAction)) ?? lastId(r.segments?.conversionAction);
    const entry = perCampaign.get(cid) ?? {};
    entry[name] = r2((entry[name] ?? 0) + num(r.metrics?.allConversions));
    perCampaign.set(cid, entry);
  }

  return {
    period: `last ${days} days`,
    tracking: { status: tracking || "UNKNOWN", acceptedCustomerDataTerms: setting.acceptedCustomerDataTerms === true },
    actions,
    campaigns: [...facts.values()].map((f) => ({ ...campaignOut(f), conversionsByAction: perCampaign.get(f.id) ?? {} })),
    findings: sortFindings(findings),
  };
}

// ─── Shopping and Performance Max ───────────────────────────────────────────

/** Minimums per asset group (Google's own minimums, and the counts that usually reach Good/Excellent). */
const ASSET_MIN: Record<string, { min: number; good: number; label: string }> = {
  HEADLINE: { min: 3, good: 5, label: "headlines" },
  LONG_HEADLINE: { min: 1, good: 3, label: "long headlines" },
  DESCRIPTION: { min: 2, good: 4, label: "descriptions" },
  MARKETING_IMAGE: { min: 1, good: 4, label: "landscape images" },
  SQUARE_MARKETING_IMAGE: { min: 1, good: 4, label: "square images" },
  LOGO: { min: 1, good: 1, label: "logos" },
  BUSINESS_NAME: { min: 1, good: 1, label: "business name" },
  YOUTUBE_VIDEO: { min: 0, good: 1, label: "videos" },
};

export function shoppingPmaxReport(rows: Record<string, GaqlRow[]>, days: number, searchByCampaign: Record<string, GaqlRow[]> = {}) {
  const facts = campaignFacts(rows.campaigns ?? [], rows.campaignPerf ?? []);
  const retail = [...facts.values()].filter((f) => f.type === "SHOPPING" || f.type === "PERFORMANCE_MAX");
  const findings: Finding[] = [];
  const scale = 30 / days;

  const perf = new Map<string, { cost: number; clicks: number; impressions: number; conversions: number; value: number }>();
  for (const r of rows.assetGroupPerf ?? []) {
    const id = str(r.assetGroup?.id);
    const m = r.metrics ?? {};
    const p = perf.get(id) ?? { cost: 0, clicks: 0, impressions: 0, conversions: 0, value: 0 };
    p.cost += micros(m.costMicros);
    p.clicks += num(m.clicks);
    p.impressions += num(m.impressions);
    p.conversions += num(m.conversions);
    p.value += num(m.conversionsValue);
    perf.set(id, p);
  }
  const assets = new Map<string, Record<string, number>>();
  for (const r of rows.assetGroupAssets ?? []) {
    const id = str(r.assetGroup?.id);
    const field = str(r.assetGroupAsset?.fieldType);
    const counts = assets.get(id) ?? {};
    counts[field] = (counts[field] ?? 0) + 1;
    assets.set(id, counts);
  }
  const signals = new Map<string, { audiences: number; searchThemes: string[] }>();
  for (const r of rows.signals ?? []) {
    const id = str(r.assetGroup?.id);
    const s = signals.get(id) ?? { audiences: 0, searchThemes: [] };
    if (r.assetGroupSignal?.audience?.audience) s.audiences++;
    if (r.assetGroupSignal?.searchTheme?.text) s.searchThemes.push(str(r.assetGroupSignal.searchTheme.text));
    signals.set(id, s);
  }
  const listing = new Map<string, { units: number; dimensions: Set<string>; itemIds: string[]; catchAll: boolean }>();
  for (const r of rows.listingGroups ?? []) {
    const id = str(r.assetGroup?.id);
    const f = r.assetGroupListingGroupFilter ?? {};
    const l = listing.get(id) ?? { units: 0, dimensions: new Set<string>(), itemIds: [], catchAll: false };
    const cv = f.caseValue ?? {};
    if (cv.productBrand) l.dimensions.add("brand");
    if (cv.productType) l.dimensions.add("product type");
    if (cv.productItemId?.value) {
      l.dimensions.add("item id");
      l.itemIds.push(str(cv.productItemId.value));
    }
    if (cv.productCustomAttribute) l.dimensions.add(`custom label ${num(cv.productCustomAttribute.index?.toString().replace(/\D/g, ""))}`);
    if (String(f.type).startsWith("UNIT")) l.units++;
    // A root that is itself a unit means "all products".
    if (!f.parentListingGroupFilter && String(f.type).startsWith("UNIT")) l.catchAll = true;
    listing.set(id, l);
  }

  const groups = (rows.assetGroups ?? []).map((r) => {
    const g = r.assetGroup ?? {};
    const id = str(g.id);
    const p = perf.get(id) ?? { cost: 0, clicks: 0, impressions: 0, conversions: 0, value: 0 };
    const counts = assets.get(id) ?? {};
    const missing = Object.entries(ASSET_MIN)
      .filter(([field, want]) => (counts[field] ?? 0) < want.min)
      .map(([, want]) => want.label);
    const thin = Object.entries(ASSET_MIN)
      .filter(([field, want]) => (counts[field] ?? 0) >= want.min && (counts[field] ?? 0) < want.good)
      .map(([field, want]) => `${want.label} ${counts[field] ?? 0}/${want.good}`);
    const l = listing.get(id);
    return {
      id,
      name: str(g.name),
      campaignId: str(r.campaign?.id),
      status: str(g.status),
      primaryStatus: str(g.primaryStatus),
      primaryStatusReasons: Array.isArray(g.primaryStatusReasons) ? g.primaryStatusReasons : [],
      adStrength: str(g.adStrength),
      finalUrls: Array.isArray(g.finalUrls) ? g.finalUrls.slice(0, 3) : [],
      cost: r2(p.cost),
      conversions: r2(p.conversions),
      value: r2(p.value),
      roas: p.cost > 0 ? r2(p.value / p.cost) : null,
      cpa: p.conversions > 0 ? r2(p.cost / p.conversions) : null,
      assetCounts: counts,
      missingAssets: missing,
      thinAssets: thin,
      audienceSignals: signals.get(id)?.audiences ?? 0,
      searchThemes: signals.get(id)?.searchThemes ?? [],
      listingGroups: l ? { units: l.units, splitBy: [...l.dimensions], allProducts: l.catchAll } : null,
    };
  });

  for (const c of retail.filter((f) => f.type === "PERFORMANCE_MAX")) {
    const own = groups.filter((g) => g.campaignId === c.id && g.status === "ENABLED");
    const spend = own.reduce((s, g) => s + g.cost, 0);
    for (const g of own) {
      if (g.missingAssets.length) findings.push({ severity: "high", check: "Missing assets", entity: g.name, detail: `Asset group "${g.name}" lacks ${g.missingAssets.join(", ")}; it can't serve in every channel.` });
      if (g.adStrength === "POOR" || g.adStrength === "AVERAGE")
        findings.push({ severity: "medium", check: "Ad strength", entity: g.name, detail: `Asset group "${g.name}" has ${g.adStrength.toLowerCase()} ad strength${g.thinAssets.length ? ` (${g.thinAssets.join(", ")})` : ""}.` });
      if (!g.audienceSignals && !g.searchThemes.length)
        findings.push({ severity: "low", check: "Signals", entity: g.name, detail: `Asset group "${g.name}" has no audience signal or search theme; first-party lists and themes speed up learning.` });
      if (c.merchantId && g.listingGroups?.allProducts && own.length > 1)
        findings.push({ severity: "medium", check: "Catch-all", entity: g.name, detail: `Asset group "${g.name}" targets all products while ${own.length - 1} other group(s) also serve products: they compete for the same items.` });
    }
    if (own.length > 1) {
      for (const g of own)
        if (g.conversions * scale < 10 && g.cost > 0)
          findings.push({ severity: "low", check: "Thin asset group", entity: g.name, detail: `Asset group "${g.name}" has about ${Math.round(g.conversions * scale)} conversions a month (under ~10): a consolidation candidate.` });
      const top = own.reduce((a, b) => (b.cost > a.cost ? b : a), own[0]!);
      if (spend > 0 && top.cost / spend >= 0.7)
        findings.push({ severity: "info", check: "Spend concentration", entity: top.name, detail: `"${top.name}" takes ${pct(top.cost / spend)}% of "${c.name}"'s asset group spend. Fine if its ROAS beats target; otherwise the other groups barely get budget.` });
    }
  }
  // Two PMax groups targeting the same item ids compete with each other.
  const owners = new Map<string, string[]>();
  for (const g of groups) for (const item of listing.get(g.id)?.itemIds ?? []) owners.set(item, [...(owners.get(item) ?? []), g.name]);
  const overlap = [...owners.entries()].filter(([, gs]) => gs.length > 1);
  if (overlap.length) findings.push({ severity: "medium", check: "Overlap", detail: `${overlap.length} product id(s) are targeted by more than one asset group, e.g. ${overlap.slice(0, 3).map(([id, gs]) => `${id} (${gs.join(", ")})`).join("; ")}.` });
  const usesLabels = groups.some((g) => g.listingGroups?.splitBy.some((d) => d.startsWith("custom label")));
  if (retail.some((c) => c.merchantId) && !usesLabels)
    findings.push({ severity: "low", check: "Custom labels", detail: "No product group or listing group splits on a custom label. Labels (margin, best sellers, price band) let you bid differently per product tier." });

  // Standard Shopping and PMax on the same feed: PMax wins the auction for shared products.
  const shopping = retail.filter((f) => f.type === "SHOPPING" && f.status === "ENABLED");
  const pmaxRetail = retail.filter((f) => f.type === "PERFORMANCE_MAX" && f.merchantId && f.status === "ENABLED");
  if (shopping.length && pmaxRetail.length)
    findings.push({ severity: "info", check: "Shopping vs PMax", detail: `${shopping.length} Standard Shopping and ${pmaxRetail.length} retail PMax campaign(s) run together. PMax takes priority for products both can show; check the products report for which side serves them.` });

  const searchCategories = Object.fromEntries(
    Object.entries(searchByCampaign).map(([cid, list]) => {
      const total = list.reduce((s, r) => s + num(r.metrics?.impressions), 0);
      return [
        cid,
        list.slice(0, 30).map((r) => ({
          category: str(r.campaignSearchTermInsight?.categoryLabel) || "(other)",
          impressions: num(r.metrics?.impressions),
          sharePercent: total ? pct(num(r.metrics?.impressions) / total) : 0,
          clicks: num(r.metrics?.clicks),
          conversions: r2(num(r.metrics?.conversions)),
          value: r2(num(r.metrics?.conversionsValue)),
        })),
      ];
    })
  );

  return {
    period: `last ${days} days`,
    campaigns: retail.map(campaignOut),
    assetGroups: groups,
    pmaxSearchCategories: searchCategories,
    notes: [
      "PMax search categories show impressions, clicks and conversions only; Google does not report cost per category.",
      "Brand terms in PMax categories are usually cheap conversions the brand Search campaign would get anyway: compare their share with the campaign's ROAS before trusting it.",
    ],
    findings: sortFindings(findings),
  };
}

// ─── Products (Shopping / retail PMax) ──────────────────────────────────────

export type ProductTier = "star" | "on_target" | "below_target" | "loser_exclude" | "loser_limit" | "too_early";

/**
 * Tier a product against the target cost per sale (value per sale ÷ target ROAS).
 * First matching rule wins; nothing is called a loser below 2× the target cost per sale.
 */
export function productTier(p: { cost: number; conversions: number; value: number }, targetRoas: number, costPerSaleTarget: number): ProductTier {
  const roas = ratio(p.value, p.cost);
  if (p.conversions === 0) {
    if (costPerSaleTarget > 0 && p.cost >= 3 * costPerSaleTarget) return "loser_exclude";
    if (costPerSaleTarget > 0 && p.cost >= 2 * costPerSaleTarget) return "loser_limit";
    return "too_early";
  }
  if (p.conversions >= 3 && roas >= 1.25 * targetRoas) return "star";
  if (roas >= targetRoas) return "on_target";
  if (costPerSaleTarget > 0 && p.cost >= 2 * costPerSaleTarget) return "below_target";
  return "too_early";
}

export function productsReport(rows: Record<string, GaqlRow[]>, days: number, opts: { targetRoas?: number } = {}) {
  const facts = campaignFacts(rows.campaigns ?? []);
  type P = { id: string; title: string; brand: string; type: string; campaigns: Set<string>; cost: number; clicks: number; impressions: number; conversions: number; value: number };
  const products = new Map<string, P>();
  for (const r of rows.performance ?? []) {
    const s = r.segments ?? {};
    const id = str(s.productItemId).toLowerCase();
    if (!id) continue;
    const m = r.metrics ?? {};
    const p = products.get(id) ?? { id, title: str(s.productTitle), brand: str(s.productBrand), type: str(s.productTypeL1), campaigns: new Set<string>(), cost: 0, clicks: 0, impressions: 0, conversions: 0, value: 0 };
    p.campaigns.add(facts.get(str(r.campaign?.id))?.name ?? str(r.campaign?.id));
    p.cost += micros(m.costMicros);
    p.clicks += num(m.clicks);
    p.impressions += num(m.impressions);
    p.conversions += num(m.conversions);
    p.value += num(m.conversionsValue);
    products.set(id, p);
  }
  const catalog = new Map<string, GaqlRow>();
  for (const r of rows.catalog ?? []) {
    const id = str(r.shoppingProduct?.itemId).toLowerCase();
    if (id) catalog.set(id, r.shoppingProduct);
  }

  const all = [...products.values()];
  const totals = all.reduce((s, p) => ({ cost: s.cost + p.cost, conversions: s.conversions + p.conversions, value: s.value + p.value }), { cost: 0, conversions: 0, value: 0 });
  const targetRoas = opts.targetRoas && opts.targetRoas > 0 ? opts.targetRoas : ratio(totals.value, totals.cost);
  const avgValuePerSale = ratio(totals.value, totals.conversions);
  const findings: Finding[] = [];

  const tiered = all.map((p) => {
    const price = micros(catalog.get(p.id)?.priceMicros);
    const valuePerSale = p.conversions > 0 ? p.value / p.conversions : price || avgValuePerSale;
    const costPerSaleTarget = targetRoas > 0 ? valuePerSale / targetRoas : 0;
    const tier = targetRoas > 0 ? productTier(p, targetRoas, costPerSaleTarget) : "too_early";
    return {
      itemId: p.id,
      title: p.title,
      brand: p.brand,
      productType: p.type,
      campaigns: [...p.campaigns],
      impressions: p.impressions,
      clicks: p.clicks,
      cost: r2(p.cost),
      conversions: r2(p.conversions),
      value: r2(p.value),
      roas: p.cost > 0 ? r2(p.value / p.cost) : null,
      costPerSaleTarget: r2(costPerSaleTarget),
      costVsTarget: costPerSaleTarget > 0 ? r2(p.cost / costPerSaleTarget) : null,
      tier,
    };
  });

  const byTier = (t: ProductTier) => tiered.filter((p) => p.tier === t);
  const spendOf = (list: typeof tiered) => r2(list.reduce((s, p) => s + p.cost, 0));
  const losers = [...byTier("loser_exclude"), ...byTier("loser_limit")].sort((a, b) => b.cost - a.cost);
  const loserShare = totals.cost > 0 ? spendOf(losers) / totals.cost : 0;
  if (losers.length)
    findings.push({
      severity: loserShare >= 0.1 ? "high" : loserShare >= 0.05 ? "medium" : "low",
      check: "Products spending without sales",
      detail: `${losers.length} product(s) spent ${spendOf(losers)} (${pct(loserShare)}% of product spend) with no sale and at least 2× their target cost per sale.`,
    });

  // Products that barely serve: why (feed) or not targeted / outbid (account).
  const served = new Set(tiered.filter((p) => p.impressions >= 10).map((p) => p.itemId));
  const notEligible: { itemId: string; title: string; reason: string }[] = [];
  const eligibleQuiet: { itemId: string; title: string; price: number }[] = [];
  for (const [id, sp] of catalog) {
    if (served.has(id)) continue;
    const status = str(sp.status);
    if (status === "NOT_ELIGIBLE" || sp.availability === "OUT_OF_STOCK") {
      const issues = Array.isArray(sp.issues) ? sp.issues.map((i: GaqlRow) => str(i.description || i.errorCode || i.type)).filter(Boolean) : [];
      notEligible.push({ itemId: id, title: str(sp.title), reason: sp.availability === "OUT_OF_STOCK" ? "out of stock" : issues.slice(0, 2).join("; ") || "not eligible" });
    } else eligibleQuiet.push({ itemId: id, title: str(sp.title), price: r2(micros(sp.priceMicros)) });
  }
  const catalogSize = catalog.size;
  if (catalogSize) {
    const ne = notEligible.length / catalogSize;
    const quiet = eligibleQuiet.length / catalogSize;
    if (ne >= 0.05) findings.push({ severity: ne >= 0.15 ? "high" : "medium", check: "Not eligible", detail: `${notEligible.length} of ${catalogSize} products (${pct(ne)}%) can't serve: feed or stock problems in Merchant Center.` });
    if (quiet >= 0.1)
      findings.push({
        severity: quiet >= 0.2 ? "high" : "medium",
        check: "Eligible but barely shown",
        detail: `${eligibleQuiet.length} eligible products (${pct(quiet)}%) got under 10 impressions: not in any campaign's product groups, or outbid (often priced above similar products).`,
      });
  }

  const summary = (t: ProductTier) => ({ products: byTier(t).length, cost: spendOf(byTier(t)) });
  return {
    period: `last ${days} days`,
    targetRoas: r2(targetRoas),
    targetSource: opts.targetRoas ? "given" : "account average ROAS of products (sorts against the average, not profitability)",
    totals: { products: tiered.length, cost: r2(totals.cost), conversions: r2(totals.conversions), value: r2(totals.value), roas: r2(ratio(totals.value, totals.cost)) },
    tiers: {
      star: summary("star"),
      on_target: summary("on_target"),
      below_target: summary("below_target"),
      loser_limit: summary("loser_limit"),
      loser_exclude: summary("loser_exclude"),
      too_early: summary("too_early"),
    },
    stars: byTier("star").sort((a, b) => b.value - a.value).slice(0, 25),
    losers: losers.slice(0, 50),
    belowTarget: byTier("below_target").sort((a, b) => b.cost - a.cost).slice(0, 25),
    barelyServing: { catalogProducts: catalogSize, notEligible: notEligible.length, eligibleButQuiet: eligibleQuiet.length, notEligibleSample: notEligible.slice(0, 20), quietSample: eligibleQuiet.slice(0, 20) },
    rules: "Tiers (first match): no sale & cost ≥3× target cost per sale → loser_exclude; ≥2× → loser_limit; else too_early. ≥3 sales & ROAS ≥1.25× target → star; ROAS ≥ target → on_target; cost ≥2× target cost per sale → below_target; else too_early. Target cost per sale = value per sale ÷ target ROAS.",
    findings: sortFindings(findings),
  };
}

// ─── Recommendations ────────────────────────────────────────────────────────

export type Verdict = "accept" | "adapt" | "dismiss" | "your_call";

const BUDGET_TYPES = new Set(["CAMPAIGN_BUDGET", "FORECASTING_CAMPAIGN_BUDGET", "MARGINAL_ROI_CAMPAIGN_BUDGET", "RAISE_BUDGET_PERFORMANCE_TOO_LOW", "MOVE_UNUSED_BUDGET"]);
const BID_OPT_IN = new Set(["TARGET_CPA_OPT_IN", "MAXIMIZE_CONVERSIONS_OPT_IN", "SET_TARGET_CPA", "FORECASTING_SET_TARGET_CPA"]);
const VALUE_OPT_IN = new Set(["TARGET_ROAS_OPT_IN", "MAXIMIZE_CONVERSION_VALUE_OPT_IN", "SET_TARGET_ROAS", "FORECASTING_SET_TARGET_ROAS"]);
const LOOSEN = new Set(["RAISE_TARGET_CPA", "RAISE_TARGET_CPA_BID_TOO_LOW", "RAISE_TARGET_CPA_PERFORMANCE_BID_TOO_LOW", "LOWER_TARGET_ROAS", "LOWER_TARGET_ROAS_PERFORMANCE_BID_TOO_LOW"]);
const REACH = new Set(["SEARCH_PARTNERS_OPT_IN", "DISPLAY_EXPANSION_OPT_IN", "CUSTOM_AUDIENCE_OPT_IN"]);
const ASSETS = /SITELINK|CALLOUT|CALL_ASSET|STRUCTURED_SNIPPET|IMAGE_ASSET|LEAD_FORM|RESPONSIVE_SEARCH_AD|AD_STRENGTH|DISPLAY_ASSET|PRICE_ASSET|PROMOTION_ASSET|TEXT_AD/;
const MEASUREMENT = /GOOGLE_TAG|CONVERSION|ENHANCED_CONVERSIONS|CUSTOMER_MATCH|UPGRADE_LOCAL/;
/** Auto-apply types that never change spend, bids, keywords, targeting or ad text. */
const SAFE_AUTO_APPLY = new Set(["OPTIMIZE_AD_ROTATION"]);

type Impact = { cost: number; conversions: number; value: number };
const impactOf = (m: GaqlRow | undefined): Impact => ({ cost: micros(m?.costMicros), conversions: num(m?.conversions), value: num(m?.conversionsValue) });

export function judgeRecommendation(
  type: string,
  c: CampaignFacts | undefined,
  impact: { base: Impact; potential: Impact },
  ctx: { accountCpa: number; accountRoas: number; valueBased: boolean; days: number }
): { verdict: Verdict; reasons: string[] } {
  const monthly = c ? c.conversions * (30 / ctx.days) : 0;
  const cpa = c && c.conversions > 0 ? c.cost / c.conversions : 0;
  const roas = c && c.cost > 0 ? c.value / c.cost : 0;
  const targetCpa = c?.targetCpa ?? ctx.accountCpa;
  const targetRoas = c?.targetRoas ?? ctx.accountRoas;
  const valueBased = c ? SMART_VALUE.has(c.bidding) || (!SMART_CPA.has(c.bidding) && ctx.valueBased) : ctx.valueBased;
  const onTarget = valueBased ? targetRoas > 0 && roas >= targetRoas : targetCpa > 0 && cpa > 0 && cpa <= targetCpa;
  const reasons: string[] = [];

  if (BUDGET_TYPES.has(type)) {
    const lost = c?.lostToBudget ?? 0;
    const extraCost = impact.potential.cost - impact.base.cost;
    const extraConv = impact.potential.conversions - impact.base.conversions;
    const extraValue = impact.potential.value - impact.base.value;
    const nextCost = extraConv > 0 ? extraCost / extraConv : Infinity;
    const nextRoas = extraCost > 0 ? extraValue / extraCost : 0;
    reasons.push(valueBased ? `ROAS ${r2(roas)} vs target ${r2(targetRoas)}` : `CPA ${r2(cpa)} vs target ${r2(targetCpa)}`);
    reasons.push(`impression share lost to budget ${lost}%`);
    reasons.push(valueBased ? `ROAS of the extra spend (Google's estimate) ${r2(nextRoas)}` : `cost of each extra conversion (Google's estimate) ${Number.isFinite(nextCost) ? r2(nextCost) : "n/a"}`);
    const marginalOk = valueBased ? nextRoas >= targetRoas : nextCost <= targetCpa;
    const marginalNear = valueBased ? nextRoas >= targetRoas / 1.5 : nextCost <= 1.5 * targetCpa;
    if (onTarget && lost >= 10 && marginalOk) return { verdict: "accept", reasons };
    if (onTarget && lost >= 10 && marginalNear) return { verdict: "adapt", reasons: [...reasons, "take half the suggested increase and recheck after 14 days"] };
    return { verdict: "dismiss", reasons };
  }
  if (BID_OPT_IN.has(type) || VALUE_OPT_IN.has(type)) {
    const need = VALUE_OPT_IN.has(type) ? 50 : 30;
    reasons.push(`about ${Math.round(monthly)} conversions a month (needs ~${need})`);
    if (monthly < need) return { verdict: "dismiss", reasons };
    return { verdict: "adapt", reasons: [...reasons, "start the target at the last 30 days' actual CPA/ROAS, not tighter, then step it"] };
  }
  if (LOOSEN.has(type)) {
    reasons.push("loosening the target buys volume at a worse CPA/ROAS");
    return { verdict: onTarget ? "your_call" : "dismiss", reasons };
  }
  if (type === "USE_BROAD_MATCH_KEYWORD" || type === "KEYWORD_MATCH_TYPE") {
    const smart = !!c && (SMART_CPA.has(c.bidding) || SMART_VALUE.has(c.bidding));
    reasons.push(`smart bidding ${smart ? "yes" : "no"}, ${Math.round(monthly)} conversions/month, ${onTarget ? "on" : "off"} target, lost to budget ${c?.lostToBudget ?? 0}%`);
    return { verdict: smart && monthly >= 30 && onTarget && (c?.lostToBudget ?? 0) < 10 ? "accept" : "dismiss", reasons };
  }
  if (type === "KEYWORD") return { verdict: "your_call", reasons: ["check each keyword: sold by this ad group, not already in the account, no word matches a negative"] };
  if (REACH.has(type)) {
    if ((c?.lostToBudget ?? 0) >= 10) return { verdict: "dismiss", reasons: ["the campaign already runs out of budget"] };
    if (!onTarget) return { verdict: "dismiss", reasons: ["the campaign is off target"] };
    return { verdict: "adapt", reasons: ["test for 30 days on this campaign only; keep it if the new network meets target"] };
  }
  if (type === "MAXIMIZE_CLICKS_OPT_IN" || type === "ENHANCED_CPC_OPT_IN") return { verdict: "dismiss", reasons: ["a store with conversion tracking should bid on conversions, not clicks"] };
  if (ASSETS.test(type)) return { verdict: "accept", reasons: ["assets rarely cost money; write them from the store's own pages and facts, not Google's wording"] };
  if (MEASUREMENT.test(type)) return { verdict: "accept", reasons: ["no spend change, and better data makes every other decision safer"] };
  return { verdict: "your_call", reasons: ["changes control or reporting more than numbers; explain the trade-off"] };
}

export function recommendationsReport(rows: Record<string, GaqlRow[]>) {
  const days = 30;
  const facts = campaignFacts(rows.campaigns ?? [], rows.campaignPerf ?? []);
  const all = [...facts.values()];
  const cost = all.reduce((s, f) => s + f.cost, 0);
  const conv = all.reduce((s, f) => s + f.conversions, 0);
  const value = all.reduce((s, f) => s + f.value, 0);
  const ctx = { accountCpa: ratio(cost, conv), accountRoas: ratio(value, cost), valueBased: value > 0, days };

  const items = (rows.recommendations ?? []).map((r) => {
    const rec = r.recommendation ?? {};
    const type = str(rec.type);
    const campaignId = lastId(rec.campaign);
    const c = facts.get(campaignId);
    const impact = { base: impactOf(rec.impact?.baseMetrics), potential: impactOf(rec.impact?.potentialMetrics) };
    const detail: Record<string, unknown> = {};
    const budget = rec.campaignBudgetRecommendation ?? rec.forecastingCampaignBudgetRecommendation ?? rec.marginalRoiCampaignBudgetRecommendation ?? rec.raiseBudgetPerformanceTooLowRecommendation;
    if (budget) {
      detail.currentBudget = r2(micros(budget.currentBudgetAmountMicros));
      detail.recommendedBudget = r2(micros(budget.recommendedBudgetAmountMicros ?? budget.budgetOptions?.[0]?.budgetAmountMicros));
    }
    if (rec.keywordRecommendation?.keyword) detail.keyword = { text: str(rec.keywordRecommendation.keyword.text), matchType: str(rec.keywordRecommendation.keyword.matchType) };
    const target = rec.targetCpaOptInRecommendation ?? rec.setTargetCpaRecommendation ?? rec.raiseTargetCpaRecommendation;
    if (target) detail.recommendedTargetCpa = r2(micros(target.recommendedTargetCpaMicros ?? target.options?.[0]?.targetCpaMicros ?? target.targetCpaMicros));
    const troas = rec.targetRoasOptInRecommendation ?? rec.setTargetRoasRecommendation ?? rec.lowerTargetRoasRecommendation;
    if (troas) detail.recommendedTargetRoas = r2(num(troas.recommendedTargetRoas ?? troas.targetRoas));
    const judged = judgeRecommendation(type, c, impact, ctx);
    return {
      type,
      campaign: c ? { id: c.id, name: c.name, bidding: c.bidding } : campaignId ? { id: campaignId } : null,
      detail,
      impact: {
        cost: { now: r2(impact.base.cost), after: r2(impact.potential.cost) },
        conversions: { now: r2(impact.base.conversions), after: r2(impact.potential.conversions) },
        value: { now: r2(impact.base.value), after: r2(impact.potential.value) },
      },
      verdict: judged.verdict,
      reasons: judged.reasons,
    };
  });

  const findings: Finding[] = [];
  const autoApply = (rows.autoApply ?? []).filter((r) => r.recommendationSubscription?.status === "ENABLED").map((r) => str(r.recommendationSubscription?.type));
  const risky = autoApply.filter((t) => !SAFE_AUTO_APPLY.has(t));
  if (risky.length)
    findings.push({ severity: "high", check: "Auto-apply", detail: `Google auto-applies ${risky.length} recommendation type(s) that change spend, bids, keywords, targeting or ad text: ${risky.join(", ")}. Turn these off in Google Ads (Recommendations → Auto-apply).` });

  return {
    period: "last 30 days",
    account: { cpa: r2(ctx.accountCpa), roas: r2(ctx.accountRoas) },
    recommendations: items,
    autoApplyEnabled: autoApply,
    rules:
      "Budget: accept only if on target, ≥10% impression share lost to budget and Google's cost per extra conversion is within target; adapt (half) if within 1.5×. CPA targets need ~30 conversions/month, ROAS ~50. Broad match only with Smart Bidding, ≥30 conversions, on target, <10% lost to budget. Never change bidding or match types on the same campaign twice within 14 days.",
    howToAct: "Apply an accepted or adapted recommendation with ads_change (budget.update, campaign.update, keyword.create…). Dismissing is done in Google Ads itself.",
    findings: sortFindings(findings),
  };
}

// ─── Reach: devices, locations, audiences, assets, recent changes ───────────

const CAMPAIGN_ASSETS: Record<string, { min: number; label: string }> = {
  SITELINK: { min: 4, label: "sitelinks" },
  CALLOUT: { min: 4, label: "callouts" },
  STRUCTURED_SNIPPET: { min: 1, label: "structured snippets" },
  AD_IMAGE: { min: 1, label: "images" },
};

export function reachReport(rows: Record<string, GaqlRow[]>, days: number, geoNames: Record<string, string> = {}) {
  const facts = campaignFacts(rows.campaigns ?? []);
  const findings: Finding[] = [];

  const devices = new Map<string, { cost: number; clicks: number; conversions: number; value: number }>();
  for (const r of rows.devices ?? []) {
    const d = str(r.segments?.device);
    const m = r.metrics ?? {};
    const x = devices.get(d) ?? { cost: 0, clicks: 0, conversions: 0, value: 0 };
    x.cost += micros(m.costMicros);
    x.clicks += num(m.clicks);
    x.conversions += num(m.conversions);
    x.value += num(m.conversionsValue);
    devices.set(d, x);
  }
  const deviceRows = [...devices.entries()].map(([device, x]) => ({ device, cost: r2(x.cost), clicks: x.clicks, conversions: r2(x.conversions), value: r2(x.value), cpa: x.conversions > 0 ? r2(x.cost / x.conversions) : null, roas: x.cost > 0 ? r2(x.value / x.cost) : null }));
  const totalCost = deviceRows.reduce((s, d) => s + d.cost, 0);
  const totalConv = deviceRows.reduce((s, d) => s + d.conversions, 0);
  const avgCpa = ratio(totalCost, totalConv);
  for (const d of deviceRows)
    if (avgCpa > 0 && d.cost >= 2 * avgCpa && (d.conversions === 0 || (d.cpa ?? 0) > 2 * avgCpa))
      findings.push({ severity: "medium", check: "Device", entity: d.device, detail: `${d.device.toLowerCase()} spent ${d.cost} for ${d.conversions} conversions (account CPA ${r2(avgCpa)}).` });

  const geo = new Map<string, { type: string; cost: number; clicks: number; conversions: number; value: number }>();
  for (const r of rows.geo ?? []) {
    const id = str(r.geographicView?.countryCriterionId);
    const type = str(r.geographicView?.locationType);
    const m = r.metrics ?? {};
    const key = `${id}|${type}`;
    const x = geo.get(key) ?? { type, cost: 0, clicks: 0, conversions: 0, value: 0 };
    x.cost += micros(m.costMicros);
    x.clicks += num(m.clicks);
    x.conversions += num(m.conversions);
    x.value += num(m.conversionsValue);
    geo.set(key, x);
  }
  const geoRows = [...geo.entries()]
    .map(([key, x]) => {
      const id = key.split("|")[0]!;
      return { country: geoNames[id] ?? id, matchedBy: x.type === "LOCATION_OF_PRESENCE" ? "physical location" : x.type === "AREA_OF_INTEREST" ? "interest only" : x.type, cost: r2(x.cost), clicks: x.clicks, conversions: r2(x.conversions), value: r2(x.value) };
    })
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 30);
  const interest = geoRows.filter((g) => g.matchedBy === "interest only").reduce((s, g) => s + g.cost, 0);
  if (totalCost > 0 && interest / totalCost >= 0.1)
    findings.push({ severity: "medium", check: "Location option", detail: `${pct(interest / totalCost)}% of spend comes from people only interested in your locations, not in them. For a store that ships to set countries, use "Presence: people in your locations".` });

  const targeting = new Map<string, { included: string[]; excluded: string[] }>();
  for (const r of rows.locations ?? []) {
    const cid = str(r.campaign?.id);
    const t = targeting.get(cid) ?? { included: [], excluded: [] };
    const loc = lastId(r.campaignCriterion?.location?.geoTargetConstant);
    const label = loc ? geoNames[loc] ?? loc : r.campaignCriterion?.proximity ? `radius ${num(r.campaignCriterion.proximity.radius)}` : "";
    if (label) (r.campaignCriterion?.negative ? t.excluded : t.included).push(label);
    targeting.set(cid, t);
  }
  for (const f of facts.values())
    if (f.status === "ENABLED" && f.type !== "PERFORMANCE_MAX" && !targeting.get(f.id)?.included.length)
      findings.push({ severity: "medium", check: "Locations", entity: f.name, detail: `"${f.name}" targets all countries and territories. A store should target where it ships.` });

  const audiences = (rows.audiences ?? [])
    .map((r) => ({ campaign: facts.get(str(r.campaign?.id))?.name ?? str(r.campaign?.id), audience: str(r.adGroupCriterion?.displayName) || str(r.adGroupCriterion?.type), cost: r2(micros(r.metrics?.costMicros)), conversions: r2(num(r.metrics?.conversions)), value: r2(num(r.metrics?.conversionsValue)) }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 40);

  const accountAssets = new Map<string, number>();
  for (const r of rows.accountAssets ?? []) accountAssets.set(str(r.customerAsset?.fieldType), (accountAssets.get(str(r.customerAsset?.fieldType)) ?? 0) + 1);
  const campaignAssets = new Map<string, Map<string, number>>();
  for (const r of rows.campaignAssets ?? []) {
    const cid = str(r.campaign?.id);
    const m = campaignAssets.get(cid) ?? new Map<string, number>();
    m.set(str(r.campaignAsset?.fieldType), (m.get(str(r.campaignAsset?.fieldType)) ?? 0) + 1);
    campaignAssets.set(cid, m);
  }
  const assetCoverage = [...facts.values()]
    .filter((f) => f.status === "ENABLED" && f.type === "SEARCH")
    .map((f) => {
      const own = campaignAssets.get(f.id) ?? new Map<string, number>();
      // Campaign-level assets replace account-level ones of the same type.
      const count = (field: string) => own.get(field) ?? accountAssets.get(field) ?? 0;
      const missing = Object.entries(CAMPAIGN_ASSETS)
        .filter(([field, want]) => count(field) < want.min)
        .map(([field, want]) => `${want.label} ${count(field)}/${want.min}`);
      if (missing.length) findings.push({ severity: "low", check: "Assets", entity: f.name, detail: `"${f.name}" is short of ${missing.join(", ")}. Assets make ads bigger at no extra cost.` });
      return { campaign: f.name, counts: Object.fromEntries(Object.keys(CAMPAIGN_ASSETS).map((k) => [k, count(k)])), missing };
    });

  const changes = (rows.changes ?? []).map((r) => ({
    at: str(r.changeEvent?.changeDateTime),
    what: `${str(r.changeEvent?.resourceChangeOperation).toLowerCase()} ${str(r.changeEvent?.changeResourceType).toLowerCase().replace(/_/g, " ")}`,
    by: str(r.changeEvent?.userEmail) || str(r.changeEvent?.clientType),
    campaign: facts.get(str(r.campaign?.id))?.name ?? null,
  }));
  const byWho = new Map<string, number>();
  for (const c of changes) byWho.set(c.by, (byWho.get(c.by) ?? 0) + 1);

  return {
    period: `last ${days} days`,
    devices: deviceRows,
    countries: geoRows,
    locationTargeting: [...facts.values()].filter((f) => f.status !== "REMOVED").map((f) => ({ campaign: f.name, ...(targeting.get(f.id) ?? { included: [], excluded: [] }) })),
    audiences,
    assetCoverage,
    recentChanges: { total: changes.length, byWho: Object.fromEntries(byWho), latest: changes.slice(0, 30) },
    findings: sortFindings(findings),
  };
}

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };
function sortFindings(list: Finding[]): Finding[] {
  return [...list].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
