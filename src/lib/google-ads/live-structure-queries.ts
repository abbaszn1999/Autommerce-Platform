// GAQL for the parts of a live account that have no metrics: Performance Max
// asset groups, assets, audiences, product groups, placements, the shared
// library, experiments and linked accounts. Read only.

const AUDIENCE_TYPES = "('USER_LIST', 'USER_INTEREST', 'CUSTOM_AUDIENCE', 'COMBINED_AUDIENCE')";
const ASSET_FIELDS =
  "asset.id, asset.name, asset.type, asset.final_urls, asset.policy_summary.approval_status, asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2, asset.callout_asset.callout_text, asset.structured_snippet_asset.header, asset.structured_snippet_asset.values, asset.call_asset.phone_number, asset.image_asset.full_size.url, asset.text_asset.text";
const LISTING_VALUES =
  "case_value.product_brand.value, case_value.product_type.value, case_value.product_type.level, case_value.product_item_id.value, case_value.product_custom_attribute.value, case_value.product_custom_attribute.index";
const listing = (prefix: string) => LISTING_VALUES.split(", ").map((f) => `${prefix}.${f}`).join(", ");

export const STRUCTURE_QUERIES = {
  assetGroups: () =>
    "SELECT asset_group.id, asset_group.name, asset_group.status, asset_group.campaign, asset_group.final_urls, asset_group.ad_strength FROM asset_group WHERE asset_group.status != 'REMOVED' AND campaign.status != 'REMOVED'",
  assetGroupAssets: () =>
    "SELECT asset_group.id, asset_group_asset.field_type, asset.id, asset.text_asset.text, asset.image_asset.full_size.url, asset.youtube_video_asset.youtube_video_id FROM asset_group_asset WHERE asset_group_asset.status != 'REMOVED' AND asset_group.status != 'REMOVED'",
  assetGroupSignals: () => "SELECT asset_group.id, asset_group_signal.audience.audience, asset_group_signal.search_theme.text FROM asset_group_signal WHERE asset_group.status != 'REMOVED'",
  assetGroupListings: () =>
    `SELECT asset_group.id, asset_group_listing_group_filter.type, ${listing("asset_group_listing_group_filter")} FROM asset_group_listing_group_filter WHERE asset_group.status != 'REMOVED'`,
  customerAssets: () => `SELECT customer_asset.field_type, customer_asset.status, ${ASSET_FIELDS} FROM customer_asset WHERE customer_asset.status != 'REMOVED'`,
  campaignAssets: () => `SELECT campaign.id, campaign.status, campaign_asset.field_type, campaign_asset.status, ${ASSET_FIELDS} FROM campaign_asset WHERE campaign_asset.status != 'REMOVED' AND campaign.status != 'REMOVED'`,
  adGroupAssets: () => `SELECT ad_group.id, ad_group.status, ad_group_asset.field_type, ad_group_asset.status, ${ASSET_FIELDS} FROM ad_group_asset WHERE ad_group_asset.status != 'REMOVED' AND ad_group.status != 'REMOVED'`,
  userLists: () => "SELECT user_list.id, user_list.name, user_list.type, user_list.size_for_search, user_list.membership_life_span, user_list.description FROM user_list",
  campaignAudiences: () =>
    `SELECT campaign.id, campaign.targeting_setting.target_restrictions, campaign_criterion.criterion_id, campaign_criterion.type, campaign_criterion.negative, campaign_criterion.bid_modifier, campaign_criterion.display_name, campaign_criterion.user_list.user_list FROM campaign_criterion WHERE campaign_criterion.type IN ${AUDIENCE_TYPES} AND campaign.status != 'REMOVED'`,
  adGroupAudiences: () =>
    `SELECT ad_group.id, ad_group.targeting_setting.target_restrictions, ad_group_criterion.criterion_id, ad_group_criterion.type, ad_group_criterion.negative, ad_group_criterion.bid_modifier, ad_group_criterion.display_name, ad_group_criterion.user_list.user_list FROM ad_group_criterion WHERE ad_group_criterion.type IN ${AUDIENCE_TYPES} AND ad_group_criterion.status != 'REMOVED' AND ad_group.status != 'REMOVED'`,
  listingGroups: () =>
    `SELECT campaign.id, ad_group_criterion.criterion_id, ad_group_criterion.negative, ad_group_criterion.cpc_bid_micros, ad_group_criterion.listing_group.type, ad_group_criterion.listing_group.parent_ad_group_criterion, ${listing("ad_group_criterion.listing_group")} FROM ad_group_criterion WHERE ad_group_criterion.type = 'LISTING_GROUP' AND ad_group_criterion.status != 'REMOVED' AND ad_group.status != 'REMOVED'`,
  placements: () =>
    "SELECT campaign.id, ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.type, ad_group_criterion.negative, ad_group_criterion.bid_modifier, ad_group_criterion.display_name FROM ad_group_criterion WHERE ad_group_criterion.type IN ('PLACEMENT', 'YOUTUBE_CHANNEL', 'YOUTUBE_VIDEO', 'TOPIC') AND ad_group_criterion.status != 'REMOVED' AND ad_group.status != 'REMOVED'",
  labels: () => "SELECT label.id, label.name, label.text_label.background_color FROM label WHERE label.status = 'ENABLED'",
  bidStrategies: () =>
    "SELECT bidding_strategy.id, bidding_strategy.name, bidding_strategy.type, bidding_strategy.target_cpa.target_cpa_micros, bidding_strategy.target_roas.target_roas, bidding_strategy.target_impression_share.cpc_bid_ceiling_micros FROM bidding_strategy WHERE bidding_strategy.status = 'ENABLED'",
  sharedSets: () => "SELECT shared_set.id, shared_set.name, shared_set.type FROM shared_set WHERE shared_set.status = 'ENABLED' AND shared_set.type IN ('NEGATIVE_KEYWORDS', 'NEGATIVE_PLACEMENTS')",
  campaignSharedSets: () => "SELECT campaign.id, shared_set.id FROM campaign_shared_set WHERE campaign_shared_set.status = 'ENABLED' AND campaign.status != 'REMOVED'",
  sharedPlacements: () =>
    "SELECT shared_set.id, shared_criterion.type, shared_criterion.placement.url, shared_criterion.youtube_channel.channel_id, shared_criterion.mobile_application.name FROM shared_criterion WHERE shared_set.type = 'NEGATIVE_PLACEMENTS' AND shared_set.status = 'ENABLED'",
  experiments: () => "SELECT experiment.experiment_id, experiment.name, experiment.description, experiment.status, experiment.type, experiment.start_date, experiment.end_date FROM experiment WHERE experiment.status != 'REMOVED'",
  experimentArms: () => "SELECT experiment_arm.experiment, experiment_arm.name, experiment_arm.control, experiment_arm.traffic_split, experiment_arm.campaigns FROM experiment_arm",
  audienceNames: () => "SELECT audience.resource_name, audience.name FROM audience WHERE audience.status = 'ENABLED'",
  productLinks: () => "SELECT product_link.product_link_id, product_link.type, product_link.merchant_center.merchant_center_id FROM product_link",
};

export type StructureQueryName = keyof typeof STRUCTURE_QUERIES;
