// Client-side stand-in for a validate-only call: catches what Meta would reject
// before the change is sent. The server repeats it with the real API.

import { BID_STRATEGIES, LIMITS, OBJECTIVES } from "./constants";
import { isoDay } from "@/lib/google-ads/metrics";
import { isLocked } from "./mutations";
import type { AdScheduleBlock, AdSetTargeting, BidStrategy, CampaignBundle, MetaAccountData, MetaAd, MetaCampaign, MutateOp, NewAdSet, SpecialAdCategory } from "./types";

/** Claims Meta's health and wellness policy rejects. The demo checks the common ones. */
const HEALTH_CLAIM = /\b(lose|drop|burn)\s+\d+\s?(kg|kilos?|lbs?|pounds?)\b|\bare you (overweight|fat|obese)\b|\bcure[sd]?\b/i;

type AdText = Pick<MetaAd, "primaryTexts" | "headlines" | "description" | "link" | "format" | "cards" | "mediaIds" | "productSetId" | "cta">;

function textErrors(ad: AdText): string[] {
  const errors: string[] = [];
  if (ad.primaryTexts.length > LIMITS.variations) errors.push(`An ad can have at most ${LIMITS.variations} primary texts.`);
  if (ad.headlines.length > LIMITS.variations) errors.push(`An ad can have at most ${LIMITS.variations} headlines.`);
  if (ad.primaryTexts.some((t) => t.length > LIMITS.primaryText)) errors.push(`Primary text should be ${LIMITS.primaryText} characters or fewer so it is not cut off.`);
  if (ad.headlines.some((h) => h.length > LIMITS.headline)) errors.push(`Headlines must be ${LIMITS.headline} characters or fewer.`);
  if ((ad.description?.length ?? 0) > LIMITS.description) errors.push(`The description must be ${LIMITS.description} characters or fewer.`);
  if (!/^https?:\/\/.+\..+/.test(ad.link)) errors.push("The destination URL must be a full web address.");
  if (HEALTH_CLAIM.test([...ad.primaryTexts, ...ad.headlines].join(" "))) errors.push("The copy makes a health or weight claim Meta's Health and wellness policy rejects.");
  if (/!{2,}/.test([...ad.primaryTexts, ...ad.headlines].join(" "))) errors.push("Repeated exclamation marks are not allowed.");
  if (ad.format === "CAROUSEL") {
    const n = ad.cards?.length ?? 0;
    if (n < LIMITS.carouselMin || n > LIMITS.carouselMax) errors.push(`A carousel needs ${LIMITS.carouselMin} to ${LIMITS.carouselMax} cards.`);
  }
  if (ad.format === "CATALOG" && !ad.productSetId) errors.push("A catalog ad needs a product set.");
  if ((ad.format === "SINGLE_IMAGE" || ad.format === "SINGLE_VIDEO") && !ad.mediaIds.length) errors.push("Pick an image or video from the Creative library.");
  return errors;
}

/** Special ad categories (housing, employment, credit) cannot target by age, gender or narrow locations. */
function specialCategoryErrors(categories: SpecialAdCategory[], t: AdSetTargeting): string[] {
  if (!categories.some((c) => c === "HOUSING" || c === "EMPLOYMENT" || c === "CREDIT")) return [];
  const errors: string[] = [];
  if (t.genders !== "ALL") errors.push("Special ad categories cannot target by gender.");
  if (t.ageMin > 18 || t.ageMax < 65) errors.push("Special ad categories cannot target by age.");
  if (t.locations.some((l) => l.kind === "City")) errors.push("Special ad categories cannot target a city or a radius.");
  return errors;
}

function bidErrors(strategy: BidStrategy, value: number | undefined): string[] {
  const needs = BID_STRATEGIES[strategy].needsValue;
  if (needs && !(value && value > 0)) return [`${BID_STRATEGIES[strategy].label} needs a ${needs === "ROAS" ? "ROAS" : needs === "COST" ? "cost per result" : "bid"} value above 0.`];
  return [];
}

type CampaignLike = Pick<MetaCampaign, "objective" | "advantageState" | "budget" | "specialAdCategories">;

/** Meta only lets an ad set run on a schedule when its budget is a lifetime budget (its own, or the campaign's). */
function scheduleErrors(name: string, schedule: AdScheduleBlock[] | undefined, budget: { kind: string } | undefined): string[] {
  if (!schedule?.length) return [];
  const errors: string[] = [];
  if (budget?.kind !== "LIFETIME") errors.push(`Ad scheduling needs a lifetime budget, and "${name}" has ${budget ? "a daily budget" : "no budget"}. Meta only allows hour-by-hour scheduling with a lifetime budget.`);
  for (const b of schedule) {
    if (!b.days.length || b.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) errors.push(`A schedule block for "${name}" needs days between Sunday and Saturday.`);
    if (!Number.isInteger(b.startHour) || !Number.isInteger(b.endHour) || b.startHour < 0 || b.endHour > 24 || b.startHour >= b.endHour) errors.push(`A schedule block for "${name}" needs a start hour before its end hour (0 to 24).`);
  }
  return errors;
}

/** Start and end dates: a running thing keeps its start date, nothing starts or ends in the past, and the end follows the start. */
function dateErrors(name: string, curStart: string, patch: { start?: string; end?: string; endGiven: boolean }, start: string, end: string | undefined, today: string): string[] {
  const errors: string[] = [];
  if (patch.start && patch.start !== curStart) {
    if (curStart <= today) errors.push(`"${name}" has already started, so its start date can't change. You can still move the end date.`);
    else if (patch.start < today) errors.push(`"${name}" can't be set to start in the past.`);
  }
  if (end && end < start) errors.push(`The end date of "${name}" has to be after its start date.`);
  if (patch.endGiven && end && end < today) errors.push(`"${name}" can't be set to end in the past.`);
  return errors;
}

/** Everything Meta checks on one ad set and its ads, for a new campaign or a new ad set in an existing one. */
function adSetErrors(data: MetaAccountData, campaign: CampaignLike, s: NewAdSet, ads: AdText[]): string[] {
  const errors: string[] = [];
  const o = OBJECTIVES[campaign.objective];
  if (!s.name.trim()) errors.push("Every ad set needs a name.");
  errors.push(...scheduleErrors(s.name, s.schedule, s.budget ?? campaign.budget));
  if ((s.budget ?? campaign.budget)?.kind === "LIFETIME" && !s.endDate) errors.push(`Ad set "${s.name}" has a lifetime budget, so it needs an end date.`);
  if (s.endDate && s.endDate < s.startDate) errors.push(`The end date of "${s.name}" has to be after its start date.`);
  if (!campaign.budget && !(s.budget && s.budget.amount >= LIMITS.minDailyBudget)) errors.push(`Ad set "${s.name}" needs a budget because the campaign has no Advantage+ campaign budget.`);
  if (!s.targeting.locations.some((l) => !l.excluded)) errors.push(`Ad set "${s.name}" needs at least one location.`);
  if (!o.locations.includes(s.conversionLocation)) errors.push(`${o.label} can't use "${s.conversionLocation.toLowerCase()}" as the conversion location.`);
  if (!o.goals.includes(s.optimizationGoal)) errors.push(`${o.label} can't optimize for ${s.optimizationGoal.toLowerCase().replace(/_/g, " ")}.`);
  if (s.optimizationGoal === "OFFSITE_CONVERSIONS" || s.optimizationGoal === "VALUE") {
    if (!s.promotedObject.datasetId && !data.account.datasetId) errors.push(`Ad set "${s.name}" needs a dataset (Pixel) to optimize for conversions.`);
    if (!s.promotedObject.event) errors.push(`Ad set "${s.name}" needs a conversion event.`);
  }
  if (s.conversionLocation === "INSTANT_FORMS" && !s.promotedObject.leadFormId) errors.push(`Ad set "${s.name}" needs an instant form.`);
  if (s.conversionLocation === "ON_AD" && !s.promotedObject.pageId && !data.account.pageId) errors.push(`Ad set "${s.name}" needs a Facebook Page.`);
  if (!s.placements.advantage && !s.placements.manual.length) errors.push(`Ad set "${s.name}" needs at least one placement.`);
  if (s.targeting.ageMin > s.targeting.ageMax) errors.push(`Ad set "${s.name}": the minimum age is above the maximum.`);
  errors.push(...specialCategoryErrors(campaign.specialAdCategories, s.targeting));
  if (campaign.advantageState === "ADVANTAGE_PLUS" && !campaign.budget) errors.push("Advantage+ campaigns use an Advantage+ campaign budget.");
  if (!ads.length) errors.push(`Ad set "${s.name}" has no ad.`);
  if (ads.length > LIMITS.adsPerAdSet) errors.push(`An ad set can have at most ${LIMITS.adsPerAdSet} ads.`);
  for (const a of ads) errors.push(...textErrors(a));
  return errors;
}
function bundleErrors(data: MetaAccountData, bundle: CampaignBundle): string[] {
  const errors: string[] = [];
  const { campaign, adSets } = bundle;
  const o = OBJECTIVES[campaign.objective];
  if (!campaign.name.trim()) errors.push("Campaign name is required.");
  if (data.campaigns.some((c) => c.status !== "ARCHIVED" && c.name.trim().toLowerCase() === campaign.name.trim().toLowerCase())) errors.push(`A campaign named "${campaign.name}" already exists.`);
  if (!o.creatable) errors.push(`${o.label} campaigns can't be created here: manage them in Ads Manager.`);
  if (campaign.advantageState === "LEGACY_ASC") errors.push("Legacy Advantage+ Shopping campaigns can no longer be created.");
  if (campaign.budget && !(campaign.budget.amount >= LIMITS.minDailyBudget)) errors.push(`The campaign budget must be at least ${LIMITS.minDailyBudget}.`);
  errors.push(...bidErrors(campaign.bidStrategy, campaign.bidValue));
  if (!adSets.length) errors.push("A campaign needs at least one ad set.");
  for (const g of adSets) errors.push(...adSetErrors(data, campaign, g.adSet, g.ads));
  return errors;
}

export function validateOps(data: MetaAccountData, ops: MutateOp[]): string[] {
  const errors: string[] = [];
  const campaignOfSet = (id: string) => data.campaigns.find((c) => c.id === data.adSets.find((s) => s.id === id)?.campaignId);
  const campaignOfAd = (id: string) => campaignOfSet(data.ads.find((a) => a.id === id)?.adSetId ?? "");
  const locked = (c: ReturnType<typeof campaignOfSet>, what: string) => {
    if (isLocked(c)) errors.push(`${c!.name} is view only (${c!.advantageState === "LEGACY_ASC" ? "legacy Advantage+ Shopping can't be edited" : "App promotion is managed in Ads Manager"}): ${what}.`);
  };

  for (const op of ops) {
    switch (op.kind) {
      case "budget.update": {
        if (!(op.budget.amount >= LIMITS.minDailyBudget)) errors.push(`The budget must be at least ${LIMITS.minDailyBudget}.`);
        const c = op.entity === "CAMPAIGN" ? data.campaigns.find((x) => x.id === op.id) : campaignOfSet(op.id);
        locked(c, "its budget can't be changed");
        if (op.entity === "CAMPAIGN" && c && !c.budget) errors.push(`${c.name} has no campaign budget: change the budget of its ad sets instead.`);
        if (op.entity === "AD_SET" && c?.budget) errors.push(`${c.name} uses an Advantage+ campaign budget: change the campaign budget instead.`);
        if (op.entity === "AD_SET" && op.budget.kind === "DAILY") {
          const s = data.adSets.find((x) => x.id === op.id);
          if (s?.schedule?.length) errors.push(`"${s.name}" runs on a schedule, which needs a lifetime budget. Remove the schedule before switching to a daily budget.`);
        }
        break;
      }
      case "campaign.create":
        errors.push(...bundleErrors(data, op.bundle));
        break;
      case "campaign.update": {
        const c = data.campaigns.find((x) => x.id === op.campaignId);
        locked(c, "it can't be edited");
        if (op.patch.bidStrategy || op.patch.bidValue !== undefined) errors.push(...bidErrors(op.patch.bidStrategy ?? c?.bidStrategy ?? "LOWEST_COST_WITHOUT_CAP", op.patch.bidValue ?? c?.bidValue));
        if (op.patch.name !== undefined && !op.patch.name.trim()) errors.push("Campaign name is required.");
        if (c && ("startDate" in op.patch || "stopDate" in op.patch)) {
          const start = (op.patch.startDate ?? c.startDate).slice(0, 10);
          const stop = ("stopDate" in op.patch ? op.patch.stopDate : c.stopDate)?.slice(0, 10);
          errors.push(...dateErrors(c.name, c.startDate.slice(0, 10), { start: op.patch.startDate?.slice(0, 10), endGiven: "stopDate" in op.patch }, start, stop, isoDay(new Date())));
          if (stop) for (const s of data.adSets.filter((x) => x.campaignId === c.id && x.status !== "ARCHIVED" && x.endDate && x.endDate.slice(0, 10) > stop)) errors.push(`"${s.name}" runs until ${s.endDate!.slice(0, 10)}, after this end date. Move that ad set's end date first.`);
        }
        break;
      }
      case "adSet.update": {
        const c = campaignOfSet(op.adSetId);
        locked(c, "its ad sets can't be edited");
        const s = data.adSets.find((x) => x.id === op.adSetId);
        if (op.patch.placements && !op.patch.placements.advantage && !op.patch.placements.manual.length) errors.push("Pick at least one placement.");
        if (op.patch.targeting && c) errors.push(...specialCategoryErrors(c.specialAdCategories, op.patch.targeting));
        if (s && op.patch.bidStrategy) errors.push(...bidErrors(op.patch.bidStrategy, op.patch.bidValue ?? s.bidValue));
        if (s && ("startDate" in op.patch || "endDate" in op.patch)) {
          const start = (op.patch.startDate ?? s.startDate).slice(0, 10);
          const end = ("endDate" in op.patch ? op.patch.endDate : s.endDate)?.slice(0, 10);
          errors.push(...dateErrors(s.name, s.startDate.slice(0, 10), { start: op.patch.startDate?.slice(0, 10), endGiven: "endDate" in op.patch }, start, end, isoDay(new Date())));
          if ((op.patch.budget ?? s.budget ?? c?.budget)?.kind === "LIFETIME" && !end) errors.push(`"${s.name}" has a lifetime budget, so it needs an end date.`);
          // The campaign can stop later in the same change.
          const sameChange = ops.find((o) => o.kind === "campaign.update" && o.campaignId === c?.id && "stopDate" in o.patch);
          const stop = (sameChange && sameChange.kind === "campaign.update" ? sameChange.patch.stopDate : c?.stopDate)?.slice(0, 10);
          if (end && stop && end > stop) errors.push(`"${s.name}" can't run past its campaign, which ends ${stop}.`);
        }
        if (s && (op.patch.schedule || op.patch.budget)) errors.push(...scheduleErrors(s.name, "schedule" in op.patch ? op.patch.schedule : s.schedule, (op.patch.budget ?? s.budget) ?? c?.budget));
        break;
      }
      case "targeting.update": {
        const c = campaignOfSet(op.adSetId);
        locked(c, "its targeting can't be edited");
        const s = data.adSets.find((x) => x.id === op.adSetId);
        if (c && s) errors.push(...specialCategoryErrors(c.specialAdCategories, { ...s.targeting, ...op.patch }));
        if (op.patch.ageMin !== undefined && op.patch.ageMax !== undefined && op.patch.ageMin > op.patch.ageMax) errors.push("The minimum age is above the maximum.");
        break;
      }
      case "adSet.create": {
        const c = data.campaigns.find((x) => x.id === op.adSet.campaignId);
        if (!c) {
          errors.push("The campaign for this ad set no longer exists.");
          break;
        }
        locked(c, "new ad sets can't be added");
        errors.push(...adSetErrors(data, c, op.adSet, op.ads));
        break;
      }      case "ad.create":
        for (const ad of op.ads) {
          locked(campaignOfSet(ad.adSetId), "new ads can't be added");
          if (!data.adSets.some((s) => s.id === ad.adSetId)) errors.push("The ad set for this ad no longer exists.");
          errors.push(...textErrors(ad));
          const n = data.ads.filter((a) => a.adSetId === ad.adSetId && a.status !== "ARCHIVED").length + op.ads.filter((a) => a.adSetId === ad.adSetId).length;
          if (n > LIMITS.adsPerAdSet) errors.push(`An ad set can have at most ${LIMITS.adsPerAdSet} ads.`);
        }
        break;
      case "ad.update": {
        const ad = data.ads.find((a) => a.id === op.adId);
        locked(campaignOfAd(op.adId), "its ads can't be edited");
        if (ad) errors.push(...textErrors({ ...ad, ...op.patch }));
        break;
      }
      case "status.set":
        if (op.status === "ACTIVE") {
          for (const id of op.ids) {
            if (op.entity === "AD" && data.ads.find((a) => a.id === id)?.review === "REJECTED") errors.push("A rejected ad can't be turned on: fix it and request a review.");
            if (op.entity === "AD") locked(campaignOfAd(id), "it can't be turned on here");
            if (op.entity === "AD_SET") locked(campaignOfSet(id), "it can't be turned on here");
            if (op.entity === "CAMPAIGN") locked(data.campaigns.find((c) => c.id === id), "it can't be turned on here");
          }
        }
        break;
      case "policy.requestReview": {
        const issue = data.policyIssues.find((p) => p.id === op.issueId);
        if (!issue) errors.push("That policy issue no longer exists.");
        else if (issue.status === "IN_REVIEW") errors.push("A review is already in progress.");
        else if (issue.status === "RESOLVED") errors.push("That issue is already resolved.");
        else if (issue.level === "ACCOUNT") errors.push("Account restrictions are appealed in Account Quality on Meta, not from here.");
        break;
      }
      case "account.update":
        if (op.patch.brandSafety && !["EXPANDED", "MODERATE", "LIMITED"].includes(op.patch.brandSafety.inventoryFilter)) errors.push("Choose an inventory filter.");
        break;
      default:
        break;
    }
  }
  return [...new Set(errors)];
}
