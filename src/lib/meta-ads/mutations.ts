// Applies MutateOps to an ad account snapshot. Pure: returns the next snapshot
// plus the ops that undo it. The server will run the same ops through the
// Marketing API (validate first, then for real).

import { LIMITS, OBJECTIVES } from "./constants";
import { money } from "./metrics";
import type {
  AdScheduleBlock,
  AdSet,
  BudgetKind,
  CampaignBundle,
  ChangeTouched,
  CollectionKey,
  DeliveryStatus,
  DiffRow,
  EntityStatus,
  MetaAccountData,
  MetaAd,
  MetaBudget,
  MetaCampaign,
  MutateOp,
  NewAd,
  NewAdSet,
  PartDraft,
  StatusEntity,
} from "./types";

export { gid } from "@/lib/google-ads/mutations";
import { gid } from "@/lib/google-ads/mutations";

const STATUS_COLLECTION: Record<StatusEntity, "campaigns" | "adSets" | "ads"> = { CAMPAIGN: "campaigns", AD_SET: "adSets", AD: "ads" };

/** Edits to these settings are significant: Meta resets the learning phase. */
export const LEARNING_RESET_KEYS: (keyof AdSet)[] = ["optimizationGoal", "bidStrategy", "bidValue", "placements", "promotedObject", "attribution", "conversionLocation"];

/** Whether the ad set's budget change is big enough to reset learning. */
export function budgetResetsLearning(before: MetaBudget | undefined, after: MetaBudget): boolean {
  if (!before) return false;
  if (before.kind !== after.kind) return true;
  return before.amount > 0 && Math.abs(after.amount - before.amount) / before.amount > LIMITS.safeBudgetStep;
}

function pickPrev<T extends object>(source: T, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) out[k] = source[k];
  return out;
}

/** A campaign Meta no longer lets anyone edit: legacy Advantage+ Shopping, and App promotion (view only here). */
export function isLocked(c?: MetaCampaign): boolean {
  return !!c && (c.advantageState === "LEGACY_ASC" || c.objective === "APP_PROMOTION");
}

/** Delivery after an entity is switched on, from what it knows about itself. */
function deliveryWhenOn(data: MetaAccountData, entity: StatusEntity, id: string): DeliveryStatus {
  if (entity === "AD") {
    const ad = data.ads.find((a) => a.id === id);
    return ad?.review === "REJECTED" ? "REJECTED" : ad?.review === "IN_REVIEW" ? "IN_REVIEW" : "ACTIVE";
  }
  if (entity === "AD_SET") {
    const s = data.adSets.find((x) => x.id === id);
    return s?.learning.phase === "LEARNING" ? "LEARNING" : s?.learning.phase === "LIMITED" ? "LEARNING_LIMITED" : "ACTIVE";
  }
  const sets = data.adSets.filter((s) => s.campaignId === id && s.status === "ACTIVE");
  return sets.some((s) => s.learning.phase === "LIMITED") ? "LEARNING_LIMITED" : "ACTIVE";
}

function mapList<T extends { id: string }>(list: T[], id: string, update: (item: T) => T): T[] {
  return list.map((x) => (x.id === id ? update(x) : x));
}

function applyOne(data: MetaAccountData, op: MutateOp): { next: MetaAccountData; inverse: MutateOp[] } {
  switch (op.kind) {
    case "campaign.create": {
      const { bundle } = op;
      const campaignId = op.tempId;
      const createdAt = new Date().toISOString();
      const sets = bundle.adSets.map((g) => ({ ...g, id: gid("as") }));
      const weights = { ...data.weights };
      const adSets: AdSet[] = sets.map((g) => ({ ...g.adSet, id: g.id, campaignId, delivery: "IN_REVIEW" as const, learning: { phase: "LEARNING" as const, events: 0, target: LIMITS.learningEvents }, createdAt }));
      const ads: MetaAd[] = sets.flatMap((g) =>
        g.ads.map((a) => ({ ...a, id: gid("ad"), adSetId: g.id, delivery: "IN_REVIEW" as const, review: "IN_REVIEW" as const, rankings: { quality: "UNKNOWN" as const, engagement: "UNKNOWN" as const, conversion: "UNKNOWN" as const }, createdAt }))
      );
      for (const s of adSets) weights[s.id] = { share: 1, efficiency: 1 };
      for (const a of ads) weights[a.id] = { share: 1, efficiency: 1 };
      const next: MetaAccountData = {
        ...data,
        campaigns: [...data.campaigns, { ...bundle.campaign, id: campaignId, createdAt, delivery: "IN_REVIEW", labels: ["Created by agent"] }],
        adSets: [...data.adSets, ...adSets],
        ads: [...data.ads, ...ads],
        weights,
        daily: { ...data.daily, [campaignId]: [] },
      };
      return { next, inverse: [{ kind: "status.set", entity: "CAMPAIGN", ids: [campaignId], status: "ARCHIVED" }] };
    }

    case "campaign.update": {
      const c = data.campaigns.find((x) => x.id === op.campaignId);
      if (!c) return { next: data, inverse: [] };
      const keys = Object.keys(op.patch) as (keyof MetaCampaign)[];
      return {
        next: { ...data, campaigns: mapList(data.campaigns, c.id, (x) => ({ ...x, ...op.patch })) },
        inverse: [{ kind: "campaign.update", campaignId: c.id, patch: pickPrev(c, keys) }],
      };
    }

    case "adSet.create":
      return {
        next: {
          ...data,
          adSets: [...data.adSets, op.adSet],
          ads: [...data.ads, ...op.ads],
          weights: { ...data.weights, [op.adSet.id]: { share: 1, efficiency: 1 }, ...Object.fromEntries(op.ads.map((a) => [a.id, { share: 1, efficiency: 1 }])) },
        },
        inverse: [{ kind: "status.set", entity: "AD_SET", ids: [op.adSet.id], status: "ARCHIVED" }],
      };

    case "adSet.update": {
      const s = data.adSets.find((x) => x.id === op.adSetId);
      if (!s) return { next: data, inverse: [] };
      const keys = Object.keys(op.patch) as (keyof AdSet)[];
      const resets = keys.some((k) => LEARNING_RESET_KEYS.includes(k)) && s.status === "ACTIVE";
      const patch: Partial<AdSet> = resets ? { ...op.patch, learning: { phase: "LEARNING", events: 0, target: LIMITS.learningEvents }, delivery: "LEARNING" } : op.patch;
      const prevKeys = resets ? [...new Set([...keys, "learning" as const, "delivery" as const])] : keys;
      return {
        next: { ...data, adSets: mapList(data.adSets, s.id, (x) => ({ ...x, ...patch })) },
        inverse: [{ kind: "adSet.update", adSetId: s.id, patch: pickPrev(s, prevKeys) }],
      };
    }

    case "ad.create":
      return {
        next: { ...data, ads: [...data.ads, ...op.ads], weights: { ...data.weights, ...Object.fromEntries(op.ads.map((a) => [a.id, { share: 1, efficiency: 1 }])) } },
        inverse: [{ kind: "status.set", entity: "AD", ids: op.ads.map((a) => a.id), status: "ARCHIVED" }],
      };

    case "ad.update": {
      const a = data.ads.find((x) => x.id === op.adId);
      if (!a) return { next: data, inverse: [] };
      const keys = Object.keys(op.patch) as (keyof MetaAd)[];
      return {
        next: { ...data, ads: mapList(data.ads, a.id, (x) => ({ ...x, ...op.patch })) },
        inverse: [{ kind: "ad.update", adId: a.id, patch: pickPrev(a, keys) }],
      };
    }

    case "status.set": {
      const key = STATUS_COLLECTION[op.entity];
      const list = data[key] as { id: string; status: EntityStatus }[];
      const byPrev = new Map<EntityStatus, string[]>();
      for (const id of op.ids) {
        const item = list.find((x) => x.id === id);
        if (item && item.status !== op.status) byPrev.set(item.status, [...(byPrev.get(item.status) ?? []), id]);
      }
      const touched = new Set(op.ids);
      const nextList = list.map((x) => {
        if (!touched.has(x.id)) return x;
        const delivery = op.status === "ACTIVE" ? deliveryWhenOn(data, op.entity, x.id) : "OFF";
        return { ...x, status: op.status, delivery };
      });
      const inverse: MutateOp[] = [...byPrev.entries()].map(([status, ids]) => ({ kind: "status.set" as const, entity: op.entity, ids, status }));
      return { next: { ...data, [key]: nextList } as MetaAccountData, inverse };
    }

    case "budget.update": {
      if (op.entity === "CAMPAIGN") {
        const c = data.campaigns.find((x) => x.id === op.id);
        if (!c) return { next: data, inverse: [] };
        return {
          next: { ...data, campaigns: mapList(data.campaigns, c.id, (x) => ({ ...x, budget: op.budget })) },
          inverse: [{ kind: "campaign.update", campaignId: c.id, patch: { budget: c.budget } }],
        };
      }
      const s = data.adSets.find((x) => x.id === op.id);
      if (!s) return { next: data, inverse: [] };
      const resets = s.status === "ACTIVE" && budgetResetsLearning(s.budget, op.budget);
      const patch: Partial<AdSet> = resets ? { budget: op.budget, learning: { phase: "LEARNING", events: 0, target: LIMITS.learningEvents }, delivery: "LEARNING" } : { budget: op.budget };
      return {
        next: { ...data, adSets: mapList(data.adSets, s.id, (x) => ({ ...x, ...patch })) },
        inverse: [{ kind: "adSet.update", adSetId: s.id, patch: pickPrev(s, resets ? ["budget", "learning", "delivery"] : ["budget"]) }],
      };
    }

    case "targeting.update": {
      const s = data.adSets.find((x) => x.id === op.adSetId);
      if (!s) return { next: data, inverse: [] };
      const keys = Object.keys(op.patch) as (keyof AdSet["targeting"])[];
      return {
        next: { ...data, adSets: mapList(data.adSets, s.id, (x) => ({ ...x, targeting: { ...x.targeting, ...op.patch } })) },
        inverse: [{ kind: "targeting.update", adSetId: s.id, patch: pickPrev(s.targeting, keys) }],
      };
    }

    case "policy.requestReview": {
      const issue = data.policyIssues.find((p) => p.id === op.issueId);
      if (!issue) return { next: data, inverse: [] };
      const ad = issue.level === "AD" ? data.ads.find((a) => a.id === issue.entityId) : undefined;
      const next: MetaAccountData = {
        ...data,
        policyIssues: mapList(data.policyIssues, issue.id, (p) => ({ ...p, status: "IN_REVIEW", reviewRequested: true })),
        ads: ad && ad.review === "REJECTED" ? mapList(data.ads, ad.id, (a) => ({ ...a, review: "IN_REVIEW", delivery: "IN_REVIEW" })) : data.ads,
      };
      return { next, inverse: [{ kind: "policy.restore", issue, ad: ad ? { id: ad.id, review: ad.review, delivery: ad.delivery } : undefined }] };
    }

    case "policy.restore": {
      const current = data.policyIssues.find((p) => p.id === op.issue.id);
      return {
        next: {
          ...data,
          policyIssues: mapList(data.policyIssues, op.issue.id, () => op.issue),
          ads: op.ad ? mapList(data.ads, op.ad.id, (a) => ({ ...a, review: op.ad!.review, delivery: op.ad!.delivery })) : data.ads,
        },
        inverse: current ? [{ kind: "policy.requestReview", issueId: current.id }] : [],
      };
    }

    case "account.update": {
      const keys = Object.keys(op.patch) as (keyof typeof op.patch)[];
      return { next: { ...data, ...op.patch }, inverse: [{ kind: "account.update", patch: pickPrev(data, keys as (keyof MetaAccountData)[]) as typeof op.patch }] };
    }

    case "opportunity.set":
    case "lead.set": {
      const key = op.kind === "opportunity.set" ? "opportunities" : "leads";
      const list = data[key] as { id: string; status: string }[];
      const byPrev = new Map<string, string[]>();
      for (const id of op.ids) {
        const item = list.find((x) => x.id === id);
        if (item && item.status !== op.status) byPrev.set(item.status, [...(byPrev.get(item.status) ?? []), id]);
      }
      const touched = new Set(op.ids);
      const inverse = [...byPrev.entries()].map(([status, ids]) => ({ kind: op.kind, ids, status }) as MutateOp);
      return { next: { ...data, [key]: list.map((x) => (touched.has(x.id) ? { ...x, status: op.status } : x)) } as MetaAccountData, inverse };
    }

    case "collection.upsert": {
      const key = op.collection;
      const list = data[key] as { id: string }[];
      const incoming = op.items as { id: string }[];
      const before = incoming.map((i) => list.find((x) => x.id === i.id)).filter(Boolean) as { id: string }[];
      const fresh = incoming.filter((i) => !list.some((x) => x.id === i.id)).map((i) => i.id);
      const merged = [...list.map((x) => incoming.find((i) => i.id === x.id) ?? x), ...incoming.filter((i) => !list.some((x) => x.id === i.id))];
      const inverse: MutateOp[] = [];
      if (fresh.length) inverse.push({ kind: "collection.remove", collection: key, ids: fresh });
      if (before.length) inverse.push({ kind: "collection.upsert", collection: key, items: before } as MutateOp);
      return { next: { ...data, [key]: merged } as MetaAccountData, inverse };
    }

    case "collection.remove": {
      const key = op.collection;
      const list = data[key] as { id: string }[];
      const removed = list.filter((x) => op.ids.includes(x.id));
      return {
        next: { ...data, [key]: list.filter((x) => !op.ids.includes(x.id)) } as MetaAccountData,
        inverse: removed.length ? [{ kind: "collection.upsert", collection: key, items: removed } as MutateOp] : [],
      };
    }
  }
}

/** Apply ops in order; inverse ops are returned in undo order. */
export function applyOps(data: MetaAccountData, ops: MutateOp[]): { next: MetaAccountData; inverse: MutateOp[] } {
  let next = data;
  const inverse: MutateOp[] = [];
  for (const op of ops) {
    const result = applyOne(next, op);
    next = result.next;
    inverse.unshift(...result.inverse);
  }
  return { next, inverse };
}

/** Which campaigns, ad sets and ads a set of ops touches, so history can be filtered to one of them. */
export function touchedBy(before: MetaAccountData, ops: MutateOp[], after: MetaAccountData = before): ChangeTouched {
  const campaigns = new Set<string>();
  const adSets = new Set<string>();
  const ads = new Set<string>();
  const setOf = (id: string) => [...before.adSets, ...after.adSets].find((s) => s.id === id);
  const addAdSet = (id?: string) => {
    if (!id) return;
    adSets.add(id);
    const s = setOf(id);
    if (s) campaigns.add(s.campaignId);
  };
  const addAd = (id?: string) => {
    if (!id) return;
    ads.add(id);
    const a = [...before.ads, ...after.ads].find((x) => x.id === id);
    if (a) addAdSet(a.adSetId);
  };
  for (const op of ops) {
    switch (op.kind) {
      case "campaign.update":
        campaigns.add(op.campaignId);
        break;
      case "adSet.create":
        addAdSet(op.adSet.id);
        campaigns.add(op.adSet.campaignId);
        break;
      case "adSet.update":
      case "targeting.update":
        addAdSet(op.adSetId);
        break;
      case "ad.create":
        for (const a of op.ads) addAd(a.id);
        break;
      case "ad.update":
        addAd(op.adId);
        break;
      case "status.set":
        for (const id of op.ids) {
          if (op.entity === "CAMPAIGN") campaigns.add(id);
          else if (op.entity === "AD_SET") addAdSet(id);
          else addAd(id);
        }
        break;
      case "budget.update":
        if (op.entity === "CAMPAIGN") campaigns.add(op.id);
        else addAdSet(op.id);
        break;
      case "policy.requestReview": {
        const issue = before.policyIssues.find((p) => p.id === op.issueId);
        if (issue?.level === "AD") addAd(issue.entityId);
        break;
      }
      default:
        break;
    }
  }
  if (ops.some((o) => o.kind === "campaign.create")) for (const c of after.campaigns) if (!before.campaigns.some((x) => x.id === c.id)) campaigns.add(c.id);
  return { campaignIds: [...campaigns], adSetIds: [...adSets], adIds: [...ads] };
}

// ─── Human-readable diffs ───────────────────────────────────────────────────

const STATUS_LABEL: Record<EntityStatus, string> = { ACTIVE: "Active", PAUSED: "Paused", ARCHIVED: "Archived" };

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hourText = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;

/** "Mon–Fri 08:00–23:00" style text for a schedule. */
export function scheduleText(blocks: AdScheduleBlock[] | undefined): string {
  if (!blocks?.length) return "All day, every day";
  const order = [1, 2, 3, 4, 5, 6, 0]; // weeks read Monday to Sunday
  const dayText = (days: number[]) => {
    const on = order.filter((d) => days.includes(d));
    if (on.length === 7) return "Every day";
    const runs: number[][] = [];
    for (const d of on) {
      const last = runs[runs.length - 1];
      if (last && order.indexOf(last[last.length - 1]!) + 1 === order.indexOf(d)) last.push(d);
      else runs.push([d]);
    }
    return runs.map((r) => (r.length > 2 ? `${DAY_NAMES[r[0]!]}–${DAY_NAMES[r[r.length - 1]!]}` : r.map((i) => DAY_NAMES[i]).join(", "))).join(", ");
  };
  return blocks.map((b) => `${dayText(b.days)} ${hourText(b.startHour)}–${b.endHour === 24 ? "24:00" : hourText(b.endHour)}`).join(" · ");
}

function summarize(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (Array.isArray(v) && v.length && typeof v[0] === "object" && v[0] && "startHour" in v[0]) return scheduleText(v as AdScheduleBlock[]);
  if (Array.isArray(v)) return v.length > 3 ? `${v.slice(0, 3).join(", ")} +${v.length - 3} more` : v.join(", ") || "—";
  if (typeof v === "object") {
    const b = v as { kind?: BudgetKind; amount?: number; advantage?: boolean; manual?: string[] };
    if (b.amount !== undefined && b.kind) return `${b.amount}/${b.kind === "DAILY" ? "day" : "lifetime"}`;
    if (b.advantage !== undefined) return b.advantage ? "Advantage+ placements" : `${b.manual?.length ?? 0} placements chosen`;
    return JSON.stringify(v);
  }
  return String(v);
}

const KEY_LABEL: Record<string, string> = { startDate: "start date", stopDate: "end date", endDate: "end date", schedule: "ad schedule" };

const BUDGET_TEXT = (b: MetaBudget | undefined, cur: string) => (b ? `${money(b.amount, cur)}/${b.kind === "DAILY" ? "day" : "lifetime"}` : undefined);

export function describeOps(data: MetaAccountData, ops: MutateOp[]): DiffRow[] {
  const cur = data.account.currency;
  const campaignName = (id: string) => data.campaigns.find((c) => c.id === id)?.name ?? id;
  const adSetName = (id: string) => data.adSets.find((s) => s.id === id)?.name ?? id;
  const adName = (id: string) => data.ads.find((a) => a.id === id)?.name ?? id;
  const audienceName = (id: string) => data.audiences.find((a) => a.id === id)?.name ?? id;
  const rows: DiffRow[] = [];

  for (const op of ops) {
    switch (op.kind) {
      case "campaign.create": {
        const b = op.bundle;
        rows.push({ label: "New campaign", after: `${b.campaign.name} · ${OBJECTIVES[b.campaign.objective].label}${b.campaign.advantageState === "ADVANTAGE_PLUS" ? " · Advantage+" : ""}${b.campaign.budget ? ` · ${BUDGET_TEXT(b.campaign.budget, cur)}` : ""}` });
        for (const g of b.adSets) rows.push({ label: "Ad set", after: `${g.adSet.name} · ${g.ads.length} ad${g.ads.length === 1 ? "" : "s"}${g.adSet.budget ? ` · ${BUDGET_TEXT(g.adSet.budget, cur)}` : ""}` });
        break;
      }
      case "campaign.update": {
        const c = data.campaigns.find((x) => x.id === op.campaignId);
        for (const [key, value] of Object.entries(op.patch)) {
          const before = c ? (c as Record<string, unknown>)[key] : undefined;
          rows.push({ label: `${campaignName(op.campaignId)} · ${KEY_LABEL[key] ?? key}`, before: summarize(before), after: summarize(value) });
        }
        break;
      }
      case "adSet.create":
        rows.push({ label: `New ad set in ${campaignName(op.adSet.campaignId)}`, after: `${op.adSet.name} · ${op.ads.length} ads` });
        break;
      case "adSet.update": {
        const s = data.adSets.find((x) => x.id === op.adSetId);
        for (const [key, value] of Object.entries(op.patch)) {
          if (key === "learning" || key === "delivery") continue;
          const before = s ? (s as unknown as Record<string, unknown>)[key] : undefined;
          rows.push({ label: `${adSetName(op.adSetId)} · ${KEY_LABEL[key] ?? key}`, before: summarize(before), after: summarize(value) });
        }
        break;
      }
      case "ad.create":
        for (const a of op.ads) rows.push({ label: `New ad in ${adSetName(a.adSetId)}`, after: a.name });
        break;
      case "ad.update": {
        const a = data.ads.find((x) => x.id === op.adId);
        for (const [key, value] of Object.entries(op.patch)) {
          const before = a ? (a as unknown as Record<string, unknown>)[key] : undefined;
          rows.push({ label: `${adName(op.adId)} · ${key}`, before: summarize(before), after: summarize(value) });
        }
        break;
      }
      case "status.set": {
        const key = STATUS_COLLECTION[op.entity];
        const list = data[key] as { id: string; status: EntityStatus; name: string }[];
        for (const id of op.ids) {
          const item = list.find((x) => x.id === id);
          rows.push({ label: item?.name ?? id, before: item ? STATUS_LABEL[item.status] : undefined, after: STATUS_LABEL[op.status] });
        }
        break;
      }
      case "budget.update": {
        if (op.entity === "CAMPAIGN") {
          const c = data.campaigns.find((x) => x.id === op.id);
          rows.push({ label: `Campaign budget · ${campaignName(op.id)}`, before: BUDGET_TEXT(c?.budget, cur), after: BUDGET_TEXT(op.budget, cur)! });
        } else {
          const s = data.adSets.find((x) => x.id === op.id);
          rows.push({ label: `Ad set budget · ${adSetName(op.id)}`, before: BUDGET_TEXT(s?.budget, cur), after: BUDGET_TEXT(op.budget, cur)! });
        }
        break;
      }
      case "targeting.update": {
        const s = data.adSets.find((x) => x.id === op.adSetId);
        for (const [key, value] of Object.entries(op.patch)) {
          const before = s ? (s.targeting as unknown as Record<string, unknown>)[key] : undefined;
          const names = (v: unknown) => (key.endsWith("AudienceIds") && Array.isArray(v) ? v.map((id) => audienceName(String(id))) : v);
          rows.push({ label: `${adSetName(op.adSetId)} · ${key === "excludeAudienceIds" ? "excluded audiences" : key === "includeAudienceIds" ? "included audiences" : key}`, before: summarize(names(before)), after: summarize(names(value)) });
        }
        break;
      }
      case "policy.requestReview": {
        const issue = data.policyIssues.find((p) => p.id === op.issueId);
        rows.push({ label: `Request review · ${issue?.entityName ?? op.issueId}`, before: issue ? issue.status.toLowerCase() : undefined, after: "in review" });
        break;
      }
      case "policy.restore":
        rows.push({ label: `Review request · ${op.issue.entityName}`, after: op.issue.status.toLowerCase() });
        break;
      case "account.update":
        if (op.patch.brandSafety) {
          rows.push({ label: "Brand safety · inventory filter", before: data.brandSafety.inventoryFilter.toLowerCase(), after: op.patch.brandSafety.inventoryFilter.toLowerCase() });
          rows.push({ label: "Brand safety · excluded content", before: summarize(data.brandSafety.excluded.map((x) => x.toLowerCase())), after: summarize(op.patch.brandSafety.excluded.map((x) => x.toLowerCase())) });
        }
        if (op.patch.audienceSegments) {
          rows.push({ label: "Audience segments · existing customers", before: summarize(data.audienceSegments.existingCustomerAudienceIds.map(audienceName)), after: summarize(op.patch.audienceSegments.existingCustomerAudienceIds.map(audienceName)) });
          rows.push({ label: "Audience segments · engaged", before: summarize(data.audienceSegments.engagedAudienceIds.map(audienceName)), after: summarize(op.patch.audienceSegments.engagedAudienceIds.map(audienceName)) });
        }
        break;
      case "opportunity.set":
        for (const id of op.ids) {
          const o = data.opportunities.find((x) => x.id === id);
          rows.push({ label: o?.title ?? id, before: o?.status.toLowerCase(), after: op.status.toLowerCase() });
        }
        break;
      case "lead.set":
        for (const id of op.ids) {
          const l = data.leads.find((x) => x.id === id);
          rows.push({ label: `Lead · ${l?.name ?? id}`, before: l?.status.toLowerCase(), after: op.status.toLowerCase() });
        }
        break;
      case "collection.upsert": {
        const list = data[op.collection] as { id: string; name?: string; title?: string }[];
        for (const item of op.items as { id: string; name?: string; title?: string }[]) {
          const existed = list.some((x) => x.id === item.id);
          rows.push({ label: `${COLLECTION_LABEL[op.collection]} · ${item.name ?? item.title ?? item.id}`, before: existed ? "existing" : undefined, after: existed ? "updated" : "new" });
        }
        break;
      }
      case "collection.remove": {
        const list = data[op.collection] as { id: string; name?: string; title?: string }[];
        for (const id of op.ids) {
          const item = list.find((x) => x.id === id);
          rows.push({ label: `${COLLECTION_LABEL[op.collection]} · ${item?.name ?? item?.title ?? id}`, before: "existing", after: "removed" });
        }
        break;
      }
    }
  }
  return rows;
}

const COLLECTION_LABEL: Record<CollectionKey, string> = {
  rules: "Rule",
  alerts: "Alert",
  abTests: "A/B test",
  liftStudies: "Lift study",
  valueRules: "Value rule",
  audiences: "Audience",
  blockLists: "Block list",
  products: "Product",
  scheduledReports: "Scheduled report",
};

/** A fresh campaign bundle: Advantage+ Sales, the default the agent builds. */
export function emptyBundle(objective: CampaignBundle["campaign"]["objective"] = "SALES"): CampaignBundle {
  const o = OBJECTIVES[objective];
  const today = new Date().toISOString().slice(0, 10);
  const advantage = objective === "SALES" || objective === "LEADS";
  return {
    campaign: {
      name: "",
      objective,
      advantageState: advantage ? "ADVANTAGE_PLUS" : "MANUAL",
      buyingType: "AUCTION",
      specialAdCategories: [],
      status: "PAUSED",
      budget: { kind: "DAILY", amount: 50 },
      bidStrategy: "LOWEST_COST_WITHOUT_CAP",
      startDate: today,
    },
    adSets: [
      {
        adSet: {
          name: "Ad set 1",
          status: "PAUSED",
          conversionLocation: o.locations[0],
          optimizationGoal: o.defaultGoal,
          promotedObject: objective === "SALES" ? { event: "PURCHASE" } : {},
          attribution: "CLICK_7_VIEW_1",
          startDate: today,
          targeting: { advantageAudience: advantage, locations: [{ id: "2682", name: "Saudi Arabia", kind: "Country" }], ageMin: 18, ageMax: 65, genders: "ALL", languages: ["Arabic", "English"], includeAudienceIds: [], excludeAudienceIds: [], detailed: [] },
          placements: { advantage: true, manual: [] },
        },
        ads: [],
      },
    ],
  };
}

/** An ad as the editor holds it: without the id, review and delivery it gets once created. */
export function newAdOf(a: MetaAd): NewAd {
  const rest: Partial<MetaAd> = { ...a };
  for (const k of ["id", "adSetId", "delivery", "review", "rankings", "createdAt"] as const) delete rest[k];
  return rest as NewAd;
}

/** An ad set as the editor holds it: without the id, learning state and delivery it gets once created. */
export function newAdSetOf(s: AdSet): NewAdSet {
  const rest: Partial<AdSet> = { ...s };
  for (const k of ["id", "campaignId", "delivery", "learning", "createdAt"] as const) delete rest[k];
  return rest as NewAdSet;
}

/** What an agent draft of "a new ad set" or "new ads" holds, read back from the pending change. */
export function partFromOp(op: MutateOp): PartDraft | null {
  if (op.kind === "adSet.create") return { kind: "adSet", campaignId: op.adSet.campaignId, adSet: newAdSetOf(op.adSet), ads: op.ads.map(newAdOf) };
  if (op.kind === "ad.create" && op.ads.length) return { kind: "ad", adSetId: op.ads[0]!.adSetId, ads: op.ads.map(newAdOf) };
  return null;
}
/** Turns an edited part draft back into the operation that creates it. */
export function partToOp(part: PartDraft, status: EntityStatus = "PAUSED"): MutateOp {
  const createdAt = new Date().toISOString();
  const review = (a: NewAd, adSetId: string): MetaAd => ({
    ...a,
    status,
    id: gid("ad"),
    adSetId,
    delivery: "IN_REVIEW",
    review: "IN_REVIEW",
    rankings: { quality: "UNKNOWN", engagement: "UNKNOWN", conversion: "UNKNOWN" },
    createdAt,
  });
  if (part.kind === "ad") return { kind: "ad.create", ads: part.ads.map((a) => review(a, part.adSetId)) };
  const adSetId = gid("as");
  return {
    kind: "adSet.create",
    adSet: { ...part.adSet, status, id: adSetId, campaignId: part.campaignId, delivery: "IN_REVIEW", learning: { phase: "LEARNING", events: 0, target: LIMITS.learningEvents }, createdAt },
    ads: part.ads.map((a) => review(a, adSetId)),
  };
}
