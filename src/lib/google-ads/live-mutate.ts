// Turns an approved change (our MutateOps) into Google Ads mutate operations for
// one customer, plus the ops that undo it. Pure: the server fetches the current
// state from Google first and passes it in, so nothing here trusts the browser.
//
// Safety rules enforced here:
// - only the op kinds listed in LIVE_OPS; everything else is refused, not guessed;
// - every id must exist in this customer's current state (another account's ids never match);
// - nothing Google can't bring back: no REMOVED status, no campaign/ad group/ad removal.
//   The only removals are negatives, and keywords this app created (undo of a create);
// - budgets and bids may not jump by more than MAX_RAISE in one change, and a
//   target ROAS may not fall by more than that (a lower target spends more);
// - a change may not take the daily budgets above the business profile's monthly cap;
// - undo puts back what was there, so these limits don't apply to it;
// - amounts are rounded to the currency's billable unit, as Google requires.

import type { Bidding, EntityStatus, Keyword, MatchType, MutateOp, NegativeKeyword } from "./types";
import { EXPERIMENT_OPS, isExperimentOp } from "./live-experiment";
import { CREATE_OPS, CreatePlanError, emptyCreateState, inverseForCreatedResources, isCreateOp, planCreate, type CreateState } from "./live-create";

export const LIVE_OPS = ["status.set", "budget.update", "campaign.update", "adGroup.update", "keyword.create", "keyword.update", "negative.create", "negative.remove", ...CREATE_OPS, ...EXPERIMENT_OPS] as const;

/** A raise beyond this multiple of the current budget or bid must be done in steps. */
export const MAX_RAISE = 3;
export const MAX_OPERATIONS = 200;

export type BeforeState = {
  /** Smallest amount Google bills in the account currency, in micros (10 000 for cents). */
  billableUnitMicros: number;
  campaigns: Record<string, { name: string; status: EntityStatus; budgetId: string; biddingType: string; targetCpa?: number; targetRoas?: number }>;
  budgets: Record<string, { amount: number; shared: boolean }>;
  adGroups: Record<string, { name: string; status: EntityStatus; campaignId: string; cpcBid?: number; targetCpa?: number }>;
  /** Positive and negative ad group criteria, keyed "adGroupId~criterionId". */
  criteria: Record<string, { text: string; matchType: MatchType; negative: boolean; status: EntityStatus; cpcBid?: number; finalUrl?: string }>;
  ads: Record<string, { status: EntityStatus }>;
  /** Campaign negative keywords, keyed "campaignId~criterionId". */
  campaignNegatives: Record<string, { text: string; matchType: MatchType }>;
  /** Keyword ids earlier changes in this workspace created: only these may be removed. */
  createdKeywordIds: Set<string>;
  /** The account's budgets, when the business profile has a monthly cap and the change could spend more. */
  spend?: SpendState;
  /** What creating things needs: images, asset groups, targeting, what this app created. */
  create?: CreateState;
  /** The business profile has no monthly budget cap: nothing that raises spending may be sent. */
  capMissing?: boolean;
};

export type SpendState = {
  /** The business profile's monthly budget cap, in the account currency. */
  monthlyCap: number;
  /** Daily amount of every budget in use. */
  budgets: Record<string, number>;
  campaigns: Record<string, { budgetId: string; enabled: boolean }>;
};

/** Average days in a month, for turning daily budgets into a monthly figure. */
const DAYS_PER_MONTH = 30.4;

/** Which created resource each operation's result belongs to, so the server can read back new ids. */
export type CreatedRef = { index: number; kind: "keyword" | "adGroupNegative" | "campaignNegative" | "resource"; ref: string };

export type LivePlan = {
  operations: Record<string, unknown>[];
  /** Undo ops, in undo order. Creations are filled in after Google returns their ids. */
  inverse: MutateOp[];
  created: CreatedRef[];
  warnings: string[];
};

export class LivePlanError extends Error {}

const ID = /^\d{1,20}$/;
const PAIR = /^\d{1,20}~\d{1,20}$/;
const TURNS_ON = "This turns on a paused campaign: it starts spending its budget again.";

export function toMicros(amount: number, unitMicros: number): string {
  const unit = unitMicros > 0 ? unitMicros : 10_000;
  // Integer maths on micros: avoids 0.1+0.2 style errors Google rejects.
  return String(Math.round((amount * 1_000_000) / unit) * unit);
}

function money(amount: unknown, what: string): number {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) throw new LivePlanError(`${what} must be a positive amount.`);
  return amount;
}

function guardRaise(before: number | undefined, after: number, what: string) {
  if (before && before > 0 && after > before * MAX_RAISE)
    throw new LivePlanError(`${what} would go from ${before} to ${after}. Raises above ${MAX_RAISE}× must be made in smaller steps.`);
}

const text = (s: unknown, max: number, what: string) => {
  const t = typeof s === "string" ? s.trim() : "";
  if (!t || t.length > max) throw new LivePlanError(`${what} must be 1–${max} characters.`);
  return t;
};

/** Sum of the daily budgets of enabled campaigns (a shared budget counts once), now and after these ops. */
export function dailySpend(ops: MutateOp[], spend: SpendState): { now: number; after: number } {
  const total = (budgets: Record<string, number>, enabled: Set<string>) =>
    [...new Set([...enabled].map((id) => spend.campaigns[id]?.budgetId).filter((id): id is string => !!id))].reduce((sum, id) => sum + (budgets[id] ?? 0), 0);
  const enabledNow = new Set(Object.entries(spend.campaigns).filter(([, c]) => c.enabled).map(([id]) => id));
  const budgets = { ...spend.budgets };
  const enabled = new Set(enabledNow);
  for (const op of ops) {
    if (op.kind === "budget.update") budgets[op.budgetId] = op.amount;
    if (op.kind === "status.set" && op.entity === "CAMPAIGN") {
      for (const id of op.ids) {
        if (op.status === "ENABLED") enabled.add(id);
        else enabled.delete(id);
      }
    }
  }
  return { now: total(spend.budgets, enabledNow), after: total(budgets, enabled) };
}

export function planLiveChange(customerId: string, ops: MutateOp[], before: BeforeState, opts: { undo?: boolean } = {}): LivePlan {
  if (!/^\d{10}$/.test(customerId)) throw new LivePlanError("Bad customer id.");
  const guard = (previous: number | undefined, after: number, what: string) => {
    if (!opts.undo) guardRaise(previous, after, what);
  };
  // An undo sends null for a value that was not set before the change.
  const cleared = (value: unknown) => !!opts.undo && value === null;
  const rn = (collection: string, id: string) => `customers/${customerId}/${collection}/${id}`;
  const operations: Record<string, unknown>[] = [];
  const inverse: MutateOp[] = [];
  const created: CreatedRef[] = [];
  const warnings: string[] = [];
  const temp = { next: -1 };
  const update = (family: string, resource: Record<string, unknown>, mask: string[]) =>
    operations.push({ [family]: { update: resource, updateMask: mask.join(",") } });

  for (const op of ops) {
    if (!(LIVE_OPS as readonly string[]).includes(op.kind)) throw new LivePlanError(`"${op.kind}" can't be sent to Google Ads yet.`);
    // Experiments run as their own steps (live-experiment.server); they can't be a plan step.
    if (isExperimentOp(op)) throw new LivePlanError("An experiment is started from the chat on its own, not inside a plan or with other edits.");
    if (isCreateOp(op)) {
      try {
        planCreate(op, {
          customerId,
          before,
          state: before.create ?? emptyCreateState(),
          undo: !!opts.undo,
          operations,
          inverse: inverse as never,
          created,
          warnings,
          toMicros: (amount) => toMicros(amount, before.billableUnitMicros),
          temp,
        });
      } catch (err) {
        if (err instanceof CreatePlanError) throw new LivePlanError(err.message);
        throw err;
      }
      continue;
    }

    switch (op.kind) {
      case "status.set": {
        const isRemove = op.status === "REMOVED";
        if (op.status !== "ENABLED" && op.status !== "PAUSED" && !(isRemove && op.entity === "KEYWORD"))
          throw new LivePlanError("Removing can't be undone in Google Ads. Pause it instead.");
        const previous = new Map<EntityStatus, string[]>();
        for (const id of op.ids) {
          if (op.entity === "CAMPAIGN") {
            const c = ID.test(id) ? before.campaigns[id] : undefined;
            if (!c) throw new LivePlanError(`Campaign ${id} isn't in this account.`);
            update("campaign_operation", { resourceName: rn("campaigns", id), status: op.status }, ["status"]);
            previous.set(c.status, [...(previous.get(c.status) ?? []), id]);
            if (!opts.undo && op.status === "ENABLED" && c.status === "PAUSED" && !warnings.includes(TURNS_ON)) warnings.push(TURNS_ON);
          } else if (op.entity === "AD_GROUP") {
            const g = ID.test(id) ? before.adGroups[id] : undefined;
            if (!g) throw new LivePlanError(`Ad group ${id} isn't in this account.`);
            update("ad_group_operation", { resourceName: rn("adGroups", id), status: op.status }, ["status"]);
            previous.set(g.status, [...(previous.get(g.status) ?? []), id]);
          } else if (op.entity === "AD") {
            const a = PAIR.test(id) ? before.ads[id] : undefined;
            if (!a) throw new LivePlanError(`Ad ${id} isn't in this account.`);
            update("ad_group_ad_operation", { resourceName: rn("adGroupAds", id), status: op.status }, ["status"]);
            previous.set(a.status, [...(previous.get(a.status) ?? []), id]);
          } else if (op.entity === "KEYWORD") {
            const k = PAIR.test(id) ? before.criteria[id] : undefined;
            if (!k || k.negative) throw new LivePlanError(`Keyword ${id} isn't in this account.`);
            if (isRemove) {
              // Only an undo of our own create may remove a keyword.
              if (!before.createdKeywordIds.has(id)) throw new LivePlanError("Removing can't be undone in Google Ads. Pause it instead.");
              operations.push({ ad_group_criterion_operation: { remove: rn("adGroupCriteria", id) } });
              continue;
            }
            update("ad_group_criterion_operation", { resourceName: rn("adGroupCriteria", id), status: op.status }, ["status"]);
            previous.set(k.status, [...(previous.get(k.status) ?? []), id]);
          } else {
            throw new LivePlanError(`Changing the status of ${op.entity.toLowerCase().replace("_", " ")}s can't be sent to Google Ads yet.`);
          }
        }
        for (const [status, ids] of previous) inverse.unshift({ kind: "status.set", entity: op.entity, ids, status });
        break;
      }

      case "budget.update": {
        const b = ID.test(op.budgetId) ? before.budgets[op.budgetId] : undefined;
        if (!b) throw new LivePlanError(`Budget ${op.budgetId} isn't in this account.`);
        const amount = money(op.amount, "The daily budget");
        guard(b.amount, amount, "The daily budget");
        if (b.shared) warnings.push("This is a shared budget: every campaign that uses it changes too.");
        update("campaign_budget_operation", { resourceName: rn("campaignBudgets", op.budgetId), amountMicros: toMicros(amount, before.billableUnitMicros) }, ["amount_micros"]);
        inverse.unshift({ kind: "budget.update", budgetId: op.budgetId, amount: b.amount });
        break;
      }

      case "campaign.update": {
        const c = ID.test(op.campaignId) ? before.campaigns[op.campaignId] : undefined;
        if (!c) throw new LivePlanError(`Campaign ${op.campaignId} isn't in this account.`);
        const resource: Record<string, unknown> = { resourceName: rn("campaigns", op.campaignId) };
        const mask: string[] = [];
        const undo: Partial<{ name: string; bidding: Bidding }> = {};
        for (const key of Object.keys(op.patch)) if (key !== "name" && key !== "bidding") throw new LivePlanError(`Changing a campaign's ${key} can't be sent to Google Ads yet.`);
        if (op.patch.name !== undefined) {
          resource.name = text(op.patch.name, 255, "The campaign name");
          mask.push("name");
          undo.name = c.name;
        }
        if (op.patch.bidding) {
          const bid = op.patch.bidding as { type?: string; targetCpa?: number | null; targetRoas?: number | null };
          const strategy = biddingField(c.biddingType);
          if (!strategy || (bid.type && bid.type !== strategyType(c.biddingType)))
            throw new LivePlanError("Changing the bid strategy type can't be sent to Google Ads yet.");
          // Only the target this change touches goes in the undo; null clears one that was not set.
          const undoBid: Record<string, unknown> = { type: strategyType(c.biddingType)! };
          if (bid.targetCpa !== undefined) {
            if (strategy.cpa === undefined) throw new LivePlanError("This bid strategy has no target CPA.");
            if (cleared(bid.targetCpa)) resource[strategy.cpa] = {};
            else {
              const v = money(bid.targetCpa, "The target CPA");
              guard(c.targetCpa, v, "The target CPA");
              resource[strategy.cpa] = { targetCpaMicros: toMicros(v, before.billableUnitMicros) };
            }
            mask.push(`${snake(strategy.cpa)}.target_cpa_micros`);
            undoBid.targetCpa = c.targetCpa ?? null;
          }
          if (bid.targetRoas !== undefined) {
            if (strategy.roas === undefined) throw new LivePlanError("This bid strategy has no target ROAS.");
            if (cleared(bid.targetRoas)) resource[strategy.roas] = {};
            else {
              const v = money(bid.targetRoas, "The target ROAS");
              if (!opts.undo && c.targetRoas && v < c.targetRoas / MAX_RAISE)
                throw new LivePlanError(`The target ROAS would fall from ${c.targetRoas} to ${v}, which raises spending. Cuts beyond ${MAX_RAISE}× must be made in smaller steps.`);
              resource[strategy.roas] = { targetRoas: v };
            }
            mask.push(`${snake(strategy.roas)}.target_roas`);
            undoBid.targetRoas = c.targetRoas ?? null;
          }
          undo.bidding = undoBid as unknown as Bidding;
        }
        if (!mask.length) break;
        update("campaign_operation", resource, mask);
        inverse.unshift({ kind: "campaign.update", campaignId: op.campaignId, patch: undo });
        break;
      }

      case "adGroup.update": {
        const g = ID.test(op.adGroupId) ? before.adGroups[op.adGroupId] : undefined;
        if (!g) throw new LivePlanError(`Ad group ${op.adGroupId} isn't in this account.`);
        const resource: Record<string, unknown> = { resourceName: rn("adGroups", op.adGroupId) };
        const mask: string[] = [];
        const undo: Record<string, unknown> = {};
        for (const key of Object.keys(op.patch))
          if (!["name", "defaultCpcBid", "targetCpa"].includes(key)) throw new LivePlanError(`Changing an ad group's ${key} can't be sent to Google Ads yet.`);
        if (op.patch.name !== undefined) {
          resource.name = text(op.patch.name, 255, "The ad group name");
          mask.push("name");
          undo.name = g.name;
        }
        if (op.patch.defaultCpcBid !== undefined) {
          if (!cleared(op.patch.defaultCpcBid)) {
            const v = money(op.patch.defaultCpcBid, "The default bid");
            guard(g.cpcBid, v, "The default bid");
            resource.cpcBidMicros = toMicros(v, before.billableUnitMicros);
          }
          mask.push("cpc_bid_micros");
          undo.defaultCpcBid = g.cpcBid ?? null;
        }
        if (op.patch.targetCpa !== undefined) {
          if (!cleared(op.patch.targetCpa)) {
            const v = money(op.patch.targetCpa, "The ad group target CPA");
            guard(g.targetCpa, v, "The ad group target CPA");
            resource.targetCpaMicros = toMicros(v, before.billableUnitMicros);
          }
          mask.push("target_cpa_micros");
          undo.targetCpa = g.targetCpa ?? null;
        }
        if (!mask.length) break;
        update("ad_group_operation", resource, mask);
        inverse.unshift({ kind: "adGroup.update", adGroupId: op.adGroupId, patch: undo });
        break;
      }

      case "keyword.create": {
        for (const k of op.keywords) {
          const g = ID.test(k.adGroupId) ? before.adGroups[k.adGroupId] : undefined;
          if (!g) throw new LivePlanError(`Ad group ${k.adGroupId} isn't in this account.`);
          const words = text(k.text, 80, "A keyword");
          if (words.split(/\s+/).length > 10) throw new LivePlanError(`"${words}" has more than 10 words.`);
          if (!isMatch(k.matchType)) throw new LivePlanError(`"${words}" has no valid match type.`);
          if (k.status !== "ENABLED" && k.status !== "PAUSED") throw new LivePlanError(`"${words}" must be enabled or paused.`);
          const exists = Object.entries(before.criteria).some(
            ([id, c]) => id.startsWith(`${k.adGroupId}~`) && !c.negative && c.text.toLowerCase() === words.toLowerCase() && c.matchType === k.matchType
          );
          if (exists) throw new LivePlanError(`"${words}" (${k.matchType.toLowerCase()}) is already in this ad group.`);
          if (k.cpcBid !== undefined) guard(g.cpcBid, money(k.cpcBid, `The bid for "${words}"`), `The bid for "${words}" against the ad group's default bid`);
          created.push({ index: operations.length, kind: "keyword", ref: k.id });
          operations.push({
            ad_group_criterion_operation: {
              create: {
                adGroup: rn("adGroups", k.adGroupId),
                status: k.status,
                keyword: { text: words, matchType: k.matchType },
                ...(k.cpcBid !== undefined ? { cpcBidMicros: toMicros(money(k.cpcBid, `The bid for "${words}"`), before.billableUnitMicros) } : {}),
                ...(k.finalUrl ? { finalUrls: [url(k.finalUrl)] } : {}),
              },
            },
          });
        }
        break;
      }

      case "keyword.update": {
        const k = PAIR.test(op.keywordId) ? before.criteria[op.keywordId] : undefined;
        if (!k || k.negative) throw new LivePlanError(`Keyword ${op.keywordId} isn't in this account.`);
        if (op.patch.matchType !== undefined && op.patch.matchType !== k.matchType)
          throw new LivePlanError("Google Ads can't change a keyword's match type. Add the keyword again with the new match type and pause the old one.");
        const resource: Record<string, unknown> = { resourceName: rn("adGroupCriteria", op.keywordId) };
        const mask: string[] = [];
        const undo: Partial<Pick<Keyword, "finalUrl">> & { cpcBid?: number | null } = {};
        if (op.patch.cpcBid !== undefined) {
          if (!cleared(op.patch.cpcBid)) {
            const v = money(op.patch.cpcBid, "The keyword bid");
            // A keyword with no bid of its own uses its ad group's.
            guard(k.cpcBid ?? before.adGroups[op.keywordId.split("~")[0]!]?.cpcBid, v, "The keyword bid");
            resource.cpcBidMicros = toMicros(v, before.billableUnitMicros);
          }
          mask.push("cpc_bid_micros");
          undo.cpcBid = k.cpcBid ?? null;
        }
        if (op.patch.finalUrl !== undefined) {
          resource.finalUrls = op.patch.finalUrl ? [url(op.patch.finalUrl)] : [];
          mask.push("final_urls");
          undo.finalUrl = k.finalUrl ?? "";
        }
        if (!mask.length) break;
        update("ad_group_criterion_operation", resource, mask);
        inverse.unshift({ kind: "keyword.update", keywordId: op.keywordId, patch: undo as Partial<Keyword> });
        break;
      }

      case "negative.create": {
        for (const n of op.negatives) {
          const words = text(n.text, 80, "A negative keyword");
          if (!isMatch(n.matchType)) throw new LivePlanError(`"${words}" has no valid match type.`);
          if (n.level === "AD_GROUP") {
            if (!ID.test(n.parentId) || !before.adGroups[n.parentId]) throw new LivePlanError(`Ad group ${n.parentId} isn't in this account.`);
            created.push({ index: operations.length, kind: "adGroupNegative", ref: n.id });
            operations.push({ ad_group_criterion_operation: { create: { adGroup: rn("adGroups", n.parentId), negative: true, keyword: { text: words, matchType: n.matchType } } } });
          } else if (n.level === "CAMPAIGN") {
            if (!ID.test(n.parentId) || !before.campaigns[n.parentId]) throw new LivePlanError(`Campaign ${n.parentId} isn't in this account.`);
            created.push({ index: operations.length, kind: "campaignNegative", ref: n.id });
            operations.push({ campaign_criterion_operation: { create: { campaign: rn("campaigns", n.parentId), negative: true, keyword: { text: words, matchType: n.matchType } } } });
          } else {
            throw new LivePlanError("Negative keyword lists can't be changed from here yet.");
          }
        }
        break;
      }

      case "negative.remove": {
        const restored: NegativeKeyword[] = [];
        for (const id of op.ids) {
          if (!PAIR.test(id)) throw new LivePlanError(`Negative keyword ${id} isn't in this account.`);
          const adGroupNeg = before.criteria[id];
          const campaignNeg = before.campaignNegatives[id];
          const [parentId] = id.split("~");
          if (adGroupNeg?.negative) {
            operations.push({ ad_group_criterion_operation: { remove: rn("adGroupCriteria", id) } });
            restored.push({ id, text: adGroupNeg.text, matchType: adGroupNeg.matchType, level: "AD_GROUP", parentId: parentId! });
          } else if (campaignNeg) {
            operations.push({ campaign_criterion_operation: { remove: rn("campaignCriteria", id) } });
            restored.push({ id, text: campaignNeg.text, matchType: campaignNeg.matchType, level: "CAMPAIGN", parentId: parentId! });
          } else {
            throw new LivePlanError(`Negative keyword ${id} isn't in this account.`);
          }
        }
        inverse.unshift({ kind: "negative.create", negatives: restored });
        break;
      }
    }
  }

  if (!operations.length) throw new LivePlanError("This change doesn't change anything in Google Ads.");
  if (operations.length > MAX_OPERATIONS) throw new LivePlanError(`One change can hold at most ${MAX_OPERATIONS} edits. Split it up.`);
  // Real money: a change that spends more needs the owner's monthly cap to be checked against.
  if (!opts.undo && before.capMissing) {
    const raises = ops.some(
      (op) =>
        (op.kind === "budget.update" && op.amount > (before.budgets[op.budgetId]?.amount ?? 0)) ||
        (op.kind === "status.set" && op.entity === "CAMPAIGN" && op.status === "ENABLED" && op.ids.some((id) => before.campaigns[id]?.status !== "ENABLED"))
    );
    if (raises)
      throw new LivePlanError("This raises spending, and the Business profile has no monthly budget cap yet. Ask the owner for the cap and save it first (update_business_profile), then propose the change again.");
  }
  if (!opts.undo && before.spend) {
    const { now, after } = dailySpend(ops, before.spend);
    const monthly = Math.round(after * DAYS_PER_MONTH * 100) / 100;
    if (after > now && monthly > before.spend.monthlyCap)
      throw new LivePlanError(`This would bring the daily budgets to ${after} (about ${monthly} a month), above the monthly budget cap of ${before.spend.monthlyCap} in the Business profile. Spend less, or raise the cap there.`);
  }
  return { operations, inverse, created, warnings };
}

/** Undo ops for what a change created, once Google has returned the new resource names. */
export function inverseForCreated(created: CreatedRef[], resourceNames: (string | undefined)[]): { inverse: MutateOp[]; keywordIds: string[]; resources: string[] } {
  const keywordIds: string[] = [];
  const negativeIds: string[] = [];
  const made = inverseForCreatedResources(created, resourceNames);
  for (const c of created) {
    if (c.kind === "resource") continue;
    const id = resourceNames[c.index]?.split("/").pop();
    if (!id || !PAIR.test(id)) continue;
    if (c.kind === "keyword") keywordIds.push(id);
    else negativeIds.push(id);
  }
  const inverse: MutateOp[] = [];
  if (keywordIds.length) inverse.push({ kind: "status.set", entity: "KEYWORD", ids: keywordIds, status: "REMOVED" });
  if (negativeIds.length) inverse.push({ kind: "negative.remove", ids: negativeIds });
  inverse.unshift(...(made.inverse as MutateOp[]));
  return { inverse, keywordIds, resources: made.resources };
}

/** Resource name of each operation's result, in operation order. */
export function resultNames(response: Record<string, unknown>): (string | undefined)[] {
  const list = (response.mutate_operation_responses ?? response.mutateOperationResponses ?? []) as Record<string, Record<string, unknown> | undefined>[];
  return list.map((r) => {
    const result = r && Object.values(r)[0];
    return (result?.resource_name ?? result?.resourceName) as string | undefined;
  });
}

const isMatch = (m: unknown): m is MatchType => m === "BROAD" || m === "PHRASE" || m === "EXACT";

function url(u: string): string {
  const v = u.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(v) || v.length > 2048) throw new LivePlanError(`"${v}" isn't a valid web address.`);
  return v;
}

/** Where a strategy keeps its targets on the campaign resource. */
function biddingField(type: string): { cpa?: string; roas?: string } | null {
  switch (type) {
    case "TARGET_CPA":
      return { cpa: "targetCpa" };
    case "MAXIMIZE_CONVERSIONS":
      return { cpa: "maximizeConversions" };
    case "TARGET_ROAS":
      return { roas: "targetRoas" };
    case "MAXIMIZE_CONVERSION_VALUE":
      return { roas: "maximizeConversionValue" };
    case "MANUAL_CPC":
    case "TARGET_SPEND":
    case "TARGET_IMPRESSION_SHARE":
      return {};
    default:
      return null;
  }
}

function strategyType(type: string): Bidding["type"] | undefined {
  const map: Record<string, Bidding["type"]> = {
    TARGET_CPA: "TARGET_CPA",
    MAXIMIZE_CONVERSIONS: "MAXIMIZE_CONVERSIONS",
    TARGET_ROAS: "TARGET_ROAS",
    MAXIMIZE_CONVERSION_VALUE: "MAXIMIZE_CONVERSION_VALUE",
    MANUAL_CPC: "MANUAL_CPC",
    TARGET_SPEND: "MAXIMIZE_CLICKS",
    TARGET_IMPRESSION_SHARE: "TARGET_IMPRESSION_SHARE",
  };
  return map[type];
}

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
