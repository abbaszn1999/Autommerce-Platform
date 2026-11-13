// Domain model for the Meta Ads workspace. Mirrors what Meta's Marketing API
// (v26) exposes: a Business portfolio owns ad accounts (act_), an account holds
// campaigns (objective), ad sets (audience, placements, budget, optimization,
// attribution) and ads (identity, format, creative).

// ─── Accounts ───────────────────────────────────────────────────────────────

export type BusinessPortfolio = { id: string; name: string; verified: boolean };

export type MetaAccount = {
  /** Ad account id, e.g. act_4412907731. */
  accountId: string;
  name: string;
  currency: string;
  timeZone: string;
  businessId: string;
  /** Opportunity score, 0–100. */
  opportunityScore: number;
  /** The Page and Instagram account used as the ad identity. */
  pageId?: string;
  instagramId?: string;
  datasetId?: string;
  /** Catalog connected through Commerce Manager (own connection, like Merchant Center for Google). */
  catalogId?: string;
};

/** A Facebook Page or Instagram account the signed-in user can reach. */
export type MetaIdentity = { id: string; name: string; handle?: string; followers: number };

// ─── Campaign layer ─────────────────────────────────────────────────────────

export type EntityStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";

/** The six ODAX objectives. */
export type Objective = "AWARENESS" | "TRAFFIC" | "ENGAGEMENT" | "LEADS" | "APP_PROMOTION" | "SALES";

/** Advantage+ is a flag on top of the objective: budget, audience and placements all on. Legacy ASC can no longer be created or edited. */
export type AdvantageState = "ADVANTAGE_PLUS" | "MANUAL" | "LEGACY_ASC";

export type DeliveryStatus = "ACTIVE" | "LEARNING" | "LEARNING_LIMITED" | "IN_REVIEW" | "REJECTED" | "SCHEDULED" | "OFF" | "COMPLETED";

export type BidStrategy = "LOWEST_COST_WITHOUT_CAP" | "COST_CAP" | "LOWEST_COST_WITH_MIN_ROAS" | "LOWEST_COST_WITH_BID_CAP";

export type BudgetKind = "DAILY" | "LIFETIME";

export type SpecialAdCategory = "HOUSING" | "EMPLOYMENT" | "CREDIT" | "ISSUES_ELECTIONS_POLITICS" | "ONLINE_GAMBLING";

export type AttributionSetting = "CLICK_7_VIEW_1" | "CLICK_1" | "CLICK_7" | "CLICK_1_ENGAGED_1" | "INCREMENTAL";

export type MetaBudget = { kind: BudgetKind; amount: number };

export type MetaCampaign = {
  id: string;
  name: string;
  objective: Objective;
  advantageState: AdvantageState;
  buyingType: "AUCTION" | "RESERVED";
  specialAdCategories: SpecialAdCategory[];
  status: EntityStatus;
  delivery: DeliveryStatus;
  /** Advantage+ campaign budget (CBO) when set; otherwise each ad set has its own (ABO). */
  budget?: MetaBudget;
  bidStrategy: BidStrategy;
  /** Cost cap, bid cap or minimum ROAS value, depending on the strategy. */
  bidValue?: number;
  startDate: string;
  stopDate?: string;
  /** Advantage+ Sales: the share of budget that may go to existing customers (0–1). */
  existingCustomerCap?: number;
  /** Value rule set applied to this campaign. */
  valueRuleIds?: string[];
  abTestId?: string;
  labels: string[];
  createdAt: string;
};

// ─── Ad set layer ───────────────────────────────────────────────────────────

export type ConversionLocation = "WEBSITE" | "APP" | "INSTANT_FORMS" | "MESSAGING" | "CALLS" | "ON_AD" | "ON_POST" | "INSTAGRAM_PROFILE";

export type OptimizationGoal =
  | "OFFSITE_CONVERSIONS"
  | "VALUE"
  | "LANDING_PAGE_VIEWS"
  | "LINK_CLICKS"
  | "REACH"
  | "IMPRESSIONS"
  | "LEAD_GENERATION"
  | "QUALITY_LEAD"
  | "CONVERSATIONS"
  | "THRUPLAY"
  | "POST_ENGAGEMENT"
  | "AD_RECALL_LIFT"
  | "APP_INSTALLS";

export type ConversionEvent = "PURCHASE" | "ADD_TO_CART" | "INITIATE_CHECKOUT" | "LEAD" | "COMPLETE_REGISTRATION" | "VIEW_CONTENT";

export type PlacementKey =
  | "FB_FEED"
  | "FB_REELS"
  | "FB_STORIES"
  | "FB_MARKETPLACE"
  | "FB_SEARCH"
  | "FB_INSTREAM"
  | "FB_RIGHT_COLUMN"
  | "IG_FEED"
  | "IG_REELS"
  | "IG_STORIES"
  | "IG_EXPLORE"
  | "IG_SEARCH"
  | "MESSENGER_INBOX"
  | "MESSENGER_STORIES"
  | "AN_NATIVE"
  | "AN_REWARDED"
  | "THREADS_FEED";

export type PlatformKey = "FACEBOOK" | "INSTAGRAM" | "MESSENGER" | "AUDIENCE_NETWORK" | "THREADS";

export type GeoTarget = { id: string; name: string; kind: "Country" | "City" | "Region"; excluded?: boolean };

export type AdSetTargeting = {
  /** Advantage+ audience: Meta finds people; the listed audiences are only suggestions. */
  advantageAudience: boolean;
  locations: GeoTarget[];
  ageMin: number;
  ageMax: number;
  genders: "ALL" | "MEN" | "WOMEN";
  languages: string[];
  /** Custom and lookalike audiences to include. Hard targeting when Advantage+ audience is off, a suggestion when on. */
  includeAudienceIds: string[];
  excludeAudienceIds: string[];
  /** Interest and behaviour suggestions. */
  detailed: string[];
};

export type AdSetLearning = {
  phase: "LEARNING" | "SUCCESS" | "LIMITED";
  /** Optimization events so far in the current 7-day window. */
  events: number;
  /** About 50 events in 7 days to leave the learning phase. */
  target: number;
};

/** One run of hours on some days. Days follow Meta's adset_schedule (0 = Sunday), hours are 0-24 and the end is exclusive. */
export type AdScheduleBlock = { days: number[]; startHour: number; endHour: number };

export type AdSet = {
  id: string;
  campaignId: string;
  name: string;
  status: EntityStatus;
  delivery: DeliveryStatus;
  conversionLocation: ConversionLocation;
  optimizationGoal: OptimizationGoal;
  promotedObject: { datasetId?: string; event?: ConversionEvent; pageId?: string; productSetId?: string; leadFormId?: string };
  /** Set per ad set (ABO). Absent when the campaign has an Advantage+ campaign budget. */
  budget?: MetaBudget;
  bidStrategy?: BidStrategy;
  bidValue?: number;
  attribution: AttributionSetting;
  startDate: string;
  endDate?: string;
  targeting: AdSetTargeting;
  placements: { advantage: boolean; manual: PlacementKey[] };
  frequencyCap?: { max: number; days: number };
  /** Ad scheduling (dayparting). Meta only allows it with a lifetime budget. Absent means "all day, every day". */
  schedule?: AdScheduleBlock[];
  learning: AdSetLearning;
  createdAt: string;
};

// ─── Ad layer ───────────────────────────────────────────────────────────────

export type AdFormat = "SINGLE_IMAGE" | "SINGLE_VIDEO" | "CAROUSEL" | "COLLECTION" | "CATALOG";

export type CtaKey = "SHOP_NOW" | "LEARN_MORE" | "SIGN_UP" | "GET_QUOTE" | "BOOK_NOW" | "CONTACT_US" | "SEND_MESSAGE" | "ORDER_NOW" | "DOWNLOAD" | "WATCH_MORE" | "NO_BUTTON";

export type ReviewStatus = "APPROVED" | "IN_REVIEW" | "REJECTED" | "LIMITED";

export type Ranking = "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE" | "UNKNOWN";

export type EnhancementKey = "TEXT_IMPROVEMENTS" | "VISUAL_TOUCH_UPS" | "ADD_MUSIC" | "ADD_OVERLAYS" | "RELEVANT_COMMENTS" | "ENHANCE_CTA";

export type PartnershipInfo = {
  creatorName: string;
  creatorHandle: string;
  permission: "GRANTED" | "PENDING" | "REVOKED";
  /** Whether the creator's handle appears as the ad identity (partnership ads). */
  boostedPostId?: string;
};

export type MetaAd = {
  id: string;
  adSetId: string;
  name: string;
  status: EntityStatus;
  delivery: DeliveryStatus;
  review: ReviewStatus;
  /** Why the ad was rejected or limited. */
  reviewReason?: string;
  format: AdFormat;
  /** The Page and Instagram account the ad runs as. */
  identity: { pageName: string; instagramHandle?: string };
  partnership?: PartnershipInfo;
  /** Up to 5 variations each; Meta tests combinations. */
  primaryTexts: string[];
  headlines: string[];
  description?: string;
  cta: CtaKey;
  link: string;
  urlParams?: string;
  mediaIds: string[];
  cards?: { mediaId: string; headline: string; link: string }[];
  productSetId?: string;
  enhancements: Partial<Record<EnhancementKey, boolean>>;
  /** Ad-level diagnostics; unknown until the ad has enough impressions. */
  rankings: { quality: Ranking; engagement: Ranking; conversion: Ranking };
  conceptId?: string;
  createdAt: string;
};

// ─── Creative library ───────────────────────────────────────────────────────

export type CreativeAsset = {
  id: string;
  name: string;
  kind: "IMAGE" | "VIDEO";
  ratio: "1:1" | "4:5" | "9:16";
  conceptId: string;
  durationSec?: number;
  createdAt: string;
};

/** A creative concept: assets that share one angle. Andromeda reads concepts, so diversity matters more than variants. */
export type CreativeConcept = { id: string; name: string; angle: string; hook: string };

// ─── Audiences ──────────────────────────────────────────────────────────────

export type AudienceKind = "WEBSITE" | "CUSTOMER_LIST" | "ENGAGEMENT" | "CATALOG" | "LOOKALIKE" | "SAVED";

export type MetaAudience = {
  id: string;
  name: string;
  kind: AudienceKind;
  /** Estimated people. */
  size: number;
  status: "READY" | "POPULATING" | "TOO_SMALL";
  source: string;
  /** Lookalike: the closest-matching share of the country (1–10%). */
  lookalikePct?: number;
  seedAudienceId?: string;
  retentionDays?: number;
  updatedAt: string;
};

// ─── Catalog ────────────────────────────────────────────────────────────────

export type ProductIssue = { code: string; label: string; severity: "ERROR" | "WARNING" };

export type MetaProduct = {
  id: string;
  title: string;
  brand: string;
  category: string;
  price: number;
  availability: "IN_STOCK" | "OUT_OF_STOCK";
  status: "ACTIVE" | "ISSUES" | "REJECTED";
  issues: ProductIssue[];
  /** Mock-only: share of dynamic-ad traffic and conversion efficiency. */
  share: number;
  efficiency: number;
};

export type ProductSet = { id: string; name: string; rule: string; count: number };

// ─── Measurement (Events Manager) ───────────────────────────────────────────

export type DatasetEvent = {
  name: string;
  count7d: number;
  /** Event Match Quality, 0–10. */
  emq: number;
  browserShare: number;
  serverShare: number;
  /** Share of browser and server pairs deduplicated, 0–1. */
  dedup: number;
  status: "ACTIVE" | "WARNING" | "INACTIVE";
  issue?: string;
};

export type Dataset = {
  id: string;
  name: string;
  pixelId: string;
  capiConnected: boolean;
  capiSource: string;
  lastReceived: string;
  events: DatasetEvent[];
};

export type CustomConversion = { id: string; name: string; rule: string; datasetId: string; baseEvent: string; status: "ACTIVE" | "INACTIVE"; count7d: number };

// ─── Leads ──────────────────────────────────────────────────────────────────

export type LeadForm = {
  id: string;
  name: string;
  type: "MORE_VOLUME" | "HIGHER_INTENT";
  status: "ACTIVE" | "ARCHIVED";
  questions: string[];
  privacyUrl: string;
  createdAt: string;
};

export type LeadQuality = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export type Lead = {
  id: string;
  formId: string;
  adId?: string;
  createdAt: string;
  name: string;
  email: string;
  phone: string;
  quality: LeadQuality;
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "LOST";
};

// ─── Experiments ────────────────────────────────────────────────────────────

export type AbTest = {
  id: string;
  name: string;
  variable: "CREATIVE" | "AUDIENCE" | "PLACEMENT" | "OPTIMIZATION" | "CUSTOM";
  status: "DRAFT" | "RUNNING" | "COMPLETED" | "ENDED";
  metric: string;
  startDate: string;
  endDate: string;
  cells: { name: string; campaignId?: string; adSetId?: string; costPerResult: number; budgetShare: number }[];
  winner?: string;
  /** Chance the winner is real, 0–1. */
  confidence?: number;
};

export type LiftStudy = {
  id: string;
  name: string;
  kind: "CONVERSION_LIFT" | "BRAND_LIFT";
  status: "PLANNED" | "RUNNING" | "COMPLETED";
  startDate: string;
  endDate: string;
  campaignIds: string[];
  /** Share of people held out of seeing ads. */
  controlPct: number;
  metric: string;
  /** Relative lift for conversion studies; absolute points for brand studies. */
  lift?: number;
  confidence?: number;
  /** Conversion lift: results that would not have happened without the ads. */
  incrementalResults?: number;
  /** Brand lift: ad recall lift in points. */
  recallLiftPoints?: number;
};

// ─── Monitoring ─────────────────────────────────────────────────────────────

export type RuleMetric = "spend" | "costPerResult" | "roas" | "ctr" | "frequency" | "cpm" | "results";

export type MetaRule = {
  id: string;
  name: string;
  scope: "ACCOUNT" | "CAMPAIGN" | "AD_SET" | "AD";
  campaignId?: string;
  condition: { metric: RuleMetric; op: ">" | "<"; value: number; window: "LAST_3_DAYS" | "LAST_7_DAYS" | "LIFETIME" };
  action: "NOTIFY" | "PAUSE" | "INCREASE_BUDGET" | "DECREASE_BUDGET";
  amountPct?: number;
  schedule: "CONTINUOUS" | "DAILY";
  enabled: boolean;
  createdBy: "USER" | "AGENT";
  lastRun?: string;
  lastResult?: string;
};

export type Alert = {
  id: string;
  at: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  body: string;
  campaignId?: string;
  ruleId?: string;
  read: boolean;
  /** Question to hand to the agent from the alert. */
  prompt?: string;
};

export type OpportunityCategory = "CREATIVE" | "AUDIENCE" | "BUDGET" | "MEASUREMENT" | "PLACEMENTS";

export type Opportunity = {
  id: string;
  category: OpportunityCategory;
  title: string;
  description: string;
  /** Points added to the opportunity score when applied. */
  scoreGain: number;
  status: "OPEN" | "APPLIED" | "DISMISSED";
  entityLabel?: string;
  ops?: MutateOp[];
  prompt: string;
};

export type ScheduledReport = {
  id: string;
  name: string;
  breakdown: BreakdownKey;
  metrics: MetricKey[];
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  recipients: string[];
  format: "PDF" | "CSV" | "EMAIL";
  nextRun: string;
};

// ─── Safety, quality and billing ────────────────────────────────────────────

export type BlockList = { id: string; name: string; kind: "PUBLISHER" | "APP" | "WEBSITE"; entries: string[]; appliesTo: "ACCOUNT" | "CAMPAIGNS" };

export type InventoryFilter = "EXPANDED" | "MODERATE" | "LIMITED";

export type ContentExclusion = "NEWS" | "POLITICS" | "GAMBLING" | "TRAGEDY" | "MATURE";

export type BrandSafety = { inventoryFilter: InventoryFilter; excluded: ContentExclusion[] };

export type PolicyIssue = {
  id: string;
  level: "AD" | "ACCOUNT" | "PAGE";
  entityId?: string;
  entityName: string;
  policy: string;
  reason: string;
  status: "REJECTED" | "LIMITED" | "RESTRICTED" | "IN_REVIEW" | "RESOLVED";
  detectedAt: string;
  reviewRequested?: boolean;
};

export type LinkedAsset = {
  id: string;
  kind: "PAGE" | "INSTAGRAM" | "WHATSAPP" | "CATALOG" | "DATASET" | "APP" | "DOMAIN";
  name: string;
  externalId: string;
  status: "CONNECTED" | "NEEDS_ACTION" | "UNVERIFIED";
  detail: string;
};

/** Advantage+ audience segments: who Meta should treat as existing customers or engaged people. */
export type AudienceSegments = { existingCustomerAudienceIds: string[]; engagedAudienceIds: string[] };

export type ValueRule = {
  id: string;
  name: string;
  dimension: "AUDIENCE" | "LOCATION" | "PLACEMENT" | "OS";
  match: string;
  /** Bid adjustment in percent, e.g. +20 or -10. */
  adjustmentPct: number;
  status: "ACTIVE" | "PAUSED";
};

/** View only: the agent can never change billing, payment methods or the spending limit. */
/**
 * Only what the Marketing API really returns for an ad account: account_status, spend_cap,
 * amount_spent, balance and funding_source_details. The billing threshold and next charge date
 * are not exposed to apps, so they are not here: the page links to Meta Billing for them.
 */
export type BillingInfo = {
  /** spend_cap. 0 means no limit. */
  spendLimit: number;
  /** amount_spent: counted against the limit, and back to 0 when the limit is reset. */
  amountSpent: number;
  /** funding_source_details.display_string, e.g. "Visa ending 4417". Missing unless the connected user can manage the account. */
  paymentLabel?: string;
  /** balance: the bill amount currently owed. */
  balanceDue: number;
  accountStatus: "ACTIVE" | "DISABLED" | "UNSETTLED";
};

// ─── Metrics ────────────────────────────────────────────────────────────────

export type BaseMetrics = {
  spend: number;
  impressions: number;
  reach: number;
  linkClicks: number;
  landingPageViews: number;
  /** Events of each ad set's optimization goal. */
  results: number;
  purchases: number;
  purchaseValue: number;
  leads: number;
  addToCart: number;
  video3s: number;
  thruPlays: number;
  engagements: number;
};

export type Metrics = BaseMetrics & {
  cpm: number;
  frequency: number;
  ctr: number;
  cpc: number;
  costPerResult: number;
  roas: number;
  cpl: number;
  costPerLpv: number;
  /** 3-second plays per impression. */
  hookRate: number;
  /** ThruPlays per 3-second play. */
  holdRate: number;
};

export type MetaDailyPoint = BaseMetrics & { date: string };

export type MetricKey = keyof Metrics;

export type DateRangePreset = "LAST_7_DAYS" | "LAST_14_DAYS" | "LAST_30_DAYS" | "LAST_90_DAYS";

/** The attribution setting rides along with the date range, so every report uses the one chosen in the top bar. */
export type DateRange = { preset: DateRangePreset; start: string; end: string; attribution?: AttributionSetting };

export type BreakdownKey = "day" | "week" | "dayOfWeek" | "hour" | "device" | "country" | "age" | "gender" | "ageGender" | "platform" | "placement" | "objective";

// ─── Mutations ──────────────────────────────────────────────────────────────

/** An ad set as the editor holds it, before it has an id or any delivery. */
export type NewAdSet = Omit<AdSet, "id" | "campaignId" | "delivery" | "learning" | "createdAt">;
/** An ad as the editor holds it, before it has an id or a review. */
export type NewAd = Omit<MetaAd, "id" | "adSetId" | "delivery" | "review" | "rankings" | "createdAt">;

/** A campaign with everything it needs, created in one change. */
export type CampaignBundle = {
  campaign: Omit<MetaCampaign, "id" | "createdAt" | "delivery" | "labels">;
  adSets: {
    adSet: NewAdSet;
    ads: NewAd[];
  }[];
};

/** Part of an existing campaign the agent drafts: a new ad set (with its ads) or new ads in an existing ad set. */
export type PartDraft =
  | { kind: "adSet"; campaignId: string; adSet: NewAdSet; ads: NewAd[] }
  | { kind: "ad"; adSetId: string; ads: NewAd[] };

export type CollectionKey =
  | "rules"
  | "alerts"
  | "abTests"
  | "liftStudies"
  | "valueRules"
  | "audiences"
  | "blockLists"
  | "products"
  | "scheduledReports";

export type CollectionUpsert = { [K in CollectionKey]: { kind: "collection.upsert"; collection: K; items: MetaAccountData[K] } }[CollectionKey];

export type StatusEntity = "CAMPAIGN" | "AD_SET" | "AD";

export type MutateOp =
  | { kind: "campaign.create"; bundle: CampaignBundle; tempId: string }
  | { kind: "campaign.update"; campaignId: string; patch: Partial<Omit<MetaCampaign, "id">> }
  | { kind: "adSet.create"; adSet: AdSet; ads: MetaAd[] }
  | { kind: "adSet.update"; adSetId: string; patch: Partial<Omit<AdSet, "id" | "campaignId">> }
  | { kind: "ad.create"; ads: MetaAd[] }
  | { kind: "ad.update"; adId: string; patch: Partial<Omit<MetaAd, "id" | "adSetId">> }
  | { kind: "status.set"; entity: StatusEntity; ids: string[]; status: EntityStatus }
  | { kind: "budget.update"; entity: "CAMPAIGN" | "AD_SET"; id: string; budget: MetaBudget }
  | { kind: "targeting.update"; adSetId: string; patch: Partial<AdSetTargeting> }
  | { kind: "policy.requestReview"; issueId: string }
  /** Undo of a review request: puts the issue (and its ad) back as they were. */
  | { kind: "policy.restore"; issue: PolicyIssue; ad?: Pick<MetaAd, "id" | "review" | "delivery"> }
  | { kind: "account.update"; patch: Partial<Pick<MetaAccountData, "brandSafety" | "audienceSegments">> }
  | { kind: "opportunity.set"; ids: string[]; status: Opportunity["status"] }
  | { kind: "lead.set"; ids: string[]; status: Lead["status"] }
  | CollectionUpsert
  | { kind: "collection.remove"; collection: CollectionKey; ids: string[] };

export type DiffRow = {
  /** What is changed, e.g. "Budget · Advantage+ Sales". */
  label: string;
  before?: string;
  after: string;
};

export type ChangeSource = "AGENT" | "USER" | "OPPORTUNITY";

export type ChangeStatus = "PENDING" | "APPLIED" | "REJECTED" | "FAILED";

export type ProposedChange = {
  id: string;
  createdAt: string;
  source: ChangeSource;
  title: string;
  rationale: string;
  /** Short projected effect, e.g. "≈ $410/mo less wasted spend". */
  impact?: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  /** Significant edits reset the learning phase; the agent says so. */
  resetsLearning?: boolean;
  status: ChangeStatus;
  ops: MutateOp[];
  diff: DiffRow[];
  messageId?: string;
  error?: string;
};

export type ChangeTouched = { campaignIds: string[]; adSetIds: string[]; adIds: string[] };

export type ChangeEvent = {
  id: string;
  at: string;
  actor: string;
  source: ChangeSource;
  title: string;
  diff: DiffRow[];
  inverse?: MutateOp[];
  undone?: boolean;
  changeId?: string;
  touched?: ChangeTouched;
};

// ─── Account snapshot ───────────────────────────────────────────────────────

// ─── Organic content ────────────────────────────────────────────────────────

export type PostPlatform = "FACEBOOK" | "INSTAGRAM";
export type PostFormat = "POST" | "CAROUSEL" | "REEL" | "STORY" | "VIDEO";
export type PostStatus = "PUBLISHED" | "SCHEDULED" | "DRAFT" | "FAILED";

/** One frame of a post. Placeholder art until real media comes from the Page and Instagram APIs. */
export type PostMedia = { label: string; kind: "IMAGE" | "VIDEO"; durationSec?: number };

/** Engagement on a published post. Plays only exist for reels and videos. */
export type PostMetrics = { reach: number; impressions: number; likes: number; comments: number; shares: number; saves: number; plays?: number };

/** An organic Page or Instagram post: published, or scheduled to publish later. */
export type OrganicPost = {
  id: string;
  /** Cross-posted when both are set. */
  platforms: PostPlatform[];
  format: PostFormat;
  status: PostStatus;
  /** When it went out or will go out (ISO date-time, UTC). */
  publishAt: string;
  caption: string;
  media: PostMedia[];
  identity: { pageName: string; instagramHandle?: string };
  link?: string;
  /** Published posts only. */
  metrics?: PostMetrics;
  /** The ad that boosts this post, when there is one. */
  boostedAdId?: string;
  /** Why a post failed to publish. */
  error?: string;
  createdBy: "USER" | "AGENT";
};

export type MetaAccountData = {
  account: MetaAccount;
  portfolio: BusinessPortfolio;
  campaigns: MetaCampaign[];
  adSets: AdSet[];
  ads: MetaAd[];
  creatives: CreativeAsset[];
  concepts: CreativeConcept[];
  audiences: MetaAudience[];
  products: MetaProduct[];
  productSets: ProductSet[];
  datasets: Dataset[];
  customConversions: CustomConversion[];
  leadForms: LeadForm[];
  leads: Lead[];
  abTests: AbTest[];
  liftStudies: LiftStudy[];
  rules: MetaRule[];
  alerts: Alert[];
  opportunities: Opportunity[];
  scheduledReports: ScheduledReport[];
  blockLists: BlockList[];
  brandSafety: BrandSafety;
  policyIssues: PolicyIssue[];
  linkedAssets: LinkedAsset[];
  audienceSegments: AudienceSegments;
  valueRules: ValueRule[];
  billing: BillingInfo;
  /** Organic posts, reels and stories on the connected Page and Instagram account. */
  posts: OrganicPost[];
  /** Daily metrics per campaign id. */
  daily: Record<string, MetaDailyPoint[]>;
  /** Share of a parent's traffic per child (ad set of campaign, ad of ad set) and its conversion efficiency. Mock-only. */
  weights: Record<string, { share: number; efficiency: number }>;
};

// ─── Agent conversation ─────────────────────────────────────────────────────

export type AgentToolStep = {
  /** Tool name as the backend agent would call it, e.g. meta_insights. */
  tool: string;
  label: string;
  detail?: string;
};

export type ChatThread = {
  id: string;
  title: string;
  messages: AgentMessage[];
  /** "plan": the agent only describes what it would do and proposes nothing. */
  mode: "agent" | "plan";
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AgentMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
  at: string;
  steps?: AgentToolStep[];
  changeIds?: string[];
  followUps?: string[];
  viewHint?: MetaView;
  /** Reply asks to open the campaign editor prefilled. */
  draftBundle?: CampaignBundle;
  docId?: string;
  docAction?: "created" | "updated";
  docNote?: string;
  questions?: { id: string; label: string; options: string[] }[];
  answered?: boolean;
  team?: { role: string; task: string; status: "WAITING" | "WORKING" | "DONE" }[];
  todo?: { label: string; done: boolean }[];
  memoryAdded?: string;
};

export type MetaView =
  // Top
  | "overview"
  | "opportunities"
  | "reports"
  // Structure
  | "campaigns"
  | "adSets"
  | "ads"
  | "calendar"
  | "creatives"
  | "experiments"
  | "catalog"
  | "leadForms"
  // Insights
  | "placements"
  | "demographics"
  | "trends"
  | "reachFrequency"
  | "landingPages"
  | "breakdowns"
  // Targeting & audiences
  | "audiences"
  | "locations"
  | "adSetAudience"
  | "adSetPlacements"
  // Setup
  | "eventsManager"
  | "linkedAssets"
  | "accountQuality"
  | "brandSafety"
  | "billing"
  | "connections"
  | "accountSettings"
  | "settings"
  | "adSetSettings"
  // Agent
  | "documents"
  | "profile"
  | "rules"
  // Off-nav pages
  | "pending"
  | "history"
  | "planner";

/** Where the user is: the whole account, a campaign, or an ad set inside it. */
export type MetaScope = { campaignId?: string; adSetId?: string };

/** The Facebook Page and Instagram account the signed-in user can reach, and the Business portfolios behind them. */
export type MetaPortfolioChoice = { portfolio: BusinessPortfolio; accounts: MetaAccount[] };

/** A catalog the signed-in user can reach in Commerce Manager (own connection, separate from the ad account). */
export type CatalogAccount = { catalogId: string; name: string; website: string; productCount: number };
