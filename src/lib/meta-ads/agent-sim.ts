// Scripted stand-in for the Meta Ads agent. It reads the same account data the
// UI shows and proposes real, applicable changes, so the prototype behaves like
// the finished product. The backend agent will expose the same tool names listed
// in each plan's steps. It never touches billing: spend limits and payment
// methods are view only, for the agent and the UI alike.

import { CONTENT_EXCLUSIONS, GEO_TARGETS, INVENTORY_FILTERS, LIMITS, OBJECTIVES } from "./constants";
import { catalogFix, creativeRows, isRetargeting, learningBudget, productMetrics, recentCostPerResult, reachFrequency, segmentRows } from "./analytics";
import { accountBase, adSetBase, campaignBase, delta, derive, money, num, pct, previousRange } from "./metrics";
import { DEMO_DOMAIN } from "./mock-data";
import { emptyBundle, gid, isLocked, newAdOf, newAdSetOf, partToOp, scheduleText } from "./mutations";
import { parseDateText, parseSpan } from "./calendar";
import { isoDay, addDays } from "@/lib/google-ads/metrics";
import { planDocTurn } from "./agent-docs";
import { validateOps } from "./validation";
import type { ProposedChangeInput } from "./store";
import type { AgentDoc, AgentMemory, BusinessProfile, DocSection } from "./docs";
import type {
  AdScheduleBlock,
  AdSet,
  AgentMessage,
  AgentToolStep,
  CampaignBundle,
  ContentExclusion,
  DateRange,
  EntityStatus,
  InventoryFilter,
  MetaAccountData,
  MetaAd,
  MetaCampaign,
  MetaRule,
  MetaScope,
  MetaView,
  MutateOp,
  Objective,
  PartDraft,
  PlacementKey,
  StatusEntity,
} from "./types";

export type AgentPlan = {
  steps: AgentToolStep[];
  reply: string;
  changes: Omit<ProposedChangeInput, "messageId">[];
  followUps: string[];
  viewHint?: MetaView;
  draftBundle?: CampaignBundle;
  /** Document to open in a new tab. */
  doc?: AgentDoc;
  /** Edit to an existing document (new version). */
  docUpdate?: { docId: string; sections: DocSection[]; note: string; extra?: Partial<AgentDoc> };
  questions?: AgentMessage["questions"];
  team?: { role: string; task: string }[];
  todo?: string[];
  memory?: string;
};

export type Ctx = {
  data: MetaAccountData;
  range: DateRange;
  scope: MetaScope;
  profile?: BusinessProfile;
  memories?: AgentMemory[];
  docs?: AgentDoc[];
  /** Document tab the user is looking at, if any. */
  activeDocId?: string;
  /** Catalog connection. `false` means not connected; unset means "assume connected". */
  catalogConnected?: boolean;
};

type Change = AgentPlan["changes"][number];

// ─── Copy library (stands in for catalog-driven generation) ───────────────

export const COPY = {
  running: {
    texts: ["Built for Gulf heat: Glide 3 keeps you cool at 40°C. Free 2-day delivery and 30-day returns.", "Your next personal best starts here. Lightweight Glide 3 running shoes, delivered free across KSA and UAE."],
    headlines: ["Glide 3 Running Shoes", "Free 2-Day Delivery", "30-Day Free Returns"],
    description: "Shop running shoes",
  },
  gym: {
    texts: ["Gym wear that moves with you. Breathable, quick-dry and made for training in the Gulf. Free delivery.", "Train harder, stay cooler. New gym wear for him and her, with free returns."],
    headlines: ["New Gym Wear", "Breathable & Quick-Dry", "Free Delivery & Returns"],
    description: "Shop gym wear",
  },
  kids: {
    texts: ["Kids sportswear that keeps up with them. Soft, tough and easy to wash. Free delivery on every order.", "School sports days sorted. Shop Stride Kids shoes and sportswear today."],
    headlines: ["Stride Kids Sportswear", "Built For Playtime", "Free Delivery"],
    description: "Shop kids sportswear",
  },
  generic: {
    texts: ["Sportswear made for the Gulf. Shop new arrivals with free delivery and 30-day returns.", "Move more in gear that's built for the heat. Free 2-day delivery across KSA and UAE."],
    headlines: ["Stride Sportswear", "Free 2-Day Delivery", "New Arrivals"],
    description: "Shop new arrivals",
  },
};

export const themeOf = (text: string): keyof typeof COPY => {
  const t = text.toLowerCase();
  if (/kid|children|أطفال/.test(t)) return "kids";
  if (/gym|legging|apparel|training|نادي/.test(t)) return "gym";
  if (/run|shoe|sneaker|حذاء|جري/.test(t)) return "running";
  return "generic";
};

// ─── Small helpers ─────────────────────────────────────────────────────────

const curOf = (ctx: Ctx) => ctx.data.account.currency;
const dailyOf = (b: { kind: "DAILY" | "LIFETIME"; amount: number } | undefined) => (b ? (b.kind === "DAILY" ? b.amount : b.amount / 30) : 0);

function campaignsInScope(ctx: Ctx): MetaCampaign[] {
  const live = ctx.data.campaigns.filter((c) => c.status !== "ARCHIVED");
  return ctx.scope.campaignId ? live.filter((c) => c.id === ctx.scope.campaignId) : live;
}

function adSetsOf(ctx: Ctx, campaign: MetaCampaign): AdSet[] {
  return ctx.data.adSets.filter((s) => s.campaignId === campaign.id && s.status !== "ARCHIVED");
}

function campaignDaily(ctx: Ctx, c: MetaCampaign): number {
  if (c.budget) return dailyOf(c.budget);
  return adSetsOf(ctx, c).filter((s) => s.status === "ACTIVE").reduce((t, s) => t + dailyOf(s.budget), 0);
}

function profileOf(ctx: Ctx): BusinessProfile {
  return ctx.profile ?? { businessName: "Stride Sportswear", website: `https://${DEMO_DOMAIN}`, markets: ["Saudi Arabia"], categories: [], margin: 0.45, averageOrderValue: 120, targetRoas: 3, monthlyBudgetCap: 12000, keySellingPoints: [], competitiveAdvantages: [], competitors: [], peakSeasons: [], neverAdvertise: [], brandVoice: "", brand: {} as BusinessProfile["brand"] };
}

const isConversionObjective = (o: Objective) => OBJECTIVES[o].conversions;

function moneyIn(text: string): number | undefined {
  const m = text.replace(/,/g, "").match(/\$\s?(\d+(?:\.\d+)?)\s?(k)?|(\d+(?:\.\d+)?)\s?(k)?\s?(?:\$|usd|dollars?|دولار)/i);
  if (!m) return undefined;
  const n = Number(m[1] ?? m[3]);
  return m[2] || m[4] ? n * 1000 : n;
}

// ─── Performance ───────────────────────────────────────────────────────────

export function performance(ctx: Ctx): AgentPlan {
  const { data, range } = ctx;
  const cur = curOf(ctx);
  const ids = campaignsInScope(ctx).map((c) => c.id);
  const now = derive(accountBase(data, range, ids));
  const before = derive(accountBase(data, previousRange(range), ids));
  const arrow = (a: number, b: number, goodUp = true) => {
    const d = delta(a, b);
    if (d === null) return "new";
    return `${d >= 0 ? "▲" : "▼"} ${Math.abs(d * 100).toFixed(0)}% ${(d >= 0) === goodUp ? "(better)" : "(worse)"}`;
  };
  const rows = campaignsInScope(ctx)
    .filter((c) => c.status === "ACTIVE")
    .map((c) => ({ c, m: derive(campaignBase(data, c.id, range)) }))
    .filter((r) => r.m.spend > 0);
  const sales = rows.filter((r) => isConversionObjective(r.c.objective));
  const best = [...sales].sort((a, b) => b.m.roas - a.m.roas)[0];
  const worst = [...sales].sort((a, b) => a.m.roas - b.m.roas)[0];
  const lines = [
    `**${money(now.spend, cur, { compact: true })} spent** · ${num(now.results, { compact: true })} results · ${now.purchaseValue ? `**${now.roas.toFixed(2)}x ROAS**` : `${money(now.costPerResult, cur)} per result`}`,
    "",
    `- Spend: ${arrow(now.spend, before.spend)}`,
    `- ROAS: ${arrow(now.roas, before.roas)}`,
    `- CPM: ${money(now.cpm, cur)} (${arrow(now.cpm, before.cpm, false)})`,
    `- Link CTR: ${pct(now.ctr)} (${arrow(now.ctr, before.ctr)})`,
    `- Frequency: ${now.frequency.toFixed(2)} (${arrow(now.frequency, before.frequency, false)})`,
  ];
  if (best && worst && best.c.id !== worst.c.id) lines.push("", `Best: **${best.c.name}** at ${best.m.roas.toFixed(2)}x. Weakest: **${worst.c.name}** at ${worst.m.roas.toFixed(2)}x.`);
  const attribution = range.attribution && range.attribution !== "CLICK_7_VIEW_1" ? " Numbers use the attribution setting chosen in the top bar." : "";
  return {
    steps: [
      { tool: "meta_insights", label: "Pulled account insights" },
      { tool: "meta_insights", label: "Compared with the previous period" },
    ],
    reply: `${lines.join("\n")}${attribution ? `\n\n${attribution.trim()}` : ""}`,
    changes: [],
    followUps: ["Which creatives are fatigued?", "Where should I scale budget?", "Run a full audit of my Meta account"],
    viewHint: "overview",
  };
}

// ─── Creative fatigue ──────────────────────────────────────────────────────

const TEXT_ANGLES: Record<string, string[]> = {
  "Product proof": ["Tested at 40°C: Glide 3 keeps your feet cool mile after mile. Free 2-day delivery."],
  "Social proof": ["10,000+ runners switched to Glide 3. See what they say, and get free returns for 30 days."],
  Offer: ["Free 2-day delivery. 30-day returns. Try Glide 3 at no risk."],
  Brand: ["Built in the Gulf for the Gulf. Meet the shoes made for your run."],
  "Product detail": ["Lighter, softer, faster. Meet Glide 3, our best-selling running shoe."],
  Seasonal: ["Ramadan nights are for moving. New running gear, delivered free."],
};

/** A new ad for an ad set from a creative concept it doesn't use yet, with copy for that angle. Meta rewards different concepts, not tweaks of one. */
function conceptAd(data: MetaAccountData, adSetId: string, template: MetaAd): { ad: MetaAd; concept: MetaAccountData["concepts"][number] } | undefined {
  const used = new Set(data.ads.filter((a) => a.adSetId === adSetId).map((a) => a.conceptId));
  const concept = data.concepts.find((c) => !used.has(c.id) && data.creatives.some((cr) => cr.conceptId === c.id));
  if (!concept) return undefined;
  const media = data.creatives.filter((c) => c.conceptId === concept.id).map((c) => c.id);
  const texts = TEXT_ANGLES[concept.angle] ?? [`${concept.hook}. Free 2-day delivery and 30-day returns.`];
  const ad: MetaAd = {
    id: gid("ad"),
    adSetId,
    name: `${concept.name} – new concept`,
    status: "ACTIVE",
    delivery: "IN_REVIEW",
    review: "IN_REVIEW",
    format: data.creatives.find((c) => c.id === media[0])?.kind === "VIDEO" ? "SINGLE_VIDEO" : "SINGLE_IMAGE",
    identity: template.identity,
    primaryTexts: texts.map((t) => t.slice(0, LIMITS.primaryText)),
    headlines: [concept.hook.slice(0, LIMITS.headline), "Free 2-Day Delivery"],
    description: "Shop now",
    cta: "SHOP_NOW",
    link: template.link,
    mediaIds: media.slice(0, 1),
    enhancements: {},
    rankings: { quality: "UNKNOWN", engagement: "UNKNOWN", conversion: "UNKNOWN" },
    conceptId: concept.id,
    createdAt: new Date().toISOString(),
  };
  return { ad, concept };
}
export function fatigue(ctx: Ctx): AgentPlan {
  const { data, range } = ctx;
  const inScope = (ad: MetaAd) => {
    const s = data.adSets.find((x) => x.id === ad.adSetId);
    return !ctx.scope.campaignId || s?.campaignId === ctx.scope.campaignId;
  };
  const rows = creativeRows(data, range)
    .filter((r) => r.fatigued && r.ad.status === "ACTIVE" && inScope(r.ad))
    .sort((a, b) => b.metrics.spend - a.metrics.spend)
    .slice(0, 4);
  if (!rows.length) {
    return {
      steps: [{ tool: "meta_creatives", label: "Checked frequency and CTR decay per ad" }],
      reply: "No ad shows real fatigue right now: frequency and link CTR are healthy across active ads. I'll keep watching and flag it when that changes.",
      changes: [],
      followUps: ["Write a creative brief for new concepts", "Which placements waste budget?"],
      viewHint: "creatives",
    };
  }
  const changes: Change[] = [];
  const lines: string[] = [];
  for (const r of rows) {
    const set = data.adSets.find((s) => s.id === r.ad.adSetId)!;
    lines.push(`- **${r.ad.name}**: frequency ${r.frequency.toFixed(1)}, link CTR down ${(r.ctrDrop * 100).toFixed(0)}% in ${r.ageDays} days, ${money(r.metrics.spend, curOf(ctx))} spent.`);
    changes.push({
      title: `Pause fatigued ad: ${r.ad.name}`,
      rationale: `Frequency ${r.frequency.toFixed(1)} and CTR down ${(r.ctrDrop * 100).toFixed(0)}%: the same people have seen it too often. Its budget flows to the other ads in ${set.name}.`,
      impact: "Lower CPM waste, fresher delivery",
      risk: "LOW",
      ops: [{ kind: "status.set", entity: "AD", ids: [r.ad.id], status: "PAUSED" }],
    });
  }
  // One fresh ad from an angle the ad set doesn't use yet. Meta's retrieval (Andromeda) rewards different concepts, not tweaks of one.
  const top = rows[0]!;
  const made = conceptAd(data, top.ad.adSetId, top.ad);
  const concept = made?.concept;
  if (made) {
    const fresh = made.ad;
    changes.push({
      title: `Add a new concept to ${data.adSets.find((s) => s.id === top.ad.adSetId)?.name}: ${made.concept.name}`,
      rationale: `Your ad sets lean on a few concepts. “${made.concept.name}” (${made.concept.angle.toLowerCase()}) is a different angle with creative ready in the library: Meta shows different concepts to different people, so it widens delivery instead of repeating one message.`,
      impact: "Fresh reach, CTR recovery",
      risk: "LOW",
      ops: [{ kind: "ad.create", ads: [fresh] }],
    });
  }
  return {
    steps: [
      { tool: "meta_insights", label: "Pulled ad-level frequency and CTR by week" },
      { tool: "meta_creatives", label: `Scored ${data.ads.length} ads for fatigue`, detail: "Frequency above 2.8 (6 for retargeting) or link CTR down more than 25%" },
      { tool: "meta_creatives", label: "Matched unused concepts from the creative library" },
    ],
    reply: [`**${rows.length} ad${rows.length > 1 ? "s are" : " is"} fatigued:**`, "", ...lines, "", `I queued ${changes.length} changes: pause the tired ads${concept ? ` and add a new concept (**${concept.name}**)` : ""}. New creative should differ in angle, not just in colour: Meta groups near-identical ads together.`].join("\n"),
    changes,
    followUps: ["Write a creative brief for new concepts", "Why is my prospecting learning limited?", "Plan a creative A/B test"],
    viewHint: "creatives",
  };
}

// ─── Learning phase ────────────────────────────────────────────────────────

export function learning(ctx: Ctx): AgentPlan {
  const { data, range } = ctx;
  const cur = curOf(ctx);
  const limited = data.adSets.filter((s) => s.status === "ACTIVE" && s.learning.phase === "LIMITED" && (!ctx.scope.campaignId || s.campaignId === ctx.scope.campaignId));
  if (!limited.length) {
    return {
      steps: [{ tool: "meta_structure", label: "Checked learning status of every ad set" }],
      reply: "No ad set is learning limited. Every active ad set either left learning (about 50 results in 7 days) or is still inside its first week.",
      changes: [],
      followUps: ["Where should I scale budget?", "Run a full audit of my Meta account"],
      viewHint: "adSets",
    };
  }
  const changes: Change[] = [];
  const lines: string[] = [];
  for (const s of limited) {
    const c = data.campaigns.find((x) => x.id === s.campaignId)!;
    const cpr = recentCostPerResult(data, s.id, range);
    const need = learningBudget(cpr);
    const own = c.budget ? dailyOf(c.budget) : dailyOf(s.budget);
    lines.push(`- **${s.name}** (${c.name}): ${s.learning.events} of ${s.learning.target} results in 7 days at ${money(cpr, cur)} each. It needs about **${money(need, cur)}/day** to exit learning; it has ${money(own, cur)}.`);
    const siblings = adSetsOf(ctx, c).filter((x) => x.id !== s.id && x.status === "ACTIVE" && x.learning.phase !== "SUCCESS");
    if (c.budget) {
      if (need > own) {
        changes.push({
          title: `Raise ${c.name} budget to ${money(need, cur)}/day`,
          rationale: `${s.name} gets about ${s.learning.events} results a week at this budget; at ${money(cpr, cur)} per result it needs ${money(need, cur)}/day for 50. This ad set uses the campaign budget, so I raise that.`,
          impact: "Exits learning limited",
          risk: need > own * (1 + LIMITS.safeBudgetStep) ? "MEDIUM" : "LOW",
          resetsLearning: need > own * (1 + LIMITS.safeBudgetStep),
          ops: [{ kind: "budget.update", entity: "CAMPAIGN", id: c.id, budget: { kind: "DAILY", amount: Math.round(need) } }],
        });
      }
    } else if (siblings.length) {
      const moved = siblings.reduce((t, x) => t + dailyOf(x.budget), 0);
      const merged = Math.round(own + moved);
      changes.push({
        title: `Consolidate ${siblings.map((x) => x.name).join(" + ")} into ${s.name}`,
        rationale: `Splitting ${money(own + moved, cur)}/day across ${siblings.length + 1} ad sets leaves none with enough results to learn. One ad set with ${money(merged, cur)}/day gets there ${merged >= need ? "(above the" : "(close to the"} ${money(need, cur)} it needs).`,
        impact: "Faster exit from learning, steadier cost per result",
        risk: "MEDIUM",
        resetsLearning: true,
        ops: [
          { kind: "status.set", entity: "AD_SET", ids: siblings.map((x) => x.id), status: "PAUSED" },
          { kind: "budget.update", entity: "AD_SET", id: s.id, budget: { kind: "DAILY", amount: merged } },
        ],
      });
    } else if (need > own) {
      changes.push({
        title: `Raise ${s.name} budget to ${money(need, cur)}/day`,
        rationale: `At ${money(cpr, cur)} per result it needs ${money(need, cur)}/day to reach 50 results in 7 days.`,
        impact: "Exits learning limited",
        risk: "MEDIUM",
        resetsLearning: true,
        ops: [{ kind: "budget.update", entity: "AD_SET", id: s.id, budget: { kind: "DAILY", amount: Math.round(need) } }],
      });
    }
    if (s.bidStrategy === "COST_CAP" && s.bidValue && s.bidValue < cpr * 0.9) {
      const next = Math.ceil(cpr * 1.1);
      changes.push({
        title: `Loosen the cost cap on ${s.name} to ${money(next, cur)}`,
        rationale: `The cap (${money(s.bidValue, cur)}) is below the real cost per result (${money(cpr, cur)}), so Meta skips most auctions. A cap about 10% above the average keeps cost in check and lets delivery recover.`,
        impact: "More delivery at a controlled cost",
        risk: "MEDIUM",
        resetsLearning: true,
        ops: [{ kind: "adSet.update", adSetId: s.id, patch: { bidValue: next } }],
      });
    }
  }
  return {
    steps: [
      { tool: "meta_structure", label: `Found ${limited.length} learning-limited ad set${limited.length > 1 ? "s" : ""}` },
      { tool: "meta_insights", label: "Read the last 7 days of results and cost per result" },
      { tool: "meta_forecast", label: "Worked out the budget each needs: cost × 50 ÷ 7" },
    ],
    reply: [
      "Meta needs **about 50 results per ad set in 7 days** for stable delivery. These miss it:",
      "",
      ...lines,
      "",
      changes.length
        ? `I queued ${changes.length} change${changes.length > 1 ? "s" : ""}. ${changes.some((c) => c.resetsLearning) ? "**Heads up: these edits restart the learning phase.** Expect a few days of unstable results; I'll keep other settings untouched." : ""}`
        : "Nothing to change automatically: the budget already covers the 50-result target.",
    ].join("\n"),
    changes,
    followUps: ["Where should I scale budget?", "Exclude existing customers from prospecting"],
    viewHint: "adSets",
  };
}

// ─── Budget ────────────────────────────────────────────────────────────────

export function budget(ctx: Ctx): AgentPlan {
  const { data, range } = ctx;
  const cur = curOf(ctx);
  const p = profileOf(ctx);
  const breakEven = 1 / p.margin;
  const changes: Change[] = [];
  const lines: string[] = [];
  const rows = campaignsInScope(ctx)
    .filter((c) => c.status === "ACTIVE" && isConversionObjective(c.objective) && c.delivery !== "LEARNING" && !c.advantageState.startsWith("LEGACY"))
    .map((c) => ({ c, m: derive(campaignBase(data, c.id, range)), daily: campaignDaily(ctx, c) }))
    .filter((r) => r.m.spend > 0);
  for (const r of rows) {
    const limitedSet = adSetsOf(ctx, r.c).some((s) => s.learning.phase === "LIMITED");
    if (r.m.roas >= p.targetRoas * 1.15 && !limitedSet) {
      // Learning only resets when the change passes 20%, so scale in 15–20% steps.
      const step = r.m.roas >= p.targetRoas * 1.5 ? LIMITS.safeBudgetStep : 0.15;
      lines.push(`- **${r.c.name}** returns ${r.m.roas.toFixed(2)}x against a ${p.targetRoas}x target: raise **${(step * 100).toFixed(0)}%**.`);
      if (r.c.budget) {
        changes.push({
          title: `Raise ${r.c.name} budget ${(step * 100).toFixed(0)}%`,
          rationale: `${r.m.roas.toFixed(2)}x ROAS, above the ${p.targetRoas}x target. A ${(step * 100).toFixed(0)}% step stays inside the range Meta tolerates without restarting learning.`,
          impact: `≈ +${money(r.daily * step * 30, cur)}/mo spend`,
          risk: "LOW",
          ops: [{ kind: "budget.update", entity: "CAMPAIGN", id: r.c.id, budget: { kind: "DAILY", amount: Math.round(r.daily * (1 + step)) } }],
        });
      } else {
        const ops: MutateOp[] = adSetsOf(ctx, r.c)
          .filter((s) => s.status === "ACTIVE" && s.budget && s.learning.phase === "SUCCESS")
          .map((s) => ({ kind: "budget.update", entity: "AD_SET", id: s.id, budget: { kind: "DAILY", amount: Math.round(dailyOf(s.budget) * (1 + step)) } }));
        if (ops.length)
          changes.push({
            title: `Raise ${r.c.name} ad set budgets ${(step * 100).toFixed(0)}%`,
            rationale: `${r.m.roas.toFixed(2)}x ROAS, above target. Only ad sets that already left learning are raised.`,
            impact: `≈ +${money(r.daily * step * 30, cur)}/mo spend`,
            risk: "LOW",
            ops,
          });
      }
    } else if (r.m.roas > 0 && r.m.roas < breakEven && r.daily > LIMITS.minDailyBudget * 2) {
      lines.push(`- **${r.c.name}** returns ${r.m.roas.toFixed(2)}x, below break-even (${breakEven.toFixed(2)}x at your ${(p.margin * 100).toFixed(0)}% margin): trim **20%**.`);
      if (r.c.budget) {
        changes.push({
          title: `Trim ${r.c.name} budget 20%`,
          rationale: `${r.m.roas.toFixed(2)}x is below break-even, so each dollar loses money. Cut gently and revisit in a week.`,
          impact: `≈ ${money(r.daily * 0.2 * 30, cur)}/mo saved`,
          risk: "LOW",
          ops: [{ kind: "budget.update", entity: "CAMPAIGN", id: r.c.id, budget: { kind: "DAILY", amount: Math.max(LIMITS.minDailyBudget, Math.round(r.daily * 0.8)) } }],
        });
      }
    }
  }
  const totalDaily = rows.reduce((t, r) => t + r.daily, 0);
  const added = changes.reduce((t, c) => t + c.ops.reduce((s, o) => (o.kind === "budget.update" ? s + (o.budget.amount - 0) : s), 0), 0);
  const billing = data.billing;
  const billingNote = billing.spendLimit && billing.amountSpent / billing.spendLimit > 0.7 ? `\n\nNote: you've used **${Math.round((billing.amountSpent / billing.spendLimit) * 100)}%** of the account spending limit (${money(billing.spendLimit, cur)}). I can't change the limit; raise it in Billing on Meta if you scale further.` : "";
  void added;
  if (!changes.length) {
    return {
      steps: [{ tool: "meta_insights", label: "Compared ROAS with your target and break-even" }],
      reply: `No budget moves are clearly worth making: no campaign sits far enough above ${p.targetRoas}x (to scale) or below ${breakEven.toFixed(2)}x (to trim) while out of learning.${billingNote}`,
      changes: [],
      followUps: ["Why is my prospecting learning limited?", "Plan how to spend $12,000 next month"],
      viewHint: "planner",
    };
  }
  return {
    steps: [
      { tool: "meta_insights", label: "Pulled ROAS per campaign" },
      { tool: "profile_memory", label: `Read your target (${p.targetRoas}x) and margin (${(p.margin * 100).toFixed(0)}%)` },
      { tool: "meta_forecast", label: "Forecast the effect of each step" },
    ],
    reply: [`I'd move budget like this (today **${money(totalDaily, cur)}/day** across these campaigns):`, "", ...lines, "", `Each step is **15–20%**, the largest move that doesn't restart learning.${billingNote}`].join("\n"),
    changes,
    followUps: ["Plan how to spend $12,000 next month", "Why is my prospecting learning limited?"],
    viewHint: "planner",
  };
}

// ─── Existing customers and audience segments ──────────────────────────────

export function exclusions(ctx: Ctx): AgentPlan {
  const { data } = ctx;
  const purchasers = data.audiences.find((a) => /purchas/i.test(a.name) && a.kind === "WEBSITE");
  const customers = data.audiences.find((a) => a.kind === "CUSTOMER_LIST");
  const changes: Change[] = [];
  const lines: string[] = [];
  if (purchasers) {
    for (const c of campaignsInScope(ctx).filter((x) => x.status === "ACTIVE" && x.objective === "SALES" && x.advantageState === "MANUAL")) {
      for (const s of adSetsOf(ctx, c)) {
        if (isRetargeting(data, s) || s.targeting.excludeAudienceIds.includes(purchasers.id)) continue;
        lines.push(`- **${s.name}** (${c.name}) shows prospecting ads to people who already bought.`);
        changes.push({
          title: `Exclude purchasers from ${s.name}`,
          rationale: `${purchasers.name} (${num(purchasers.size, { compact: true })} people) are existing customers. Prospecting spend should find new ones.`,
          impact: "Less wasted spend on people who already converted",
          risk: "LOW",
          ops: [{ kind: "targeting.update", adSetId: s.id, patch: { excludeAudienceIds: [...s.targeting.excludeAudienceIds, purchasers.id] } }],
        });
      }
    }
  }
  const asc = campaignsInScope(ctx).filter((c) => c.advantageState === "ADVANTAGE_PLUS" && c.objective === "SALES" && c.status === "ACTIVE");
  for (const c of asc) {
    const cap = c.existingCustomerCap ?? 0.25;
    if (cap > 0.1) {
      lines.push(`- **${c.name}** lets up to ${(cap * 100).toFixed(0)}% of budget reach existing customers.`);
      changes.push({
        title: `Cap existing-customer budget at 10% on ${c.name}`,
        rationale: "Advantage+ Sales treats the audience you list as existing customers and limits spend on them to this cap. 10% keeps most budget on new customers while still allowing profitable repeat buyers.",
        impact: "More budget reaches new customers",
        risk: "LOW",
        ops: [{ kind: "campaign.update", campaignId: c.id, patch: { existingCustomerCap: 0.1 } }],
      });
    }
  }
  const want = [purchasers?.id, customers?.id].filter(Boolean) as string[];
  const have = data.audienceSegments.existingCustomerAudienceIds;
  if (want.some((id) => !have.includes(id))) {
    lines.push("- The account's **existing-customer segment** doesn't list every customer audience, so Advantage+ can't tell them apart.");
    changes.push({
      title: "Tell Meta who your existing customers are",
      rationale: `Adds ${want.map((id) => data.audiences.find((a) => a.id === id)?.name).join(" and ")} to the account's existing-customer segment, which Advantage+ campaigns use for the budget cap above.`,
      impact: "The cap applies to the right people",
      risk: "LOW",
      ops: [{ kind: "account.update", patch: { audienceSegments: { ...data.audienceSegments, existingCustomerAudienceIds: [...new Set([...have, ...want])] } } }],
    });
  }
  return {
    steps: [
      { tool: "meta_audiences", label: "Read audiences and ad set exclusions" },
      { tool: "meta_structure", label: "Checked Advantage+ existing-customer caps" },
    ],
    reply: changes.length ? [`**Existing customers are absorbing prospecting budget:**`, "", ...lines, "", `I queued ${changes.length} fix${changes.length > 1 ? "es" : ""}.`].join("\n") : "Prospecting already excludes purchasers and your Advantage+ campaigns cap existing-customer spend. Nothing to fix.",
    changes,
    followUps: ["Where should I scale budget?", "Which placements waste budget?"],
    viewHint: "audiences",
  };
}

// ─── Placements ────────────────────────────────────────────────────────────

export function placements(ctx: Ctx): AgentPlan {
  const { data, range } = ctx;
  const cur = curOf(ctx);
  const ids = campaignsInScope(ctx).map((c) => c.id);
  const rows = segmentRows(data, range, "placement", ids).filter((r) => r.base.spend > 0);
  const total = rows.reduce((t, r) => t + r.base.spend, 0);
  const results = rows.reduce((t, r) => t + r.base.results, 0);
  const avg = results ? total / results : 0;
  const bad = rows.filter((r) => r.base.spend / total > 0.05 && r.metrics.costPerResult > avg * 1.3 && r.metrics.results > 0);
  const changes: Change[] = [];
  const manualSets = data.adSets.filter((s) => s.status === "ACTIVE" && !s.placements.advantage && (!ctx.scope.campaignId || s.campaignId === ctx.scope.campaignId));
  for (const b of bad) {
    const hit = manualSets.filter((s) => s.placements.manual.includes(b.key as PlacementKey) && s.placements.manual.length > 1);
    for (const s of hit)
      changes.push({
        title: `Remove ${b.label} from ${s.name}`,
        rationale: `${b.label} costs ${money(b.metrics.costPerResult, cur)} per result against ${money(avg, cur)} on average (${((b.metrics.costPerResult / avg - 1) * 100).toFixed(0)}% more) and takes ${((b.base.spend / total) * 100).toFixed(0)}% of spend.`,
        impact: "Lower cost per result",
        risk: "MEDIUM",
        resetsLearning: true,
        ops: [{ kind: "adSet.update", adSetId: s.id, patch: { placements: { advantage: false, manual: s.placements.manual.filter((k) => k !== b.key) } } }],
      });
  }
  const top = [...rows].sort((a, b) => a.metrics.costPerResult - b.metrics.costPerResult).slice(0, 3);
  return {
    steps: [{ tool: "meta_insights", label: "Broke results down by placement" }, { tool: "meta_structure", label: "Checked which ad sets use manual placements" }],
    reply: [
      `Average cost per result is **${money(avg, cur)}**. Cheapest placements: ${top.map((r) => `**${r.label}** (${money(r.metrics.costPerResult, cur)})`).join(", ")}.`,
      "",
      bad.length ? `Too expensive: ${bad.map((r) => `**${r.label}** (${money(r.metrics.costPerResult, cur)})`).join(", ")}.` : "No placement is more than 30% above average with meaningful spend.",
      "",
      changes.length ? `I queued ${changes.length} change${changes.length > 1 ? "s" : ""} for ad sets with **manual** placements. Editing placements restarts their learning. Ad sets on Advantage+ placements stay as they are: Meta usually does better when it can move spend between placements itself.` : "Ad sets on Advantage+ placements are left alone: Meta moves spend to the cheapest placement on its own.",
    ].join("\n"),
    changes,
    followUps: ["Where should I scale budget?", "Which creatives are fatigued?"],
    viewHint: "placements",
  };
}

// ─── Measurement (Pixel, Conversions API, Event Match Quality) ─────────────

export function measurement(ctx: Ctx): AgentPlan {
  const { data } = ctx;
  const ds = data.datasets.find((d) => d.id === data.account.datasetId) ?? data.datasets[0];
  if (!ds) {
    return { steps: [{ tool: "meta_events", label: "Looked for a dataset" }], reply: "This ad account has no dataset (Pixel) yet. Create one in Events Manager first; sales and lead campaigns can't optimize without it.", changes: [], followUps: [], viewHint: "eventsManager" };
  }
  const issues: string[] = [];
  for (const e of ds.events) {
    if (e.emq < 6) issues.push(`🟠 **${e.name}** Event Match Quality is **${e.emq.toFixed(1)}/10**${e.emq < 4 ? " (poor)" : " (needs work)"}: send more customer information (email, phone) with each event.`);
    if (e.dedup < 0.9 && e.browserShare > 0 && e.serverShare > 0) issues.push(`🟠 **${e.name}** deduplication is ${(e.dedup * 100).toFixed(0)}%: browser and server events aren't paired, so purchases may be double counted.`);
    if (e.status !== "ACTIVE" && e.issue) issues.push(`🔴 **${e.name}**: ${e.issue}`);
  }
  if (!ds.capiConnected) issues.push("🔴 **Conversions API isn't connected**: you only get browser events, which iOS and ad blockers cut by 20–30%.");
  const purchase = ds.events.find((e) => /purchase/i.test(e.name));
  const rule: MetaRule = {
    id: gid("rule"),
    name: "Alert when purchases drop",
    scope: "ACCOUNT",
    condition: { metric: "results", op: "<", value: 40, window: "LAST_3_DAYS" },
    action: "NOTIFY",
    schedule: "DAILY",
    enabled: true,
    createdBy: "AGENT",
  };
  const changes: Change[] = !data.rules.some((r) => r.name === rule.name) && purchase
    ? [{ title: "Watch for tracking breaks: alert if results drop", rationale: "A sudden fall in purchases is usually a broken Pixel or Conversions API feed, not demand. This rule tells you within a day.", impact: "Catch broken tracking early", risk: "LOW", ops: [{ kind: "collection.upsert", collection: "rules", items: [rule] }] }]
    : [];
  return {
    steps: [{ tool: "meta_events", label: `Read ${ds.name}: ${ds.events.length} events` }, { tool: "meta_events", label: "Checked Event Match Quality and deduplication" }],
    reply: issues.length
      ? [`**${ds.name}: ${issues.length} measurement issue${issues.length > 1 ? "s" : ""}**`, "", ...issues.map((i) => `- ${i}`), "", "I can't edit your site or server code, but I can watch for the effects. Fixing these improves optimization for every campaign."].join("\n")
      : `**${ds.name} looks healthy**: events match well, browser and server events are deduplicated and Conversions API is connected.`,
    changes,
    followUps: ["Run a full audit of my Meta account", "Why were my ads rejected?"],
    viewHint: "eventsManager",
  };
}

// ─── Catalog ───────────────────────────────────────────────────────────────

export function catalog(ctx: Ctx): AgentPlan {
  const { data, range } = ctx;
  if (ctx.catalogConnected === false) {
    return {
      steps: [{ tool: "meta_catalog", label: "Looked for a connected catalog" }],
      reply: "No catalog is connected yet. Connect your Commerce Manager catalog under **Connections** and I'll review product issues and fix what I can.",
      changes: [],
      followUps: ["Check my Pixel and Conversions API"],
      viewHint: "connections",
    };
  }
  const bad = data.products.filter((p) => p.status !== "ACTIVE");
  const metrics = productMetrics(data, range);
  const fixable = bad.map((p) => ({ p, fixed: catalogFix(p) })).filter((x) => x.fixed !== x.p);
  const unfixable = bad.filter((p) => !fixable.some((f) => f.p.id === p.id));
  if (!bad.length) return { steps: [{ tool: "meta_catalog", label: "Checked product statuses" }], reply: "Every product is approved. Nothing to fix.", changes: [], followUps: ["Which creatives are fatigued?"], viewHint: "catalog" };
  const lost = bad.reduce((t, p) => t + (metrics.get(p.id)?.purchaseValue ?? 0), 0);
  const changes: Change[] = fixable.length
    ? [{ title: `Fix ${fixable.length} product${fixable.length > 1 ? "s" : ""} in the catalog`, rationale: `Missing category, availability or small images are the fixable ones. Products with these issues can't be shown in catalog ads: ${fixable.map((f) => f.p.title).join(", ")}.`, impact: "More products eligible for catalog ads", risk: "LOW", ops: [{ kind: "collection.upsert", collection: "products", items: fixable.map((f) => f.fixed) }] }]
    : [];
  return {
    steps: [{ tool: "meta_catalog", label: `Read ${data.products.length} products` }, { tool: "meta_catalog", label: "Matched issues to fixes" }],
    reply: [
      `**${bad.length} of ${data.products.length} products have catalog issues.**`,
      "",
      ...bad.slice(0, 6).map((p) => `- **${p.title}**: ${p.issues.map((i) => i.label).join(", ")}`),
      "",
      fixable.length ? `I can fix **${fixable.length}** now. ${unfixable.length ? `${unfixable.length} need changes in your store (for example a policy-rejected product) and stay as they are.` : ""}` : "None of these can be fixed from here: they need changes in your store.",
      lost ? `\nThese products drove ${money(lost, curOf(ctx))} in the period.` : "",
    ].join("\n"),
    changes,
    followUps: ["Review my product catalog", "Which creatives are fatigued?"],
    viewHint: "catalog",
  };
}

// ─── Leads ─────────────────────────────────────────────────────────────────

export function leads(ctx: Ctx): AgentPlan {
  const { data } = ctx;
  const all = data.leads;
  if (!all.length) return { steps: [{ tool: "meta_leads", label: "Looked for leads" }], reply: "There are no leads yet. Once an instant-form campaign runs I'll score lead quality by ad and form.", changes: [], followUps: ["Create a Leads campaign for corporate orders in Saudi Arabia with $40/day"], viewHint: "leadForms" };
  const share = (q: string) => all.filter((l) => l.quality === q).length / all.length;
  const lowShare = share("LOW");
  const changes: Change[] = [];
  const set = data.adSets.find((s) => s.conversionLocation === "INSTANT_FORMS" && s.status === "ACTIVE" && s.optimizationGoal === "LEAD_GENERATION");
  if (set && lowShare >= 0.25) {
    changes.push({
      title: `Optimize ${set.name} for quality leads`,
      rationale: `${(lowShare * 100).toFixed(0)}% of leads are low quality. "Quality leads" steers delivery to people more likely to be qualified instead of the cheapest to get. Expect fewer leads at a higher cost each, but more that convert.`,
      impact: "Fewer, better leads",
      risk: "MEDIUM",
      resetsLearning: true,
      ops: [{ kind: "adSet.update", adSetId: set.id, patch: { optimizationGoal: "QUALITY_LEAD" } }],
    });
  }
  return {
    steps: [{ tool: "meta_leads", label: `Read ${all.length} leads` }, { tool: "meta_leads", label: "Scored quality by form and ad" }],
    reply: [`**${all.length} leads:** ${(share("HIGH") * 100).toFixed(0)}% high quality, ${(share("MEDIUM") * 100).toFixed(0)}% medium, ${(lowShare * 100).toFixed(0)}% low.`, "", lowShare >= 0.25 ? "Too many low-quality leads: forms that are easy to submit bring volume, not buyers. Optimizing for **quality leads**, or switching to a higher-intent form (with a review step), usually shifts the mix." : "Lead quality is healthy.", changes.length ? "\nQueued the optimization change; it restarts the ad set's learning phase." : ""].join("\n"),
    changes,
    followUps: ["Run a full audit of my Meta account"],
    viewHint: "leadForms",
  };
}

// ─── Opportunities ─────────────────────────────────────────────────────────

export function opportunities(ctx: Ctx): AgentPlan {
  const open = ctx.data.opportunities.filter((o) => o.status === "OPEN");
  if (!open.length) return { steps: [{ tool: "meta_opportunities", label: "Read Meta's recommendations" }], reply: "Meta has no open recommendations. Your opportunity score is as high as it gets for now.", changes: [], followUps: [], viewHint: "opportunities" };
  const changes: Change[] = open
    .filter((o) => o.ops?.length)
    .map((o) => ({
      title: `Apply: ${o.title}`,
      rationale: o.description,
      impact: `+${o.scoreGain} opportunity score`,
      risk: "LOW" as const,
      source: "OPPORTUNITY" as const,
      ops: [...(o.ops ?? []), { kind: "opportunity.set", ids: [o.id], status: "APPLIED" } as MutateOp],
    }));
  const gain = open.reduce((t, o) => t + o.scoreGain, 0);
  return {
    steps: [{ tool: "meta_opportunities", label: `Read ${open.length} open recommendations` }, { tool: "meta_opportunities", label: "Checked each against your goals and learning status" }],
    reply: [`Meta has **${open.length} open recommendations** worth up to **+${gain} score**:`, "", ...open.map((o) => `- **${o.title}** (+${o.scoreGain}): ${o.description}`), "", changes.length ? `I queued the ${changes.length} that I can apply safely. Others need creative or settings only you can provide.` : "None can be applied automatically."].join("\n"),
    changes,
    followUps: ["Run a full audit of my Meta account"],
    viewHint: "opportunities",
  };
}

// ─── Policy and account quality ────────────────────────────────────────────

const CLAIM_PATTERNS = [/\b(lose|drop|burn)\s+\d+\s?(kg|kilos?|lbs?|pounds?)[^.!?]*[.!?]?/gi, /\bare you (overweight|fat|obese)\??/gi, /\bcure[sd]?\b/gi];

function cleanCopy(text: string): string {
  let out = text;
  for (const re of CLAIM_PATTERNS) out = out.replace(re, "");
  return out.replace(/\s{2,}/g, " ").replace(/!{2,}/g, "!").trim();
}

export function policy(ctx: Ctx): AgentPlan {
  const { data } = ctx;
  const open = data.policyIssues.filter((p) => p.status !== "RESOLVED");
  if (!open.length) return { steps: [{ tool: "meta_policy", label: "Checked ad and account quality" }], reply: "No ads or assets have policy issues. Account quality is clean.", changes: [], followUps: [], viewHint: "accountQuality" };
  const changes: Change[] = [];
  const lines: string[] = [];
  for (const p of open) {
    lines.push(`- **${p.entityName}** (${p.policy}, ${p.status.toLowerCase()}): ${p.reason}`);
    const ad = p.entityId ? data.ads.find((a) => a.id === p.entityId) : undefined;
    if (p.status === "REJECTED" && ad && !p.reviewRequested) {
      const primaryTexts = ad.primaryTexts.map(cleanCopy).filter(Boolean);
      const headlines = ad.headlines.map(cleanCopy).filter(Boolean);
      changes.push({
        title: `Fix "${ad.name}" and request a review`,
        rationale: `Removes the claims Meta's ${p.policy} policy rejects, then asks for a review. Reviews usually finish within 24 hours.`,
        impact: "Ad returns to delivery once approved",
        risk: "LOW",
        ops: [
          { kind: "ad.update", adId: ad.id, patch: { primaryTexts: primaryTexts.length ? primaryTexts : COPY.running.texts.slice(0, 1), headlines: headlines.length ? headlines : COPY.running.headlines.slice(0, 2) } },
          { kind: "policy.requestReview", issueId: p.id },
        ],
      });
    }
  }
  const limitedAd = open.find((p) => p.status === "LIMITED" && p.entityId);
  return {
    steps: [{ tool: "meta_policy", label: `Read ${open.length} policy issue${open.length > 1 ? "s" : ""}` }, { tool: "meta_ads", label: "Checked the copy against Meta's advertising standards" }],
    reply: [
      "**Policy issues:**",
      "",
      ...lines,
      "",
      changes.length ? "For rejected ads I rewrote the copy and queued the review request. A rejected ad can't be turned on until it passes." : "",
      limitedAd ? `\n**${limitedAd.entityName}** is limited by licensed music. Swap the audio for royalty-free music in Ads Manager and I'll request the review: I can't replace media from here.` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    changes,
    followUps: ["Run a full audit of my Meta account", "Check my brand safety settings"],
    viewHint: "accountQuality",
  };
}

// ─── Partnership ads ───────────────────────────────────────────────────────

export function partnership(ctx: Ctx): AgentPlan {
  const { data, range } = ctx;
  const ads = data.ads.filter((a) => a.partnership && a.status !== "ARCHIVED");
  if (!ads.length) return { steps: [{ tool: "meta_ads", label: "Looked for partnership ads" }], reply: "You don't run partnership ads yet. Ask a creator to grant ad permission and I can boost their post with your budget.", changes: [], followUps: [], viewHint: "ads" };
  const changes: Change[] = [];
  const lines = ads.map((a) => {
    const m = derive(campaignBase(data, data.adSets.find((s) => s.id === a.adSetId)!.campaignId, range));
    void m;
    return `- **${a.name}** with ${a.partnership!.creatorName} (${a.partnership!.creatorHandle}): permission **${a.partnership!.permission.toLowerCase()}**.`;
  });
  for (const a of ads) {
    if (a.partnership!.permission === "REVOKED" && a.status === "ACTIVE")
      changes.push({ title: `Pause ${a.name}: creator revoked permission`, rationale: "Meta stops delivering a partnership ad when the creator withdraws permission; pausing keeps it from sitting in a broken state.", risk: "LOW", ops: [{ kind: "status.set", entity: "AD", ids: [a.id], status: "PAUSED" }] });
  }
  return {
    steps: [{ tool: "meta_ads", label: `Found ${ads.length} partnership ad${ads.length > 1 ? "s" : ""}` }],
    reply: ["**Partnership ads** run as the creator's handle, which usually lifts trust and CTR:", "", ...lines, "", "Pending permissions must be approved by the creator before the ad delivers."].join("\n"),
    changes,
    followUps: ["Which creatives are fatigued?"],
    viewHint: "ads",
  };
}

// ─── Brand safety, segments, value rules, lift, rules (account-level) ──────

export function brandSafety(ctx: Ctx): AgentPlan {
  const bs = ctx.data.brandSafety;
  const want = ["TRAGEDY", "MATURE", "GAMBLING"] as const;
  const missing = want.filter((x) => !bs.excluded.includes(x));
  const changes: Change[] =
    missing.length || bs.inventoryFilter === "EXPANDED"
      ? [{
          title: "Tighten brand safety",
          rationale: `Your brand sells to families and athletes: keep ads away from ${missing.map((m) => m.toLowerCase()).join(", ") || "sensitive content"}. A Moderate filter keeps most reach.`,
          impact: "Safer placements, small reach cost",
          risk: "LOW",
          ops: [{ kind: "account.update", patch: { brandSafety: { inventoryFilter: bs.inventoryFilter === "EXPANDED" ? "MODERATE" : bs.inventoryFilter, excluded: [...bs.excluded, ...missing] } } }],
        }]
      : [];
  return {
    steps: [{ tool: "meta_brand_safety", label: "Read inventory filter, exclusions and block lists" }],
    reply: [`Inventory filter: **${bs.inventoryFilter.toLowerCase()}**. Excluded topics: ${bs.excluded.length ? bs.excluded.map((e) => e.toLowerCase()).join(", ") : "none"}. Block lists: ${ctx.data.blockLists.length}.`, "", changes.length ? "I queued a tighter setup." : "That's already a safe setup."].join("\n"),
    changes,
    followUps: ["Which placements waste budget?"],
    viewHint: "brandSafety",
  };
}

export function segments(ctx: Ctx): AgentPlan {
  const base = exclusions(ctx);
  const { data } = ctx;
  const atc = data.audiences.find((a) => a.id === "aud_atc14");
  const changes = [...base.changes];
  if (atc && !data.valueRules.some((r) => r.match === atc.name)) {
    changes.push({
      title: "Value rule: bid 15% more for recent cart abandoners",
      rationale: "People who added to cart in the last 14 days convert far better than average. A value rule raises bids for them without a new ad set.",
      impact: "More purchases from your warmest audience",
      risk: "LOW",
      ops: [{ kind: "collection.upsert", collection: "valueRules", items: [{ id: gid("vr"), name: "Bid more for cart abandoners", dimension: "AUDIENCE", match: atc.name, adjustmentPct: 15, status: "ACTIVE" }] }],
    });
  }
  return { ...base, reply: `${base.reply}\n\n**Value rules** adjust bids for a group (audience, location, placement) by a set percentage. You have ${data.valueRules.length} active.`, changes, viewHint: "audiences" };
}

export function lift(ctx: Ctx): AgentPlan {
  const { data, range } = ctx;
  const sales = campaignsInScope(ctx)
    .filter((c) => c.objective === "SALES" && c.status === "ACTIVE")
    .map((c) => ({ c, spend: campaignBase(data, c.id, range).spend }))
    .sort((a, b) => b.spend - a.spend)[0];
  if (!sales) return { steps: [{ tool: "meta_experiments", label: "Looked for a sales campaign to test" }], reply: "A lift study needs an active campaign with steady spend. I don't see one yet.", changes: [], followUps: [], viewHint: "experiments" };
  const start = new Date();
  const end = new Date(Date.now() + 28 * 86_400_000);
  const study = { id: gid("lift"), name: `Conversion lift: ${sales.c.name}`, kind: "CONVERSION_LIFT" as const, status: "PLANNED" as const, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), campaignIds: [sales.c.id], controlPct: 10, metric: "Purchases" };
  return {
    steps: [{ tool: "meta_experiments", label: "Picked the campaign with the most spend" }, { tool: "meta_experiments", label: "Sized the holdout: 10% for 4 weeks" }],
    reply: `A **conversion lift study** shows how many purchases **would not have happened without your ads**: Meta holds back 10% of the audience and compares. I'd run it on **${sales.c.name}** for 4 weeks. The holdout group won't see these ads, so expect about 10% less delivery during the study.`,
    changes: [{ title: `Plan a conversion lift study on ${sales.c.name}`, rationale: "Platform-reported ROAS counts purchases that would have happened anyway. A holdout test measures true incremental sales before you scale.", impact: "True incremental ROAS", risk: "MEDIUM", ops: [{ kind: "collection.upsert", collection: "liftStudies", items: [study] }] }],
    followUps: ["Plan a creative A/B test", "Where should I scale budget?"],
    viewHint: "experiments",
  };
}

export function rules(ctx: Ctx): AgentPlan {
  const p = profileOf(ctx);
  const have = new Set(ctx.data.rules.map((r) => r.name));
  const all: MetaRule[] = [
    { id: gid("rule"), name: "Alert when frequency passes 3", scope: "ACCOUNT", condition: { metric: "frequency", op: ">", value: 3, window: "LAST_7_DAYS" }, action: "NOTIFY", schedule: "DAILY", enabled: true, createdBy: "AGENT" },
    { id: gid("rule"), name: "Alert when ROAS falls below break-even", scope: "ACCOUNT", condition: { metric: "roas", op: "<", value: Number((1 / p.margin).toFixed(2)), window: "LAST_3_DAYS" }, action: "NOTIFY", schedule: "DAILY", enabled: true, createdBy: "AGENT" },
    { id: gid("rule"), name: "Pause ads with very low CTR", scope: "AD", condition: { metric: "ctr", op: "<", value: 0.004, window: "LAST_7_DAYS" }, action: "PAUSE", schedule: "DAILY", enabled: true, createdBy: "AGENT" },
  ];
  const proposed = all.filter((r) => !have.has(r.name));
  return {
    steps: [{ tool: "meta_rules", label: `Read ${ctx.data.rules.length} existing rules` }, { tool: "profile_memory", label: "Read your margin to set break-even ROAS" }],
    reply: proposed.length ? ["I'd watch the account with these rules:", "", ...proposed.map((r) => `- **${r.name}**`), "", "Rules run daily and notify you; the pausing one only touches ads that are clearly not working."].join("\n") : "Your rules already cover frequency, break-even ROAS and low-CTR ads.",
    changes: proposed.length ? [{ title: `Set up ${proposed.length} monitoring rule${proposed.length > 1 ? "s" : ""}`, rationale: "Catches fatigue, losing campaigns and dead ads without you opening the account.", impact: "Early warning", risk: "LOW", ops: [{ kind: "collection.upsert", collection: "rules", items: proposed }] }] : [],
    followUps: ["Write my monthly performance report"],
    viewHint: "rules",
  };
}

// ─── Billing (read only) ───────────────────────────────────────────────────

export function billing(ctx: Ctx): AgentPlan {
  const b = ctx.data.billing;
  const cur = curOf(ctx);
  const used = b.spendLimit ? b.amountSpent / b.spendLimit : 0;
  return {
    steps: [{ tool: "meta_billing", label: "Read the spending limit and balance (read only)" }],
    reply: [
      `**Billing is view only for me.** I can't change payment methods, the spending limit or the billing threshold.`,
      "",
      `- Account status: **${b.accountStatus.toLowerCase()}**`,
      b.spendLimit ? `- Spending limit: ${money(b.spendLimit, cur)} · spent ${money(b.amountSpent, cur)} (**${Math.round(used * 100)}%**)` : `- No spending limit · spent ${money(b.amountSpent, cur)}`,
      `- Payment method: ${b.paymentLabel ?? "Meta only shares it with people who can manage this ad account"}`,
      `- Balance due: ${money(b.balanceDue, cur, { decimals: 2 })}`,
      "- Billing threshold and next charge date: Meta doesn't share these with apps. You'll find them in Meta Billing.",
      "",
      used > 0.8 ? `**You're at ${Math.round(used * 100)}% of the limit.** Ads stop when it's reached. Raise it in Meta Billing before you scale.` : "There's plenty of room under the limit.",
    ].join("\n"),
    changes: [],
    followUps: ["Where should I scale budget?"],
    viewHint: "billing",
  };
}

// ─── Create campaign ───────────────────────────────────────────────────────

function geoOf(text: string, ctx: Ctx) {
  const t = text.toLowerCase();
  const alias: [RegExp, string][] = [[/ksa|saudi|السعود/, "Saudi Arabia"], [/uae|emirates|dubai|الإمارات|الامارات/, "United Arab Emirates"], [/kuwait|الكويت/, "Kuwait"], [/qatar|قطر/, "Qatar"], [/egypt|مصر/, "Egypt"]];
  const hit = alias.find(([re]) => re.test(t))?.[1] ?? GEO_TARGETS.find((g) => t.includes(g.name.toLowerCase()))?.name ?? ctx.profile?.markets[0] ?? "Saudi Arabia";
  return GEO_TARGETS.find((g) => g.name === hit) ?? GEO_TARGETS[0]!;
}

function objectiveOf(text: string): Objective {
  const t = text.toLowerCase();
  if (/\bapp\b|install|تطبيق/.test(t)) return "APP_PROMOTION";
  if (/lead|form|عملاء محتملين/.test(t)) return "LEADS";
  if (/traffic|visit|زيارات|زيارة/.test(t)) return "TRAFFIC";
  if (/awareness|reach|brand video|وعي|انتشار/.test(t)) return "AWARENESS";
  if (/engag|reels|follow|تفاعل/.test(t)) return "ENGAGEMENT";
  return "SALES";
}

export function createCampaign(message: string, ctx: Ctx): AgentPlan {
  const { data } = ctx;
  const p = profileOf(ctx);
  const objective = objectiveOf(message);
  const o = OBJECTIVES[objective];
  if (!o.creatable) {
    return { steps: [], reply: `**${o.label}** campaigns can't be created here yet: they need an app and SDK setup that happens in Ads Manager. I can build Sales, Leads, Traffic, Awareness or Engagement campaigns.`, changes: [], followUps: ["Create an Advantage+ Sales campaign for running shoes in Saudi Arabia with $80/day"] };
  }
  const geo = geoOf(message, ctx);
  const theme = themeOf(message);
  const daily = (() => {
    const perDay = message.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s?(?:\$|usd)?\s?(?:\/|per|a)\s?day|\$\s?(\d+(?:\.\d+)?)/i);
    return Number(perDay?.[1] ?? perDay?.[2] ?? moneyIn(message) ?? (objective === "SALES" ? 80 : 40));
  })();
  const manual = /manual|ABO|without advantage/i.test(message);
  const advantage = (objective === "SALES" || objective === "LEADS") && !manual;
  const label = { running: "Running Shoes", gym: "Gym Wear", kids: "Kids Sportswear", generic: "All Products" }[theme];
  const base = `${advantage ? "Advantage+ " : ""}${o.label} – ${label} ${geo.name === "Saudi Arabia" ? "KSA" : geo.name === "United Arab Emirates" ? "UAE" : geo.name}`;
  let name = base;
  for (let i = 2; data.campaigns.some((c) => c.name.toLowerCase() === name.toLowerCase()); i++) name = `${base} (${i})`;

  const b = emptyBundle(objective);
  const set = b.adSets[0]!.adSet;
  b.campaign = { ...b.campaign, name, advantageState: advantage ? "ADVANTAGE_PLUS" : "MANUAL", budget: { kind: "DAILY", amount: daily }, existingCustomerCap: objective === "SALES" && advantage ? 0.1 : undefined };
  set.name = `${geo.name} – ${label}`;
  set.targeting = { ...set.targeting, advantageAudience: advantage, locations: [{ id: geo.id, name: geo.name, kind: "Country" }], includeAudienceIds: advantage && objective === "SALES" ? data.audiences.filter((a) => a.kind === "LOOKALIKE").slice(0, 1).map((a) => a.id) : [], excludeAudienceIds: objective === "SALES" && !advantage ? data.audiences.filter((a) => /purchas/i.test(a.name)).map((a) => a.id) : [] };
  const pageId = data.account.pageId;
  if (objective === "SALES") set.promotedObject = { datasetId: data.account.datasetId ?? data.datasets[0]?.id, event: "PURCHASE", productSetId: ctx.catalogConnected === false ? undefined : data.productSets.find((s) => theme === "running" && /running/i.test(s.name))?.id ?? data.productSets[0]?.id };
  else if (objective === "LEADS") set.promotedObject = { pageId, leadFormId: data.leadForms.find((f) => f.status === "ACTIVE")?.id };
  else set.promotedObject = { pageId };
  const copy = COPY[theme];
  const media = data.creatives.filter((c) => c.ratio !== "1:1" || c.kind === "IMAGE").slice(0, 2).map((c) => c.id);
  const link = `${p.website.replace(/\/$/, "")}/collections/${theme === "generic" ? "all" : theme}`;
  const identity = { pageName: p.businessName, instagramHandle: data.linkedAssets.find((a) => a.kind === "INSTAGRAM")?.name };
  const cta = objective === "LEADS" ? "SIGN_UP" : objective === "SALES" ? "SHOP_NOW" : "LEARN_MORE";
  const mk = (n: string, i: number): CampaignBundle["adSets"][number]["ads"][number] => ({
    name: n,
    status: "PAUSED",
    format: "SINGLE_IMAGE",
    identity,
    primaryTexts: [copy.texts[i % copy.texts.length]!],
    headlines: copy.headlines.slice(0, 2),
    description: copy.description,
    cta,
    link,
    mediaIds: media[i] ? [media[i]!] : [],
    enhancements: { TEXT_IMPROVEMENTS: true },
  });
  b.adSets[0]!.ads = [mk(`${label} – hero`, 0), mk(`${label} – offer`, 1)];
  const sets = objective === "SALES" && advantage;
  return {
    steps: [
      { tool: "profile_memory", label: "Read your business profile and memory" },
      { tool: "meta_structure", label: "Checked existing campaigns for name and audience clashes" },
      { tool: "meta_events", label: "Picked your dataset and Purchase event" },
      { tool: "meta_forecast", label: "Sized the budget for the learning phase" },
      { tool: "meta_creatives", label: "Chose creative from the library and wrote copy" },
    ],
    reply: [
      `I built a draft: **${name}**.`,
      "",
      `- **Objective:** ${o.label}${advantage ? " with Advantage+ budget, audience and placements" : " (manual setup)"}`,
      `- **Budget:** ${money(daily, curOf(ctx))}/day, ${geo.name}`,
      `- **Optimization:** ${o.resultLabel}${objective === "SALES" ? ", Purchase event" : ""}`,
      `- **Ads:** 2 ads in paused state, copy within Meta limits`,
      sets ? `- Existing-customer budget capped at 10%, so spend reaches new buyers.` : "",
      "",
      daily < learningBudget(25) ? `Heads up: at ${money(daily, curOf(ctx))}/day the ad set may take longer to leave learning; Meta wants about 50 results a week.` : "",
      "Approve it to create it paused, or open it in the editor to change anything first. Nothing goes live until you turn it on.",
    ]
      .filter((l) => l !== "")
      .join("\n"),
    changes: [
      {
        title: `Create campaign: ${name}`,
        rationale: `New ${advantage ? "Advantage+ " : ""}${o.label} campaign at ${money(daily, curOf(ctx))}/day for ${geo.name}, built from your business profile. It is created paused.`,
        impact: `Adds about ${money(daily * 30.4, curOf(ctx))}/month of spend once you turn it on`,
        risk: "HIGH",
        ops: [{ kind: "campaign.create", bundle: b, tempId: gid("c") }],
      },
    ],
    draftBundle: b,
    followUps: ["Write a creative brief for new concepts", "Exclude existing customers from prospecting"],
    viewHint: "pending",
  };
}

// ─── New ad set / new ad in an existing campaign ───────────────────────────

const nameWords = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff ]+/g, " ").split(/\s+/).filter((w) => w.length >= 4);

/** The item whose name the message mentions the most, if any. */
function mentioned<T extends { name: string }>(list: T[], message: string): T | undefined {
  const m = message.toLowerCase();
  let best: T | undefined;
  let top = 0;
  for (const item of list) {
    const score = nameWords(item.name).filter((w) => m.includes(w)).length + (m.includes(item.name.toLowerCase()) ? 5 : 0);
    if (score > top) {
      best = item;
      top = score;
    }
  }
  return best;
}

export function addAdSet(message: string, ctx: Ctx): AgentPlan {
  const { data, range } = ctx;
  const cur = curOf(ctx);
  const editable = data.campaigns.filter((c) => c.status !== "ARCHIVED" && !isLocked(c));
  const campaign =
    mentioned(editable, message) ??
    editable.find((c) => c.id === ctx.scope.campaignId) ??
    [...editable].filter((c) => c.status === "ACTIVE").sort((a, b) => campaignBase(data, b.id, range).spend - campaignBase(data, a.id, range).spend)[0];
  if (!campaign) {
    return { steps: [], reply: "I couldn't find a campaign I can add an ad set to. App promotion and legacy Advantage+ Shopping campaigns are view only. Tell me which campaign, for example *“Add an ad set to Prospecting – Running Shoes”*.", changes: [], followUps: ["Which campaigns can I edit?"] };
  }
  const sets = adSetsOf(ctx, campaign);
  const template = [...sets].sort((a, b) => adSetBase(data, b.id, range).spend - adSetBase(data, a.id, range).spend)[0];
  const base = template ? newAdSetOf(template) : emptyBundle(campaign.objective).adSets[0]!.adSet;
  const m = message.toLowerCase();
  const explicitGeo = /ksa|saudi|uae|emirates|dubai|kuwait|qatar|egypt|السعود|الإمارات|الامارات|الكويت|قطر|مصر/.test(m);
  const geo = geoOf(message, ctx);
  const lookalike = /lookalike|lal\b/.test(m) ? data.audiences.find((a) => a.kind === "LOOKALIKE") : undefined;
  const label = explicitGeo ? `${geo.name} – broad test` : lookalike ? `${lookalike.name} – test` : `${base.name} – new audience test`;
  let name = label;
  for (let i = 2; sets.some((s) => s.name.toLowerCase() === name.toLowerCase()); i++) name = `${label} (${i})`;
  const asked = moneyIn(message);
  const adSet = {
    ...base,
    name,
    status: "PAUSED" as const,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: undefined,
    budget: campaign.budget ? undefined : { kind: "DAILY" as const, amount: asked ?? Math.max(LIMITS.minDailyBudget, Math.round(dailyOf(base.budget) * 0.5) || 20) },
    targeting: {
      ...base.targeting,
      advantageAudience: campaign.advantageState === "ADVANTAGE_PLUS" ? true : base.targeting.advantageAudience,
      locations: explicitGeo ? [{ id: geo.id, name: geo.name, kind: "Country" as const }] : base.targeting.locations,
      includeAudienceIds: lookalike ? [lookalike.id] : base.targeting.includeAudienceIds,
    },
  };
  const source = template ? data.ads.filter((a) => a.adSetId === template.id && a.status !== "ARCHIVED" && a.review !== "REJECTED").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2) : [];
  const ads = source.map(newAdOf);
  const part: PartDraft = { kind: "adSet", campaignId: campaign.id, adSet, ads: ads.map((a) => ({ ...a, status: "PAUSED" as const })) };
  const op = partToOp(part, "PAUSED");
  const cbo = !!campaign.budget;
  return {
    steps: [
      { tool: "meta_structure", label: `Read ${campaign.name} and its ${sets.length} ad set${sets.length === 1 ? "" : "s"}` },
      { tool: "meta_audiences", label: "Picked an audience that doesn't overlap the existing ad sets" },
      { tool: "meta_validate", label: "Validated the new ad set (validate only)" },
    ],
    reply: [
      `I drafted a new ad set for **${campaign.name}**:`,
      "",
      `- **Ad set:** ${name}`,
      `- **Audience:** ${adSet.targeting.advantageAudience ? "Advantage+ audience" : "manual"}${lookalike ? `, suggesting ${lookalike.name}` : ""} · ${adSet.targeting.locations.filter((l) => !l.excluded).map((l) => l.name).join(", ")}`,
      `- **Budget:** ${cbo ? "uses the campaign budget" : `${money(adSet.budget!.amount, cur)}/day`}`,
      `- **Ads:** ${part.ads.length ? `${part.ads.length} copied from ${template?.name}, paused` : "none yet: add one in the editor"}`,
      "",
      cbo ? "The campaign budget is shared, so existing ad sets may get a little less while the new one learns." : "",
      "Approve it to create it paused, or open it in the editor to change anything first.",
    ]
      .filter((l) => l !== "")
      .join("\n"),
    changes: [
      {
        title: `Add ad set to ${campaign.name}: ${name}`,
        rationale: `A new audience test inside ${campaign.name}${cbo ? ". It shares the campaign budget" : ` with its own ${money(adSet.budget!.amount, cur)}/day budget`}. It is created paused.`,
        impact: "Tests a new audience without touching your winners",
        risk: "MEDIUM",
        ops: [op],
      },
    ],
    followUps: ["Write a creative brief for new concepts", "Where should I scale budget?"],
    viewHint: "pending",
  };
}

export function addAd(message: string, ctx: Ctx): AgentPlan {
  const { data, range } = ctx;
  const editableSets = data.adSets.filter((s) => s.status !== "ARCHIVED" && !isLocked(data.campaigns.find((c) => c.id === s.campaignId)));
  const campaign = mentioned(data.campaigns.filter((c) => c.status !== "ARCHIVED" && !isLocked(c)), message);
  const pool = campaign ? editableSets.filter((s) => s.campaignId === campaign.id) : editableSets;
  const set =
    mentioned(pool, message) ??
    editableSets.find((s) => s.id === ctx.scope.adSetId) ??
    [...pool].filter((s) => s.status === "ACTIVE").sort((a, b) => adSetBase(data, b.id, range).spend - adSetBase(data, a.id, range).spend)[0];
  if (!set) {
    return { steps: [], reply: "I couldn't find an ad set I can add an ad to. Tell me which one, for example *“Add a new ad to Advantage+ audience – KSA & UAE”*.", changes: [], followUps: ["Which creatives are fatigued?"] };
  }
  const existing = data.ads.filter((a) => a.adSetId === set.id && a.status !== "ARCHIVED");
  if (existing.length >= LIMITS.adsPerAdSet) {
    return { steps: [], reply: `**${set.name}** already has ${existing.length} ads, the most Meta allows. Pause or archive one first and I'll add the new one.`, changes: [], followUps: ["Which creatives are fatigued?"] };
  }
  const template: MetaAd =
    existing[0] ??
    ({ identity: { pageName: data.account.name }, link: `https://${DEMO_DOMAIN}` } as MetaAd);
  const made = conceptAd(data, set.id, template);
  if (!made) {
    return {
      steps: [{ tool: "meta_creatives", label: `Checked the concepts ${set.name} already uses` }],
      reply: `Every concept in your creative library already runs in **${set.name}**, so a new ad would only repeat one. Meta shows different concepts to different people, so the useful next step is new creative, not another copy. I can write a brief for it.`,
      changes: [],
      followUps: ["Write a creative brief for new concepts", "Which creatives are fatigued?"],
      viewHint: "creatives",
    };
  }
  const fresh: MetaAd = { ...made.ad, status: "PAUSED" };
  return {
    steps: [
      { tool: "meta_structure", label: `Read the ads in ${set.name}` },
      { tool: "meta_creatives", label: "Matched an unused concept from the creative library" },
      { tool: "meta_validate", label: "Checked the copy against Meta's limits" },
    ],
    reply: [`I drafted a new ad for **${set.name}**:`, "", `- **Concept:** ${made.concept.name} (${made.concept.angle.toLowerCase()})`, `- **Ad:** ${fresh.name}, paused`, `- **Copy:** ${fresh.headlines[0]}`, "", "It's a different angle from the ads already running there. Approve it to create it paused, or open it in the editor to see the preview and change anything."].join("\n"),
    changes: [
      {
        title: `Add a new ad to ${set.name}: ${made.concept.name}`,
        rationale: `“${made.concept.name}” (${made.concept.angle.toLowerCase()}) is an angle ${set.name} doesn't use yet, with creative ready in the library. It is created paused.`,
        impact: "Fresh reach, CTR recovery",
        risk: "LOW",
        ops: [{ kind: "ad.create", ads: [fresh] }],
      },
    ],
    followUps: ["Which creatives are fatigued?", "Write a creative brief for new concepts"],
    viewHint: "pending",
  };
}
// ─── Requests that come from a click on a page ─────────────────────────────
// The dashboard never edits the account itself: a button on a page sends a plain
// request to the agent (like Google Ads), and the agent answers with a change to
// approve. These are the exact requests the pages send, matched by name.

const quotedIn = (text: string): string | undefined => text.match(/["“](.+?)["”]/)?.[1];
const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function refuse(tool: string, label: string, errors: string[]): AgentPlan {
  return { steps: [{ tool, label }], reply: `I can't do that:\n\n${errors.map((e) => `- ${e}`).join("\n")}`, changes: [], followUps: ["Run a full audit of my Meta account"] };
}

/** "Turn on / Pause / Archive these campaigns: A, B" from the bulk bar, or one entity by name. */
function statusRequest(message: string, ctx: Ctx): AgentPlan | null {
  const m = message.toLowerCase();
  const verb = m.match(/^\s*(turn on|switch on|enable|resume|turn off|switch off|pause|archive|remove|delete)\b/)?.[1];
  if (!verb) return null;
  const status: EntityStatus = /on$|enable|resume/.test(verb) ? "ACTIVE" : /off$|pause/.test(verb) ? "PAUSED" : "ARCHIVED";
  const { data } = ctx;
  const listText = message.includes(":") ? message.slice(message.indexOf(":") + 1) : message;
  const wanted = listText.split(/,\s+(?=[A-Z0-9"“])/).map((s) => s.trim().replace(/^["“]|["”]$/g, "")).filter(Boolean);
  const pick = <T extends { name: string; status: EntityStatus }>(list: T[]) => list.filter((x) => wanted.some((w) => eq(w, x.name)));
  const found = { CAMPAIGN: pick(data.campaigns), AD_SET: pick(data.adSets), AD: pick(data.ads) };
  const hint: StatusEntity | undefined = /ad sets?/.test(m) ? "AD_SET" : /\bads?\b/.test(m) ? "AD" : /campaigns?/.test(m) ? "CAMPAIGN" : undefined;
  const entity = (Object.keys(found) as StatusEntity[]).sort((a, b) => found[b].length - found[a].length || (b === hint ? 1 : 0) - (a === hint ? 1 : 0))[0]!;
  const items = found[entity];
  if (!items.length) return null;
  const todo = items.filter((x) => x.status !== status);
  const noun = { CAMPAIGN: "campaign", AD_SET: "ad set", AD: "ad" }[entity] + (items.length === 1 ? "" : "s");
  const word = status === "ACTIVE" ? "Turn on" : status === "PAUSED" ? "Pause" : "Archive";
  if (!todo.length) return { steps: [{ tool: "meta_structure", label: `Checked the status of ${items.length} ${noun}` }], reply: `${items.length === 1 ? "That one is" : "Those are"} already ${status === "ACTIVE" ? "on" : status === "PAUSED" ? "off" : "archived"}. Nothing to change.`, changes: [], followUps: [] };
  const ops: MutateOp[] = [{ kind: "status.set", entity, ids: todo.map((x) => x.id), status }];
  const errors = validateOps(data, ops);
  if (errors.length) return refuse("meta_validate", "Validated the change (validate only)", errors);
  const names = todo.map((x) => x.name);
  return {
    steps: [{ tool: "meta_structure", label: `Found ${todo.length} ${noun}` }, { tool: "meta_validate", label: "Checked it against Meta's rules (validate only)" }],
    reply: `${word} ${todo.length === 1 ? `**${names[0]}**` : `these ${todo.length} ${noun}: ${names.map((n) => `**${n}**`).join(", ")}`}?${status === "ARCHIVED" ? " Archived items stop delivering and leave your active lists." : status === "ACTIVE" ? " They go to Meta review if needed and start delivering once approved." : " Delivery stops right away; budget flows to what's still on."}\n\nApprove the change below to apply it.`,
    changes: [{ title: `${word} ${todo.length === 1 ? names[0] : `${todo.length} ${noun}`}`, rationale: `You asked to ${word.toLowerCase()} ${todo.length === 1 ? "it" : "them"} from the table.`, risk: status === "PAUSED" ? "LOW" : "MEDIUM", ops }],
    followUps: ["Which creatives are fatigued?", "Where should I scale budget?"],
  };
}

export function directRequest(message: string, ctx: Ctx): AgentPlan | null {
  const { data } = ctx;
  const m = message.toLowerCase();
  const name = quotedIn(message);

  // Switch an automated rule or a value rule.
  const ruleVerb = m.match(/^\s*(turn on|turn off|switch on|switch off|enable|disable|pause|activate|resume)\b/)?.[1];
  if (ruleVerb && /value rule/.test(m) && name) {
    const r = data.valueRules.find((x) => eq(x.name, name));
    if (r) {
      const status = /on$|enable|activate|resume/.test(ruleVerb) ? "ACTIVE" : "PAUSED";
      return {
        steps: [{ tool: "meta_rules", label: `Found the value rule “${r.name}”` }],
        reply: `${status === "ACTIVE" ? "Activate" : "Pause"} the value rule **${r.name}** (${r.adjustmentPct > 0 ? "+" : ""}${r.adjustmentPct}% bids when ${r.match})? Approve the change below.`,
        changes: [{ title: `${status === "ACTIVE" ? "Activate" : "Pause"} value rule: ${r.name}`, rationale: "Value rules raise or lower bids for the people who matter more or less.", risk: "LOW", ops: [{ kind: "collection.upsert", collection: "valueRules", items: [{ ...r, status }] }] }],
        followUps: ["Suggest value rules for my account"],
      };
    }
  }
  if (ruleVerb && /\brule\b/.test(m) && name) {
    const r = data.rules.find((x) => eq(x.name, name));
    if (r) {
      const enabled = /on$|enable|activate|resume/.test(ruleVerb);
      return {
        steps: [{ tool: "meta_rules", label: `Found the rule “${r.name}”` }],
        reply: `Turn **${r.name}** ${enabled ? "on" : "off"}? Rules run on their own, so I'm asking first. Approve the change below.`,
        changes: [{ title: `Turn ${enabled ? "on" : "off"} rule: ${r.name}`, rationale: "Rules run on a schedule and act on their own, so switching one is a change to approve.", risk: "LOW", ops: [{ kind: "collection.upsert", collection: "rules", items: [{ ...r, enabled }] }] }],
        followUps: ["Set up rules to warn me when cost per result jumps"],
      };
    }
  }

  // Ask Meta to review a rejected ad.
  if (/^\s*request (a )?review/.test(m) && name) {
    const issue = data.policyIssues.find((p) => eq(p.entityName, name));
    if (issue) {
      const ops: MutateOp[] = [{ kind: "policy.requestReview", issueId: issue.id }];
      const errors = validateOps(data, ops);
      if (errors.length) return refuse("meta_policy", "Checked the review request", errors);
      return {
        steps: [{ tool: "meta_policy", label: `Read the policy issue on “${issue.entityName}”` }],
        reply: `**${issue.entityName}** was ${issue.status.toLowerCase()} under **${issue.policy}**: ${issue.reason}\n\nAsk Meta to look again only if you've fixed the cause: repeated reviews without a fix can hurt account standing. Approve the change below to send it.`,
        changes: [{ title: `Request review: ${issue.entityName}`, rationale: `Meta flagged this under ${issue.policy}. Fix the cause first, then ask Meta to look again.`, risk: "LOW", ops }],
        followUps: ["Why were my ads rejected and how do I fix them?"],
      };
    }
  }

  // Apply one of Meta's recommendations.
  const opp = m.startsWith("apply this opportunity:") ? data.opportunities.find((o) => o.status === "OPEN" && eq(o.title, message.slice(message.indexOf(":") + 1))) : undefined;
  if (opp?.ops?.length) {
    return {
      steps: [{ tool: "meta_opportunities", label: `Read the recommendation “${opp.title}”` }, { tool: "meta_validate", label: "Checked it against your goals and learning status" }],
      reply: `**${opp.title}** (+${opp.scoreGain} score): ${opp.description}\n\nApprove the change below to apply it.`,
      changes: [{ title: opp.title, rationale: opp.description, impact: `+${opp.scoreGain} opportunity score`, risk: "LOW", source: "OPPORTUNITY", ops: [...opp.ops, { kind: "opportunity.set", ids: [opp.id], status: "APPLIED" }] }],
      followUps: ["Run a full audit of my Meta account"],
    };
  }

  // Brand safety: inventory filter or a topic exclusion.
  if (/brand safety/.test(m)) {
    const bs = data.brandSafety;
    const filter = name && /inventory filter/.test(m) ? (Object.keys(INVENTORY_FILTERS) as InventoryFilter[]).find((k) => eq(INVENTORY_FILTERS[k].label, name)) : undefined;
    if (filter) {
      return {
        steps: [{ tool: "meta_brand_safety", label: "Read the inventory filter and exclusions" }],
        reply: `Switch the inventory filter to **${INVENTORY_FILTERS[filter].label}**? ${INVENTORY_FILTERS[filter].blurb}.\n\nApprove the change below to apply it.`,
        changes: [{ title: `Set inventory filter to ${INVENTORY_FILTERS[filter].label}`, rationale: "Controls which content your ads can appear next to. Stricter settings reduce reach and usually raise CPM.", risk: "LOW", ops: [{ kind: "account.update", patch: { brandSafety: { ...bs, inventoryFilter: filter } } }] }],
        followUps: ["Which placements waste budget?"],
      };
    }
    const topic = name ? (Object.keys(CONTENT_EXCLUSIONS) as ContentExclusion[]).find((k) => eq(CONTENT_EXCLUSIONS[k], name)) : undefined;
    const exclude = /^\s*exclude\b/.test(m);
    if (topic && (exclude || /^\s*allow\b/.test(m))) {
      const excluded = exclude ? [...new Set([...bs.excluded, topic])] : bs.excluded.filter((x) => x !== topic);
      return {
        steps: [{ tool: "meta_brand_safety", label: "Read the inventory filter and exclusions" }],
        reply: `${exclude ? "Exclude" : "Allow"} **${CONTENT_EXCLUSIONS[topic]}** ${exclude ? "from" : "in"} in-stream, Reels and Audience Network content? Approve the change below.`,
        changes: [{ title: `${exclude ? "Exclude" : "Allow"} ${CONTENT_EXCLUSIONS[topic]}`, rationale: "Topic exclusion for in-stream, Reels and Audience Network content.", risk: "LOW", ops: [{ kind: "account.update", patch: { brandSafety: { ...bs, excluded } } }] }],
        followUps: ["Review my brand safety settings"],
      };
    }
  }

  // Audience segments: which audiences count as existing customers or as engaged.
  const seg = m.match(/^\s*(add|remove)\b.*\baudience\b.*\b(existing customer|engaged) audiences\b/);
  if (seg && name) {
    const aud = data.audiences.find((a) => eq(a.name, name));
    if (aud) {
      const key = seg[2] === "engaged" ? "engagedAudienceIds" : "existingCustomerAudienceIds";
      const cur = data.audienceSegments[key];
      const next = seg[1] === "add" ? [...new Set([...cur, aud.id])] : cur.filter((x) => x !== aud.id);
      return {
        steps: [{ tool: "meta_audiences", label: "Read your audience segments" }],
        reply: `${seg[1] === "add" ? "Add" : "Remove"} **${aud.name}** ${seg[1] === "add" ? "to" : "from"} your ${seg[2]} audiences? Advantage+ uses these to tell new people from people who already know you. Approve the change below.`,
        changes: [{ title: `${seg[1] === "add" ? "Add" : "Remove"} ${aud.name} ${seg[1] === "add" ? "to" : "from"} ${seg[2]} audiences`, rationale: "Advantage+ uses these segments to tell new people from people who already know you.", risk: "LOW", ops: [{ kind: "account.update", patch: { audienceSegments: { ...data.audienceSegments, [key]: next } } }] }],
        followUps: ["Exclude existing customers from prospecting"],
      };
    }
  }

  return statusRequest(message, ctx);
}
// ─── Ad scheduling (hour and day) ───────────────────────────────────────────

const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Hours and days that earn at least `floor` of the average result per dollar, as schedule blocks. */
export function schedulePlan(data: MetaAccountData, range: DateRange, campaignIds?: string[], floor = 0.7) {
  const hours = segmentRows(data, range, "hour", campaignIds);
  const days = segmentRows(data, range, "dayOfWeek", campaignIds);
  const eff = (rows: typeof hours) => {
    const spend = rows.reduce((s, r) => s + r.base.spend, 0);
    const results = rows.reduce((s, r) => s + r.base.results, 0);
    return { avg: spend ? results / spend : 0, of: (r: (typeof rows)[number]) => (r.base.spend ? r.base.results / r.base.spend : 0) };
  };
  const he = eff(hours);
  const de = eff(days);
  const coldHours = hours.filter((r) => he.of(r) < he.avg * floor).map((r) => Number(r.key));
  const coldDays = days.filter((r) => de.of(r) < de.avg * floor).map((r) => Number(r.key));
  const onDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !coldDays.includes(d));
  const blocks: AdScheduleBlock[] = [];
  let start: number | undefined;
  for (let h = 0; h <= 24; h++) {
    const on = h < 24 && !coldHours.includes(h);
    if (on && start === undefined) start = h;
    if (!on && start !== undefined) {
      blocks.push({ days: onDays, startHour: start, endHour: h });
      start = undefined;
    }
  }
  const offHours = coldHours.length;
  return { blocks: onDays.length ? blocks : [], coldHours, coldDays, onDays, offHours, hourNote: coldHours.length ? `${coldHours.length} slow hours (${[...new Set(coldHours.map((h) => `${String(h).padStart(2, "0")}:00`))].slice(0, 6).join(", ")}${coldHours.length > 6 ? "…" : ""})` : "no slow hours" };
}

function adSchedule(ctx: Ctx): AgentPlan {
  const { data, range, scope } = ctx;
  const budgetOf = (s: AdSet) => s.budget ?? data.campaigns.find((c) => c.id === s.campaignId)?.budget;
  const live = data.adSets.filter((s) => s.status !== "ARCHIVED" && !isLocked(data.campaigns.find((c) => c.id === s.campaignId)));
  const eligible = live.filter((s) => budgetOf(s)?.kind === "LIFETIME" && (!scope.adSetId || s.id === scope.adSetId) && (!scope.campaignId || s.campaignId === scope.campaignId));
  const steps = [{ tool: "meta_insights", label: "Read performance by hour and day" }, { tool: "meta_structure", label: "Checked which ad sets can run on a schedule" }];
  const limitation = "Meta only allows hour-by-hour scheduling for ad sets with a **lifetime budget**. Ad sets on a daily budget run all day.";

  if (!eligible.length) {
    const daily = live.filter((s) => budgetOf(s)?.kind === "DAILY").length;
    return {
      steps,
      reply: `None of ${scope.adSetId || scope.campaignId ? "these" : "your"} ad sets can use a schedule right now. ${limitation} ${daily} of your live ad sets use a daily budget.\n\nIf you want a schedule on one of them, switching it to a lifetime budget with an end date is a bigger change, so tell me which ad set and I'll check what it does to learning first.`,
      changes: [],
      followUps: ["Which ad sets are stuck in learning?", "Where should I scale budget?"],
    };
  }

  const changes: ProposedChangeInput[] = [];
  const notes: string[] = [];
  for (const s of eligible.slice(0, 3)) {
    const plan = schedulePlan(data, range, [s.campaignId]);
    if (!plan.blocks.length || (!plan.coldHours.length && !plan.coldDays.length)) {
      notes.push(`**${s.name}**: results per dollar are steady all day, so a schedule would only cut reach.`);
      continue;
    }
    const ops: MutateOp[] = [{ kind: "adSet.update", adSetId: s.id, patch: { schedule: plan.blocks } }];
    const errors = validateOps(data, ops);
    if (errors.length) {
      notes.push(`**${s.name}**: ${errors[0]}`);
      continue;
    }
    notes.push(`**${s.name}**: ${plan.hourNote}${plan.coldDays.length ? ` and ${plan.coldDays.map((d) => DAY_LONG[d]).join(", ")}` : ""}. New schedule: ${scheduleText(plan.blocks)}.`);
    changes.push({ title: `Schedule ${s.name}`, rationale: `Skips ${plan.hourNote}${plan.coldDays.length ? ` and ${plan.coldDays.map((d) => DAY_LONG[d]).join(", ")}` : ""} so the lifetime budget goes to the hours that convert.`, impact: "Same budget on better hours. Changing the schedule doesn't restart learning.", risk: "LOW", ops });
  }
  return {
    steps,
    reply: `${limitation}\n\n${notes.join("\n\n")}${changes.length ? "\n\nWith a lifetime budget Meta spreads spend across the hours you leave on, so your total stays the same. Approve the change below to apply it." : ""}`,
    changes,
    followUps: ["Which creatives are fatigued?", "Where should I scale budget?"],
  };
}
// ─── Dates: start, end, extend, move ────────────────────────────────────────

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Extend X by 2 weeks", "End X on 30 Nov", "Schedule X to start on 2026-12-01", "Push back X by a week". */
export function dateRequest(message: string, ctx: Ctx, today = isoDay(new Date())): AgentPlan | null {
  const { data } = ctx;
  const m = message.toLowerCase();
  const verbs = /\b(extend|postpone|delay|push back|reschedule|move|change the dates?|dates? of|start(s|ing)?|begin|go live|launch|end(s|ing)?|stop|until|finish)\b/;
  if (!verbs.test(m)) return null;

  const sets = data.adSets.filter((s) => s.status !== "ARCHIVED");
  const camps = data.campaigns.filter((c) => c.status !== "ARCHIVED");
  const set = sets.find((s) => m.includes(s.name.toLowerCase()));
  const camp = camps.find((c) => m.includes(c.name.toLowerCase()));
  // A full name beats a fuzzy match; between two full names the longer one is the one meant.
  const exact = set && camp ? (set.name.length > camp.name.length ? { set } : { camp }) : set ? { set } : camp ? { camp } : undefined;
  const fuzzy = exact ? undefined : mentioned(camps, message) ? { camp: mentioned(camps, message)! } : mentioned(sets, message) ? { set: mentioned(sets, message)! } : undefined;
  const target = exact ?? fuzzy;
  const steps = [{ tool: "meta_structure", label: "Read start and end dates" }];

  if (!target) {
    if (!/schedule or extend|ending soon|what('?s| is) (ending|scheduled)|calendar/.test(m)) return null;
    const soon = camps.map((c) => ({ c, end: c.stopDate })).filter((x) => x.end && x.end >= today && x.end <= addDays(today, 30)).sort((a, b) => a.end!.localeCompare(b.end!));
    const open = camps.filter((c) => c.status === "ACTIVE" && !c.stopDate).length;
    return {
      steps,
      reply: `${soon.length ? `Ending in the next 30 days:\n\n${soon.map((x) => `- **${x.c.name}** on ${fmtDay(x.end!)}`).join("\n")}\n\n` : "Nothing is set to end in the next 30 days.\n\n"}${open} active campaign${open === 1 ? " has" : "s have"} no end date and keep running. Tell me which one to move, for example “Extend ${soon[0]?.c.name ?? camps[0]?.name ?? "my campaign"} by 2 weeks” or “End ${camps[0]?.name ?? "my campaign"} on 30 Nov”. The Calendar page shows all of it.`,
      changes: [],
      followUps: ["Suggest an ad schedule based on my best hours and days"],
      viewHint: "calendar",
    };
  }

  const entity = target.set ?? target.camp!;
  const isSet = !!target.set;
  const curStart = entity.startDate.slice(0, 10);
  const curEnd = (isSet ? target.set!.endDate : target.camp!.stopDate)?.slice(0, 10);

  // Dates after a keyword belong to that keyword: "start on 1 Dec", "end on 20 Dec".
  const startAt = m.search(/\b(start(s|ing)?|begin|go live|launch|from)\b/);
  const endAt = m.search(/\b(end(s|ing)?|stop|until|finish|through)\b|\bto\s+(?=\d{1,2}\s*(st|nd|rd|th)?\s+[a-z]{3}|[a-z]{3}[a-z]*\s+\d|\d{4}-)/);
  const startText = startAt >= 0 ? m.slice(startAt, endAt > startAt ? endAt : undefined) : "";
  const endText = endAt >= 0 ? m.slice(endAt, startAt > endAt ? startAt : undefined) : "";
  let start = parseDateText(startText, today);
  let end = parseDateText(endText, today);
  const span = parseSpan(m);

  if (span && !start && !end) {
    if (/\b(extend|longer|keep (it )?running)\b/.test(m)) {
      if (!curEnd) {
        return { steps, reply: `**${entity.name}** has no end date, so it already keeps running. Tell me an end date if you want it to stop, for example “End ${entity.name} on 30 Nov”.`, changes: [], followUps: [], viewHint: "calendar" };
      }
      end = addDays(curEnd, span);
    } else if (/\b(postpone|delay|push back|move|reschedule)\b/.test(m)) {
      start = addDays(curStart, span);
      if (curEnd) end = addDays(curEnd, span);
    }
  }

  if (!start && !end) {
    // "Move budget from A to B" mentions a campaign too: only answer when the request is about dates.
    if (!/\b(change the dates?|dates? of|reschedule|extend|postpone|delay|push back)\b/.test(m)) return null;
    return {
      steps,
      reply: `Which dates should **${entity.name}** have? It runs ${fmtDay(curStart)} → ${curEnd ? fmtDay(curEnd) : "with no end date"}. Tell me a start or end date, or a shift, for example “End ${entity.name} on 30 Nov”, “Extend ${entity.name} by 2 weeks” or “Push back ${entity.name} by a week”.`,
      changes: [],
      followUps: [],
      viewHint: "calendar",
    };
  }

  const ops: MutateOp[] = [];
  const campaignOfSet = isSet ? data.campaigns.find((c) => c.id === target.set!.campaignId) : undefined;
  if (isSet) {
    ops.push({ kind: "adSet.update", adSetId: entity.id, patch: { ...(start ? { startDate: start } : {}), ...(end ? { endDate: end } : {}) } });
    // A campaign can't stop before its ad sets do, so move its stop date along when it would.
    if (end && campaignOfSet?.stopDate && end > campaignOfSet.stopDate.slice(0, 10)) ops.unshift({ kind: "campaign.update", campaignId: campaignOfSet.id, patch: { stopDate: end } });
  } else {
    ops.push({ kind: "campaign.update", campaignId: entity.id, patch: { ...(start ? { startDate: start } : {}), ...(end ? { stopDate: end } : {}) } });
  }
  const errors = validateOps(data, ops);
  if (errors.length) return refuse("meta_validate", "Checked the dates against Meta's rules (validate only)", errors);

  const newStart = start ?? curStart;
  const newEnd = end ?? curEnd;
  const running = entity.status === "ACTIVE" && curStart <= today;
  return {
    steps: [...steps, { tool: "meta_validate", label: "Checked the dates against Meta's rules (validate only)" }],
    reply: `**${entity.name}** would run ${fmtDay(newStart)} → ${newEnd ? fmtDay(newEnd) : "with no end date"} (now ${fmtDay(curStart)} → ${curEnd ? fmtDay(curEnd) : "no end date"}).${ops.length > 1 ? ` I'm moving the campaign's stop date too, because it can't end before its ad sets.` : ""}${running && end && !start ? " It keeps delivering as it does now, so learning isn't affected." : ""}\n\nApprove the change below to apply it. You'll see it on the Calendar.`,
    changes: [{ title: `Set dates of ${entity.name}`, rationale: `${start ? `Start ${fmtDay(start)}. ` : ""}${end ? `End ${fmtDay(end)}.` : ""}`.trim(), risk: "LOW", ops }],
    followUps: ["Which of my campaigns should I schedule or extend?"],
    viewHint: "calendar",
  };
}
// ─── Audit ─────────────────────────────────────────────────────────────────

export function audit(ctx: Ctx): AgentPlan {
  const { data, range } = ctx;
  const cur = curOf(ctx);
  const issues: string[] = [];
  const limited = data.adSets.filter((s) => s.status === "ACTIVE" && s.learning.phase === "LIMITED");
  const fatigued = creativeRows(data, range).filter((r) => r.fatigued && r.ad.status === "ACTIVE");
  const open = data.policyIssues.filter((p) => p.status !== "RESOLVED");
  const ds = data.datasets.find((d) => d.id === data.account.datasetId) ?? data.datasets[0];
  const lowEmq = ds?.events.filter((e) => e.emq < 6) ?? [];
  const badProducts = data.products.filter((p) => p.status !== "ACTIVE");
  const purchasers = data.audiences.find((a) => /purchas/i.test(a.name));
  const noExclude = purchasers
    ? data.adSets.filter((s) => {
        const c = data.campaigns.find((x) => x.id === s.campaignId)!;
        return s.status === "ACTIVE" && c.objective === "SALES" && c.advantageState === "MANUAL" && !isRetargeting(data, s) && !s.targeting.excludeAudienceIds.includes(purchasers.id);
      })
    : [];
  const awareness = data.campaigns.filter((c) => c.objective === "AWARENESS" && c.status === "ACTIVE");
  const reach = awareness.length ? reachFrequency(data, range, awareness.map((c) => c.id), 3) : undefined;
  const lowLeads = data.leads.filter((l) => l.quality === "LOW").length;
  const used = data.billing.spendLimit ? data.billing.amountSpent / data.billing.spendLimit : 0;

  if (open.some((p) => p.status === "REJECTED")) issues.push(`🔴 **${open.filter((p) => p.status === "REJECTED").length} rejected ad${open.filter((p) => p.status === "REJECTED").length > 1 ? "s" : ""}.** Policy, not performance: fix and request review.`);
  if (ds && !ds.capiConnected) issues.push("🔴 **Conversions API isn't connected**: browser-only tracking loses 20–30% of events.");
  if (lowEmq.length) issues.push(`🟠 **${lowEmq.map((e) => `${e.name} EMQ ${e.emq.toFixed(1)}`).join(", ")}**: Event Match Quality under 6 weakens optimization.`);
  if (limited.length) issues.push(`🟠 **${limited.length} ad set${limited.length > 1 ? "s" : ""} learning limited**: ${limited.map((s) => s.name).join(", ")}.`);
  if (fatigued.length) issues.push(`🟠 **${fatigued.length} fatigued ad${fatigued.length > 1 ? "s" : ""}**: high frequency and falling CTR.`);
  if (noExclude.length) issues.push(`🟠 **${noExclude.length} prospecting ad set${noExclude.length > 1 ? "s" : ""} don't exclude purchasers.**`);
  if (badProducts.length) issues.push(`🟡 **${badProducts.length} catalog products have issues.**`);
  if (reach && reach.overCapShare > 0.3) issues.push(`🟡 **${(reach.overCapShare * 100).toFixed(0)}% of awareness impressions go to people already reached 3+ times.**`);
  if (lowLeads / Math.max(1, data.leads.length) > 0.3) issues.push(`🟡 **${lowLeads} of ${data.leads.length} leads are low quality.**`);
  if (used > 0.7) issues.push(`🟡 **${Math.round(used * 100)}% of the spending limit used** (${money(data.billing.amountSpent, cur)} of ${money(data.billing.spendLimit, cur)}). I can't change it; raise it in Meta Billing.`);

  const score = Math.max(35, 100 - issues.length * 8);
  const parts = [fatigue(ctx), learning(ctx), exclusions(ctx), policy(ctx)];
  const changes = parts.flatMap((x) => x.changes);
  return {
    steps: [
      { tool: "meta_insights", label: "Pulled 90-day account performance" },
      { tool: "meta_structure", label: `Read ${data.campaigns.length} campaigns, ${data.adSets.length} ad sets, ${data.ads.length} ads` },
      { tool: "meta_creatives", label: "Scored creative fatigue" },
      { tool: "meta_events", label: "Checked Pixel, Conversions API and EMQ" },
      { tool: "meta_policy", label: "Checked policy and account quality" },
      { tool: "meta_catalog", label: "Checked catalog product issues" },
    ],
    reply: [`**Account health: ${score}/100.** I found **${issues.length} issues**, ordered by impact:`, "", ...issues.map((i) => `- ${i}`), "", `I queued **${changes.length} fixes** I can make now. Tracking and creative production need your side: ask for “check my Pixel” or “write a creative brief”.`].join("\n"),
    changes,
    followUps: ["Check my Pixel, Conversions API and EMQ", "Write a creative brief for new concepts", "Write a full audit report of my Meta account"],
    viewHint: "pending",
  };
}

function help(ctx: Ctx): AgentPlan {
  const empty = !ctx.data.campaigns.length;
  return {
    steps: [],
    reply: empty
      ? "This ad account has no campaigns yet. I can build one: tell me the objective, country and a daily budget, for example *“Create an Advantage+ Sales campaign for running shoes in Saudi Arabia with $80/day”*."
      : [
          "I can work on anything in this Meta ad account. For example:",
          "",
          "- **Analyse:** performance, trends, what changed and why",
          "- **Creative:** find fatigued ads, brief new concepts, plan A/B tests",
          "- **Learning:** fix learning-limited ad sets and consolidate",
          "- **Budgets:** scale winners in 15–20% steps, trim losers",
          "- **Audiences:** exclude existing customers, segments, value rules",
          "- **Placements and measurement:** placement costs, Pixel, Conversions API, EMQ",
          "- **Catalog and leads:** fix product issues, improve lead quality",
          "- **Quality:** rejected ads, brand safety, partnership ads",
          "- **Build:** create Sales, Leads, Traffic, Awareness or Engagement campaigns",
          "",
          "Every change waits for your approval unless you turn on auto-approve. I never change billing or the spending limit.",
        ].join("\n"),
    changes: [],
    followUps: empty ? ["Create an Advantage+ Sales campaign for running shoes in Saudi Arabia with $80/day"] : ["Run a full audit of my Meta account", "Which creatives are fatigued?", "Where should I scale budget?"],
  };
}

/** "Add a new ad set to X": the verb comes before "ad set" with no "campaign" in between (otherwise it is a new campaign that has an ad set). */
const ADD_AD_SET = /\b(add|create|new|another|build)\b(?:(?!campaign)[^.]){0,25}\bad ?sets?\b/;
const ADD_AD = /\b(add|create|new|another)\b(?:(?!campaign|ad ?set)[^.]){0,25}\bad\b(?!\s?sets?)/;

export function planAgentTurn(message: string, ctx: Ctx): AgentPlan {
  const m = message.toLowerCase();
  const docTurn = planDocTurn(message, ctx);
  if (docTurn) return docTurn;
  const direct = directRequest(message, ctx);
  if (direct) return direct;
  const dated = dateRequest(message, ctx);
  if (dated) return dated;
  if (ADD_AD_SET.test(m) && ctx.data.campaigns.length) return addAdSet(message, ctx);
  if (ADD_AD.test(m) && ctx.data.adSets.length) return addAd(message, ctx);
  if (/(create|launch|build|set up|start|new).*(campaign|advantage)|حملة جديدة|انشئ|أنشئ/.test(m)) return createCampaign(message, ctx);
  if (!ctx.data.campaigns.length) return help(ctx);
  if (/spend(ing)? limit|billing|payment|credit card|invoice|الفوترة|الدفع|حد الإنفاق/.test(m)) return billing(ctx);
  if (/ad schedul|schedule (my |the |these |all )?(ads?\b|campaigns?|ad sets?)|day.?parting|hours? of (the )?day|best hours|ads? (by|per) hour|when (do|does) my ads?|جدولة/.test(m)) return adSchedule(ctx);
  if (/audit|health|review (my|the) account|تدقيق|راجع/.test(m)) return audit(ctx);
  if (/fatigu|creative (refresh|tired)|frequency|new concept|refresh|إرهاق|مللو/.test(m)) return fatigue(ctx);
  if (/learning|consolidat|ad set.*limited|التعلم/.test(m)) return learning(ctx);
  if (/exclu.*(customer|purchas)|existing customer|segment|value rule|lookalike|استبعد|العملاء الحاليين/.test(m)) return /value rule|segment/.test(m) ? segments(ctx) : exclusions(ctx);
  if (/placement|reels|stories|audience network|المواضع/.test(m)) return placements(ctx);
  if (/pixel|capi|conversions api|emq|event match|tracking|dataset|تتبع|بيكسل/.test(m)) return measurement(ctx);
  if (/catalog|product (issue|feed)|dpa|الكتالوج|المنتجات/.test(m)) return catalog(ctx);
  if (/\bleads?\b|lead quality|عملاء محتملين/.test(m)) return leads(ctx);
  if (/opportunit|recommend|توصي|فرص/.test(m)) return opportunities(ctx);
  if (/reject|disapprov|policy|account quality|مرفوض|سياسة/.test(m)) return policy(ctx);
  if (/partnership|creator|influencer|مؤثر/.test(m)) return partnership(ctx);
  if (/brand safety|block ?list|inventory filter|أمان العلامة/.test(m)) return brandSafety(ctx);
  if (/lift (study|test)|incremental|دراسة/.test(m)) return lift(ctx);
  if (/\brules?\b|alert|monitor|watch|تنبيه|راقب/.test(m)) return rules(ctx);
  if (/budget|scale|realloc|move (money|spend)|ميزاني|وسّع/.test(m)) return budget(ctx);
  if (/perform|how.*(doing|did)|summary|overview|trend|roas|أداء|ملخص/.test(m)) return performance(ctx);
  return help(ctx);
}
