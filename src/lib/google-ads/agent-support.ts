// Pure helpers for the Google Ads agent's tools: a compact account summary the
// model can read, a guard for its read-only GAQL, and the before → after lines
// its approval card shows. No network here; the server routes call these.

import { adGroupBase, campaignBase, derive, keywordBase, searchTermBase } from "./metrics";
import { isCreateOp } from "./live-create";
import { describeCreate } from "./live-create-describe";
import type { BeforeState } from "./live-mutate";
import type { AccountData, MutateOp } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => Math.round(n * 10_000) / 100;

/** What the agent sees first: the account, every campaign with its numbers, and where money goes. */
export function accountOverview(data: AccountData, range: { start: string; end: string }) {
  const full = { preset: "LAST_30_DAYS" as const, ...range };
  const budgets = new Map(data.budgets.map((b) => [b.id, b]));
  const metric = (m: ReturnType<typeof derive>) => ({
    impressions: m.impressions,
    clicks: m.clicks,
    cost: r2(m.cost),
    conversions: r2(m.conversions),
    conversionValue: r2(m.conversionsValue),
    ctrPercent: pct(m.ctr),
    avgCpc: r2(m.avgCpc),
    cpa: r2(m.cpa),
    roas: r2(m.roas),
  });
  const campaigns = data.campaigns.map((c) => {
    const b = budgets.get(c.budgetId);
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      budgetId: c.budgetId,
      dailyBudget: b ? r2(b.amount) : null,
      sharedBudget: b?.shared ?? false,
      bidding: c.bidding,
      servingIssues: c.servingIssues,
      adGroups: data.adGroups.filter((g) => g.campaignId === c.id).length,
      metrics: metric(derive(campaignBase(data, c.id, full))),
    };
  });
  const keywords = data.keywords
    .map((k) => ({ k, m: derive(keywordBase(data, k.id, full)) }))
    .sort((a, b) => b.m.cost - a.m.cost)
    .slice(0, 25)
    .map(({ k, m }) => ({ id: k.id, text: k.text, matchType: k.matchType, status: k.status, adGroupId: k.adGroupId, cpcBid: k.cpcBid ?? null, qualityScore: k.qualityScore ?? null, metrics: metric(m) }));
  const searchTerms = data.searchTerms
    .map((t) => ({ t, m: derive(searchTermBase(data, t.id, full)) }))
    .sort((a, b) => b.m.cost - a.m.cost)
    .slice(0, 25)
    .map(({ t, m }) => ({ text: t.text, campaignId: t.campaignId, adGroupId: t.adGroupId || null, matchedVia: t.matchedVia, status: t.status, metrics: metric(m) }));
  const adGroups = data.adGroups
    .map((g) => ({ g, m: derive(adGroupBase(data, g.id, full)) }))
    .sort((a, b) => b.m.cost - a.m.cost)
    .slice(0, 40)
    .map(({ g, m }) => ({ id: g.id, name: g.name, campaignId: g.campaignId, status: g.status, type: g.type, defaultCpcBid: g.defaultCpcBid ?? null, metrics: metric(m) }));
  const total = campaigns.reduce(
    (s, c) => ({ cost: s.cost + c.metrics.cost, clicks: s.clicks + c.metrics.clicks, impressions: s.impressions + c.metrics.impressions, conversions: s.conversions + c.metrics.conversions, value: s.value + c.metrics.conversionValue }),
    { cost: 0, clicks: 0, impressions: 0, conversions: 0, value: 0 }
  );
  return {
    account: { customerId: data.account.customerId, name: data.account.name, currency: data.account.currency, timeZone: data.account.timeZone, optimizationScore: data.account.optimizationScore },
    period: range,
    totals: { ...total, cost: r2(total.cost), conversions: r2(total.conversions), value: r2(total.value) },
    counts: { campaigns: data.campaigns.length, adGroups: data.adGroups.length, keywords: data.keywords.length, negatives: data.negatives.length, ads: data.ads.length, searchTerms: data.searchTerms.length },
    campaigns,
    topAdGroupsByCost: adGroups,
    topKeywordsByCost: keywords,
    topSearchTermsByCost: searchTerms,
    negatives: data.negatives.slice(0, 50).map((n) => ({ id: n.id, text: n.text, matchType: n.matchType, level: n.level, parentId: n.parentId })),
  };
}

export class GaqlGuardError extends Error {}

export const GAQL_MAX_ROWS = 500;

/**
 * Read-only GAQL from the agent. GAQL itself can only read; this also keeps it
 * to one statement and caps the rows so one query can't flood the chat or quota.
 */
export function guardGaql(query: string): string {
  const q = query.trim().replace(/;+\s*$/, "");
  if (!/^select\s/i.test(q)) throw new GaqlGuardError("Only SELECT queries are allowed.");
  if (q.includes(";")) throw new GaqlGuardError("Send one query at a time.");
  if (q.length > 8000) throw new GaqlGuardError("The query is too long.");
  if (!/\sfrom\s+[a-z_]+/i.test(q)) throw new GaqlGuardError("The query needs a FROM resource.");
  // Who works in the account is not needed to manage it, and must not reach a chat or a web request.
  if (/\b(user_email|customer_user_access(_invitation)?)\b/i.test(q)) throw new GaqlGuardError("Reading the account's users and their email addresses is not allowed.");
  const limit = /\slimit\s+(\d+)\s*$/i.exec(q);
  if (!limit) return `${q} LIMIT ${GAQL_MAX_ROWS}`;
  return Number(limit[1]) > GAQL_MAX_ROWS ? q.replace(/\slimit\s+\d+\s*$/i, ` LIMIT ${GAQL_MAX_ROWS}`) : q;
}

export type PreviewItem = { id: string; label: string; changes: Array<{ field: string; before?: string; after?: string }> };

/** Before → after lines for the approval card, from Google's current state. */
export function describeLiveChange(ops: MutateOp[], before: BeforeState, currency: string): PreviewItem[] {
  const money = (n: number | undefined) => (n == null ? "—" : `${n.toFixed(2)} ${currency}`);
  const campaign = (id: string) => before.campaigns[id]?.name ?? `Campaign ${id}`;
  const adGroup = (id: string) => before.adGroups[id]?.name ?? `Ad group ${id}`;
  const items: PreviewItem[] = [];
  const push = (id: string, label: string, field: string, from?: string, to?: string) => items.push({ id, label, changes: [{ field, before: from, after: to }] });
  for (const [n, op] of ops.entries()) {
    if (isCreateOp(op)) {
      items.push(...describeCreate(op, before, currency, n));
      continue;
    }
    switch (op.kind) {
      case "status.set":
        for (const id of op.ids) {
          const label =
            op.entity === "CAMPAIGN"
              ? `Campaign · ${campaign(id)}`
              : op.entity === "AD_GROUP"
                ? `Ad group · ${adGroup(id)}`
                : op.entity === "KEYWORD"
                  ? `Keyword · ${before.criteria[id]?.text ?? id} (${adGroup(id.split("~")[0]!)})`
                  : `Ad ${id.split("~")[1]} · ${adGroup(id.split("~")[0]!)}`;
          const was = op.entity === "CAMPAIGN" ? before.campaigns[id]?.status : op.entity === "AD_GROUP" ? before.adGroups[id]?.status : op.entity === "KEYWORD" ? before.criteria[id]?.status : before.ads[id]?.status;
          push(id, label, "Status", was, op.status);
        }
        break;
      case "budget.update": {
        const users = Object.values(before.campaigns).filter((c) => c.budgetId === op.budgetId).map((c) => c.name);
        push(op.budgetId, `Daily budget · ${users.join(", ") || op.budgetId}`, "Amount per day", money(before.budgets[op.budgetId]?.amount), money(op.amount));
        break;
      }
      case "campaign.update": {
        const c = before.campaigns[op.campaignId];
        if (op.patch.name !== undefined) push(op.campaignId, `Campaign · ${campaign(op.campaignId)}`, "Name", c?.name, op.patch.name);
        if (op.patch.bidding?.targetCpa !== undefined) push(op.campaignId, `Campaign · ${campaign(op.campaignId)}`, "Target CPA", money(c?.targetCpa), money(op.patch.bidding.targetCpa));
        if (op.patch.bidding?.targetRoas !== undefined)
          push(op.campaignId, `Campaign · ${campaign(op.campaignId)}`, "Target ROAS", c?.targetRoas != null ? `${Math.round(c.targetRoas * 100)}%` : "—", `${Math.round(op.patch.bidding.targetRoas * 100)}%`);
        break;
      }
      case "adGroup.update": {
        const g = before.adGroups[op.adGroupId];
        if (op.patch.name !== undefined) push(op.adGroupId, `Ad group · ${adGroup(op.adGroupId)}`, "Name", g?.name, op.patch.name);
        if (op.patch.defaultCpcBid !== undefined) push(op.adGroupId, `Ad group · ${adGroup(op.adGroupId)}`, "Default max CPC", money(g?.cpcBid), money(op.patch.defaultCpcBid));
        if (op.patch.targetCpa !== undefined) push(op.adGroupId, `Ad group · ${adGroup(op.adGroupId)}`, "Target CPA", money(g?.targetCpa), money(op.patch.targetCpa));
        break;
      }
      case "keyword.create":
        for (const k of op.keywords)
          push(k.id, `New keyword · ${adGroup(k.adGroupId)}`, "Keyword", undefined, `${k.text} (${k.matchType.toLowerCase()}, ${k.status.toLowerCase()}${k.cpcBid ? `, bid ${money(k.cpcBid)}` : ""})`);
        break;
      case "keyword.update": {
        const k = before.criteria[op.keywordId];
        const label = `Keyword · ${k?.text ?? op.keywordId}`;
        if (op.patch.cpcBid !== undefined) push(op.keywordId, label, "Max CPC", money(k?.cpcBid), money(op.patch.cpcBid));
        if (op.patch.finalUrl !== undefined) push(op.keywordId, label, "Final URL", k?.finalUrl ?? "—", op.patch.finalUrl || "—");
        break;
      }
      case "negative.create":
        for (const n of op.negatives)
          push(n.id, `New negative keyword · ${n.level === "CAMPAIGN" ? campaign(n.parentId) : adGroup(n.parentId)}`, "Excludes", undefined, `${n.text} (${n.matchType.toLowerCase()})`);
        break;
      case "negative.remove":
        for (const id of op.ids) {
          const n = before.criteria[id] ?? before.campaignNegatives[id];
          push(id, `Remove negative keyword`, "Excludes", n ? `${n.text} (${n.matchType.toLowerCase()})` : id, "—");
        }
        break;
      default:
        break;
    }
  }
  return items;
}
