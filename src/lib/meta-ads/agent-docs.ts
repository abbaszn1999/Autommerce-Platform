// Agent document generators and editors for the Meta Ads workspace. Each
// generator reads the account, the business profile and memory, and returns a
// typed document. Edits and comment replies produce new versions of a document.

import { creativeRows, segmentRows } from "./analytics";
import { audit, budget as budgetPlan, catalog as catalogPlan, COPY, createCampaign, exclusions, fatigue, themeOf, type AgentPlan, type Ctx } from "./agent-sim";
import { OBJECTIVES } from "./constants";
import {
  DEFAULT_PROFILE,
  DOC_TYPES,
  newDoc,
  section,
  type AgentDoc,
  type BusinessProfile,
  type ChecklistItem,
  type DocComment,
  type DocSection,
  type DocType,
} from "./docs";
import { accountBase, addDays, campaignBase, delta, derive, money, num, pct, previousRange, rangeFor } from "./metrics";
import { gid } from "./mutations";
import type { AbTest, MetaAccountData, MetaRule, MutateOp, ScheduledReport } from "./types";

const profileOf = (ctx: Ctx): BusinessProfile => ctx.profile ?? DEFAULT_PROFILE;
const memoryHint = (ctx: Ctx, re: RegExp) => ctx.memories?.find((m) => re.test(m.text))?.text;

function moneyIn(text: string): number | undefined {
  const m = text.replace(/,/g, "").match(/\$\s?(\d+(?:\.\d+)?)\s?(k)?|(\d+(?:\.\d+)?)\s?(k)?\s?(?:\$|usd|dollars?|دولار)/i);
  if (!m) return undefined;
  const n = Number(m[1] ?? m[3]);
  return m[2] || m[4] ? n * 1000 : n;
}

function occasionOf(text: string): string {
  const t = text.toLowerCase();
  if (/ramadan|رمضان/.test(t)) return "Ramadan";
  if (/white friday|black friday|الجمعة البيضاء/.test(t)) return "White Friday";
  if (/back to school|المدارس/.test(t)) return "Back to School";
  if (/eid|العيد/.test(t)) return "Eid";
  if (/summer|الصيف/.test(t)) return "Summer";
  if (/launch|إطلاق|new product/.test(t)) return "Product Launch";
  return "Quarterly growth";
}

function step(text: string, ops: MutateOp[] | undefined, detail?: string, risk: ChecklistItem["risk"] = "LOW"): ChecklistItem {
  return { id: gid("step"), text, ops, detail, risk };
}

/** Turns the changes an analysis proposed into runnable checklist steps. */
function stepsFrom(plan: AgentPlan): ChecklistItem[] {
  return plan.changes.map((c) => step(c.title, c.ops, c.resetsLearning ? `${c.rationale} Restarts the learning phase.` : c.rationale, c.risk));
}

const today = () => new Date().toISOString().slice(0, 10);

// ─── Campaign plan ─────────────────────────────────────────────────────────

const PLAN_SPLIT = [
  { key: "asc", name: "Advantage+ Sales – Always On", share: 0.45, roasK: 1.1 },
  { key: "prosp", name: "Prospecting – Creative Testing", share: 0.2, roasK: 0.8 },
  { key: "retarget", name: "Retargeting – Catalog (DPA)", share: 0.15, roasK: 1.5 },
  { key: "reach", name: "Awareness – Reels Video", share: 0.1, roasK: 0 },
  { key: "engage", name: "Engagement – Creators", share: 0.1, roasK: 0.3 },
];

export function buildPlanDoc(ctx: Ctx, inputs: { occasion: string; budget: number; goal: string; focus: string; weeks?: number }): AgentDoc {
  const { data, range } = ctx;
  const p = profileOf(ctx);
  const cur = data.account.currency;
  const base = derive(accountBase(data, range));
  const baseRoas = base.roas ? (base.roas + p.targetRoas) / 2 : p.targetRoas;
  const seasonal = inputs.occasion === "Ramadan" ? 1.18 : inputs.occasion === "White Friday" ? 1.25 : 1.05;
  const weeks = inputs.weeks ?? (inputs.occasion === "Ramadan" ? 5 : 4);
  const days = weeks * 7;
  const breakEven = 1 / p.margin;
  const theme = themeOf(inputs.focus);
  const hero = memoryHint(ctx, /hero product/i);

  const rows = PLAN_SPLIT.map((s) => {
    const spend = inputs.budget * s.share;
    const roas = Math.min(14, baseRoas * s.roasK * seasonal * (inputs.goal.startsWith("New") ? 0.85 : 1));
    return { ...s, spend, daily: spend / days, roas, value: spend * roas, conv: (spend * roas) / p.averageOrderValue };
  });
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalConv = rows.reduce((s, r) => s + r.conv, 0);
  const planRoas = totalValue / inputs.budget;
  const daily = (k: string) => Math.max(10, Math.round(rows.find((r) => r.key === k)!.daily));

  const phases =
    inputs.occasion === "Ramadan"
      ? [
          { label: "Warm-up", when: "7 days before", focus: "Seed audiences and test concepts", items: ["Launch 3 new concepts at low budget", "Grow video-viewer and engager audiences"], budgetShare: 0.1 },
          { label: "Weeks 1–2", when: "Days 1–14", focus: "Steady demand, evening peaks", items: ["Scale winners 15–20% per step", "Reels and Stories carry the evening reach"], budgetShare: 0.28 },
          { label: "Last 10 days", when: "Days 20–30", focus: "Peak Eid shopping", items: ["Raise budgets in 20% steps every 3 days", "Shipping cut-off messaging"], budgetShare: 0.42 },
          { label: "Eid", when: "Eid + 3 days", focus: "Eid gifts and new outfits", items: ["Swap to Eid creative", "Retarget cart abandoners"], budgetShare: 0.2 },
        ]
      : [
          { label: "Prepare", when: "Week 1", focus: "Concepts, audiences and tracking", items: ["Build campaigns paused", "Check EMQ and Conversions API"], budgetShare: 0.15 },
          { label: "Launch", when: "Week 2", focus: "Go live and exit learning", items: ["Start at full budget so ad sets reach 50 results", "No edits for 7 days"], budgetShare: 0.25 },
          { label: "Scale", when: "Weeks 3–4", focus: "Move money to winners", items: ["Raise winners 15–20% per step", "Pause fatigued ads"], budgetShare: 0.6 },
        ];

  const t = COPY[theme];
  const ads = [
    { audience: "Prospecting: runners and fitness fans", primaryTexts: [`${inputs.occasion}: ${t.texts[0]}`.slice(0, 125)], headlines: [t.headlines[0]!, t.headlines[1]!], cta: "Shop now", url: `${p.website.replace(/^https?:\/\//, "")}/${theme}` },
    { audience: "Retargeting: cart abandoners", primaryTexts: ["Still thinking? Your cart is saved. Free 2-day delivery and 30-day returns."], headlines: ["Complete Your Order", t.headlines[2]!], cta: "Shop now", url: `${p.website.replace(/^https?:\/\//, "")}/cart` },
    { audience: "Reels and Stories reach", primaryTexts: [hero ? "Glide 3: our best seller, in motion." : t.texts[1]!], headlines: ["Made For Your Run", "New This Season"], cta: "Learn more", url: `${p.website.replace(/^https?:\/\//, "")}/new` },
  ];

  const draft = createCampaign(`Create an Advantage+ Sales campaign for ${inputs.focus} in ${p.markets[0] ?? "Saudi Arabia"} with $${daily("asc")}/day`, ctx).draftBundle;
  if (draft) draft.campaign.name = `${inputs.occasion} – Advantage+ Sales – ${theme === "gym" ? "Gym Wear" : theme === "kids" ? "Kids" : "Running"}`;
  const rule: MetaRule = { id: gid("rule"), name: `${inputs.occasion}: alert if daily spend passes ${money(Math.round((inputs.budget / days) * 1.3), cur)}`, scope: "ACCOUNT", condition: { metric: "spend", op: ">", value: Math.round((inputs.budget / days) * 1.3), window: "LAST_3_DAYS" }, action: "NOTIFY", schedule: "DAILY", enabled: true, createdBy: "AGENT" };
  const report: ScheduledReport = { id: gid("sr"), name: `${inputs.occasion} weekly report`, breakdown: "objective", metrics: ["spend", "results", "purchaseValue", "roas"], frequency: "WEEKLY", recipients: ["owner@stride-demo.com"], format: "PDF", nextRun: addDays(today(), 7) };
  const asc = data.campaigns.find((c) => c.advantageState === "ADVANTAGE_PLUS" && c.budget && c.status === "ACTIVE");

  const steps: ChecklistItem[] = [
    ...(draft ? [step(`Create "${draft.campaign.name}" at ${money(daily("asc"), cur)}/day`, [{ kind: "campaign.create", bundle: draft, tempId: gid("c") }], "Advantage+ budget, audience and placements; 2 ads from your library", "HIGH")] : []),
    ...(asc ? [step(`Raise ${asc.name} to ${money(Math.round(asc.budget!.amount * 1.2), cur)}/day`, [{ kind: "budget.update", entity: "CAMPAIGN", id: asc.id, budget: { kind: "DAILY", amount: Math.round(asc.budget!.amount * 1.2) } }], "A 20% step does not restart learning", "MEDIUM")] : []),
    step("Turn on an overspend alert", [{ kind: "collection.upsert", collection: "rules", items: [rule] }], rule.name),
    step("Email a weekly progress report", [{ kind: "collection.upsert", collection: "scheduledReports", items: [report] }], "Every Monday to the owner"),
  ];

  const sections: DocSection[] = [
    section(
      "Summary",
      { kind: "text", md: `A ${weeks}-week **${inputs.occasion}** plan with **${money(inputs.budget, cur)}** to drive **${inputs.goal}**, focused on **${inputs.focus}**. Built from your last 30 days (${(base.roas || p.targetRoas).toFixed(2)}x ROAS), your business profile and what worked before.` },
      {
        kind: "kpis",
        items: [
          { label: "Total budget", value: money(inputs.budget, cur), hint: `${money(inputs.budget / days, cur)}/day average` },
          { label: "Expected revenue", value: money(totalValue, cur, { compact: true }) },
          { label: "Expected orders", value: num(totalConv, { decimals: 0 }) },
          { label: "Expected ROAS", value: `${planRoas.toFixed(2)}x`, hint: `Break-even ${breakEven.toFixed(2)}x at ${Math.round(p.margin * 100)}% margin` },
        ],
      }
    ),
    section(
      "Goal and assumptions",
      { kind: "text", md: `- **Goal:** ${inputs.goal}\n- **Markets:** ${p.markets.join(", ")}\n- **Seasonal lift:** +${Math.round((seasonal - 1) * 100)}% conversion rate vs a normal month\n- **Average order:** ${money(p.averageOrderValue, cur)}\n- **Target ROAS:** ${p.targetRoas}x (break-even ${breakEven.toFixed(2)}x)\n- **Attribution:** 7-day click and 1-day view` },
      inputs.budget > p.monthlyBudgetCap
        ? { kind: "callout", tone: "warn", title: "Above your monthly cap.", text: `This plan spends ${money(inputs.budget, cur)}, above the ${money(p.monthlyBudgetCap, cur)} cap in your business profile. Confirm before launch.` }
        : { kind: "callout", tone: "good", title: "Within your limits.", text: `${money(inputs.budget, cur)} fits your ${money(p.monthlyBudgetCap, cur)} monthly cap.` }
    ),
    section(
      "Budget split",
      { kind: "chart", title: "Share of budget", variant: "donut", format: "money", data: rows.map((r) => ({ label: r.name, value: Math.round(r.spend) })) },
      {
        kind: "table",
        columns: ["Campaign", "Share", "Total", "Per day", "Expected ROAS"],
        align: ["left", "right", "right", "right", "right"],
        rows: [...rows.map((r) => [r.name, pct(r.share, 0), money(r.spend, cur), money(r.daily, cur), r.roas ? `${r.roas.toFixed(1)}x` : "Reach"]), ["Total", "100%", money(inputs.budget, cur), money(inputs.budget / days, cur), `${planRoas.toFixed(1)}x`]],
        highlightLast: true,
      }
    ),
    section("Campaign structure", {
      kind: "tree",
      items: [
        { name: draft?.campaign.name ?? "New Advantage+ Sales campaign", meta: `Sales · ${money(daily("asc"), cur)}/day · Advantage+`, children: [{ name: draft?.adSets[0]?.adSet.name ?? "Ad set", meta: "Advantage+ audience, placements on", chips: ["Purchase", "Existing customers capped at 10%"] }] },
        { name: "Prospecting – Creative Testing (existing)", meta: `${money(daily("prosp"), cur)}/day`, children: [{ name: "New concepts", meta: "3 concepts, different angles" }] },
        { name: "Retargeting – Catalog (existing)", meta: `${money(daily("retarget"), cur)}/day`, children: [{ name: "Cart abandoners 7d", meta: "Exclude purchasers" }] },
      ],
    }),
    section("Creative angles", { kind: "text", md: `Tone from your brand voice: *${p.brandVoice}*${hero ? `\n\nFrom memory: ${hero}` : ""}\n\nMeta rewards **different concepts**, not variations of one. Cover proof, offer and story.` }, { kind: "ads", items: ads }),
    section("Timeline", { kind: "timeline", phases }),
    section(
      "Expected results",
      { kind: "chart", title: "Expected revenue by phase", variant: "bar", format: "money", data: phases.map((ph) => ({ label: ph.label, value: Math.round(totalValue * (ph.budgetShare ?? 0.25)) })) },
      {
        kind: "table",
        columns: ["Scenario", "Spend", "Revenue", "Orders", "ROAS"],
        align: ["left", "right", "right", "right", "right"],
        rows: [
          ["Conservative", money(inputs.budget * 0.9, cur), money(totalValue * 0.75, cur), num(totalConv * 0.75, { decimals: 0 }), `${((totalValue * 0.75) / (inputs.budget * 0.9)).toFixed(2)}x`],
          ["Expected", money(inputs.budget, cur), money(totalValue, cur), num(totalConv, { decimals: 0 }), `${planRoas.toFixed(2)}x`],
          ["Optimistic", money(inputs.budget, cur), money(totalValue * 1.2, cur), num(totalConv * 1.2, { decimals: 0 }), `${(planRoas * 1.2).toFixed(2)}x`],
        ],
      },
      { kind: "callout", tone: "info", title: "Forecasts are estimates.", text: "They use your recent results, seasonality and auction data. Actual results depend on competition, creative and stock." }
    ),
    section("Risks", { kind: "text", md: "- **Learning phase:** edits in the first 7 days restart it. Plan changes for after day 7.\n- **Creative fatigue** in peak weeks: keep new concepts queued.\n- **Stock-outs** on hero sizes: keep the catalog updated hourly.\n- **Spending limit:** check Billing before scaling; I can't change it." }),
    section("Execution steps", { kind: "text", md: "Approve the plan, then run each step. Every step creates a change that waits in **Pending changes**." }, { kind: "checklist", items: steps }),
  ];

  return newDoc("PLAN", `${inputs.occasion} campaign plan`, sections, {
    subtitle: `${weeks} weeks · ${money(inputs.budget, cur)} · ${inputs.goal}`,
    team: ["Analyst", "Strategist", "Copywriter", "Forecaster"],
    inputs: { ...inputs, weeks },
  });
}

// ─── Performance report ────────────────────────────────────────────────────

export function buildReportDoc(ctx: Ctx, opts: { days?: 7 | 30 } = {}): AgentDoc {
  const { data } = ctx;
  const cur = data.account.currency;
  const range = { ...rangeFor(opts.days === 7 ? "LAST_7_DAYS" : "LAST_30_DAYS"), attribution: ctx.range.attribution };
  const now = derive(accountBase(data, range));
  const prev = derive(accountBase(data, previousRange(range)));
  const rows = data.campaigns.filter((c) => c.status !== "ARCHIVED").map((c) => ({ c, m: derive(campaignBase(data, c.id, range)) })).sort((a, b) => b.m.spend - a.m.spend);
  const sales = rows.filter((r) => OBJECTIVES[r.c.objective].conversions && r.m.spend > 0);
  const best = [...sales].sort((a, b) => b.m.roas - a.m.roas)[0];
  const worst = [...sales].filter((r) => r.m.spend > 100).sort((a, b) => a.m.roas - b.m.roas)[0];
  const placements = segmentRows(data, range, "placement").filter((r) => r.base.spend > 0).slice(0, 8);
  const fatigued = creativeRows(data, range).filter((r) => r.fatigued && r.ad.status === "ACTIVE");
  const period = opts.days === 7 ? "Weekly" : "Monthly";
  const d = (k: "spend" | "results" | "purchaseValue" | "roas" | "costPerResult") => delta(now[k], prev[k]) ?? undefined;
  const recs = [...budgetPlan({ ...ctx, range }).changes, ...fatigue({ ...ctx, range }).changes.slice(0, 2)];

  const sections: DocSection[] = [
    section(
      "Headline numbers",
      {
        kind: "kpis",
        items: [
          { label: "Spend", metric: "spend", delta: d("spend") },
          { label: "Results", metric: "results", delta: d("results") },
          { label: "Revenue", metric: "purchaseValue", delta: d("purchaseValue") },
          { label: "ROAS", metric: "roas", delta: d("roas") },
          { label: "Cost per result", metric: "costPerResult", delta: d("costPerResult") },
        ],
      },
      { kind: "text", md: `Revenue ${(d("purchaseValue") ?? 0) >= 0 ? "grew" : "fell"} **${Math.abs((d("purchaseValue") ?? 0) * 100).toFixed(1)}%** on ${(d("spend") ?? 0) >= 0 ? "+" : ""}${((d("spend") ?? 0) * 100).toFixed(1)}% spend. ROAS is **${now.roas.toFixed(2)}x**, ${now.roas >= profileOf(ctx).targetRoas ? "above" : "below"} your ${profileOf(ctx).targetRoas}x target. Numbers use ${range.attribution === "CLICK_1" ? "1-day click" : "the chosen"} attribution.` }
    ),
    section("Trend", { kind: "chart", title: "Spend and results per day", variant: "line", format: "money", live: { metric: "spend", metric2: "results" }, seriesNames: ["Spend", "Results"] }),
    section(
      "Campaigns",
      {
        kind: "table",
        columns: ["Campaign", "Objective", "Spend", "Results", "Revenue", "ROAS"],
        align: ["left", "left", "right", "right", "right", "right"],
        rows: rows.map(({ c, m }) => [c.name, OBJECTIVES[c.objective].label, money(m.spend, cur), num(m.results, { compact: true }), m.purchaseValue ? money(m.purchaseValue, cur) : "—", m.purchaseValue && m.spend ? `${m.roas.toFixed(2)}x` : "—"]),
      },
      ...(best ? [{ kind: "callout" as const, tone: "good" as const, title: `Winner: ${best.c.name}.`, text: `${money(best.m.purchaseValue, cur)} revenue at ${best.m.roas.toFixed(2)}x.` }] : []),
      ...(worst && worst.c.id !== best?.c.id ? [{ kind: "callout" as const, tone: "bad" as const, title: `Weakest: ${worst.c.name}.`, text: `${worst.m.roas.toFixed(2)}x ROAS on ${money(worst.m.spend, cur)} spend.` }] : [])
    ),
    section("Placements", { kind: "chart", title: "Spend by placement", variant: "donut", format: "money", data: placements.map((r) => ({ label: r.label, value: Math.round(r.base.spend) })) }),
    section("Creative health", { kind: "text", md: fatigued.length ? `**${fatigued.length} ad${fatigued.length > 1 ? "s are" : " is"} fatigued:** ${fatigued.slice(0, 4).map((r) => r.ad.name).join(", ")}. Details in **Creative library**.` : "No ad shows fatigue." }),
    section("Recommendations", { kind: "text", md: "Each recommendation is a change you can approve." }, { kind: "checklist", items: recs.map((c) => step(c.title, c.ops, c.rationale, c.risk)) }),
  ];
  return newDoc("REPORT", `${period} performance report`, sections, { subtitle: `${range.start} → ${range.end}`, team: ["Analyst", "Strategist"] });
}

// ─── Audit ─────────────────────────────────────────────────────────────────

export function buildAuditDoc(ctx: Ctx): AgentDoc {
  const plan = audit(ctx);
  const issues = plan.reply.split("\n").filter((l) => l.startsWith("- "));
  const score = Number(plan.reply.match(/(\d+)\/100/)?.[1] ?? 70);
  return newDoc(
    "AUDIT",
    "Account audit",
    [
      section("Health score", { kind: "score", score, label: "Account health", parts: [{ label: "Tracking", score: Math.min(100, score + 8) }, { label: "Structure and learning", score: Math.max(30, score - 6) }, { label: "Creative", score: Math.max(30, score - 10) }, { label: "Policy", score: Math.min(100, score + 4) }] }),
      section("Issues by impact", { kind: "text", md: issues.join("\n") || "No issues found." }),
      section("Fixes", { kind: "text", md: "Run the steps below one by one or all at once. Each creates a pending change." }, { kind: "checklist", items: stepsFrom(plan) }),
    ],
    { subtitle: `${issues.length} issues · score ${score}/100`, team: ["Auditor", "Analyst", "Catalog specialist"] }
  );
}

// ─── Budget plan ───────────────────────────────────────────────────────────

export function buildBudgetDoc(ctx: Ctx, total: number): AgentDoc {
  const { data, range } = ctx;
  const cur = data.account.currency;
  const rows = data.campaigns
    .filter((c) => c.status === "ACTIVE" && OBJECTIVES[c.objective].conversions && !c.advantageState.startsWith("LEGACY"))
    .map((c) => ({ c, m: derive(campaignBase(data, c.id, range)) }))
    .filter((r) => r.m.spend > 0);
  const weights = rows.map((r) => Math.max(0.3, r.m.roas) ** 1.5);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const alloc = rows.map((r, i) => ({ ...r, amount: (total * weights[i]!) / sum }));
  const steps = alloc
    .filter((a) => a.c.budget)
    .map((a) => step(`Set ${a.c.name} to ${money(Math.round(a.amount / 30.4), cur)}/day`, [{ kind: "budget.update", entity: "CAMPAIGN", id: a.c.id, budget: { kind: "DAILY", amount: Math.max(1, Math.round(a.amount / 30.4)) } }], `Currently ${money(a.c.budget!.amount, cur)}/day. Changes over 20% restart learning.`, "MEDIUM"));
  return newDoc(
    "BUDGET",
    `Budget plan: ${money(total, cur)}`,
    [
      section("Allocation", { kind: "chart", title: "Budget by campaign", variant: "donut", format: "money", data: alloc.map((a) => ({ label: a.c.name, value: Math.round(a.amount) })) }, { kind: "table", columns: ["Campaign", "Last ROAS", "Budget", "Per day"], align: ["left", "right", "right", "right"], rows: alloc.map((a) => [a.c.name, `${a.m.roas.toFixed(2)}x`, money(a.amount, cur), money(a.amount / 30.4, cur)]) }),
      section("How to move it", { kind: "text", md: "- Scale winners **15–20% per step**, at most every 3–4 days.\n- A change over 20% restarts the learning phase.\n- Keep each ad set able to reach about 50 results per week." }),
      section("Steps", { kind: "checklist", items: steps }),
    ],
    { subtitle: "Allocated by return, learning-safe", team: ["Forecaster", "Strategist"], inputs: { budget: total } }
  );
}

// ─── Creative brief ────────────────────────────────────────────────────────

export function buildCreativeBriefDoc(ctx: Ctx, subject: string): AgentDoc {
  const { data } = ctx;
  const p = profileOf(ctx);
  const theme = themeOf(subject);
  const t = COPY[theme];
  const used = data.concepts.map((c) => [c.name, c.angle, c.hook]);
  const fresh = [
    ["Myth vs fact", "Education", "5 running shoe myths, tested"],
    ["Side by side", "Comparison", "Glide 3 vs. the shoe you're wearing"],
    ["Real runners", "Social proof", "Three runners, one week, one pair"],
    ["Behind the sole", "Craft", "How we make it breathe at 40°C"],
  ];
  return newDoc(
    "CREATIVE_BRIEF",
    `Creative brief: ${subject}`,
    [
      section("What works today", { kind: "text", md: "Meta now reads the **concept** behind each ad: near-identical variants are grouped and share delivery. More angles beat more edits of one angle." }, { kind: "table", columns: ["Concept", "Angle", "Hook"], rows: used }),
      section("New concepts", { kind: "table", columns: ["Concept", "Angle", "Hook"], rows: fresh }, { kind: "callout", tone: "info", title: "Format.", text: "Make each concept in 9:16 video (6–15 s, hook in the first 2 s) and a 4:5 image. Sound on is optional: add captions." }),
      section("Copy to start from", { kind: "ads", items: [{ audience: "Prospecting", primaryTexts: t.texts, headlines: t.headlines, cta: "Shop now", url: `${p.website.replace(/^https?:\/\//, "")}/${theme}` }] }),
      section("Production notes", { kind: "text", md: `Tone: *${p.brandVoice}*\n\nNever advertise: ${p.neverAdvertise.join(", ") || "n/a"}. Avoid weight, health or "before and after" claims: Meta rejects them.` }),
    ],
    { subtitle: "4 new concepts, ready to produce", team: ["Strategist", "Copywriter"] }
  );
}

// ─── Audience review ───────────────────────────────────────────────────────

export function buildAudiencesDoc(ctx: Ctx): AgentDoc {
  const { data } = ctx;
  const plan = exclusions(ctx);
  return newDoc(
    "AUDIENCES",
    "Audience review",
    [
      section("Your audiences", { kind: "table", columns: ["Audience", "Type", "Size", "Status"], align: ["left", "left", "right", "left"], rows: data.audiences.map((a) => [a.name, a.kind.replace(/_/g, " ").toLowerCase(), num(a.size, { compact: true }), a.status.replace(/_/g, " ").toLowerCase()]) }),
      section("What to fix", { kind: "text", md: plan.reply }),
      section("Steps", { kind: "checklist", items: stepsFrom(plan) }),
    ],
    { subtitle: `${data.audiences.length} audiences`, team: ["Strategist", "Analyst"] }
  );
}

// ─── Catalog review ────────────────────────────────────────────────────────

export function buildFeedDoc(ctx: Ctx): AgentDoc {
  const plan = catalogPlan(ctx);
  const bad = ctx.data.products.filter((p) => p.status !== "ACTIVE");
  return newDoc(
    "FEED",
    "Catalog review",
    [
      section("Summary", { kind: "text", md: plan.reply }),
      section("Products with issues", { kind: "table", columns: ["Product", "Status", "Issues"], rows: bad.map((p) => [p.title, p.status.toLowerCase(), p.issues.map((i) => i.label).join(", ")]) }),
      section("Fixes", { kind: "checklist", items: stepsFrom(plan) }),
    ],
    { subtitle: `${bad.length} products need attention`, team: ["Catalog specialist"] }
  );
}

// ─── Experiment plan ───────────────────────────────────────────────────────

export function buildExperimentDoc(ctx: Ctx): AgentDoc {
  const { data } = ctx;
  const c = data.campaigns.find((x) => x.objective === "SALES" && x.status === "ACTIVE" && data.adSets.filter((s) => s.campaignId === x.id).length > 1) ?? data.campaigns[0];
  const sets = data.adSets.filter((s) => s.campaignId === c?.id).slice(0, 2);
  const test: AbTest = {
    id: gid("ab"),
    name: "UGC vs. product image",
    variable: "CREATIVE",
    status: "DRAFT",
    metric: "Cost per purchase",
    startDate: today(),
    endDate: addDays(today(), 14),
    cells: [
      { name: "UGC video", campaignId: c?.id, adSetId: sets[0]?.id, costPerResult: 0, budgetShare: 0.5 },
      { name: "Product image", campaignId: c?.id, adSetId: sets[1]?.id ?? sets[0]?.id, costPerResult: 0, budgetShare: 0.5 },
    ],
  };
  return newDoc(
    "EXPERIMENT",
    `Experiment: ${test.name}`,
    [
      section("Hypothesis", { kind: "text", md: "**UGC video** will cost at least **15% less per purchase** than the product image, because it matches how people watch Reels." }),
      section("Design", { kind: "table", columns: ["Setting", "Value"], rows: [["Variable", "Creative (one only)"], ["Campaign", c?.name ?? "—"], ["Split", "50 / 50, no overlap"], ["Duration", "14 days, no edits"], ["Primary metric", "Cost per purchase"], ["Needs", "≥ 100 purchases per cell for a clear result"]] }),
      section("Also consider a lift study", { kind: "callout", tone: "info", title: "Lift study.", text: "An A/B test says which creative is better; a conversion lift study says whether ads cause sales at all. Run one on your biggest campaign before scaling." }),
      section("Start", { kind: "checklist", items: [step("Create the A/B test as a draft", [{ kind: "collection.upsert", collection: "abTests", items: [test] }])] }),
    ],
    { subtitle: "14 days · 50/50 split", team: ["Strategist", "Analyst"] }
  );
}

// ─── Competitor analysis ───────────────────────────────────────────────────

export function buildCompetitorDoc(ctx: Ctx): AgentDoc {
  const p = profileOf(ctx);
  const names = p.competitors.map((c) => c.name);
  return newDoc(
    "COMPETITORS",
    "Competitor analysis",
    [
      section("Who is advertising", { kind: "table", columns: ["Competitor", "Active ads (Ads Library)", "Main format"], rows: (names.length ? names : ["Namshi", "Noon"]).map((n, i) => [n, 30 + i * 14, i % 2 ? "Carousel" : "Reels video"]) }),
      section("Messages they push", { kind: "text", md: "- Heavy discounting (up to 70% off)\n- Free and fast delivery\n- Broad assortment\n\nNobody leads with **heat-tested performance** or runner-made proof: your openings." }),
      section("Where you can beat them", { kind: "ads", items: [{ audience: "Prospecting", primaryTexts: COPY.running.texts, headlines: COPY.running.headlines, cta: "Shop now", url: p.website.replace(/^https?:\/\//, "") }] }),
    ],
    { subtitle: names.join(" · ") || "From the Ads Library", team: ["Researcher", "Strategist", "Copywriter"] }
  );
}

// ─── Seed ─────────────────────────────────────────────────────────────────

export function seedDocs(data: MetaAccountData): AgentDoc[] {
  const ctx: Ctx = { data, range: rangeFor("LAST_7_DAYS"), scope: {} };
  const weekly = buildReportDoc(ctx, { days: 7 });
  weekly.title = "Weekly performance report";
  weekly.createdAt = weekly.updatedAt = new Date(Date.now() - 2 * 86400000).toISOString();
  weekly.schedule = { frequency: "WEEKLY", recipients: ["owner@stride-demo.com"], nextRun: addDays(today(), 5) };
  weekly.status = "APPROVED";
  return [weekly];
}

// ─── Editing ───────────────────────────────────────────────────────────────

type Edit = { sections: DocSection[]; note: string; reply: string; extra?: Partial<AgentDoc> };

function regenerate(doc: AgentDoc, ctx: Ctx, patch: Record<string, string | number>): AgentDoc | null {
  const inputs = { ...(doc.inputs ?? {}), ...patch };
  if (doc.type === "PLAN") return buildPlanDoc(ctx, { occasion: String(inputs.occasion ?? "Ramadan"), budget: Number(inputs.budget ?? 5000), goal: String(inputs.goal ?? "Sales"), focus: String(inputs.focus ?? "Running shoes"), weeks: Number(inputs.weeks ?? 5) });
  if (doc.type === "BUDGET") return buildBudgetDoc(ctx, Number(inputs.budget ?? 10000));
  return null;
}

/** Applies a request to a document; null when the request isn't an edit. */
export function editDoc(doc: AgentDoc, request: string, ctx: Ctx, onlySectionId?: string): Edit | null {
  const m = request.toLowerCase();
  const amount = moneyIn(request);
  const cur = ctx.data.account.currency;

  if (amount && (doc.type === "PLAN" || doc.type === "BUDGET") && /budget|ميزاني|make it|change|اجعل|غيّر|\$/.test(m)) {
    const next = regenerate(doc, ctx, { budget: amount });
    if (next) {
      const old = Number(doc.inputs?.budget ?? 0);
      return { sections: next.sections, note: `Budget ${money(old, cur)} → ${money(amount, cur)}`, reply: `Recalculated the whole plan for **${money(amount, cur)}**: the split, the forecast and the steps all follow.`, extra: { title: next.title, subtitle: next.subtitle, inputs: next.inputs } };
    }
  }

  if (doc.type === "PLAN" && /(week 1|first week|warm|الأسبوع الأول|البداية)/.test(m) && /(more|raise|increase|زِد|زد|ارفع|أكثر)/.test(m)) {
    const sections = doc.sections.map((s) =>
      s.blocks.some((b) => b.kind === "timeline")
        ? {
            ...s,
            blocks: s.blocks.map((b) => {
              if (b.kind !== "timeline") return b;
              const shares = b.phases.map((ph) => ph.budgetShare ?? 0.25);
              const moved = 0.08;
              const next = shares.map((v, i) => (i === 0 ? v + moved : i === shares.length - 1 ? v : v - moved / Math.max(1, shares.length - 2)));
              return { ...b, phases: b.phases.map((ph, i) => ({ ...ph, budgetShare: Math.max(0.05, next[i]!) })) };
            }),
          }
        : s
    );
    return { sections, note: "More budget to the first phase", reply: "Moved **8% of the budget** into the first phase and took it evenly from the middle weeks. The last phase is unchanged." };
  }

  if (/short|summary only|مختصر|اختصر|أقصر/.test(m)) {
    const keep = doc.sections.filter((s, i) => i === 0 || /split|steps|apply|fixes|recommend|issues/i.test(s.title));
    return { sections: keep, note: "Shortened", reply: `Cut it down to **${keep.length} sections**: the summary, the numbers that matter and the steps.` };
  }

  if (/risk|مخاطر/.test(m) && !doc.sections.some((s) => s.title === "Risks")) {
    const idx = Math.max(1, doc.sections.length - 1);
    return { sections: [...doc.sections.slice(0, idx), section("Risks", { kind: "text", md: "- Learning phase restarts if you edit too often.\n- Creative fatigue in peak weeks.\n- Spending limit reached before the campaign ends." }), ...doc.sections.slice(idx)], note: "Added risks", reply: "Added a **Risks** section." };
  }

  const remove = m.match(/(?:remove|delete|احذف|شيل)\s+(?:the\s+)?(.+?)(?:\s+section)?$/);
  if (remove) {
    const target = doc.sections.find((s) => s.title.toLowerCase().includes(remove[1]!.trim()) || remove[1]!.includes(s.title.toLowerCase()));
    if (target) return { sections: doc.sections.filter((s) => s.id !== target.id), note: `Removed "${target.title}"`, reply: `Removed the **${target.title}** section.` };
  }

  if (/(conservative|safer|أحذر|متحفظ)/.test(m) && doc.type === "PLAN") {
    const next = regenerate(doc, ctx, { budget: Math.round(Number(doc.inputs?.budget ?? 5000) * 0.8) });
    if (next) return { sections: next.sections, note: "Conservative version (−20% budget)", reply: "Made it more conservative: **20% less budget** with the same structure.", extra: { subtitle: next.subtitle, inputs: next.inputs } };
  }

  const improve = request.match(/improve the "(.+)" section/i);
  if (improve) {
    const target = doc.sections.find((s) => s.title === improve[1]);
    if (target) {
      const text = target.blocks.find((b) => b.kind === "text");
      const takeaway = text && text.kind === "text" ? text.md.replace(/[*_#>-]/g, "").split(/(?<=\.)\s/)[0]! : `The numbers in "${target.title}" come from your last 30 days and your business profile.`;
      const sections = doc.sections.map((s) =>
        s.id === target.id
          ? { ...s, blocks: [{ kind: "callout" as const, tone: "good" as const, title: "Key takeaway:", text: takeaway }, ...s.blocks.filter((b) => !(b.kind === "callout" && b.title === "Key takeaway:")), { kind: "text" as const, md: "**What to watch:** check this weekly; I'll flag it in Rules & alerts if it drifts more than 15% from plan." }] }
          : s
      );
      return { sections, note: `Improved "${target.title}"`, reply: `Improved **${target.title}**: added a key takeaway at the top and what to watch.` };
    }
  }

  if (onlySectionId && /(clear|simpler|أبسط|وضّح)/.test(m)) {
    const sections = doc.sections.map((s) => (s.id === onlySectionId ? { ...s, blocks: [{ kind: "callout" as const, tone: "info" as const, title: "In short:", text: `This section explains ${s.title.toLowerCase()} in plain terms.` }, ...s.blocks] } : s));
    return { sections, note: "Simplified a section", reply: "Added a plain-language summary at the top of that section." };
  }
  return null;
}

const WHY: Record<string, string> = {
  "Budget split": "Advantage+ Sales takes the largest share because it drove most revenue last month; retargeting stays small because its audiences are limited; awareness is a reach bet, not a sales one.",
  "Expected results": "Revenue = spend × expected ROAS per campaign, using your last 30 days and a seasonal lift. Orders = revenue ÷ your average order value.",
  Timeline: "Spend follows demand: Gulf e-commerce peaks in the last 10 days before Eid, so that phase gets the biggest share. Increases are 15–20% per step so learning isn't reset.",
  "Health score": "Each high-severity issue costs 8 points, so tracking and policy problems weigh the most.",
};

export function replyToComment(doc: AgentDoc, comment: DocComment, ctx: Ctx): { reply: string; edit?: Edit } {
  const edit = editDoc(doc, comment.text, ctx, comment.sectionId);
  if (edit) return { reply: `${edit.reply} (version ${doc.version + 1})`, edit };
  const sec = doc.sections.find((s) => s.id === comment.sectionId);
  if (/why|how|لماذا|كيف/.test(comment.text.toLowerCase())) return { reply: WHY[sec?.title ?? ""] ?? `This is based on your last 30 days of data and your business profile (${Math.round(profileOf(ctx).margin * 100)}% margin, ${profileOf(ctx).targetRoas}x target ROAS).` };
  return { reply: "Noted. Tell me what to change here, for example *more budget to week 1*, *make it shorter* or *add risks*, and I'll update this section." };
}

// ─── Routing ───────────────────────────────────────────────────────────────

const TEAM_TASKS: Record<DocType, { role: string; task: string }[]> = {
  PLAN: [
    { role: "Analyst", task: "Reading last year's results and seasonality" },
    { role: "Strategist", task: "Splitting the budget and building the structure" },
    { role: "Copywriter", task: "Writing seasonal copy in your brand voice" },
    { role: "Forecaster", task: "Forecasting revenue and orders" },
  ],
  REPORT: [
    { role: "Analyst", task: "Comparing this period with the last one" },
    { role: "Strategist", task: "Turning findings into recommendations" },
  ],
  AUDIT: [
    { role: "Auditor", task: "Checking structure, learning and creative" },
    { role: "Analyst", task: "Measuring tracking quality" },
    { role: "Catalog specialist", task: "Checking product issues" },
  ],
  BUDGET: [
    { role: "Forecaster", task: "Modelling returns per extra dollar" },
    { role: "Strategist", task: "Allocating the budget" },
  ],
  CREATIVE_BRIEF: [
    { role: "Strategist", task: "Finding angles you haven't used" },
    { role: "Copywriter", task: "Writing hooks and copy" },
  ],
  AUDIENCES: [{ role: "Analyst", task: "Checking overlaps and exclusions" }],
  FEED: [{ role: "Catalog specialist", task: "Reading product statuses" }],
  EXPERIMENT: [{ role: "Strategist", task: "Designing the test" }],
  COMPETITORS: [
    { role: "Researcher", task: "Reading the Ads Library" },
    { role: "Copywriter", task: "Finding message gaps" },
  ],
};

function docPlan(doc: AgentDoc, reply: string, steps: string[]): AgentPlan {
  return {
    steps: steps.map((label, i) => ({ tool: ["meta_insights", "profile_memory", "meta_catalog", "meta_forecast", "doc_write"][i % 5]!, label })),
    todo: steps,
    team: TEAM_TASKS[doc.type],
    reply,
    changes: [],
    followUps: doc.type === "PLAN" ? ["Put more budget into week 1", "Add a risks section", "Make it shorter"] : ["Make it shorter", "Add risks"],
    doc,
  };
}

function askPlanQuestions(occasion: string): AgentPlan {
  return {
    steps: [{ tool: "profile_memory", label: "Read your business profile and memory" }],
    reply: `Happy to build the **${occasion}** plan. Three quick questions so it fits your business:`,
    changes: [],
    followUps: [],
    questions: [
      { id: "budget", label: "Total budget", options: ["$3,000", "$5,000", "$10,000"] },
      { id: "goal", label: "Main goal", options: ["Sales at a strong ROAS", "New customers", "Clear stock"] },
      { id: "focus", label: "Products to push", options: ["Running shoes", "Gym wear", "All products"] },
    ],
  };
}

export function planDocTurn(message: string, ctx: Ctx): AgentPlan | null {
  const m = message.toLowerCase();
  const active = ctx.docs?.find((d) => d.id === ctx.activeDocId);

  const remember = message.match(/^(?:remember|تذكر|تذكّر|احفظ)\s*(?:that|أن)?\s*:?\s*(.+)/i);
  if (remember) return { steps: [{ tool: "memory_write", label: "Saved to the shared memory" }], reply: `Saved. I'll use this from now on: *${remember[1]}*`, changes: [], followUps: [], memory: remember[1] };

  if (active) {
    const edit = editDoc(active, message, ctx);
    if (edit) {
      return {
        steps: [{ tool: "doc_read", label: `Read "${active.title}" (v${active.version})` }, { tool: "doc_update", label: edit.note }],
        reply: `${edit.reply} Saved as **version ${active.version + 1}**; changed sections are highlighted.`,
        changes: [],
        followUps: ["Make it shorter", "Add risks"],
        docUpdate: { docId: active.id, sections: edit.sections, note: edit.note, extra: edit.extra },
      };
    }
  }

  if (!ctx.data.campaigns.length) return null;
  const answers = /^answers?\b|budget:\s*\$/i.test(message);
  const wantsPlan = /(plan|strategy|خطة|استراتيجي)/.test(m) && !/budget plan|spend \$|how to spend|experiment|a\/b/.test(m);

  if (wantsPlan || answers) {
    const occasion = occasionOf(message);
    const budget = moneyIn(message);
    if (!budget) return askPlanQuestions(occasion);
    const goal = message.match(/goal:\s*([^·\n]+)/i)?.[1]?.trim() ?? "Sales at a strong ROAS";
    const focus = message.match(/focus:\s*([^·\n]+)/i)?.[1]?.trim() ?? (/gym|legging/.test(m) ? "Gym wear" : "Running shoes");
    const doc = buildPlanDoc(ctx, { occasion, budget, goal, focus });
    return docPlan(doc, `Your **${doc.title}** is open in a new tab: ${doc.sections.length} sections, a forecast and steps you can run. Tell me what to change, or comment on any section.`, ["Read the last 30 days and seasonality", "Checked your business profile and memory", "Pulled hero products from the catalog", "Forecast revenue per campaign", "Wrote the plan document"]);
  }
  if (/(report|تقرير)/.test(m) && !/audit|تدقيق/.test(m)) {
    const doc = buildReportDoc(ctx, { days: /week|أسبوع/.test(m) ? 7 : 30 });
    return docPlan(doc, `Your **${doc.title}** is ready in a new tab. Want me to send it every Monday?`, ["Pulled account insights", "Compared with the previous period", "Ranked campaigns", "Found recommendations", "Wrote the report"]);
  }
  if (/(audit|تدقيق)/.test(m) && /(report|document|doc|تقرير|مستند|write)/.test(m)) {
    const doc = buildAuditDoc(ctx);
    return docPlan(doc, "The audit is open in a new tab. Fixes are listed at the end; run them one by one or all at once.", ["Checked structure and learning", "Scored creative fatigue", "Checked Pixel and Conversions API", "Checked policy and the catalog", "Wrote the audit"]);
  }
  if (/(budget plan|how (should|do) i (split|spend)|spend \$|split \$|وزّع|توزيع)/.test(m)) {
    const doc = buildBudgetDoc(ctx, moneyIn(message) ?? 12000);
    return docPlan(doc, `The **${doc.title}** is open. Each extra $100 went where it earns the most, in steps that don't restart learning.`, ["Read campaign returns", "Modelled diminishing returns", "Allocated the budget", "Wrote the plan"]);
  }
  if (/(creative brief|brief for|concepts?\b.*brief|ملخص إبداعي)/.test(m)) {
    const subject = message.match(/(?:for|عن|ل)\s+(?:new\s+)?(.+?)(?:\s+concepts?)?$/i)?.[1]?.replace(/[?.!]$/, "") ?? "running shoes";
    const doc = buildCreativeBriefDoc(ctx, subject);
    return docPlan(doc, `The creative brief for **${subject}** is open: four new concepts with hooks and copy to start from.`, ["Read the creative library", "Found unused angles", "Wrote hooks and copy", "Wrote the brief"]);
  }
  if (/(audience review|review (my )?audiences|مراجعة الجمهور)/.test(m)) {
    const doc = buildAudiencesDoc(ctx);
    return docPlan(doc, "The audience review is open in a new tab.", ["Read audiences and exclusions", "Checked sizes and statuses", "Wrote the review"]);
  }
  if (/(review (my )?(product )?(catalog|feed)|catalog review|مراجعة الكتالوج)/.test(m)) {
    const doc = buildFeedDoc(ctx);
    return docPlan(doc, "The catalog review is open in a new tab.", ["Read product statuses", "Matched issues to fixes", "Wrote the review"]);
  }
  if (/(competitor|منافس)/.test(m) && /(analy|تحليل|who)/.test(m)) {
    const doc = buildCompetitorDoc(ctx);
    return docPlan(doc, "The competitor analysis is open in a new tab.", ["Read the Ads Library", "Compared messages", "Wrote the analysis"]);
  }
  if (/(experiment plan|plan (an?|the) (experiment|creative a\/b|a\/b)|a\/b test|خطة تجربة)/.test(m)) {
    const doc = buildExperimentDoc(ctx);
    return docPlan(doc, "The experiment plan is open. Start it from the last section.", ["Picked the campaign", "Designed the test", "Wrote the plan"]);
  }
  return null;
}

export { DOC_TYPES };
