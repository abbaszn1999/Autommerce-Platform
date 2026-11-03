// GAQL for the live account snapshot (read only). Structure queries carry no
// metrics so every entity comes back, even ones without traffic; metrics come
// from separate queries over the chosen date range.

const METRICS = "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value";

const between = (start: string, end: string) => `segments.date BETWEEN '${start}' AND '${end}'`;

/** Dates are built by us (YYYY-MM-DD), never taken from user input as-is. */
export function assertIsoDay(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Bad date ${day}`);
  return day;
}

export const LIVE_QUERIES = {
  customer: () => "SELECT customer.id, customer.optimization_score, customer.auto_tagging_enabled FROM customer LIMIT 1",

  campaigns: () =>
    `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type,
       campaign.bidding_strategy, campaign.campaign_budget, campaign.start_date_time, campaign.end_date_time,
       campaign.network_settings.target_google_search, campaign.network_settings.target_search_network,
       campaign.network_settings.target_content_network, campaign.target_cpa.target_cpa_micros, campaign.target_roas.target_roas,
       campaign.maximize_conversions.target_cpa_micros, campaign.maximize_conversion_value.target_roas,
       campaign.primary_status, campaign.primary_status_reasons, campaign.tracking_url_template, campaign.final_url_suffix
     FROM campaign WHERE campaign.status != 'REMOVED'`,

  budgets: () =>
    "SELECT campaign_budget.id, campaign_budget.name, campaign_budget.amount_micros, campaign_budget.explicitly_shared, campaign_budget.delivery_method FROM campaign_budget WHERE campaign_budget.status = 'ENABLED'",

  campaignDaily: (start: string, end: string) =>
    `SELECT campaign.id, segments.date, ${METRICS} FROM campaign WHERE campaign.status != 'REMOVED' AND ${between(assertIsoDay(start), assertIsoDay(end))}`,

  adGroups: () =>
    "SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, campaign.id, ad_group.cpc_bid_micros, ad_group.target_cpa_micros FROM ad_group WHERE ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED'",

  adGroupMetrics: (start: string, end: string) =>
    `SELECT ad_group.id, ${METRICS} FROM ad_group WHERE ad_group.status != 'REMOVED' AND ${between(assertIsoDay(start), assertIsoDay(end))}`,

  /** Positive and negative ad group keywords. */
  keywords: () =>
    `SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
       ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.cpc_bid_micros, ad_group_criterion.approval_status,
       ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score,
       ad_group_criterion.quality_info.post_click_quality_score, ad_group_criterion.quality_info.search_predicted_ctr,
       ad_group_criterion.position_estimates.first_page_cpc_micros, ad_group_criterion.position_estimates.top_of_page_cpc_micros,
       ad_group_criterion.final_urls
     FROM keyword_view WHERE ad_group_criterion.status != 'REMOVED' AND ad_group.status != 'REMOVED'`,

  keywordMetrics: (start: string, end: string) =>
    `SELECT ad_group.id, ad_group_criterion.criterion_id, ${METRICS} FROM keyword_view WHERE ad_group_criterion.status != 'REMOVED' AND ${between(assertIsoDay(start), assertIsoDay(end))}`,

  campaignNegatives: () =>
    "SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign_criterion.type = 'KEYWORD' AND campaign_criterion.negative = TRUE AND campaign.status != 'REMOVED'",

  ads: () =>
    `SELECT ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.ad.final_urls,
       ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions,
       ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2,
       ad_group_ad.ad.responsive_display_ad.headlines, ad_group_ad.ad.responsive_display_ad.long_headline,
       ad_group_ad.ad.responsive_display_ad.descriptions, ad_group_ad.ad.responsive_display_ad.business_name,
       ad_group_ad.ad_strength, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status
     FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED' AND ad_group.status != 'REMOVED'`,

  adMetrics: (start: string, end: string) =>
    `SELECT ad_group.id, ad_group_ad.ad.id, ${METRICS} FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED' AND ${between(assertIsoDay(start), assertIsoDay(end))}`,

  /** The most-shown 500 search terms of the range. */
  searchTerms: (start: string, end: string) =>
    `SELECT campaign.id, ad_group.id, search_term_view.search_term, search_term_view.status, segments.search_term_match_type, ${METRICS}
     FROM search_term_view WHERE ${between(assertIsoDay(start), assertIsoDay(end))} ORDER BY metrics.impressions DESC LIMIT 500`,
};

export type LiveQueryName = keyof typeof LIVE_QUERIES;
