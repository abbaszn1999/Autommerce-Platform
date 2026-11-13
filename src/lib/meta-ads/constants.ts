import type {
  AdFormat,
  AdvantageState,
  AttributionSetting,
  AudienceKind,
  BidStrategy,
  ConversionEvent,
  ConversionLocation,
  ContentExclusion,
  CtaKey,
  DeliveryStatus,
  EnhancementKey,
  InventoryFilter,
  Objective,
  OptimizationGoal,
  OpportunityCategory,
  PlacementKey,
  PlatformKey,
  Ranking,
  SpecialAdCategory,
} from "./types";

// Date presets and geo targets are the same list Google Ads uses.
export { DATE_PRESETS, GEO_TARGETS, LANGUAGES } from "@/lib/google-ads/constants";

/** Meta Ads text limits (visible characters) and structural limits. */
export const LIMITS = {
  primaryText: 125,
  headline: 40,
  description: 30,
  /** Text variations per ad. */
  variations: 5,
  carouselMin: 2,
  carouselMax: 10,
  adsPerAdSet: 50,
  campaignName: 400,
  /** About this many optimization events in 7 days to leave the learning phase. */
  learningEvents: 50,
  learningDays: 7,
  /** Raise budgets by at most this much at a time to avoid resetting learning. */
  safeBudgetStep: 0.2,
  minDailyBudget: 1,
} as const;

export const OBJECTIVES: Record<
  Objective,
  {
    label: string;
    blurb: string;
    /** Where the result happens. */
    locations: ConversionLocation[];
    goals: OptimizationGoal[];
    defaultGoal: OptimizationGoal;
    /** Whether conversion columns (purchases, ROAS…) make sense. */
    conversions: boolean;
    /** Whether the agent can create it. App promotion is view-only: there is no demo app. */
    creatable: boolean;
    resultLabel: string;
  }
> = {
  AWARENESS: {
    label: "Awareness",
    blurb: "Show ads to people most likely to remember them",
    locations: ["ON_AD"],
    goals: ["REACH", "IMPRESSIONS", "AD_RECALL_LIFT", "THRUPLAY"],
    defaultGoal: "REACH",
    conversions: false,
    creatable: true,
    resultLabel: "Reach",
  },
  TRAFFIC: {
    label: "Traffic",
    blurb: "Send people to a website, app or profile",
    locations: ["WEBSITE", "APP", "MESSAGING", "CALLS", "INSTAGRAM_PROFILE"],
    goals: ["LANDING_PAGE_VIEWS", "LINK_CLICKS", "IMPRESSIONS", "REACH"],
    defaultGoal: "LANDING_PAGE_VIEWS",
    conversions: false,
    creatable: true,
    resultLabel: "Landing page views",
  },
  ENGAGEMENT: {
    label: "Engagement",
    blurb: "Get more messages, video views, post engagement or follows",
    locations: ["ON_AD", "ON_POST", "MESSAGING", "INSTAGRAM_PROFILE", "WEBSITE"],
    goals: ["POST_ENGAGEMENT", "THRUPLAY", "CONVERSATIONS", "LINK_CLICKS"],
    defaultGoal: "POST_ENGAGEMENT",
    conversions: false,
    creatable: true,
    resultLabel: "Engagements",
  },
  LEADS: {
    label: "Leads",
    blurb: "Collect leads with instant forms, messages, calls or your website",
    locations: ["INSTANT_FORMS", "MESSAGING", "CALLS", "WEBSITE", "APP"],
    goals: ["LEAD_GENERATION", "QUALITY_LEAD", "CONVERSATIONS", "OFFSITE_CONVERSIONS"],
    defaultGoal: "LEAD_GENERATION",
    conversions: false,
    creatable: true,
    resultLabel: "Leads",
  },
  APP_PROMOTION: {
    label: "App promotion",
    blurb: "Find new people to install your app and keep using it",
    locations: ["APP"],
    goals: ["APP_INSTALLS", "OFFSITE_CONVERSIONS", "VALUE"],
    defaultGoal: "APP_INSTALLS",
    conversions: true,
    creatable: false,
    resultLabel: "App installs",
  },
  SALES: {
    label: "Sales",
    blurb: "Find people likely to purchase your products or services",
    locations: ["WEBSITE", "APP", "MESSAGING", "CALLS"],
    goals: ["OFFSITE_CONVERSIONS", "VALUE", "LANDING_PAGE_VIEWS", "LINK_CLICKS"],
    defaultGoal: "OFFSITE_CONVERSIONS",
    conversions: true,
    creatable: true,
    resultLabel: "Purchases",
  },
};

export const ADVANTAGE_STATES: Record<AdvantageState, { label: string; blurb: string; tone: "brand" | "neutral" | "warn" }> = {
  ADVANTAGE_PLUS: { label: "Advantage+", blurb: "Advantage+ budget, audience and placements are all on", tone: "brand" },
  MANUAL: { label: "Manual", blurb: "You set the budget split, audience and placements", tone: "neutral" },
  LEGACY_ASC: { label: "Legacy Advantage+ Shopping", blurb: "View only: Meta no longer lets you create or edit these", tone: "warn" },
};

export const OPTIMIZATION_GOALS: Record<OptimizationGoal, { label: string; resultLabel: string }> = {
  OFFSITE_CONVERSIONS: { label: "Maximize number of conversions", resultLabel: "Conversions" },
  VALUE: { label: "Maximize value of conversions", resultLabel: "Conversions" },
  LANDING_PAGE_VIEWS: { label: "Maximize landing page views", resultLabel: "Landing page views" },
  LINK_CLICKS: { label: "Maximize link clicks", resultLabel: "Link clicks" },
  REACH: { label: "Maximize reach", resultLabel: "Reach" },
  IMPRESSIONS: { label: "Maximize impressions", resultLabel: "Impressions" },
  LEAD_GENERATION: { label: "Maximize number of leads", resultLabel: "Leads" },
  QUALITY_LEAD: { label: "Maximize quality leads", resultLabel: "Leads" },
  CONVERSATIONS: { label: "Maximize conversations", resultLabel: "Conversations" },
  THRUPLAY: { label: "Maximize ThruPlays", resultLabel: "ThruPlays" },
  POST_ENGAGEMENT: { label: "Maximize post engagement", resultLabel: "Engagements" },
  AD_RECALL_LIFT: { label: "Maximize ad recall lift", resultLabel: "Est. ad recall lift" },
  APP_INSTALLS: { label: "Maximize app installs", resultLabel: "App installs" },
};

export const CONVERSION_LOCATIONS: Record<ConversionLocation, string> = {
  WEBSITE: "Website",
  APP: "App",
  INSTANT_FORMS: "Instant forms",
  MESSAGING: "Messaging apps",
  CALLS: "Calls",
  ON_AD: "On your ad",
  ON_POST: "On your post",
  INSTAGRAM_PROFILE: "Instagram profile",
};

export const CONVERSION_EVENTS: Record<ConversionEvent, string> = {
  PURCHASE: "Purchase",
  ADD_TO_CART: "Add to cart",
  INITIATE_CHECKOUT: "Initiate checkout",
  LEAD: "Lead",
  COMPLETE_REGISTRATION: "Complete registration",
  VIEW_CONTENT: "View content",
};

export const BID_STRATEGIES: Record<BidStrategy, { label: string; api: string; blurb: string; needsValue?: "COST" | "ROAS" | "BID" }> = {
  LOWEST_COST_WITHOUT_CAP: { label: "Highest volume", api: "LOWEST_COST_WITHOUT_CAP", blurb: "Get the most results for your budget (Highest value when optimizing for value)" },
  COST_CAP: { label: "Cost per result goal", api: "COST_CAP", blurb: "Keep the average cost per result near a target", needsValue: "COST" },
  LOWEST_COST_WITH_MIN_ROAS: { label: "ROAS goal", api: "LOWEST_COST_WITH_MIN_ROAS", blurb: "Aim for a minimum return on ad spend", needsValue: "ROAS" },
  LOWEST_COST_WITH_BID_CAP: { label: "Bid cap", api: "LOWEST_COST_WITH_BID_CAP", blurb: "Never bid above this amount in any auction", needsValue: "BID" },
};

export const ATTRIBUTION: Record<AttributionSetting, { label: string; short: string }> = {
  CLICK_7_VIEW_1: { label: "7-day click and 1-day view", short: "7d click · 1d view" },
  CLICK_1: { label: "1-day click", short: "1d click" },
  CLICK_7: { label: "7-day click", short: "7d click" },
  CLICK_1_ENGAGED_1: { label: "1-day click and 1-day engaged view", short: "1d click · 1d engaged" },
  INCREMENTAL: { label: "Incremental attribution", short: "Incremental" },
};

/** How much of the default (7-day click, 1-day view) conversions each setting reports, for the demo. */
export const ATTRIBUTION_FACTOR: Record<AttributionSetting, number> = {
  CLICK_7_VIEW_1: 1,
  CLICK_1: 0.72,
  CLICK_7: 0.88,
  CLICK_1_ENGAGED_1: 0.8,
  INCREMENTAL: 0.58,
};

export const PLATFORMS: Record<PlatformKey, { label: string; color: string }> = {
  FACEBOOK: { label: "Facebook", color: "#1877f2" },
  INSTAGRAM: { label: "Instagram", color: "#d62976" },
  MESSENGER: { label: "Messenger", color: "#0ea5e9" },
  AUDIENCE_NETWORK: { label: "Audience Network", color: "#64748b" },
  THREADS: { label: "Threads", color: "#18181b" },
};

export const PLACEMENTS: Record<PlacementKey, { label: string; platform: PlatformKey }> = {
  FB_FEED: { label: "Feed", platform: "FACEBOOK" },
  FB_REELS: { label: "Reels", platform: "FACEBOOK" },
  FB_STORIES: { label: "Stories", platform: "FACEBOOK" },
  FB_MARKETPLACE: { label: "Marketplace", platform: "FACEBOOK" },
  FB_SEARCH: { label: "Search results", platform: "FACEBOOK" },
  FB_INSTREAM: { label: "In-stream videos", platform: "FACEBOOK" },
  FB_RIGHT_COLUMN: { label: "Right column", platform: "FACEBOOK" },
  IG_FEED: { label: "Feed", platform: "INSTAGRAM" },
  IG_REELS: { label: "Reels", platform: "INSTAGRAM" },
  IG_STORIES: { label: "Stories", platform: "INSTAGRAM" },
  IG_EXPLORE: { label: "Explore", platform: "INSTAGRAM" },
  IG_SEARCH: { label: "Search results", platform: "INSTAGRAM" },
  MESSENGER_INBOX: { label: "Inbox", platform: "MESSENGER" },
  MESSENGER_STORIES: { label: "Stories", platform: "MESSENGER" },
  AN_NATIVE: { label: "Native, banner and interstitial", platform: "AUDIENCE_NETWORK" },
  AN_REWARDED: { label: "Rewarded videos", platform: "AUDIENCE_NETWORK" },
  THREADS_FEED: { label: "Threads feed", platform: "THREADS" },
};

export const ALL_PLACEMENTS = Object.keys(PLACEMENTS) as PlacementKey[];

export const AD_FORMATS: Record<AdFormat, { label: string; blurb: string }> = {
  SINGLE_IMAGE: { label: "Single image", blurb: "One image, 1:1 or 4:5" },
  SINGLE_VIDEO: { label: "Single video", blurb: "One video, best in 9:16 for Reels and Stories" },
  CAROUSEL: { label: "Carousel", blurb: "2 to 10 swipeable cards" },
  COLLECTION: { label: "Collection", blurb: "A cover with a grid of products" },
  CATALOG: { label: "Catalog (dynamic)", blurb: "Products from your catalog, shown to the right people" },
};

export const CTAS: Record<CtaKey, string> = {
  SHOP_NOW: "Shop now",
  LEARN_MORE: "Learn more",
  SIGN_UP: "Sign up",
  GET_QUOTE: "Get quote",
  BOOK_NOW: "Book now",
  CONTACT_US: "Contact us",
  SEND_MESSAGE: "Send message",
  ORDER_NOW: "Order now",
  DOWNLOAD: "Download",
  WATCH_MORE: "Watch more",
  NO_BUTTON: "No button",
};

export const ENHANCEMENTS: Record<EnhancementKey, { label: string; blurb: string }> = {
  TEXT_IMPROVEMENTS: { label: "Text improvements", blurb: "Meta may rewrite or reorder your text" },
  VISUAL_TOUCH_UPS: { label: "Visual touch-ups", blurb: "Crops, brightness and contrast per placement" },
  ADD_MUSIC: { label: "Add music", blurb: "Adds a soundtrack to image and video ads" },
  ADD_OVERLAYS: { label: "Add overlays", blurb: "Price or shipping badges on the image" },
  RELEVANT_COMMENTS: { label: "Show relevant comments", blurb: "Highlights positive comments on the ad" },
  ENHANCE_CTA: { label: "Enhance CTA", blurb: "Picks the button most likely to be clicked" },
};

export const RANKINGS: Record<Ranking, { label: string; tone: "good" | "neutral" | "bad" }> = {
  ABOVE_AVERAGE: { label: "Above average", tone: "good" },
  AVERAGE: { label: "Average", tone: "neutral" },
  BELOW_AVERAGE: { label: "Below average", tone: "bad" },
  UNKNOWN: { label: "Not enough impressions", tone: "neutral" },
};

export const DELIVERY: Record<DeliveryStatus, { label: string; tone: "good" | "info" | "warn" | "bad" | "neutral"; hint: string }> = {
  ACTIVE: { label: "Active", tone: "good", hint: "Delivering normally" },
  LEARNING: { label: "Learning", tone: "info", hint: "Still collecting about 50 results in 7 days; results are less stable" },
  LEARNING_LIMITED: { label: "Learning limited", tone: "warn", hint: "Not getting enough results to exit learning. Consolidate ad sets or raise the budget" },
  IN_REVIEW: { label: "In review", tone: "info", hint: "Meta is reviewing it; usually under 24 hours" },
  REJECTED: { label: "Rejected", tone: "bad", hint: "Does not meet Meta's advertising standards" },
  SCHEDULED: { label: "Scheduled", tone: "neutral", hint: "Starts on its start date" },
  OFF: { label: "Off", tone: "neutral", hint: "Paused" },
  COMPLETED: { label: "Completed", tone: "neutral", hint: "Reached its end date" },
};

export const SPECIAL_AD_CATEGORIES: Record<SpecialAdCategory, string> = {
  HOUSING: "Housing",
  EMPLOYMENT: "Employment",
  CREDIT: "Credit",
  ISSUES_ELECTIONS_POLITICS: "Social issues, elections or politics",
  ONLINE_GAMBLING: "Online gambling and gaming",
};

export const AUDIENCE_KINDS: Record<AudienceKind, { label: string; blurb: string }> = {
  WEBSITE: { label: "Website visitors", blurb: "People who visited your store (Pixel and Conversions API)" },
  CUSTOMER_LIST: { label: "Customer list", blurb: "Uploaded customer emails and phone numbers" },
  ENGAGEMENT: { label: "Engagement", blurb: "People who engaged with your Page, Instagram, video or leads" },
  CATALOG: { label: "Catalog", blurb: "People who viewed or added products from your catalog" },
  LOOKALIKE: { label: "Lookalike", blurb: "People similar to a source audience" },
  SAVED: { label: "Saved audience", blurb: "A saved set of locations, age and interests" },
};

export const INVENTORY_FILTERS: Record<InventoryFilter, { label: string; blurb: string }> = {
  EXPANDED: { label: "Expanded inventory", blurb: "Maximum reach. Includes content with some sensitive themes" },
  MODERATE: { label: "Moderate inventory", blurb: "Excludes high-risk content. Meta's recommended default" },
  LIMITED: { label: "Limited inventory", blurb: "Excludes moderate and high-risk content. Smallest reach, safest" },
};

export const CONTENT_EXCLUSIONS: Record<ContentExclusion, string> = {
  NEWS: "News and current events",
  POLITICS: "Politics",
  GAMBLING: "Gambling",
  TRAGEDY: "Tragedy and conflict",
  MATURE: "Mature themes",
};

export const OPPORTUNITY_CATEGORIES: Record<OpportunityCategory, string> = {
  CREATIVE: "Creative",
  AUDIENCE: "Audience",
  BUDGET: "Budget & bidding",
  MEASUREMENT: "Measurement",
  PLACEMENTS: "Placements",
};

export const ASSET_RATIOS = ["1:1", "4:5", "9:16"] as const;

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Prompts offered in an empty chat. */
export const STARTER_PROMPTS = [
  "Run a full audit of my Meta account",
  "Which creatives are fatigued, and what should replace them?",
  "Why is Prospecting – Running Shoes learning limited?",
  "Create an Advantage+ Sales campaign for running shoes in Saudi Arabia with $80/day",
  "Check my Pixel, Conversions API and Event Match Quality",
  "Why were my ads rejected and how do I fix them?",
];
