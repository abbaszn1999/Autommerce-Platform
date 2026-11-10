// Creating things in a live Google Ads account: campaigns of every type the API
// allows, ad groups, ads, Performance Max asset groups, assets, audiences,
// targeting, conversion actions and shared lists. Pure, like live-mutate: the
// server reads Google's current state (and downloads images) first.
//
// Safety rules enforced here, on top of live-mutate's:
// - every new campaign is created PAUSED: it spends nothing until someone turns it on;
// - one atomic request: budget, campaign, ad groups, ads and assets all exist, or none do;
// - every text is checked against Google's length limits before anything is sent;
// - undo removes exactly what this change created (Google's ids, kept by the server),
//   and puts back what it replaced (targeting, links);
// - Video campaigns can't be created: Google's API doesn't allow it.

import type { BeforeState, CreatedRef } from "./live-mutate";

export class CreatePlanError extends Error {}

type MatchType = "BROAD" | "PHRASE" | "EXACT";
type NewKeyword = { text: string; matchType: MatchType; cpcBid?: number };
type NewNegative = { text: string; matchType: MatchType };
type Images = { landscape?: string[]; square?: string[]; portrait?: string[]; logo?: string[]; landscapeLogo?: string[] };

export type NewAd =
  | { type: "RSA"; finalUrl: string; headlines: string[]; descriptions: string[]; path1?: string; path2?: string }
  | { type: "DISPLAY"; finalUrl: string; headlines: string[]; longHeadline: string; descriptions: string[]; businessName: string; images: Images }
  | { type: "DEMAND_GEN"; finalUrl: string; headlines: string[]; descriptions: string[]; businessName: string; images: Images; callToAction?: string };

export type NewAdGroup = { name: string; defaultCpcBid?: number; keywords?: NewKeyword[]; negatives?: NewNegative[]; ads?: NewAd[] };

export type NewAssetGroup = {
  name: string;
  finalUrl?: string;
  headlines?: string[];
  longHeadlines?: string[];
  descriptions?: string[];
  businessName?: string;
  images?: Images;
  videos?: string[];
  searchThemes?: string[];
};

export type CampaignType = "SEARCH" | "SHOPPING" | "PERFORMANCE_MAX" | "DISPLAY" | "DEMAND_GEN";
export type Strategy = "MANUAL_CPC" | "MAXIMIZE_CLICKS" | "MAXIMIZE_CONVERSIONS" | "MAXIMIZE_CONVERSION_VALUE";

export type NewAsset =
  | { type: "SITELINK"; text: string; description1?: string; description2?: string; finalUrl: string }
  | { type: "CALLOUT"; text: string }
  | { type: "CALL"; countryCode: string; phoneNumber: string }
  | { type: "STRUCTURED_SNIPPET"; header: string; values: string[] };

export type ScheduleSlot = { day: string; startHour: number; endHour: number; bidModifier?: number };

export type CreateOp =
  | {
      kind: "campaign.new";
      type: CampaignType;
      name: string;
      dailyBudget: number;
      bidding: { strategy: Strategy; targetCpa?: number; targetRoas?: number; maxCpc?: number };
      locations: string[];
      excludedLocations?: string[];
      languages: string[];
      searchPartners?: boolean;
      merchantId?: string;
      startDate?: string;
      endDate?: string;
      /** Performance Max: the brand's name and square logo, shown in every ad. */
      businessName?: string;
      logo?: string;
      negatives?: NewNegative[];
      adGroups?: NewAdGroup[];
      assetGroups?: NewAssetGroup[];
    }
  | { kind: "adGroup.new"; campaignId: string; adGroup: NewAdGroup; status?: "ENABLED" | "PAUSED" }
  | { kind: "ad.new"; adGroupId: string; ad: NewAd; status?: "ENABLED" | "PAUSED" }
  | { kind: "assetGroup.new"; campaignId: string; assetGroup: NewAssetGroup; status?: "ENABLED" | "PAUSED" }
  | ({ kind: "assetGroupAsset.add"; assetGroupId: string; existing?: { assetId: string; fieldType: string }[] } & Omit<NewAssetGroup, "name" | "finalUrl" | "searchThemes">)
  | { kind: "assetGroupAsset.remove"; ids: string[] }
  | { kind: "searchTheme.add"; assetGroupId: string; themes: string[] }
  | { kind: "asset.new"; level: "ACCOUNT" | "CAMPAIGN" | "AD_GROUP"; parentId?: string; assets: NewAsset[] }
  | { kind: "audience.add"; level: "CAMPAIGN" | "AD_GROUP"; parentId: string; userListIds: string[]; mode?: "OBSERVATION" | "TARGETING"; bidModifier?: number }
  | { kind: "audienceSetting.set"; level: "CAMPAIGN" | "AD_GROUP"; parentId: string; restrictions: unknown[] }
  | { kind: "location.add"; campaignId: string; geoIds: string[]; exclude?: boolean; bidModifier?: number }
  | { kind: "language.add"; campaignId: string; languageIds: string[] }
  | { kind: "schedule.add"; campaignId: string; slots: ScheduleSlot[] }
  | { kind: "targeting.remove"; campaignId: string; criterionIds: string[] }
  | { kind: "device.set"; campaignId: string; device: "MOBILE" | "DESKTOP" | "TABLET"; bidModifier: number }
  | { kind: "placement.exclude"; campaignId: string; urls: string[] }
  | { kind: "conversion.new"; name: string; category: string; countingType?: "ONE_PER_CLICK" | "MANY_PER_CLICK"; defaultValue?: number; alwaysUseDefaultValue?: boolean }
  | { kind: "negativeList.new"; name: string; keywords: NewNegative[]; campaignIds?: string[] }
  | { kind: "label.new"; name: string; color?: string; campaignIds?: string[] }
  | { kind: "created.remove"; resources: string[] };

export const CREATE_OPS = [
  "campaign.new",
  "adGroup.new",
  "ad.new",
  "assetGroup.new",
  "assetGroupAsset.add",
  "assetGroupAsset.remove",
  "searchTheme.add",
  "asset.new",
  "audience.add",
  "audienceSetting.set",
  "location.add",
  "language.add",
  "schedule.add",
  "targeting.remove",
  "device.set",
  "placement.exclude",
  "conversion.new",
  "negativeList.new",
  "label.new",
  "created.remove",
] as const;

/** Only the server's own undo may send these. */
export const UNDO_ONLY_OPS = new Set(["created.remove", "audienceSetting.set"]);

export const isCreateOp = (op: { kind: string }): op is CreateOp => (CREATE_OPS as readonly string[]).includes(op.kind);

/** What the planner needs beyond live-mutate's BeforeState. */
export type CreateState = {
  /** Downloaded images by URL: base64 data, ready for an image asset. */
  images: Record<string, string>;
  /** Asset groups that exist, with their campaign. */
  assetGroups: Record<string, { name: string; campaignId: string }>;
  /** Links of those asset groups, keyed "assetGroupId~assetId~FIELD". */
  assetGroupAssets: Record<string, { text?: string }>;
  /** Targeting criteria of the campaigns touched, keyed "campaignId~criterionId". */
  targeting: Record<string, { type: string; geoId?: string; languageId?: string; negative?: boolean; bidModifier?: number; slot?: ScheduleSlot; device?: string }>;
  /** Audience target restrictions of the campaigns and ad groups touched. */
  restrictions: Record<string, unknown[]>;
  /** Campaign types, for checks that depend on them. */
  campaignTypes: Record<string, string>;
  /** Campaigns that sell from a Merchant Center feed (Shopping, retail Performance Max). */
  retailCampaigns: Set<string>;
  /** Resource names earlier changes in this workspace created: only these may be removed by an undo. */
  createdResources: Set<string>;
  /** Merchant Center accounts linked to this ad account (null when not read). */
  merchantLinks: string[] | null;
  /** Readable names for the card: locations, languages and audience lists, keyed "location:2422". */
  names: Record<string, string>;
};

export const emptyCreateState = (): CreateState => ({ images: {}, assetGroups: {}, assetGroupAssets: {}, targeting: {}, restrictions: {}, campaignTypes: {}, retailCampaigns: new Set(), createdResources: new Set(), merchantLinks: null, names: {} });

const ID = /^\d{1,20}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const SNIPPET_HEADERS = ["Amenities", "Brands", "Courses", "Degree programs", "Destinations", "Featured hotels", "Insurance coverage", "Models", "Neighborhoods", "Service catalog", "Shows", "Styles", "Types"];
const CONVERSION_CATEGORIES = ["PURCHASE", "ADD_TO_CART", "BEGIN_CHECKOUT", "SUBMIT_LEAD_FORM", "SIGNUP", "PHONE_CALL_LEAD", "PAGE_VIEW", "CONTACT", "SUBSCRIBE_PAID", "BOOK_APPOINTMENT", "REQUEST_QUOTE", "GET_DIRECTIONS", "OUTBOUND_CLICK", "DOWNLOAD", "ENGAGEMENT", "STORE_VISIT", "STORE_SALE", "QUALIFIED_LEAD", "CONVERTED_LEAD"];
const STRATEGIES: Record<CampaignType, Strategy[]> = {
  SEARCH: ["MANUAL_CPC", "MAXIMIZE_CLICKS", "MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE"],
  SHOPPING: ["MANUAL_CPC", "MAXIMIZE_CLICKS", "MAXIMIZE_CONVERSION_VALUE"],
  PERFORMANCE_MAX: ["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE"],
  DISPLAY: ["MANUAL_CPC", "MAXIMIZE_CLICKS", "MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE"],
  DEMAND_GEN: ["MAXIMIZE_CLICKS", "MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE"],
};

/** Which mutate operation removes a resource, by its collection in the resource name. */
const REMOVABLE: Record<string, string> = {
  campaigns: "campaign_operation",
  adGroups: "ad_group_operation",
  adGroupAds: "ad_group_ad_operation",
  adGroupCriteria: "ad_group_criterion_operation",
  campaignCriteria: "campaign_criterion_operation",
  customerAssets: "customer_asset_operation",
  campaignAssets: "campaign_asset_operation",
  adGroupAssets: "ad_group_asset_operation",
  assetGroups: "asset_group_operation",
  assetGroupAssets: "asset_group_asset_operation",
  assetGroupSignals: "asset_group_signal_operation",
  conversionActions: "conversion_action_operation",
  sharedSets: "shared_set_operation",
  campaignSharedSets: "campaign_shared_set_operation",
  labels: "label_operation",
  campaignLabels: "campaign_label_operation",
};

type Ctx = {
  customerId: string;
  before: BeforeState;
  state: CreateState;
  undo: boolean;
  operations: Record<string, unknown>[];
  inverse: { kind: string; [key: string]: unknown }[];
  created: CreatedRef[];
  warnings: string[];
  toMicros: (amount: number) => string;
  /** Temporary ids are negative and unique across the whole change. */
  temp: { next: number };
};

// ─── Checks ─────────────────────────────────────────────────────────────────

const fail = (message: string): never => {
  throw new CreatePlanError(message);
};

function txt(value: unknown, max: number, what: string): string {
  const t = typeof value === "string" ? value.trim() : "";
  if (!t) fail(`${what} is empty.`);
  if (t.length > max) fail(`${what} "${t}" is longer than ${max} characters.`);
  return t;
}

function texts(list: unknown, min: number, max: number, maxLen: number, what: string): string[] {
  const items = Array.isArray(list) ? list.map((v, i) => txt(v, maxLen, `${what} ${i + 1}`)) : [];
  if (items.length < min || items.length > max) fail(`Give ${min === max ? min : `${min} to ${max}`} ${what.toLowerCase()}s (got ${items.length}).`);
  if (new Set(items.map((t) => t.toLowerCase())).size !== items.length) fail(`Two ${what.toLowerCase()}s are the same.`);
  return items;
}

function amount(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) fail(`${what} must be a positive amount.`);
  return value as number;
}

function webUrl(value: unknown, what = "The final URL"): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(v) || v.length > 2048) fail(`${what} "${v}" isn't a valid web address.`);
  return v;
}

function ids(list: unknown, what: string): string[] {
  const out = Array.isArray(list) ? list.map(String) : [];
  if (!out.length) fail(`Give at least one ${what}.`);
  for (const id of out) if (!ID.test(id)) fail(`"${id}" isn't a valid ${what}.`);
  return [...new Set(out)];
}

const isMatch = (m: unknown): m is MatchType => m === "BROAD" || m === "PHRASE" || m === "EXACT";

function keyword(k: NewKeyword | NewNegative, what: string) {
  const words = txt(k?.text, 80, what);
  if (words.split(/\s+/).length > 10) fail(`"${words}" has more than 10 words.`);
  if (!isMatch(k.matchType)) fail(`"${words}" needs a match type: BROAD, PHRASE or EXACT.`);
  return { text: words, matchType: k.matchType };
}

/** -0.9 … +9 as Google's multiplier (0.1 … 10); -1 is "never" (0). */
function modifier(change: unknown, what: string): number {
  if (typeof change !== "number" || !Number.isFinite(change) || change < -1 || change > 9) fail(`${what} must be between -100% and +900% (-1 to 9).`);
  return Math.round((1 + (change as number)) * 100) / 100;
}

// ─── Building blocks ────────────────────────────────────────────────────────

function builder(ctx: Ctx) {
  const rn = (collection: string, id: string) => `customers/${ctx.customerId}/${collection}/${id}`;
  const temp = (collection: string) => rn(collection, String(ctx.temp.next--));
  const create = (family: string, resource: Record<string, unknown>, undoRoot = false) => {
    if (undoRoot) ctx.created.push({ index: ctx.operations.length, kind: "resource", ref: family });
    ctx.operations.push({ [family]: { create: resource } });
  };
  // One image asset per URL in a change, however many places use it.
  const imageAssets = new Map<string, string>();
  const image = (url: string, what: string) => {
    const u = webUrl(url, what);
    const known = imageAssets.get(u);
    if (known) return known;
    const data = ctx.state.images[u];
    if (!data) fail(`${what} ${u} couldn't be downloaded. Use a public https link to a JPG, PNG or GIF under 5 MB.`);
    const name = temp("assets");
    create("asset_operation", { resourceName: name, name: `${(u.split("/").pop() || "image").slice(0, 80)} · ${Date.now().toString(36)}${Math.abs(ctx.temp.next)}`, type: "IMAGE", imageAsset: { data } });
    imageAssets.set(u, name);
    return name;
  };
  const textAsset = (value: string) => {
    const name = temp("assets");
    create("asset_operation", { resourceName: name, textAsset: { text: value } });
    return name;
  };
  return { rn, temp, create, image, textAsset };
}

function biddingFields(type: CampaignType, bidding: Extract<CreateOp, { kind: "campaign.new" }>["bidding"], ctx: Ctx): Record<string, unknown> {
  const strategy = bidding?.strategy;
  if (!STRATEGIES[type].includes(strategy)) fail(`${type.replace("_", " ").toLowerCase()} campaigns can use: ${STRATEGIES[type].join(", ")}.`);
  const micros = (v: number | undefined, what: string) => (v === undefined ? undefined : ctx.toMicros(amount(v, what)));
  switch (strategy) {
    case "MANUAL_CPC":
      return { manualCpc: {} };
    case "MAXIMIZE_CLICKS":
      return { targetSpend: bidding.maxCpc !== undefined ? { cpcBidCeilingMicros: micros(bidding.maxCpc, "The max CPC limit") } : {} };
    case "MAXIMIZE_CONVERSIONS":
      return { maximizeConversions: bidding.targetCpa !== undefined ? { targetCpaMicros: micros(bidding.targetCpa, "The target CPA") } : {} };
    case "MAXIMIZE_CONVERSION_VALUE": {
      if (bidding.targetRoas !== undefined && (typeof bidding.targetRoas !== "number" || bidding.targetRoas < 0.01 || bidding.targetRoas > 1000))
        fail("The target ROAS is a ratio, e.g. 4 for 400%.");
      if (type === "SHOPPING" && bidding.targetRoas !== undefined) return { targetRoas: { targetRoas: bidding.targetRoas } };
      return { maximizeConversionValue: bidding.targetRoas !== undefined ? { targetRoas: bidding.targetRoas } : {} };
    }
  }
  return fail("Unknown bid strategy.");
}

type B = ReturnType<typeof builder>;

function addAd(ad: NewAd, adGroup: string, campaignType: string, status: string, ctx: Ctx, b: B, undoRoot: boolean) {
  const imageLinks = (list: string[] | undefined, what: string, min: number, max: number) => {
    const urls = Array.isArray(list) ? list : [];
    if (urls.length < min || urls.length > max) fail(`Give ${min} to ${max} ${what} images (got ${urls.length}).`);
    return urls.map((u) => ({ asset: b.image(u, `The ${what} image`) }));
  };
  let body: Record<string, unknown>;
  const finalUrls = [webUrl(ad?.finalUrl)];
  switch (ad?.type) {
    case "RSA": {
      if (campaignType !== "SEARCH") fail("Responsive search ads go in Search campaigns.");
      const path = (p: unknown, n: number) => (p === undefined || p === "" ? undefined : txt(p, 15, `Path ${n}`));
      body = {
        finalUrls,
        responsiveSearchAd: {
          headlines: texts(ad.headlines, 3, 15, 30, "Headline").map((text) => ({ text })),
          descriptions: texts(ad.descriptions, 2, 4, 90, "Description").map((text) => ({ text })),
          ...(path(ad.path1, 1) ? { path1: path(ad.path1, 1) } : {}),
          ...(path(ad.path2, 2) ? { path2: path(ad.path2, 2) } : {}),
        },
      };
      break;
    }
    case "DISPLAY":
      if (campaignType !== "DISPLAY") fail("Responsive display ads go in Display campaigns.");
      body = {
        finalUrls,
        responsiveDisplayAd: {
          marketingImages: imageLinks(ad.images?.landscape, "landscape (1.91:1)", 1, 15),
          squareMarketingImages: imageLinks(ad.images?.square, "square (1:1)", 1, 15),
          ...(ad.images?.logo?.length ? { squareLogoImages: imageLinks(ad.images.logo, "logo (1:1)", 1, 5) } : {}),
          headlines: texts(ad.headlines, 1, 5, 30, "Headline").map((text) => ({ text })),
          longHeadline: { text: txt(ad.longHeadline, 90, "The long headline") },
          descriptions: texts(ad.descriptions, 1, 5, 90, "Description").map((text) => ({ text })),
          businessName: txt(ad.businessName, 25, "The business name"),
        },
      };
      break;
    case "DEMAND_GEN":
      if (campaignType !== "DEMAND_GEN") fail("Demand Gen ads go in Demand Gen campaigns.");
      body = {
        finalUrls,
        demandGenMultiAssetAd: {
          marketingImages: imageLinks(ad.images?.landscape, "landscape (1.91:1)", 1, 20),
          squareMarketingImages: imageLinks(ad.images?.square, "square (1:1)", 1, 20),
          ...(ad.images?.portrait?.length ? { portraitMarketingImages: imageLinks(ad.images.portrait, "portrait (4:5)", 1, 20) } : {}),
          logoImages: imageLinks(ad.images?.logo, "logo (1:1)", 1, 5),
          headlines: texts(ad.headlines, 1, 5, 40, "Headline").map((text) => ({ text })),
          descriptions: texts(ad.descriptions, 1, 5, 90, "Description").map((text) => ({ text })),
          businessName: txt(ad.businessName, 25, "The business name"),
          ...(ad.callToAction ? { callToActionText: txt(ad.callToAction, 10, "The call to action") } : {}),
        },
      };
      break;
    default:
      return fail('Ads are { "type": "RSA" | "DISPLAY" | "DEMAND_GEN", ... }.');
  }
  b.create("ad_group_ad_operation", { adGroup, status, ad: body }, undoRoot);
}

function addAdGroup(
  group: NewAdGroup,
  campaign: string,
  campaignType: string,
  status: string,
  ctx: Ctx,
  b: B,
  undoRoot: boolean,
  targeting?: { locations: string[]; excluded: string[]; languages: string[] }
) {
  const name = b.temp("adGroups");
  const type = { SEARCH: "SEARCH_STANDARD", SHOPPING: "SHOPPING_PRODUCT_ADS", DISPLAY: "DISPLAY_STANDARD" }[campaignType];
  if (campaignType === "PERFORMANCE_MAX") fail("Performance Max uses asset groups, not ad groups.");
  const bid = group?.defaultCpcBid !== undefined ? ctx.toMicros(amount(group.defaultCpcBid, "The default bid")) : undefined;
  b.create("ad_group_operation", { resourceName: name, campaign, name: txt(group?.name, 255, "The ad group name"), status, ...(type ? { type } : {}), ...(bid ? { cpcBidMicros: bid } : {}) }, undoRoot);
  for (const id of targeting?.locations ?? []) b.create("ad_group_criterion_operation", { adGroup: name, location: { geoTargetConstant: `geoTargetConstants/${id}` } });
  for (const id of targeting?.excluded ?? []) b.create("ad_group_criterion_operation", { adGroup: name, negative: true, location: { geoTargetConstant: `geoTargetConstants/${id}` } });
  for (const id of targeting?.languages ?? []) b.create("ad_group_criterion_operation", { adGroup: name, language: { languageConstant: `languageConstants/${id}` } });
  if (campaignType === "DEMAND_GEN" && !targeting && !undoRoot) fail("Demand Gen ad groups need their locations.");
  const keywords = group.keywords ?? [];
  if (keywords.length && campaignType !== "SEARCH") fail("Keywords go in Search ad groups.");
  if (keywords.length > 100) fail("At most 100 keywords per ad group in one change.");
  const seen = new Set<string>();
  for (const k of keywords) {
    const kw = keyword(k, "A keyword");
    const key = `${kw.text.toLowerCase()}|${kw.matchType}`;
    if (seen.has(key)) fail(`"${kw.text}" (${kw.matchType.toLowerCase()}) is listed twice.`);
    seen.add(key);
    b.create("ad_group_criterion_operation", { adGroup: name, status: "ENABLED", keyword: kw, ...(k.cpcBid !== undefined ? { cpcBidMicros: ctx.toMicros(amount(k.cpcBid, `The bid for "${kw.text}"`)) } : {}) });
  }
  for (const n of group.negatives ?? []) b.create("ad_group_criterion_operation", { adGroup: name, negative: true, keyword: keyword(n, "A negative keyword") });
  if (campaignType === "SHOPPING") {
    // Every product in the feed, in one group, at the ad group's bid.
    b.create("ad_group_criterion_operation", { adGroup: name, status: "ENABLED", listingGroup: { type: "UNIT" }, ...(bid ? { cpcBidMicros: bid } : {}) });
    b.create("ad_group_ad_operation", { adGroup: name, status: "ENABLED", ad: { shoppingProductAd: {} } });
  }
  for (const ad of group.ads ?? []) addAd(ad, name, campaignType, "ENABLED", ctx, b, false);
  if (campaignType === "SEARCH" && !(group.ads ?? []).length) ctx.warnings.push(`The ad group "${group.name}" has no ad yet: it can't show until one is added.`);
}

const FIELD = { landscape: "MARKETING_IMAGE", square: "SQUARE_MARKETING_IMAGE", portrait: "PORTRAIT_MARKETING_IMAGE", logo: "LOGO", landscapeLogo: "LANDSCAPE_LOGO" } as const;

/**
 * Text, image and video links of an asset group, with Google's limits. The brand
 * (business name and logo) lives on the campaign, so a group only adds them when given.
 */
function linkGroupAssets(group: Omit<NewAssetGroup, "name" | "finalUrl" | "searchThemes">, assetGroup: string, b: B, undoRoot: boolean, partial: boolean, brandOnCampaign = false, defer?: (asset: string, fieldType: string) => void) {
  // Google counts a new asset group's assets when it is created: then every asset must already exist and every link follow it.
  const link = defer ?? ((asset: string, fieldType: string) => b.create("asset_group_asset_operation", { assetGroup, asset, fieldType }, undoRoot));
  const range = (list: string[] | undefined, min: number, max: number, len: number, what: string) =>
    partial ? (Array.isArray(list) ? list.map((v, i) => txt(v, len, `${what} ${i + 1}`)) : []) : texts(list ?? [], min, max, len, what);
  const headlines = range(group.headlines, 3, 15, 30, "Headline");
  const longHeadlines = range(group.longHeadlines, 1, 5, 90, "Long headline");
  const descriptions = range(group.descriptions, 2, 5, 90, "Description");
  if (!partial && !descriptions.some((d) => d.length <= 60)) fail("One description must be 60 characters or fewer.");
  for (const t of headlines) link(b.textAsset(t), "HEADLINE");
  for (const t of longHeadlines) link(b.textAsset(t), "LONG_HEADLINE");
  for (const t of descriptions) link(b.textAsset(t), "DESCRIPTION");
  if (group.businessName && !brandOnCampaign) link(b.textAsset(txt(group.businessName, 25, "The business name")), "BUSINESS_NAME");
  const images = { ...(group.images ?? {}), ...(brandOnCampaign ? { logo: undefined, landscapeLogo: undefined } : {}) };
  if (!partial && !images.landscape?.length) fail("Give at least one landscape (1.91:1) image.");
  if (!partial && !images.square?.length) fail("Give at least one square (1:1) image.");
  for (const [key, field] of Object.entries(FIELD) as [keyof Images, string][]) for (const url of images[key] ?? []) link(b.image(url, `The ${key} image`), field);
  for (const id of group.videos ?? []) {
    const v = String(id).trim().replace(/^.*(?:v=|youtu\.be\/|shorts\/)/, "").slice(0, 11);
    if (!/^[\w-]{11}$/.test(v)) fail(`"${id}" isn't a YouTube video id or link.`);
    const asset = b.temp("assets");
    b.create("asset_operation", { resourceName: asset, youtubeVideoAsset: { youtubeVideoId: v } });
    link(asset, "YOUTUBE_VIDEO");
  }
}

function addAssetGroup(group: NewAssetGroup, campaign: string, retail: boolean, status: string, ctx: Ctx, b: B, undoRoot: boolean, brandOnCampaign = false) {
  const name = b.temp("assetGroups");
  const hasAssets = !!(group.headlines?.length || group.descriptions?.length || group.images || group.videos?.length);
  if (!retail && !group.finalUrl) fail("A Performance Max asset group without a product feed needs a final URL.");
  // Assets first, then the group, then the links (Google checks the minimum as the group is created).
  const links: [string, string][] = [];
  // With a feed, Google can build ads from the products alone; custom assets then need the full minimum.
  if (!retail || hasAssets) {
    if (retail && !group.finalUrl) fail("An asset group with its own assets needs a final URL.");
    linkGroupAssets(group, name, b, false, false, brandOnCampaign, (asset, fieldType) => links.push([asset, fieldType]));
  }
  b.create("asset_group_operation", { resourceName: name, campaign, name: txt(group?.name, 255, "The asset group name"), status, ...(group.finalUrl ? { finalUrls: [webUrl(group.finalUrl)] } : {}) }, undoRoot);
  for (const [asset, fieldType] of links) b.create("asset_group_asset_operation", { assetGroup: name, asset, fieldType });
  if (retail) b.create("asset_group_listing_group_filter_operation", { assetGroup: name, type: "UNIT_INCLUDED", listingSource: "SHOPPING" });
  for (const theme of group.searchThemes ?? []) b.create("asset_group_signal_operation", { assetGroup: name, searchTheme: { text: txt(theme, 80, "A search theme") } });
  if ((group.searchThemes ?? []).length > 50) fail("At most 50 search themes per asset group.");
}

// ─── The planner ───────────────────────────────────────────────────────────

export function planCreate(op: CreateOp, ctx: Ctx): void {
  const b = builder(ctx);
  const { before, state } = ctx;
  const campaignOf = (id: string) => {
    const c = ID.test(id) ? before.campaigns[id] : undefined;
    if (!c) fail(`Campaign ${id} isn't in this account.`);
    return c!;
  };
  if (UNDO_ONLY_OPS.has(op.kind) && !ctx.undo) fail(`"${op.kind}" is only used by Undo.`);

  switch (op.kind) {
    case "campaign.new": {
      const type = op.type;
      if ((type as string) === "VIDEO") fail("Google's API can't create Video campaigns. Use a Demand Gen campaign for YouTube video ads, or create the Video campaign in Google Ads.");
      if (!STRATEGIES[type]) fail("type must be SEARCH, SHOPPING, PERFORMANCE_MAX, DISPLAY or DEMAND_GEN.");
      const name = txt(op.name, 255, "The campaign name");
      const daily = amount(op.dailyBudget, "The daily budget");
      if (before.spend && daily * 30.4 > before.spend.monthlyCap)
        fail(`A daily budget of ${daily} is about ${Math.round(daily * 30.4)} a month, above the monthly budget cap of ${before.spend.monthlyCap} in the Business profile.`);
      const locations = ids(op.locations, "location id");
      const languages = ids(op.languages, "language id");
      const retail = type === "SHOPPING" || (type === "PERFORMANCE_MAX" && !!op.merchantId);
      if (type === "SHOPPING" && !op.merchantId) fail("A Shopping campaign needs the Merchant Center id (merchantId) linked to this account.");
      if (op.merchantId !== undefined && !ID.test(String(op.merchantId))) fail("merchantId must be the Merchant Center account number.");
      if (op.merchantId !== undefined && state.merchantLinks && !state.merchantLinks.includes(String(op.merchantId)))
        fail(`Merchant Center ${op.merchantId} isn't linked to this Google Ads account. Link it first (Google Ads → Tools → Data manager → Google Merchant Center), then try again.`);
      for (const d of [op.startDate, op.endDate]) if (d !== undefined && !DAY.test(String(d))) fail("Dates are YYYY-MM-DD.");
      if (op.startDate && op.endDate && op.endDate < op.startDate) fail("The end date is before the start date.");

      const budget = b.temp("campaignBudgets");
      b.create("campaign_budget_operation", {
        resourceName: budget,
        name: `${name.slice(0, 200)} budget ${Date.now().toString(36)}`,
        amountMicros: ctx.toMicros(daily),
        deliveryMethod: "STANDARD",
        explicitlyShared: false,
      });
      const campaign = b.temp("campaigns");
      b.create(
        "campaign_operation",
        {
          resourceName: campaign,
          name,
          status: "PAUSED",
          advertisingChannelType: type,
          campaignBudget: budget,
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          ...(type !== "DEMAND_GEN" ? { geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE" } } : {}),
          ...(type === "SEARCH" ? { networkSettings: { targetGoogleSearch: true, targetSearchNetwork: !!op.searchPartners, targetContentNetwork: false, targetPartnerSearchNetwork: false } } : {}),
          ...(retail ? { shoppingSetting: { merchantId: String(op.merchantId), ...(type === "SHOPPING" ? { campaignPriority: 0 } : {}) } } : {}),
          ...(op.startDate ? { startDateTime: `${op.startDate} 00:00:00` } : {}),
          ...(op.endDate ? { endDateTime: `${op.endDate} 23:59:59` } : {}),
          ...biddingFields(type, op.bidding, ctx),
        },
        true
      );
      const excluded = op.excludedLocations ? ids(op.excludedLocations, "location id") : [];
      // Demand Gen keeps locations and languages on each ad group; other types on the campaign.
      const where = type === "DEMAND_GEN" ? null : campaign;
      if (where) {
        for (const id of locations) b.create("campaign_criterion_operation", { campaign, location: { geoTargetConstant: `geoTargetConstants/${id}` } });
        for (const id of excluded) b.create("campaign_criterion_operation", { campaign, negative: true, location: { geoTargetConstant: `geoTargetConstants/${id}` } });
        for (const id of languages) b.create("campaign_criterion_operation", { campaign, language: { languageConstant: `languageConstants/${id}` } });
      }
      const groupTargeting = where ? undefined : { locations, excluded, languages };
      for (const n of op.negatives ?? []) b.create("campaign_criterion_operation", { campaign, negative: true, keyword: keyword(n, "A negative keyword") });

      if (type === "PERFORMANCE_MAX") {
        if ((op.adGroups ?? []).length) fail("Performance Max uses asset groups, not ad groups.");
        const groups = op.assetGroups ?? [];
        if (!groups.length) fail("A Performance Max campaign needs at least one asset group.");
        // Brand guidelines: the business name and logo belong to the campaign, used by every asset group.
        const brandName = txt(op.businessName ?? groups[0]?.businessName, 25, "The business name");
        const logo = op.logo ?? groups[0]?.images?.logo?.[0];
        if (!logo) fail("Give the square logo (logo) for the campaign.");
        b.create("campaign_asset_operation", { campaign, asset: b.textAsset(brandName), fieldType: "BUSINESS_NAME" });
        b.create("campaign_asset_operation", { campaign, asset: b.image(logo!, "The logo"), fieldType: "LOGO" });
        for (const g of groups) addAssetGroup(g, campaign, retail, "ENABLED", ctx, b, false, true);
      } else {
        if ((op.assetGroups ?? []).length) fail("Only Performance Max campaigns have asset groups.");
        const groups = op.adGroups ?? [];
        if (!groups.length) fail("The campaign needs at least one ad group.");
        for (const g of groups) addAdGroup(g, campaign, type, "ENABLED", ctx, b, false, groupTargeting);
      }
      ctx.warnings.push("The new campaign is created paused: it spends nothing until you turn it on.");
      return;
    }

    case "adGroup.new": {
      const c = campaignOf(op.campaignId);
      const type = state.campaignTypes[op.campaignId] ?? "";
      const status = op.status ?? "PAUSED";
      if (status !== "ENABLED" && status !== "PAUSED") fail("status is ENABLED or PAUSED.");
      if (status === "ENABLED" && c.status === "ENABLED") ctx.warnings.push("The new ad group is turned on in a running campaign: it starts spending once its ads are approved.");
      addAdGroup(op.adGroup, b.rn("campaigns", op.campaignId), type, status, ctx, b, true);
      return;
    }

    case "ad.new": {
      const g = ID.test(op.adGroupId) ? before.adGroups[op.adGroupId] : undefined;
      if (!g) fail(`Ad group ${op.adGroupId} isn't in this account.`);
      const status = op.status ?? "ENABLED";
      if (status !== "ENABLED" && status !== "PAUSED") fail("status is ENABLED or PAUSED.");
      addAd(op.ad, b.rn("adGroups", op.adGroupId), state.campaignTypes[g!.campaignId] ?? "", status, ctx, b, true);
      return;
    }

    case "assetGroup.new": {
      campaignOf(op.campaignId);
      if (state.campaignTypes[op.campaignId] !== "PERFORMANCE_MAX") fail("Asset groups go in Performance Max campaigns.");
      const retail = state.retailCampaigns.has(op.campaignId);
      addAssetGroup(op.assetGroup, b.rn("campaigns", op.campaignId), retail, op.status ?? "PAUSED", ctx, b, true);
      return;
    }

    case "assetGroupAsset.add": {
      const g = ID.test(op.assetGroupId) ? state.assetGroups[op.assetGroupId] : undefined;
      if (!g) fail(`Asset group ${op.assetGroupId} isn't in this account.`);
      const group = b.rn("assetGroups", op.assetGroupId);
      linkGroupAssets(op, group, b, true, true);
      for (const e of op.existing ?? []) {
        if (!ID.test(String(e.assetId)) || !/^[A-Z_]{3,40}$/.test(String(e.fieldType))) fail("existing assets are { assetId, fieldType }.");
        b.create("asset_group_asset_operation", { assetGroup: group, asset: b.rn("assets", String(e.assetId)), fieldType: e.fieldType }, true);
      }
      return;
    }

    case "assetGroupAsset.remove": {
      const restore = new Map<string, { assetId: string; fieldType: string }[]>();
      for (const id of op.ids ?? []) {
        const [groupId, assetId, field] = String(id).split("~");
        if (!state.assetGroupAssets[id] || !ID.test(groupId ?? "") || !ID.test(assetId ?? "")) fail(`Asset ${id} isn't in that asset group.`);
        ctx.operations.push({ asset_group_asset_operation: { remove: b.rn("assetGroupAssets", id) } });
        restore.set(groupId!, [...(restore.get(groupId!) ?? []), { assetId: assetId!, fieldType: field! }]);
      }
      for (const [assetGroupId, existing] of restore) ctx.inverse.unshift({ kind: "assetGroupAsset.add", assetGroupId, existing });
      ctx.warnings.push("Google needs a minimum of headlines, descriptions and images in each asset group; removing below it is refused.");
      return;
    }

    case "searchTheme.add": {
      if (!ID.test(op.assetGroupId) || !state.assetGroups[op.assetGroupId]) fail(`Asset group ${op.assetGroupId} isn't in this account.`);
      for (const theme of texts(op.themes, 1, 50, 80, "Search theme"))
        b.create("asset_group_signal_operation", { assetGroup: b.rn("assetGroups", op.assetGroupId), searchTheme: { text: theme } }, true);
      return;
    }

    case "asset.new": {
      const parent =
        op.level === "ACCOUNT"
          ? null
          : op.level === "CAMPAIGN"
            ? (campaignOf(String(op.parentId)), b.rn("campaigns", String(op.parentId)))
            : ID.test(String(op.parentId)) && before.adGroups[String(op.parentId)]
              ? b.rn("adGroups", String(op.parentId))
              : fail(`Ad group ${op.parentId} isn't in this account.`);
      if (!Array.isArray(op.assets) || !op.assets.length || op.assets.length > 20) fail("Give 1 to 20 assets.");
      for (const a of op.assets) {
        let body: Record<string, unknown>;
        switch (a?.type) {
          case "SITELINK":
            body = {
              finalUrls: [webUrl(a.finalUrl)],
              sitelinkAsset: {
                linkText: txt(a.text, 25, "The sitelink text"),
                ...(a.description1 ? { description1: txt(a.description1, 35, "Sitelink description 1"), description2: txt(a.description2, 35, "Sitelink description 2 (both lines or neither)") } : {}),
              },
            };
            break;
          case "CALLOUT":
            body = { calloutAsset: { calloutText: txt(a.text, 25, "The callout") } };
            break;
          case "CALL":
            if (!/^[A-Z]{2}$/.test(String(a.countryCode))) fail("countryCode is two letters, e.g. LB.");
            body = { callAsset: { countryCode: a.countryCode, phoneNumber: txt(a.phoneNumber, 30, "The phone number") } };
            break;
          case "STRUCTURED_SNIPPET":
            if (!SNIPPET_HEADERS.includes(String(a.header))) fail(`The snippet header must be one of: ${SNIPPET_HEADERS.join(", ")}.`);
            body = { structuredSnippetAsset: { header: a.header, values: texts(a.values, 3, 10, 25, "Snippet value") } };
            break;
          default:
            return fail("Assets are SITELINK, CALLOUT, CALL or STRUCTURED_SNIPPET.");
        }
        const asset = b.temp("assets");
        b.create("asset_operation", { resourceName: asset, ...body });
        const fieldType = a.type;
        if (op.level === "ACCOUNT") b.create("customer_asset_operation", { asset, fieldType }, true);
        else if (op.level === "CAMPAIGN") b.create("campaign_asset_operation", { campaign: parent, asset, fieldType }, true);
        else b.create("ad_group_asset_operation", { adGroup: parent, asset, fieldType }, true);
      }
      return;
    }

    case "audience.add": {
      const isCampaign = op.level === "CAMPAIGN";
      if (isCampaign) campaignOf(op.parentId);
      else if (!ID.test(op.parentId) || !before.adGroups[op.parentId]) fail(`Ad group ${op.parentId} isn't in this account.`);
      const parent = isCampaign ? b.rn("campaigns", op.parentId) : b.rn("adGroups", op.parentId);
      const bid = op.bidModifier !== undefined ? modifier(op.bidModifier, "The audience bid adjustment") : undefined;
      for (const id of ids(op.userListIds, "audience list id")) {
        const body = { userList: { userList: b.rn("userLists", id) }, ...(bid !== undefined ? { bidModifier: bid } : {}) };
        if (isCampaign) b.create("campaign_criterion_operation", { campaign: parent, ...body }, true);
        else b.create("ad_group_criterion_operation", { adGroup: parent, status: "ENABLED", ...body }, true);
      }
      // Observation (the default) only adjusts bids; Targeting shows ads to these people only.
      const mode = op.mode ?? "OBSERVATION";
      const key = `${op.level}:${op.parentId}`;
      const current = (state.restrictions[key] ?? []) as { targetingDimension?: string; bidOnly?: boolean }[];
      const audience = current.find((r) => r.targetingDimension === "AUDIENCE");
      const wantBidOnly = mode === "OBSERVATION";
      // Without a setting, Google treats audiences as Targeting.
      if ((audience?.bidOnly ?? false) !== wantBidOnly) {
        const next = [...current.filter((r) => r.targetingDimension !== "AUDIENCE"), { targetingDimension: "AUDIENCE", bidOnly: wantBidOnly }];
        ctx.operations.push({
          [isCampaign ? "campaign_operation" : "ad_group_operation"]: { update: { resourceName: parent, targetingSetting: { targetRestrictions: next } }, updateMask: "targeting_setting.target_restrictions" },
        });
        ctx.inverse.unshift({ kind: "audienceSetting.set", level: op.level, parentId: op.parentId, restrictions: current });
        ctx.warnings.push(
          wantBidOnly
            ? "Every audience here is now observed: it adjusts bids without limiting who sees the ads."
            : "Every audience here now limits who sees the ads: only people in these lists will see them."
        );
      }
      return;
    }

    case "audienceSetting.set": {
      const parent = op.level === "CAMPAIGN" ? b.rn("campaigns", op.parentId) : b.rn("adGroups", op.parentId);
      if (!ID.test(op.parentId) || !Array.isArray(op.restrictions)) fail("Bad audience setting.");
      ctx.operations.push({ [op.level === "CAMPAIGN" ? "campaign_operation" : "ad_group_operation"]: { update: { resourceName: parent, targetingSetting: { targetRestrictions: op.restrictions } }, updateMask: "targeting_setting.target_restrictions" } });
      return;
    }

    case "location.add": {
      campaignOf(op.campaignId);
      if (state.campaignTypes[op.campaignId] === "DEMAND_GEN") fail("Demand Gen campaigns set locations on each ad group, not on the campaign. Change them in Google Ads.");
      const bid = op.bidModifier !== undefined && !op.exclude ? modifier(op.bidModifier, "The location bid adjustment") : undefined;
      for (const id of ids(op.geoIds, "location id"))
        b.create("campaign_criterion_operation", { campaign: b.rn("campaigns", op.campaignId), location: { geoTargetConstant: `geoTargetConstants/${id}` }, ...(op.exclude ? { negative: true } : {}), ...(bid !== undefined ? { bidModifier: bid } : {}) }, true);
      return;
    }

    case "language.add": {
      campaignOf(op.campaignId);
      if (state.campaignTypes[op.campaignId] === "DEMAND_GEN") fail("Demand Gen campaigns set languages on each ad group, not on the campaign. Change them in Google Ads.");
      for (const id of ids(op.languageIds, "language id")) b.create("campaign_criterion_operation", { campaign: b.rn("campaigns", op.campaignId), language: { languageConstant: `languageConstants/${id}` } }, true);
      return;
    }

    case "schedule.add": {
      campaignOf(op.campaignId);
      if (!Array.isArray(op.slots) || !op.slots.length || op.slots.length > 42) fail("Give 1 to 42 time slots.");
      for (const s of op.slots) {
        if (!DAYS.includes(String(s?.day))) fail(`day is one of ${DAYS.join(", ")}.`);
        if (!Number.isInteger(s.startHour) || !Number.isInteger(s.endHour) || s.startHour < 0 || s.endHour > 24 || s.endHour <= s.startHour) fail("Hours are whole numbers 0–24, end after start.");
        b.create(
          "campaign_criterion_operation",
          {
            campaign: b.rn("campaigns", op.campaignId),
            adSchedule: { dayOfWeek: s.day, startHour: s.startHour, endHour: s.endHour, startMinute: "ZERO", endMinute: "ZERO" },
            ...(s.bidModifier !== undefined ? { bidModifier: modifier(s.bidModifier, "The schedule bid adjustment") } : {}),
          },
          true
        );
      }
      return;
    }

    case "targeting.remove": {
      campaignOf(op.campaignId);
      const geo: { ids: string[]; exclude: boolean; bid?: number }[] = [];
      const languages: string[] = [];
      const slots: ScheduleSlot[] = [];
      for (const id of op.criterionIds ?? []) {
        const t = state.targeting[`${op.campaignId}~${id}`];
        if (!t || !ID.test(String(id))) fail(`Targeting ${id} isn't on this campaign.`);
        if (t!.type === "DEVICE") fail("Devices can't be removed; set a -100% adjustment with device.set instead.");
        ctx.operations.push({ campaign_criterion_operation: { remove: b.rn("campaignCriteria", `${op.campaignId}~${id}`) } });
        if (t!.type === "LOCATION" && t!.geoId) geo.push({ ids: [t!.geoId], exclude: !!t!.negative, bid: t!.bidModifier });
        if (t!.type === "LANGUAGE" && t!.languageId) languages.push(t!.languageId);
        if (t!.type === "AD_SCHEDULE" && t!.slot) slots.push(t!.slot);
      }
      for (const g of geo) ctx.inverse.unshift({ kind: "location.add", campaignId: op.campaignId, geoIds: g.ids, exclude: g.exclude, ...(g.bid !== undefined ? { bidModifier: g.bid } : {}) });
      if (languages.length) ctx.inverse.unshift({ kind: "language.add", campaignId: op.campaignId, languageIds: languages });
      if (slots.length) ctx.inverse.unshift({ kind: "schedule.add", campaignId: op.campaignId, slots });
      if (geo.some((g) => !g.exclude) && Object.entries(state.targeting).filter(([k, t]) => k.startsWith(`${op.campaignId}~`) && t.type === "LOCATION" && !t.negative).length === geo.filter((g) => !g.exclude).length)
        ctx.warnings.push("This removes every targeted location: the campaign would show in all countries.");
      return;
    }

    case "device.set": {
      campaignOf(op.campaignId);
      const entry = Object.entries(state.targeting).find(([k, t]) => k.startsWith(`${op.campaignId}~`) && t.type === "DEVICE" && t.device === op.device);
      if (!entry) fail(`This campaign has no ${String(op.device).toLowerCase()} device setting to change.`);
      const value = modifier(op.bidModifier, "The device bid adjustment");
      ctx.operations.push({ campaign_criterion_operation: { update: { resourceName: b.rn("campaignCriteria", entry![0]), bidModifier: value }, updateMask: "bid_modifier" } });
      ctx.inverse.unshift({ kind: "device.set", campaignId: op.campaignId, device: op.device, bidModifier: Math.round(((entry![1].bidModifier ?? 1) - 1) * 100) / 100 });
      if (value === 0) ctx.warnings.push(`Ads in this campaign stop showing on ${String(op.device).toLowerCase()} devices.`);
      return;
    }

    case "placement.exclude": {
      campaignOf(op.campaignId);
      if (!Array.isArray(op.urls) || !op.urls.length || op.urls.length > 100) fail("Give 1 to 100 placements.");
      for (const u of op.urls) {
        const url = txt(u, 250, "A placement").replace(/^https?:\/\//i, "").replace(/\/$/, "");
        if (/\s/.test(url)) fail(`"${url}" isn't a site address.`);
        b.create("campaign_criterion_operation", { campaign: b.rn("campaigns", op.campaignId), negative: true, placement: { url } }, true);
      }
      return;
    }

    case "conversion.new": {
      if (!CONVERSION_CATEGORIES.includes(String(op.category))) fail(`category is one of ${CONVERSION_CATEGORIES.join(", ")}.`);
      const value = op.defaultValue !== undefined ? amount(op.defaultValue, "The default value") : undefined;
      b.create(
        "conversion_action_operation",
        {
          name: txt(op.name, 100, "The conversion action name"),
          type: "WEBPAGE",
          category: op.category,
          status: "ENABLED",
          countingType: op.countingType === "ONE_PER_CLICK" ? "ONE_PER_CLICK" : "MANY_PER_CLICK",
          ...(value !== undefined ? { valueSettings: { defaultValue: value, alwaysUseDefaultValue: !!op.alwaysUseDefaultValue } } : {}),
        },
        true
      );
      ctx.warnings.push("A new conversion action records nothing until its tag is on the website. Get the tag from Google Ads → Goals → Conversions.");
      return;
    }

    case "negativeList.new": {
      const set = b.temp("sharedSets");
      const campaigns = op.campaignIds ? ids(op.campaignIds, "campaign id") : [];
      campaigns.forEach(campaignOf);
      b.create("shared_set_operation", { resourceName: set, name: txt(op.name, 255, "The list name"), type: "NEGATIVE_KEYWORDS" }, true);
      if (!Array.isArray(op.keywords) || !op.keywords.length || op.keywords.length > 500) fail("Give 1 to 500 keywords.");
      for (const k of op.keywords) b.create("shared_criterion_operation", { sharedSet: set, keyword: keyword(k, "A negative keyword") });
      for (const id of campaigns) b.create("campaign_shared_set_operation", { campaign: b.rn("campaigns", id), sharedSet: set }, true);
      return;
    }

    case "label.new": {
      const label = b.temp("labels");
      const color = op.color === undefined ? "#400095" : String(op.color);
      if (!/^#[0-9a-f]{6}$/i.test(color)) fail("color is a hex colour like #400095.");
      b.create("label_operation", { resourceName: label, name: txt(op.name, 80, "The label name"), textLabel: { backgroundColor: color } }, true);
      for (const id of op.campaignIds ? ids(op.campaignIds, "campaign id") : []) {
        campaignOf(id);
        b.create("campaign_label_operation", { campaign: b.rn("campaigns", id), label }, true);
      }
      return;
    }

    case "created.remove": {
      // Links first, then what they point to (a list or label with campaigns attached).
      const order = (r: string) => (/\/(campaignSharedSets|campaignLabels)\//.test(r) ? 0 : 1);
      for (const resource of [...op.resources].sort((a, c) => order(a) - order(c))) {
        const m = /^customers\/(\d{10})\/([A-Za-z]+)\/[\d~A-Z_]+$/.exec(String(resource));
        if (!m || m[1] !== ctx.customerId || !REMOVABLE[m[2]!] || !state.createdResources.has(resource)) fail("Undo can only remove what Autommerce created in this account.");
        ctx.operations.push({ [REMOVABLE[m![2]!]!]: { remove: resource } });
      }
      return;
    }
  }
}

/** Undo for what a change created: remove exactly those resources, newest first. */
export function inverseForCreatedResources(created: CreatedRef[], resourceNames: (string | undefined)[]): { inverse: { kind: "created.remove"; resources: string[] }[]; resources: string[] } {
  const resources = created.filter((c) => c.kind === "resource").map((c) => resourceNames[c.index]).filter((r): r is string => !!r && /^customers\/\d{10}\//.test(r));
  return { inverse: resources.length ? [{ kind: "created.remove", resources: [...resources].reverse() }] : [], resources };
}

/** Image URLs a change uses, to download before planning. */
export function imageUrls(ops: { kind: string }[]): string[] {
  const out = new Set<string>();
  const collect = (images: Images | undefined) => Object.values(images ?? {}).forEach((list) => (Array.isArray(list) ? list : []).forEach((u) => typeof u === "string" && out.add(u.trim())));
  for (const op of ops as CreateOp[]) {
    if (op.kind === "campaign.new") {
      if (typeof op.logo === "string") out.add(op.logo.trim());
      op.adGroups?.forEach((g) => g.ads?.forEach((a) => "images" in a && collect(a.images)));
      op.assetGroups?.forEach((g) => collect(g.images));
    } else if (op.kind === "adGroup.new") op.adGroup?.ads?.forEach((a) => "images" in a && collect(a.images));
    else if (op.kind === "ad.new" && op.ad && "images" in op.ad) collect(op.ad.images);
    else if (op.kind === "assetGroup.new") collect(op.assetGroup?.images);
    else if (op.kind === "assetGroupAsset.add") collect(op.images);
  }
  return [...out];
}
