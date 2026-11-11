import { describe, expect, it } from "vitest";
import { buildLiveAccount, LIST_LIMITS, type LiveRows } from "./live-report";
import { LivePlanError, planLiveChange, type BeforeState } from "./live-mutate";
import { FILL_HEIGHT, REPORT_CSP, STORE_POLICY, STORE_REPORT_CSP, reportDocument, sandboxedReport } from "./report-sandbox";

const range = { preset: "CUSTOM" as const, start: "2026-10-01", end: "2026-10-31" };
const account = { customerId: "1", name: "Big", currency: "USD", timeZone: "", isManager: false, optimizationScore: 0, autoTagging: true };

describe("a big account", () => {
  const K = LIST_LIMITS.keywords + 50;
  const rows: LiveRows = {
    customer: [],
    campaigns: [{ campaign: { id: "10", name: "C", status: "ENABLED", advertisingChannelType: "SEARCH", biddingStrategyType: "MANUAL_CPC" } }],
    budgets: [],
    campaignDaily: [{ campaign: { id: "10" }, segments: { date: "2026-10-05" }, metrics: { costMicros: "999000000" } }],
    adGroups: [{ adGroup: { id: "20", name: "G", status: "ENABLED", type: "SEARCH_STANDARD" }, campaign: { id: "10" } }],
    adGroupMetrics: [],
    keywords: Array.from({ length: K }, (_, i) => ({ adGroup: { id: "20" }, adGroupCriterion: { criterionId: String(1000 + i), status: "ENABLED", keyword: { text: `kw ${i}`, matchType: "PHRASE" } } })),
    // Only the last 10 keywords spent anything: they must be among those kept.
    keywordMetrics: Array.from({ length: 10 }, (_, j) => ({ adGroup: { id: "20" }, adGroupCriterion: { criterionId: String(1000 + K - 1 - j) }, metrics: { costMicros: String((j + 1) * 1_000_000) } })),
    campaignNegatives: [],
    ads: [],
    adMetrics: [],
    searchTerms: [],
  };

  it("sends the keywords that spent the most, says how many there are, and keeps totals whole", () => {
    const data = buildLiveAccount(account, rows, range);
    expect(data.keywords).toHaveLength(LIST_LIMITS.keywords);
    expect(data.listsCapped).toEqual({ keywords: { shown: LIST_LIMITS.keywords, total: K } });
    const kept = new Set(data.keywords.map((k) => k.id));
    for (let j = 0; j < 10; j++) expect(kept.has(`20~${1000 + K - 1 - j}`)).toBe(true);
    expect(data.daily["10"]![0]!.cost).toBe(999);
    // Numbers of dropped keywords don't travel either.
    expect(Object.keys(data.exact!.byId).every((id) => !id.startsWith("20~") || kept.has(id))).toBe(true);
  });

  it("changes nothing for an account that fits", () => {
    const data = buildLiveAccount(account, { ...rows, keywords: rows.keywords.slice(0, 5) }, range);
    expect(data.listsCapped).toBeUndefined();
    expect(data.keywords).toHaveLength(5);
  });
});

describe("the monthly budget cap is required to spend more", () => {
  const before = (extra: Partial<BeforeState> = {}): BeforeState => ({
    billableUnitMicros: 10_000,
    campaigns: { "10": { name: "C", status: "PAUSED", budgetId: "5", biddingType: "MANUAL_CPC" } },
    budgets: { "5": { amount: 20, shared: false } },
    adGroups: {},
    criteria: {},
    ads: {},
    campaignNegatives: {},
    createdKeywordIds: new Set(),
    capMissing: true,
    ...extra,
  });
  const plan = (ops: unknown[], undo = false) => planLiveChange("1234567890", ops as never, before(), { undo });

  it("refuses a budget raise or turning a campaign on without a cap", () => {
    expect(() => plan([{ kind: "budget.update", budgetId: "5", amount: 30 }])).toThrow(/no monthly budget cap/);
    expect(() => plan([{ kind: "status.set", entity: "CAMPAIGN", ids: ["10"], status: "ENABLED" }])).toThrow(LivePlanError);
  });

  it("still allows what spends less, and every undo", () => {
    expect(plan([{ kind: "budget.update", budgetId: "5", amount: 10 }]).operations).toHaveLength(1);
    expect(plan([{ kind: "status.set", entity: "CAMPAIGN", ids: ["10"], status: "PAUSED" }]).operations).toHaveLength(1);
    expect(plan([{ kind: "budget.update", budgetId: "5", amount: 30 }], true).operations).toHaveLength(1);
  });
});

describe("report frames", () => {
  it("give a page that fills its window a comfortable height", () => {
    expect(reportDocument("<p>x</p>", false)).toContain(`innerHeight<${FILL_HEIGHT}?${FILL_HEIGHT}:innerHeight`);
  });
});

describe("store report frames", () => {
  it("let charts, fonts and images load but block every way to send data", () => {
    for (const rule of ["connect-src 'none'", "frame-src 'none'", "form-action 'none'", "worker-src 'none'"]) expect(STORE_REPORT_CSP).toContain(rule);
    expect(STORE_REPORT_CSP).toContain("https://cdnjs.cloudflare.com");
    expect(STORE_REPORT_CSP).toContain("img-src https:");
    const doc = sandboxedReport("<html><body>x</body></html>", false, STORE_POLICY);
    expect(doc.split(STORE_REPORT_CSP.replace(/'/g, "'")).length).toBeGreaterThan(1);
  });

  it("leave Google Ads reports as strict as before", () => {
    expect(reportDocument("<p>x</p>", false)).toContain(REPORT_CSP);
    expect(sandboxedReport("<p>x</p>", false)).not.toContain("unpkg");
  });
});
