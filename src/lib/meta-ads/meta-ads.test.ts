import { describe, expect, it } from "vitest";
import { adAssetRows, adPlacementRows, creativeRows, learningBudget, landingPageRows, reachFrequency, segmentRows } from "./analytics";
import { dateRequest, planAgentTurn, schedulePlan } from "./agent-sim";
import { buildAgenda, buildFlights, flightBudget, layoutMonth, parseDateText, parseSpan, postsByDay, shiftMonth, upNext } from "./calendar";
import { addDays, isoDay } from "@/lib/google-ads/metrics";
import { CONTENT_EXCLUSIONS, INVENTORY_FILTERS, LIMITS, OBJECTIVES } from "./constants";
import { buildDemoAccount, buildEmptyAccount } from "./mock-data";
import { accountBase, adSetBase, campaignBase, derive, previousRange, rangeFor } from "./metrics";
import { applyOps, budgetResetsLearning, describeOps, emptyBundle, isLocked, partFromOp, partToOp, scheduleText, touchedBy } from "./mutations";
import { viewForScope } from "./store";
import type { MetaAccountData, MutateOp, Objective } from "./types";
import { validateOps } from "./validation";
import { formatStats, interactionsOf, organicDaily, organicTotals, topPosts } from "./organic";

const range = () => rangeFor("LAST_30_DAYS");
const demo = (): MetaAccountData => buildDemoAccount();

describe("derive", () => {
  it("computes rates from base counts and never divides by zero", () => {
    const m = derive({ spend: 100, impressions: 20_000, reach: 10_000, linkClicks: 400, landingPageViews: 300, results: 20, purchases: 20, purchaseValue: 500, leads: 0, addToCart: 40, video3s: 8_000, thruPlays: 2_000, engagements: 900 });
    expect(m.cpm).toBeCloseTo(5);
    expect(m.frequency).toBeCloseTo(2);
    expect(m.ctr).toBeCloseTo(0.02);
    expect(m.roas).toBeCloseTo(5);
    expect(m.costPerResult).toBeCloseTo(5);
    expect(m.hookRate).toBeCloseTo(0.4);
    expect(m.holdRate).toBeCloseTo(0.25);
    const zero = derive(accountBase(buildEmptyAccount(), range()));
    expect(zero.cpm).toBe(0);
    expect(zero.roas).toBe(0);
  });

  it("adds up from campaigns to ad sets and attribution changes the numbers", () => {
    const data = demo();
    const r = range();
    const total = accountBase(data, r);
    const sum = data.campaigns.reduce((s, c) => s + campaignBase(data, c.id, r).spend, 0);
    expect(total.spend).toBeCloseTo(sum, 4);
    const camp = data.campaigns.find((c) => c.id === "m_prosp")!;
    const sets = data.adSets.filter((s) => s.campaignId === camp.id && s.status === "ACTIVE");
    const sets_sum = sets.reduce((s, x) => s + adSetBase(data, x.id, r).spend, 0);
    expect(sets_sum).toBeCloseTo(campaignBase(data, camp.id, r).spend, 0);
    const narrow = campaignBase(data, "m_prosp", { ...r, attribution: "CLICK_1" });
    const wide = campaignBase(data, "m_prosp", { ...r, attribution: "CLICK_7_VIEW_1" });
    expect(narrow.purchases).toBeLessThan(wide.purchases);
    expect(narrow.spend).toBeCloseTo(wide.spend, 4);
    expect(previousRange(r).end < r.start).toBe(true);
  });
});

describe("analytics", () => {
  it("breakdowns keep the total", () => {
    const data = demo();
    const r = range();
    const total = accountBase(data, r).spend;
    for (const seg of ["platform", "placement", "device", "age", "gender", "ageGender", "country", "hour", "dayOfWeek", "week", "day"] as const) {
      const sum = segmentRows(data, r, seg).reduce((s, x) => s + x.base.spend, 0);
      expect(sum / total, seg).toBeGreaterThan(0.97);
      expect(sum / total, seg).toBeLessThan(1.03);
    }
  });

  it("splits one ad into placements and assets", () => {
    const data = demo();
    const r = range();
    const ad = data.ads.find((a) => a.status === "ACTIVE" && a.review === "APPROVED")!;
    expect(adPlacementRows(data, ad.id, r).length).toBeGreaterThan(0);
    expect(adAssetRows(data, ad.id, r).some((x) => x.kind === "Headline")).toBe(true);
  });

  it("reach and frequency: more cap means fewer impressions beyond it", () => {
    const data = demo();
    const a = reachFrequency(data, range(), undefined, 2);
    const b = reachFrequency(data, range(), undefined, 5);
    expect(a.overCapShare).toBeGreaterThan(b.overCapShare);
    expect(a.curve[0]!.reachShare).toBe(1);
  });

  it("flags fatigue and lists landing pages", () => {
    const data = demo();
    expect(creativeRows(data, range()).some((r) => r.fatigued)).toBe(true);
    expect(landingPageRows(data, range()).length).toBeGreaterThan(0);
  });

  it("calls an ad fatigued only when people tune out, not just because it is shown often", () => {
    const rows = creativeRows(demo(), range()).filter((r) => r.metrics.spend > 0);
    const fatigued = rows.filter((r) => r.health === "FATIGUED");
    // The old free-delivery image is the one tired creative in the demo, and the alert says so too.
    expect(fatigued.map((r) => r.ad.id)).toEqual(["ad_asc_offer"]);
    expect(rows.filter((r) => r.health === "FRESH").length).toBeGreaterThan(rows.length / 2);
    for (const r of rows) {
      expect(r.fatigued).toBe(r.health === "FATIGUED");
      // A steady CTR never makes an ad fatigued, however high the frequency.
      if (r.ctrDrop < 0.2) expect(r.health, r.ad.name).not.toBe("FATIGUED");
      // Warm audiences tolerate more repeats.
      expect([3.5, 7]).toContain(r.frequencyLimit);
    }
  });

  it("learning budget is cost per result times 50 over 7 days", () => {
    expect(learningBudget(14)).toBe(100);
    expect(learningBudget(7)).toBe(50);
  });
});

describe("mutations", () => {
  it("applies and undoes a status change", () => {
    const data = demo();
    const op: MutateOp = { kind: "status.set", entity: "CAMPAIGN", ids: ["m_prosp"], status: "PAUSED" };
    const { next, inverse } = applyOps(data, [op]);
    expect(next.campaigns.find((c) => c.id === "m_prosp")!.status).toBe("PAUSED");
    const back = applyOps(next, inverse).next;
    expect(back.campaigns.find((c) => c.id === "m_prosp")!.status).toBe(data.campaigns.find((c) => c.id === "m_prosp")!.status);
  });

  it("changes a budget, describes it, and the inverse restores it", () => {
    const data = demo();
    const before = data.campaigns.find((c) => c.id === "m_asc")!.budget!;
    const op: MutateOp = { kind: "budget.update", entity: "CAMPAIGN", id: "m_asc", budget: { kind: "DAILY", amount: before.amount + 10 } };
    const { next, inverse } = applyOps(data, [op]);
    expect(next.campaigns.find((c) => c.id === "m_asc")!.budget!.amount).toBe(before.amount + 10);
    expect(describeOps(data, [op])[0]!.after).toContain(String(before.amount + 10));
    expect(applyOps(next, inverse).next.campaigns.find((c) => c.id === "m_asc")!.budget).toEqual(before);
    expect(touchedBy(data, [op], next).campaignIds).toContain("m_asc");
  });

  it("a budget change over 20% resets learning, a small one does not", () => {
    const base = { kind: "DAILY", amount: 100 } as const;
    expect(budgetResetsLearning(base, { kind: "DAILY", amount: 125 })).toBe(true);
    expect(budgetResetsLearning(base, { kind: "DAILY", amount: 110 })).toBe(false);
    expect(budgetResetsLearning(base, { kind: "LIFETIME", amount: 100 })).toBe(true);
  });

  it("creates a whole campaign from a bundle and removes it on undo", () => {
    const data = demo();
    const b = emptyBundle("TRAFFIC");
    b.campaign.name = "Traffic – Test";
    b.adSets[0]!.adSet.optimizationGoal = "LANDING_PAGE_VIEWS";
    b.adSets[0]!.ads = [{ name: "A", status: "PAUSED", format: "SINGLE_IMAGE", identity: { pageName: "Stride" }, primaryTexts: ["Hello"], headlines: ["Hi"], cta: "LEARN_MORE", link: "https://stride-demo.com/x", mediaIds: [data.creatives[0]!.id], enhancements: {} }];
    const op: MutateOp = { kind: "campaign.create", bundle: b, tempId: "tmp" };
    expect(validateOps(data, [op])).toEqual([]);
    const { next, inverse } = applyOps(data, [op]);
    expect(next.campaigns.length).toBe(data.campaigns.length + 1);
    expect(next.adSets.length).toBe(data.adSets.length + 1);
    expect(next.ads.length).toBe(data.ads.length + 1);
    const back = applyOps(next, inverse).next;
    expect(back.campaigns.find((c) => c.id === "tmp")!.status).toBe("ARCHIVED");
  });

  it("requests a review as an operation and restores it", () => {
    const data = demo();
    const issue = data.policyIssues.find((p) => p.status === "REJECTED" || p.status === "LIMITED")!;
    const { next, inverse } = applyOps(data, [{ kind: "policy.requestReview", issueId: issue.id }]);
    expect(next.policyIssues.find((p) => p.id === issue.id)!.reviewRequested).toBe(true);
    expect(applyOps(next, inverse).next.policyIssues.find((p) => p.id === issue.id)!.reviewRequested ?? false).toBe(issue.reviewRequested ?? false);
  });
});

describe("validation", () => {
  it("blocks edits to locked campaigns", () => {
    const data = demo();
    const legacy = data.campaigns.find((c) => c.advantageState === "LEGACY_ASC");
    if (!legacy) return;
    expect(isLocked(legacy)).toBe(true);
    expect(validateOps(data, [{ kind: "status.set", entity: "CAMPAIGN", ids: [legacy.id], status: "PAUSED" }]).length + validateOps(data, [{ kind: "budget.update", entity: "CAMPAIGN", id: legacy.id, budget: { kind: "DAILY", amount: 5 } }]).length).toBeGreaterThan(0);
  });

  it("rejects bad bundles with clear reasons", () => {
    const data = demo();
    const b = emptyBundle("SALES");
    expect(validateOps(data, [{ kind: "campaign.create", bundle: b, tempId: "t" }]).join(" ")).toMatch(/name is required/i);
    b.campaign.name = "x";
    expect(validateOps(data, [{ kind: "campaign.create", bundle: b, tempId: "t" }]).join(" ")).toMatch(/no ad/i);
    const app = emptyBundle("APP_PROMOTION");
    app.campaign.name = "App";
    expect(validateOps(data, [{ kind: "campaign.create", bundle: app, tempId: "t" }]).join(" ")).toMatch(/can't be created/i);
    expect(OBJECTIVES.APP_PROMOTION.creatable).toBe(false);
  });

  it("enforces text limits and budgets", () => {
    const data = demo();
    const ad = data.ads[0]!;
    const long = "x".repeat(LIMITS.headline + 1);
    expect(validateOps(data, [{ kind: "ad.update", adId: ad.id, patch: { headlines: [long] } }]).join(" ")).toMatch(/Headlines must be/);
    expect(validateOps(data, [{ kind: "budget.update", entity: "CAMPAIGN", id: "m_asc", budget: { kind: "DAILY", amount: 0 } }]).length).toBeGreaterThan(0);
  });
});

describe("viewForScope", () => {
  const objectives: Record<string, Objective> = { m_asc: "SALES", m_leads: "LEADS", m_traffic: "TRAFFIC", m_aware: "AWARENESS", m_engage: "ENGAGEMENT" };

  it("account pages fall back inside a campaign and ad set pages need an ad set", () => {
    expect(viewForScope("campaigns", { campaignId: "m_asc" }, "SALES")).toBe("adSets");
    expect(viewForScope("billing", { campaignId: "m_asc" }, "SALES")).toBe("adSets");
    expect(viewForScope("adSetAudience", {})).toBe("audiences");
    expect(viewForScope("adSetPlacements", {})).toBe("placements");
    expect(viewForScope("settings", {})).toBe("campaigns");
    expect(viewForScope("audiences", { campaignId: "m_asc" }, "SALES")).toBe("audiences");
  });

  it("objective pages follow the objective", () => {
    expect(viewForScope("leadForms", { campaignId: "m_leads" }, objectives.m_leads)).toBe("leadForms");
    expect(viewForScope("leadForms", { campaignId: "m_asc" }, objectives.m_asc)).toBe("adSets");
    expect(viewForScope("landingPages", { campaignId: "m_traffic" }, objectives.m_traffic)).toBe("landingPages");
    expect(viewForScope("landingPages", { campaignId: "m_asc" }, "SALES")).toBe("adSets");
    expect(viewForScope("reachFrequency", { campaignId: "m_aware" }, objectives.m_aware)).toBe("reachFrequency");
    expect(viewForScope("catalog", { campaignId: "m_asc" }, "SALES")).toBe("catalog");
    expect(viewForScope("catalog", { campaignId: "m_leads" }, "LEADS")).toBe("adSets");
  });

  it("inside an ad set only its own pages exist", () => {
    const scope = { campaignId: "m_asc", adSetId: "as_asc" };
    for (const v of ["ads", "adSetAudience", "adSetPlacements", "adSetSettings", "breakdowns"] as const) expect(viewForScope(v, scope, "SALES")).toBe(v);
    expect(viewForScope("adSets", scope, "SALES")).toBe("ads");
    expect(viewForScope("billing", scope, "SALES")).toBe("ads");
  });
});

describe("agent", () => {
  const ctx = () => ({ data: demo(), range: range(), scope: {}, memories: [] }) as Parameters<typeof planAgentTurn>[1];

  it("drafts a campaign as one pending change that is valid and paused", () => {
    const plan = planAgentTurn("Create an Advantage+ Sales campaign for running shoes in Saudi Arabia with $80/day", ctx());
    expect(plan.draftBundle).toBeTruthy();
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.ops[0]!.kind).toBe("campaign.create");
    expect(plan.draftBundle!.campaign.status).toBe("PAUSED");
    expect(validateOps(demo(), plan.changes[0]!.ops)).toEqual([]);
  });

  it("drafts a new ad set inside an existing campaign, copied from its best ad set", () => {
    const data = demo();
    const plan = planAgentTurn("Add a new ad set to Prospecting – Running Shoes", ctx());
    expect(plan.draftBundle).toBeUndefined();
    const op = plan.changes[0]!.ops[0]!;
    expect(op.kind).toBe("adSet.create");
    if (op.kind !== "adSet.create") return;
    expect(op.adSet.campaignId).toBe("m_prosp");
    expect(op.adSet.status).toBe("PAUSED");
    expect(op.ads.length).toBeGreaterThan(0);
    expect(op.ads.every((a) => a.adSetId === op.adSet.id && a.status === "PAUSED")).toBe(true);
    expect(data.adSets.some((s) => s.name === op.adSet.name)).toBe(false);
    expect(validateOps(data, plan.changes[0]!.ops)).toEqual([]);
    const { next, inverse } = applyOps(data, plan.changes[0]!.ops);
    expect(next.adSets.length).toBe(data.adSets.length + 1);
    expect(applyOps(next, inverse).next.adSets.find((s) => s.id === op.adSet.id)!.status).toBe("ARCHIVED");
  });

  it("an ad set under a campaign budget carries none, and one under ad set budgets gets its own", () => {
    const cbo = planAgentTurn("Add an ad set to Advantage+ Sales – Always On", ctx()).changes[0]!.ops[0]!;
    expect(cbo.kind === "adSet.create" && cbo.adSet.budget).toBeFalsy();
    const abo = planAgentTurn("Add an ad set to Traffic – Summer Drop with $25/day", ctx()).changes[0]!.ops[0]!;
    expect(abo.kind === "adSet.create" && abo.adSet.budget?.amount).toBe(25);
  });

  it("drafts a new ad from an unused concept, and is not mistaken for a new campaign", () => {
    const plan = planAgentTurn("Add a new ad to Advantage+ audience – KSA & UAE", ctx());
    const op = plan.changes[0]?.ops[0];
    expect(op?.kind).toBe("ad.create");
    if (op?.kind !== "ad.create") return;
    expect(op.ads[0]!.adSetId).toBe("as_asc");
    expect(op.ads[0]!.status).toBe("PAUSED");
    expect(validateOps(demo(), plan.changes[0]!.ops)).toEqual([]);
    expect(planAgentTurn("Create a Traffic campaign with an ad set for kids shoes", ctx()).draftBundle).toBeTruthy();
  });

  it("the editor reads a part back from its operation and rebuilds it", () => {
    const op = planAgentTurn("Add a new ad set to Prospecting – Running Shoes", ctx()).changes[0]!.ops[0]!;
    const part = partFromOp(op)!;
    expect(part.kind).toBe("adSet");
    const again = partToOp(part, "ACTIVE");
    expect(again.kind === "adSet.create" && again.adSet.status).toBe("ACTIVE");
    expect(again.kind === "adSet.create" && again.ads.every((a) => a.status === "ACTIVE")).toBe(true);
    expect(validateOps(demo(), [again])).toEqual([]);
  });

  it("refuses ad sets and ads in locked campaigns and bad ad sets", () => {
    const data = demo();
    const op = planAgentTurn("Add a new ad set to Prospecting – Running Shoes", ctx()).changes[0]!.ops[0]!;
    if (op.kind !== "adSet.create") throw new Error("expected adSet.create");
    expect(validateOps(data, [{ ...op, adSet: { ...op.adSet, name: " " } }]).join(" ")).toMatch(/needs a name/i);
    expect(validateOps(data, [{ ...op, ads: [] }]).join(" ")).toMatch(/has no ad/i);
    expect(validateOps(data, [{ ...op, adSet: { ...op.adSet, campaignId: "nope" } }]).join(" ")).toMatch(/no longer exists/i);
  });

  it("never changes billing", () => {
    const plan = planAgentTurn("Raise my account spending limit to 20000 and change my credit card", ctx());
    expect(plan.changes).toEqual([]);
    expect(plan.reply).toMatch(/Billing/i);
  });

  it("answers in Arabic keywords and understands fatigue", () => {
    expect(planAgentTurn("Which creatives are fatigued?", ctx()).reply.length).toBeGreaterThan(20);
    expect(planAgentTurn("ما هي الإعلانات المتعبة؟", ctx()).reply.length).toBeGreaterThan(5);
  });
});

describe("page requests go to the agent", () => {
  const ctx = () => ({ data: demo(), range: range(), scope: {}, memories: [] }) as Parameters<typeof planAgentTurn>[1];
  const only = (message: string) => {
    const plan = planAgentTurn(message, ctx());
    expect(plan.changes, message).toHaveLength(1);
    expect(validateOps(demo(), plan.changes[0]!.ops), message).toEqual([]);
    return plan.changes[0]!;
  };

  it("pauses and turns on several campaigns from the bulk bar", () => {
    const data = demo();
    const active = data.campaigns.filter((c) => c.status === "ACTIVE" && !isLocked(c)).slice(0, 2);
    const pause = only(`Pause these campaigns: ${active.map((c) => c.name).join(", ")}`);
    expect(pause.risk).toBe("LOW");
    expect(pause.ops[0]).toMatchObject({ kind: "status.set", entity: "CAMPAIGN", status: "PAUSED" });
    const off = data.campaigns.find((c) => c.status === "PAUSED")!;
    const on = only(`Turn on these campaigns: ${off.name}`);
    expect(on.ops[0]).toMatchObject({ kind: "status.set", status: "ACTIVE", ids: [off.id] });
  });

  it("finds ad sets and ads by name and skips what is already in that state", () => {
    const data = demo();
    const set = data.adSets.find((s) => s.status === "ACTIVE")!;
    expect(only(`Pause this ad set: ${set.name}`).ops[0]).toMatchObject({ entity: "AD_SET", ids: [set.id] });
    const ad = data.ads.find((a) => a.status === "ACTIVE")!;
    expect(only(`Archive these ads: ${ad.name}`).ops[0]).toMatchObject({ entity: "AD", status: "ARCHIVED" });
    const plan = planAgentTurn(`Turn on these ad sets: ${set.name}`, ctx());
    expect(plan.changes).toEqual([]);
    expect(plan.reply).toMatch(/already/i);
  });

  it("switches automated rules and value rules", () => {
    const data = demo();
    const rule = data.rules[0]!;
    const c = only(`Turn ${rule.enabled ? "off" : "on"} the rule "${rule.name}"`);
    expect(c.ops[0]).toMatchObject({ kind: "collection.upsert", collection: "rules" });
    const vr = data.valueRules[0]!;
    expect(only(`Pause the value rule "${vr.name}"`).ops[0]).toMatchObject({ collection: "valueRules" });
  });

  it("asks Meta to review a rejected ad, brand safety and audience segments", () => {
    const data = demo();
    expect(only(`Request a review for "${data.policyIssues[0]!.entityName}"`).ops[0]).toMatchObject({ kind: "policy.requestReview" });
    const bs = only(`Set my brand safety inventory filter to "${INVENTORY_FILTERS.LIMITED.label}"`).ops[0] as Extract<MutateOp, { kind: "account.update" }>;
    expect(bs.patch.brandSafety?.inventoryFilter).toBe("LIMITED");
    const ex = only(`Exclude "${CONTENT_EXCLUSIONS.GAMBLING}" in my brand safety settings`).ops[0] as Extract<MutateOp, { kind: "account.update" }>;
    expect(ex.patch.brandSafety?.excluded).toContain("GAMBLING");
    const aud = data.audiences.find((a) => !data.audienceSegments.engagedAudienceIds.includes(a.id))!;
    const seg = only(`Add the audience "${aud.name}" to my engaged audiences`).ops[0] as Extract<MutateOp, { kind: "account.update" }>;
    expect(seg.patch.audienceSegments?.engagedAudienceIds).toContain(aud.id);
  });

  it("applies a recommendation as a pending change tagged as an opportunity", () => {
    const o = demo().opportunities.find((x) => x.status === "OPEN" && x.ops?.length)!;
    const c = only(`Apply this opportunity: ${o.title}`);
    expect(c.source).toBe("OPPORTUNITY");
    expect(c.ops.at(-1)).toMatchObject({ kind: "opportunity.set", status: "APPLIED" });
  });
});

describe("ad scheduling", () => {
  const ctx = () => ({ data: demo(), range: range(), scope: {}, memories: [] }) as Parameters<typeof planAgentTurn>[1];

  it("writes schedules the way an advertiser reads them", () => {
    expect(scheduleText(undefined)).toBe("All day, every day");
    expect(scheduleText([{ days: [1, 2, 3, 4, 5], startHour: 8, endHour: 23 }])).toBe("Mon–Fri 08:00–23:00");
    expect(scheduleText([{ days: [0, 1, 2, 3, 4, 5, 6], startHour: 8, endHour: 24 }])).toBe("Every day 08:00–24:00");
    expect(scheduleText([{ days: [6, 0], startHour: 10, endHour: 14 }])).toBe("Sat, Sun 10:00–14:00");
  });

  it("only accepts a schedule on a lifetime budget with sensible blocks", () => {
    const data = demo();
    const block = [{ days: [1, 2], startHour: 8, endHour: 20 }];
    // as_traf_ig has a daily budget.
    expect(validateOps(data, [{ kind: "adSet.update", adSetId: "as_traf_ig", patch: { schedule: block } }]).join(" ")).toMatch(/lifetime budget/);
    // as_traf_main is the lifetime one.
    expect(validateOps(data, [{ kind: "adSet.update", adSetId: "as_traf_main", patch: { schedule: block } }])).toEqual([]);
    expect(validateOps(data, [{ kind: "adSet.update", adSetId: "as_traf_main", patch: { schedule: [{ days: [], startHour: 8, endHour: 20 }] } }]).length).toBeGreaterThan(0);
    expect(validateOps(data, [{ kind: "adSet.update", adSetId: "as_traf_main", patch: { schedule: [{ days: [1], startHour: 20, endHour: 8 }] } }]).length).toBeGreaterThan(0);
    // Going back to a daily budget while a schedule is set is refused.
    expect(validateOps(data, [{ kind: "budget.update", entity: "AD_SET", id: "as_traf_main", budget: { kind: "DAILY", amount: 40 } }]).join(" ")).toMatch(/schedule/);
  });

  it("shows a schedule change as a readable diff and undoes it", () => {
    const data = demo();
    const op: MutateOp = { kind: "adSet.update", adSetId: "as_traf_main", patch: { schedule: [{ days: [1, 2, 3, 4, 5], startHour: 9, endHour: 22 }] } };
    const row = describeOps(data, [op])[0]!;
    expect(row.before).toBe("Every day 08:00–24:00");
    expect(row.after).toBe("Mon–Fri 09:00–22:00");
    const { next, inverse } = applyOps(data, [op]);
    expect(next.adSets.find((s) => s.id === "as_traf_main")!.schedule![0]!.startHour).toBe(9);
    expect(applyOps(next, inverse).next.adSets.find((s) => s.id === "as_traf_main")!.schedule).toEqual(data.adSets.find((s) => s.id === "as_traf_main")!.schedule);
    expect(next.adSets.find((s) => s.id === "as_traf_main")!.learning).toEqual(data.adSets.find((s) => s.id === "as_traf_main")!.learning);
  });

  it("picks the hours that convert and skips the slow ones", () => {
    const plan = schedulePlan(demo(), range());
    expect(plan.coldHours.length).toBeGreaterThan(0);
    for (const b of plan.blocks) for (let h = b.startHour; h < b.endHour; h++) expect(plan.coldHours).not.toContain(h);
  });

  it("proposes a valid schedule for the lifetime ad set and explains the limit for daily ones", () => {
    const plan = planAgentTurn("Suggest an ad schedule based on my best hours and days", ctx());
    expect(plan.reply).toMatch(/lifetime budget/i);
    expect(plan.changes).toHaveLength(1);
    const op = plan.changes[0]!.ops[0]!;
    expect(op).toMatchObject({ kind: "adSet.update", adSetId: "as_traf_main" });
    expect(validateOps(demo(), plan.changes[0]!.ops)).toEqual([]);
    const daily = planAgentTurn("Schedule the ads of Instagram only – Reels & Stories for the best hours", { ...ctx(), scope: { campaignId: "m_traffic", adSetId: "as_traf_ig" } });
    expect(daily.changes).toEqual([]);
    expect(daily.reply).toMatch(/lifetime budget/i);
  });
});

describe("organic reporting", () => {
  const today = isoDay(new Date());
  const range = { start: addDays(today, -29), end: today };

  it("adds up published posts in the range only, and derives the engagement rate", () => {
    const posts = demo().posts;
    const t = organicTotals(posts, range);
    const inRange = posts.filter((p) => p.status === "PUBLISHED" && p.publishAt.slice(0, 10) >= range.start && p.publishAt.slice(0, 10) <= range.end);
    expect(t.posts).toBe(inRange.length);
    expect(t.posts).toBeGreaterThan(5);
    expect(t.reach).toBe(inRange.reduce((s, p) => s + p.metrics!.reach, 0));
    expect(t.interactions).toBe(t.likes + t.comments + t.shares + t.saves);
    expect(t.engagementRate).toBeCloseTo(t.interactions / t.reach);
    // Scheduled, draft and failed posts never count.
    expect(organicTotals(posts.filter((p) => p.status !== "PUBLISHED"), range).posts).toBe(0);
    expect(organicTotals([], range)).toMatchObject({ posts: 0, reach: 0, engagementRate: 0 });
  });

  it("lays out one value per day, ranks formats by reach and posts by interactions", () => {
    const posts = demo().posts;
    const daily = organicDaily(posts, range, (p) => p.metrics!.reach);
    expect(daily).toHaveLength(30);
    expect(daily.reduce((s, d) => s + d.value, 0)).toBe(organicTotals(posts, range).reach);

    const formats = formatStats(posts, range);
    expect(formats.map((f) => f.avgReach)).toEqual([...formats.map((f) => f.avgReach)].sort((a, b) => b - a));
    expect(formats.reduce((s, f) => s + f.posts, 0)).toBe(organicTotals(posts, range).posts);

    const top = topPosts(posts, range, 3);
    expect(top).toHaveLength(3);
    expect(top.map(interactionsOf)).toEqual([...top.map(interactionsOf)].sort((a, b) => b - a));
  });
});

describe("calendar", () => {
  const today = isoDay(new Date());
  const plain = (...flights: ReturnType<typeof buildFlights>) => flights;

  it("reads dates the way people write them", () => {
    expect(parseDateText("end it on 2026-12-01", "2026-11-04")).toBe("2026-12-01");
    expect(parseDateText("start on 20 Nov", "2026-11-04")).toBe("2026-11-20");
    expect(parseDateText("start on Nov 20th", "2026-11-04")).toBe("2026-11-20");
    expect(parseDateText("end on 2 Feb", "2026-11-04")).toBe("2027-02-02");
    expect(parseDateText("tomorrow", "2026-11-04")).toBe("2026-11-05");
    expect(parseDateText("next week", "2026-11-04")).toBe("2026-11-11");
    expect(parseDateText("no date here", "2026-11-04")).toBeUndefined();
    expect(parseSpan("extend it by 2 weeks")).toBe(14);
    expect(parseSpan("push back by a week")).toBe(7);
    expect(parseSpan("by 10 days")).toBe(10);
  });

  it("turns the account into flights: campaigns, experiments and drafts", () => {
    const data = demo();
    const flights = buildFlights(data, {}, [], today);
    const byId = (id: string) => flights.find((f) => f.id === id)!;
    expect(byId("m_traffic").end).toBe(data.campaigns.find((c) => c.id === "m_traffic")!.stopDate);
    expect(byId("m_asc").end).toBeUndefined();
    expect(byId("m_engage").state).toBe("PAUSED");
    expect(byId("m_asc").ads.length).toBeGreaterThan(0);
    expect(byId("ab_creative").kind).toBe("EXPERIMENT");
    expect(byId("ls_planned").state).toBe("SCHEDULED");
    expect(flights.every((f) => f.kind === "CAMPAIGN" || f.kind === "EXPERIMENT")).toBe(true);
  });

  it("tells running ads from scheduled ones, and lays posts out by day", () => {
    const data = demo();
    const flights = buildFlights(data, {}, [], today);
    const wf = flights.find((f) => f.id === "m_whitefriday")!;
    expect(wf.state).toBe("SCHEDULED");
    expect(flights.find((f) => f.id === "m_asc")!.state).toBe("ACTIVE");
    expect(flightBudget(data, wf)).toEqual({ kind: "DAILY", amount: 90 });
    // A campaign without its own budget adds up its ad sets.
    expect(flightBudget(data, flights.find((f) => f.id === "m_prosp")!)).toMatchObject({ kind: "DAILY", amount: 120, fromAdSets: true });
    // Ads in a scheduled ad set start with the ad set, not the day they were made.
    const inSet = buildFlights(data, { campaignId: "m_whitefriday", adSetId: "as_wf" }, [], today);
    expect(inSet.filter((f) => f.kind === "AD").every((f) => f.start === addDays(today, 9) && f.state === "SCHEDULED")).toBe(true);

    const byDay = postsByDay(data.posts, addDays(today, -3), addDays(today, 3));
    for (const [day, list] of byDay) {
      expect(list.every((p) => p.publishAt.startsWith(day))).toBe(true);
      expect(list.map((p) => p.publishAt)).toEqual([...list.map((p) => p.publishAt)].sort());
    }
    expect(data.posts.filter((p) => p.publishAt.slice(0, 10) < today).every((p) => p.status !== "SCHEDULED")).toBe(true);
    expect(data.posts.filter((p) => p.status === "PUBLISHED").every((p) => p.metrics)).toBe(true);

    const agenda = buildAgenda(flights, data.posts, today, addDays(today, 20));
    expect(agenda.find((d) => d.day === addDays(today, 9))!.starts.map((f) => f.id)).toContain("m_whitefriday");
    const next = upNext(flights, data.posts, today, 50);
    expect(next.map((x) => x.at)).toEqual([...next.map((x) => x.at)].sort());
    expect(next.some((x) => x.kind === "START" && x.flight.id === "m_whitefriday")).toBe(true);
    expect(next.some((x) => x.kind === "POST" && x.post.status === "PUBLISHED")).toBe(false);
  });

  it("follows the scope down to ad sets and ads, and shows pending creations as drafts", () => {
    const data = demo();
    const plan = planAgentTurn("Add a new ad set to Traffic – Summer Drop", { data, range: range(), scope: {}, memories: [] });
    const pending = [{ source: "AGENT" as const, ...plan.changes[0]!, id: "c1", createdAt: "", status: "PENDING" as const, diff: [] }];
    const inCampaign = buildFlights(data, { campaignId: "m_traffic" }, pending, today);
    expect(inCampaign.filter((f) => f.kind === "AD_SET").map((f) => f.id)).toEqual(expect.arrayContaining(["as_traf_main", "as_traf_ig"]));
    const draft = inCampaign.find((f) => f.state === "DRAFT" && f.kind === "AD_SET")!;
    expect(draft.ads.length).toBeGreaterThan(0);
    expect(inCampaign.some((f) => f.campaignId && f.campaignId !== "m_traffic")).toBe(false);
    const inSet = buildFlights(data, { campaignId: "m_traffic", adSetId: "as_traf_main" }, [], today);
    expect(inSet[0]!.kind).toBe("AD_SET");
    expect(inSet.slice(1).every((f) => f.kind === "AD")).toBe(true);
    expect(plain(...inSet).length).toBeGreaterThan(1);
  });

  it("lays a month out in Monday weeks with bars that don't overlap", () => {
    const flights = buildFlights(demo(), {}, [], today).filter((f) => f.kind !== "EXPERIMENT");
    const month = `${today.slice(0, 7)}-01`;
    const weeks = layoutMonth(flights, month);
    expect(weeks.length).toBeGreaterThanOrEqual(4);
    for (const w of weeks) {
      expect(new Date(`${w.days[0]}T00:00:00Z`).getUTCDay()).toBe(1);
      expect(w.days).toHaveLength(7);
      for (const a of w.bars) {
        expect(a.col + a.span).toBeLessThanOrEqual(7);
        for (const b of w.bars) if (a !== b && a.lane === b.lane) expect(a.col + a.span <= b.col || b.col + b.span <= a.col).toBe(true);
      }
    }
    const open = weeks.flatMap((w) => w.bars).find((b) => b.flight.id === "m_asc")!;
    expect(open.open).toBe(true);
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("extends and ends flights through the agent, and moves the campaign along with an ad set", () => {
    const data = demo();
    const ctx = { data, range: range(), scope: {}, memories: [] } as Parameters<typeof planAgentTurn>[1];
    const set = data.adSets.find((s) => s.id === "as_traf_main")!;
    const camp = data.campaigns.find((c) => c.id === "m_traffic")!;

    const extendSet = planAgentTurn(`Extend ${set.name} by 2 weeks`, ctx);
    expect(extendSet.changes).toHaveLength(1);
    const ops = extendSet.changes[0]!.ops;
    expect(ops.map((o) => o.kind)).toEqual(["campaign.update", "adSet.update"]);
    expect(ops[1]).toMatchObject({ patch: { endDate: addDays(set.endDate!, 14) } });
    expect(validateOps(data, ops)).toEqual([]);
    const row = describeOps(data, ops).find((r) => r.label.includes("end date") && r.label.startsWith(set.name))!;
    expect(row.after).toBe(addDays(set.endDate!, 14));

    const endCampaign = planAgentTurn(`End Advantage+ Sales – Always On on ${addDays(today, 20)}`, ctx);
    expect(endCampaign.changes[0]!.ops[0]).toMatchObject({ kind: "campaign.update", patch: { stopDate: addDays(today, 20) } });
    expect(validateOps(data, endCampaign.changes[0]!.ops)).toEqual([]);

    // Ending the campaign before its ad set does is refused with a reason.
    const tooEarly = planAgentTurn(`End ${camp.name} on ${addDays(today, 5)}`, ctx);
    expect(tooEarly.changes).toEqual([]);
    expect(tooEarly.reply).toMatch(/runs until/);

    // A running ad set keeps its start date.
    const pushBack = planAgentTurn(`Push back ${set.name} by a week`, ctx);
    expect(pushBack.changes).toEqual([]);
    expect(pushBack.reply).toMatch(/already started/);
  });

  it("asks for dates instead of guessing, and doesn't hijack other requests", () => {
    const data = demo();
    const ctx = { data, range: range(), scope: {}, memories: [] } as Parameters<typeof planAgentTurn>[1];
    const ask = planAgentTurn("Change the dates of Traffic – Summer Drop", ctx);
    expect(ask.changes).toEqual([]);
    expect(ask.reply).toMatch(/Which dates/);
    const overview = planAgentTurn("Which of my campaigns should I schedule or extend?", ctx);
    expect(overview.changes).toEqual([]);
    expect(overview.reply).toMatch(/Ending in the next 30 days/);
    expect(overview.viewHint).toBe("calendar");
    expect(dateRequest("Move budget from Traffic – Summer Drop to Leads – Corporate Orders", ctx)).toBeNull();
  });

  it("refuses bad dates", () => {
    const data = demo();
    const set = data.adSets.find((s) => s.id === "as_traf_main")!;
    const stop = data.campaigns.find((c) => c.id === "m_traffic")!.stopDate!;
    expect(validateOps(data, [{ kind: "adSet.update", adSetId: set.id, patch: { endDate: addDays(today, -3) } }]).join(" ")).toMatch(/past/);
    expect(validateOps(data, [{ kind: "adSet.update", adSetId: set.id, patch: { endDate: undefined } }]).join(" ")).toMatch(/lifetime budget/);
    expect(validateOps(data, [{ kind: "adSet.update", adSetId: set.id, patch: { endDate: addDays(stop, 3) } }]).join(" ")).toMatch(/past its campaign|can't run past/);
    expect(validateOps(data, [{ kind: "campaign.update", campaignId: "m_asc", patch: { stopDate: "2020-01-01" } }]).length).toBeGreaterThan(0);
  });
});