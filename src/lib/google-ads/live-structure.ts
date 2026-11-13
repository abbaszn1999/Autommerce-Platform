// Asset groups, assets, audiences, product groups, placements, the shared
// library, experiments and linked accounts of a live account, from Google's
// rows. Pure: no network, so it is unit tested with sample rows. A value Google
// doesn't send stays empty; nothing is guessed.

import type { GaqlRow } from "./live-report";
import type { StructureQueryName } from "./live-structure-queries";
import type {
  AdPolicyStatus,
  AdStrength,
  Asset,
  AssetGroup,
  AssetType,
  AudienceSegment,
  AudienceTarget,
  BiddingStrategyType,
  ContentTarget,
  EntityStatus,
  Experiment,
  LabelDef,
  LinkedAccount,
  ListingDimension,
  ListingGroup,
  NegativeKeywordList,
  PlacementExclusionList,
  PortfolioBidStrategy,
} from "./types";

export type StructureRows = Partial<Record<StructureQueryName, GaqlRow[]>> & { audienceNames?: GaqlRow[] };

const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);
const lastId = (resource: unknown) => str(resource).split("/").pop() ?? "";
/** "customers/1/adGroupCriteria/22~33" → "33". */
const criterionId = (resource: unknown) => lastId(resource).split("~").pop() ?? "";
const bidChange = (v: unknown) => (v == null ? undefined : Math.round((Number(v) - 1) * 100) / 100);
const status = (v: unknown): EntityStatus => (v === "PAUSED" ? "PAUSED" : v === "REMOVED" ? "REMOVED" : "ENABLED");

const STRENGTH: Record<string, AdStrength> = { POOR: "POOR", AVERAGE: "AVERAGE", GOOD: "GOOD", EXCELLENT: "EXCELLENT" };
const POLICY: Record<string, AdPolicyStatus> = { APPROVED: "APPROVED", APPROVED_LIMITED: "APPROVED_LIMITED", DISAPPROVED: "DISAPPROVED", AREA_OF_INTEREST_ONLY: "APPROVED_LIMITED" };

// ─── Performance Max asset groups ──────────────────────────────────────────

function listingText(v: GaqlRow | undefined): string {
  const cv = v?.caseValue ?? {};
  if (cv.productBrand?.value) return `Brand: ${cv.productBrand.value}`;
  if (cv.productType?.value) return `Product type: ${cv.productType.value}`;
  if (cv.productItemId?.value) return `Item ID: ${cv.productItemId.value}`;
  if (cv.productCustomAttribute?.value) return `Custom label ${str(cv.productCustomAttribute.index).replace("INDEX", "")}: ${cv.productCustomAttribute.value}`;
  return "";
}

export function mapAssetGroups(rows: StructureRows): AssetGroup[] {
  const audienceName = new Map((rows.audienceNames ?? []).map((r) => [str(r.audience?.resourceName), str(r.audience?.name)]));
  const groups = new Map<string, AssetGroup>();
  for (const r of rows.assetGroups ?? []) {
    const g = r.assetGroup;
    if (!g?.id) continue;
    groups.set(str(g.id), {
      id: str(g.id),
      campaignId: lastId(g.campaign),
      name: str(g.name) || str(g.id),
      status: status(g.status),
      finalUrl: str(g.finalUrls?.[0]),
      headlines: [],
      longHeadlines: [],
      descriptions: [],
      businessName: "",
      imageUrls: [],
      logoUrls: [],
      videoUrls: [],
      searchThemes: [],
      listingGroups: [],
      adStrength: STRENGTH[str(g.adStrength)] ?? "PENDING",
    });
  }
  for (const r of rows.assetGroupAssets ?? []) {
    const g = groups.get(str(r.assetGroup?.id));
    if (!g) continue;
    const text = str(r.asset?.textAsset?.text);
    const image = str(r.asset?.imageAsset?.fullSize?.url);
    const video = str(r.asset?.youtubeVideoAsset?.youtubeVideoId);
    switch (str(r.assetGroupAsset?.fieldType)) {
      case "HEADLINE":
        if (text) g.headlines.push(text);
        break;
      case "LONG_HEADLINE":
        if (text) g.longHeadlines.push(text);
        break;
      case "DESCRIPTION":
        if (text) g.descriptions.push(text);
        break;
      case "BUSINESS_NAME":
        g.businessName = text;
        break;
      case "MARKETING_IMAGE":
      case "SQUARE_MARKETING_IMAGE":
      case "PORTRAIT_MARKETING_IMAGE":
        if (image) g.imageUrls.push(image);
        break;
      case "LOGO":
      case "LANDSCAPE_LOGO":
        if (image) g.logoUrls.push(image);
        break;
      case "YOUTUBE_VIDEO":
        if (video) g.videoUrls.push(`https://www.youtube.com/watch?v=${video}`);
        break;
    }
  }
  const signals = new Map<string, string[]>();
  for (const r of rows.assetGroupSignals ?? []) {
    const g = groups.get(str(r.assetGroup?.id));
    if (!g) continue;
    const theme = str(r.assetGroupSignal?.searchTheme?.text);
    if (theme) g.searchThemes.push(theme);
    const audience = str(r.assetGroupSignal?.audience?.audience);
    if (audience) signals.set(g.id, [...(signals.get(g.id) ?? []), audienceName.get(audience) || "Audience signal"]);
  }
  for (const [id, names] of signals) groups.get(id)!.audienceSignal = [...new Set(names)].join(", ");
  for (const r of rows.assetGroupListings ?? []) {
    const g = groups.get(str(r.assetGroup?.id));
    const filter = r.assetGroupListingGroupFilter;
    if (!g || filter?.type !== "UNIT_INCLUDED") continue;
    g.listingGroups.push(listingText(filter) || "All products");
  }
  return [...groups.values()];
}

// ─── Assets (sitelinks, callouts…) ──────────────────────────────────────────

const ASSET_TYPES = new Set<AssetType>(["SITELINK", "CALLOUT", "STRUCTURED_SNIPPET", "CALL", "IMAGE", "PRICE", "PROMOTION", "LOCATION", "LEAD_FORM", "BUSINESS_NAME", "BUSINESS_LOGO"]);

function mapAsset(r: GaqlRow, level: Asset["level"], link: GaqlRow | undefined, parentId?: string): Asset | null {
  const a = r.asset;
  const field = str(link?.fieldType);
  const type = (ASSET_TYPES.has(field as AssetType) ? field : ASSET_TYPES.has(str(a?.type) as AssetType) ? str(a?.type) : "") as AssetType | "";
  if (!a?.id || !type) return null;
  const title =
    str(a.sitelinkAsset?.linkText) ||
    str(a.calloutAsset?.calloutText) ||
    str(a.structuredSnippetAsset?.header) ||
    str(a.callAsset?.phoneNumber) ||
    str(a.textAsset?.text) ||
    str(a.name) ||
    `${type.toLowerCase().replace(/_/g, " ")} ${a.id}`;
  const lines = a.sitelinkAsset
    ? [str(a.sitelinkAsset.description1), str(a.sitelinkAsset.description2)].filter(Boolean)
    : Array.isArray(a.structuredSnippetAsset?.values)
      ? a.structuredSnippetAsset.values.map(str)
      : undefined;
  return {
    id: `${level}-${parentId ?? "account"}-${a.id}`,
    type,
    level,
    parentId,
    status: status(link?.status),
    policy: POLICY[str(a.policySummary?.approvalStatus)] ?? "UNDER_REVIEW",
    title,
    ...(lines?.length ? { lines } : {}),
    ...(a.finalUrls?.[0] ? { finalUrl: str(a.finalUrls[0]) } : {}),
    ...(a.imageAsset?.fullSize?.url ? { imageUrl: str(a.imageAsset.fullSize.url) } : {}),
  };
}

export function mapAssets(rows: StructureRows): Asset[] {
  const out: Asset[] = [];
  for (const r of rows.customerAssets ?? []) {
    const a = mapAsset(r, "ACCOUNT", r.customerAsset);
    if (a) out.push(a);
  }
  for (const r of rows.campaignAssets ?? []) {
    const a = mapAsset(r, "CAMPAIGN", r.campaignAsset, str(r.campaign?.id));
    if (a) out.push(a);
  }
  for (const r of rows.adGroupAssets ?? []) {
    const a = mapAsset(r, "AD_GROUP", r.adGroupAsset, str(r.adGroup?.id));
    if (a) out.push(a);
  }
  return out;
}

// ─── Audiences ──────────────────────────────────────────────────────────────

/** Observation unless Google says the audience narrows who sees ads; Google's default when unset is targeting. */
function audienceMode(restrictions: unknown): AudienceTarget["mode"] {
  const audience = (Array.isArray(restrictions) ? restrictions : []).find((t: GaqlRow) => t?.targetingDimension === "AUDIENCE");
  return audience?.bidOnly ? "OBSERVATION" : "TARGETING";
}

export function mapAudiences(rows: StructureRows): { audiences: AudienceSegment[]; audienceTargets: AudienceTarget[] } {
  const segments = new Map<string, AudienceSegment>();
  for (const r of rows.userLists ?? []) {
    const l = r.userList;
    if (!l?.id) continue;
    segments.set(str(l.id), {
      id: str(l.id),
      name: str(l.name) || str(l.id),
      kind: l.type === "CRM_BASED" ? "CUSTOMER_MATCH" : "REMARKETING",
      size: l.sizeForSearch != null ? num(l.sizeForSearch) : undefined,
      description: str(l.description) || undefined,
      durationDays: l.membershipLifeSpan != null && num(l.membershipLifeSpan) < 10000 ? num(l.membershipLifeSpan) : undefined,
    });
  }
  const targets: AudienceTarget[] = [];
  const add = (level: AudienceTarget["level"], parentId: string, c: GaqlRow | undefined, mode: AudienceTarget["mode"]) => {
    if (!c?.criterionId || !parentId) return;
    let segmentId = lastId(c.userList?.userList);
    if (!segmentId || !segments.has(segmentId)) {
      segmentId = segmentId || `criterion-${c.criterionId}`;
      segments.set(segmentId, { id: segmentId, name: str(c.displayName) || "Audience segment", kind: c.type === "CUSTOM_AUDIENCE" ? "CUSTOM" : c.type === "USER_LIST" ? "REMARKETING" : "INTEREST" });
    }
    targets.push({ id: `${level}-${parentId}-${c.criterionId}`, segmentId, level, parentId, mode: c.negative ? "EXCLUSION" : mode, bidModifier: c.negative ? undefined : bidChange(c.bidModifier) });
  };
  for (const r of rows.campaignAudiences ?? []) add("CAMPAIGN", str(r.campaign?.id), r.campaignCriterion, audienceMode(r.campaign?.targetingSetting?.targetRestrictions));
  for (const r of rows.adGroupAudiences ?? []) add("AD_GROUP", str(r.adGroup?.id), r.adGroupCriterion, audienceMode(r.adGroup?.targetingSetting?.targetRestrictions));
  return { audiences: [...segments.values()], audienceTargets: targets };
}

// ─── Shopping product groups ────────────────────────────────────────────────

export function mapListingGroups(rows: StructureRows): ListingGroup[] {
  const out: ListingGroup[] = [];
  for (const r of rows.listingGroups ?? []) {
    const c = r.adGroupCriterion;
    if (!c?.criterionId) continue;
    const cv = c.listingGroup?.caseValue ?? {};
    const parent = criterionId(c.listingGroup?.parentAdGroupCriterion);
    let dimension: ListingDimension = parent ? "OTHERS" : "ALL";
    let value = parent ? "Everything else" : "All products";
    if (cv.productBrand?.value != null) [dimension, value] = ["BRAND", str(cv.productBrand.value)];
    else if (cv.productType?.value != null) [dimension, value] = ["PRODUCT_TYPE", str(cv.productType.value)];
    else if (cv.productItemId?.value != null) [dimension, value] = ["ITEM_ID", str(cv.productItemId.value)];
    else if (cv.productCustomAttribute?.value != null) [dimension, value] = ["CUSTOM_LABEL_0", `${str(cv.productCustomAttribute.index).replace("INDEX", "Label ")}: ${str(cv.productCustomAttribute.value)}`];
    out.push({
      id: str(c.criterionId),
      campaignId: str(r.campaign?.id),
      ...(parent ? { parentId: parent } : {}),
      dimension,
      value,
      ...(c.cpcBidMicros ? { bid: num(c.cpcBidMicros) / 1_000_000 } : {}),
      ...(c.negative ? { excluded: true } : {}),
    });
  }
  return out;
}

// ─── Placements and topics ──────────────────────────────────────────────────

const CONTENT_KIND: Record<string, ContentTarget["kind"]> = { PLACEMENT: "PLACEMENT", YOUTUBE_VIDEO: "PLACEMENT", YOUTUBE_CHANNEL: "YOUTUBE_CHANNEL", TOPIC: "TOPIC" };

/** Placement metrics aren't split here: share and efficiency stay 0 and the page shows no numbers for them. */
export function mapContentTargets(rows: StructureRows): ContentTarget[] {
  const out: ContentTarget[] = [];
  for (const r of rows.placements ?? []) {
    const c = r.adGroupCriterion;
    const kind = CONTENT_KIND[str(c?.type)];
    if (!c?.criterionId || !kind) continue;
    out.push({
      id: `${str(r.adGroup?.id)}-${c.criterionId}`,
      campaignId: str(r.campaign?.id),
      adGroupId: str(r.adGroup?.id) || undefined,
      kind,
      value: str(c.displayName) || str(c.criterionId),
      excluded: !!c.negative,
      bidModifier: c.negative ? undefined : bidChange(c.bidModifier),
      share: 0,
      efficiency: 0,
    });
  }
  return out;
}

// ─── Shared library ─────────────────────────────────────────────────────────

const LABEL_COLOR = /^#[0-9a-f]{6}$/i;

export function mapLibrary(rows: StructureRows, bidding: Record<string, BiddingStrategyType>) {
  const labelDefs: LabelDef[] = (rows.labels ?? [])
    .filter((r) => r.label?.id)
    .map((r) => ({ id: str(r.label.id), name: str(r.label.name), color: LABEL_COLOR.test(str(r.label.textLabel?.backgroundColor)) ? str(r.label.textLabel.backgroundColor) : "#64748b" }));
  const bidStrategies: PortfolioBidStrategy[] = [];
  for (const r of rows.bidStrategies ?? []) {
    const b = r.biddingStrategy;
    const type = bidding[str(b?.type)];
    if (!b?.id || !type) continue;
    bidStrategies.push({
      id: str(b.id),
      name: str(b.name) || str(b.id),
      type,
      ...(b.targetCpa?.targetCpaMicros ? { targetCpa: num(b.targetCpa.targetCpaMicros) / 1_000_000 } : {}),
      ...(b.targetRoas?.targetRoas ? { targetRoas: num(b.targetRoas.targetRoas) } : {}),
      ...(b.targetImpressionShare?.cpcBidCeilingMicros ? { maxCpcLimit: num(b.targetImpressionShare.cpcBidCeilingMicros) / 1_000_000 } : {}),
    });
  }
  const campaignsOf = new Map<string, string[]>();
  for (const r of rows.campaignSharedSets ?? []) {
    const set = str(r.sharedSet?.id);
    if (set) campaignsOf.set(set, [...(campaignsOf.get(set) ?? []), str(r.campaign?.id)]);
  }
  const placementsOf = new Map<string, string[]>();
  for (const r of rows.sharedPlacements ?? []) {
    const c = r.sharedCriterion ?? {};
    const value = str(c.placement?.url) || (c.youtubeChannel?.channelId ? `youtube.com/channel/${c.youtubeChannel.channelId}` : "") || str(c.mobileApplication?.name);
    const set = str(r.sharedSet?.id);
    if (set && value) placementsOf.set(set, [...(placementsOf.get(set) ?? []), value]);
  }
  const negativeLists: NegativeKeywordList[] = [];
  const placementLists: PlacementExclusionList[] = [];
  for (const r of rows.sharedSets ?? []) {
    const s = r.sharedSet;
    if (!s?.id) continue;
    const base = { id: str(s.id), name: str(s.name) || str(s.id), campaignIds: campaignsOf.get(str(s.id)) ?? [] };
    if (s.type === "NEGATIVE_KEYWORDS") negativeLists.push(base);
    if (s.type === "NEGATIVE_PLACEMENTS") placementLists.push({ ...base, placements: placementsOf.get(str(s.id)) ?? [] });
  }
  return { labelDefs, bidStrategies, negativeLists, placementLists };
}

// ─── Experiments and links ─────────────────────────────────────────────────

const EXPERIMENT_STATUS: Record<string, Experiment["status"]> = { SETUP: "DRAFT", INITIATED: "DRAFT", ENABLED: "RUNNING", HALTED: "ENDED", PROMOTED: "APPLIED", GRADUATED: "APPLIED" };

export function mapExperiments(rows: StructureRows): Experiment[] {
  const arms = new Map<string, GaqlRow[]>();
  for (const r of rows.experimentArms ?? []) {
    const id = lastId(r.experimentArm?.experiment);
    if (id) arms.set(id, [...(arms.get(id) ?? []), r.experimentArm]);
  }
  const out: Experiment[] = [];
  for (const r of rows.experiments ?? []) {
    const e = r.experiment;
    const state = EXPERIMENT_STATUS[str(e?.status)];
    if (!e?.experimentId || !state) continue;
    const own = arms.get(str(e.experimentId)) ?? [];
    const control = own.find((a) => a.control);
    const trial = own.find((a) => !a.control);
    out.push({
      id: str(e.experimentId),
      name: str(e.name) || str(e.experimentId),
      baseCampaignId: lastId(control?.campaigns?.[0]),
      change: str(e.description) || str(trial?.name) || "See the experiment in Google Ads",
      ops: [],
      split: trial ? num(trial.trafficSplit) : 0,
      status: state,
      startDate: str(e.startDate),
      endDate: str(e.endDate),
    });
  }
  return out;
}

/** Only links Google reports are listed; a missing one isn't claimed to be "not linked". */
export function mapLinks(rows: StructureRows): LinkedAccount[] {
  return (rows.productLinks ?? [])
    .filter((r) => r.productLink?.merchantCenter?.merchantCenterId)
    .map((r) => ({
      id: str(r.productLink.productLinkId) || str(r.productLink.merchantCenter.merchantCenterId),
      kind: "MERCHANT_CENTER" as const,
      name: "Merchant Center",
      externalId: str(r.productLink.merchantCenter.merchantCenterId),
      status: "LINKED" as const,
    }));
}
