import { describe, expect, it } from "vitest";
import { DocInputError, canApply, changesNothing, parsePlanInput, parseReportInput, planStatus, stepChangeId, stepStates, type StepChangeRow } from "./live-docs";

const pause = { kind: "status.set", entity: "KEYWORD", ids: ["1~2"], status: "PAUSED" };

describe("parsePlanInput", () => {
  it("only lets a Merchant Center step update products", () => {
    const step = (kind: string) => ({ title: "Plan", steps: [{ title: "Fix", target: "merchant", edits: [{ kind, productId: "x" }] }] });
    expect(() => parsePlanInput(step("product.restore"))).toThrow(/only update products/);
    expect(parsePlanInput(step("product.update")).content.steps[0]!.target).toBe("merchant");
  });

  it("numbers the steps and keeps their edits, target and risk", () => {
    const plan = parsePlanInput({
      title: " Cut waste ",
      summary: "Saves money",
      overview: "## Why",
      steps: [
        { title: "Pause keywords", why: "No sales", target: "ads", edits: [pause], risk: "low", expected: "≈ $300 a month" },
        { title: "Fix titles", why: "Limited", target: "merchant", edits: [{ kind: "product.update", productId: "en~US~1", set: { title: "x" } }], risk: "nonsense" },
      ],
    });
    expect(plan.title).toBe("Cut waste");
    expect(plan.content.steps.map((s) => [s.id, s.target, s.risk])).toEqual([
      ["s1", "ads", "low"],
      ["s2", "merchant", "low"],
    ]);
    expect(plan.content.steps[0]!.ops).toEqual([pause]);
  });

  it("refuses a plan without steps, a step without edits and an edit without a kind", () => {
    expect(() => parsePlanInput({ title: "x", steps: [] })).toThrow(DocInputError);
    expect(() => parsePlanInput({ title: "x", steps: [{ title: "Advice only", edits: [] }] })).toThrow(/no edits/);
    expect(() => parsePlanInput({ title: "x", steps: [{ title: "Bad", edits: [{ ids: [] }] }] })).toThrow(/without a kind/);
    expect(() => parsePlanInput({ title: "", steps: [{ title: "a", edits: [pause] }] })).toThrow(/title/);
  });

  it("caps the number of steps", () => {
    const steps = Array.from({ length: 21 }, (_, i) => ({ title: `s${i}`, edits: [pause] }));
    expect(() => parsePlanInput({ title: "x", steps })).toThrow(/At most 20/);
  });
});

describe("parseReportInput", () => {
  it("needs a verdict and ranks findings by severity", () => {
    expect(() => parseReportInput({ title: "x", verdict: [] })).toThrow(/verdict/);
    const r = parseReportInput({
      title: "Audit",
      verdict: ["Fair", "Tracking", "Fix the tag", "extra line"],
      kpis: [{ label: "Cost", value: "$1,200", delta: 0.12 }, { value: "no label" }],
      findings: [
        { title: "Low one", severity: "low", evidence: "e", fix: "f" },
        { title: "High one", severity: "high", evidence: "e", fix: "f" },
      ],
      sections: [{ title: "Spend", blocks: [{ kind: "chart", title: "By campaign", variant: "pie", data: [{ label: "A", value: "12" }, { label: "B", value: "x" }] }] }],
    });
    expect(r.content.verdict).toHaveLength(3);
    expect(r.content.kpis).toEqual([{ label: "Cost", value: "$1,200", delta: 0.12 }]);
    expect(r.content.findings.map((f) => f.title)).toEqual(["High one", "Low one"]);
    expect(r.content.sections[0]!.blocks).toEqual([{ kind: "chart", title: "By campaign", variant: "bar", format: "number", data: [{ label: "A", value: 12 }] }]);
  });

  const report = (blocks: unknown[], title = "Spend") => parseReportInput({ title: "Audit", verdict: ["ok"], sections: [{ title, blocks }] });

  it("never drops a block in silence: the agent is told what to fix", () => {
    expect(() => report([{ kind: "unknown" }])).toThrow(/Section 1 \("Spend"\), block 1: unknown block kind "unknown"/);
    expect(() => report([{ kind: "text", md: "" }])).toThrow(/text block is empty/);
    expect(() => report([{ kind: "table", columns: [], rows: [] }])).toThrow(/no columns/);
    expect(() => report([{ kind: "chart", data: [{ label: "x", value: "n/a" }] }])).toThrow(/no data points/);
    expect(() => report([])).toThrow(/no blocks/);
    expect(() => report([{ kind: "text", md: "x" }], "")).toThrow(/give the section a title/);
  });

  it("keeps an html block the agent wrote, and refuses tags that could leave the report", () => {
    const html = '<div id="c"></div><script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script><script>new Chart(c, {})</script>';
    expect(report([{ kind: "html", title: "Hours", html }]).content.sections[0]!.blocks[0]).toEqual({ kind: "html", title: "Hours", html });
    expect(() => report([{ kind: "html", html: '<meta http-equiv="refresh" content="0;url=https://x.example">' }])).toThrow(/http-equiv/);
    expect(() => report([{ kind: "html", html: '<script src="https://evil.example/x.js"></script>' }])).toThrow(/script from another address/);
    expect(() => report([{ kind: "html", html: '<iframe src="https://x.example"></iframe>' }])).toThrow(/embedded frame/);
    expect(() => report([{ kind: "html", html: '<form action="https://x.example"></form>' }])).toThrow(/form/);
    expect(() => report([{ kind: "html", html: '<link rel="stylesheet" href="https://x.example/a.css">' }])).toThrow(/<link>/);
    expect(() => report([{ kind: "html", html: "x".repeat(200_001) }])).toThrow(/longer than/);
  });
});

describe("changesNothing", () => {
  it("is true only when every shown value stays the same", () => {
    const item = (before: string, after: string) => ({ id: "1", label: "Keyword", changes: [{ field: "Status", before, after }] });
    expect(changesNothing([item("PAUSED", "PAUSED")])).toBe(true);
    expect(changesNothing([item("PAUSED", "PAUSED"), item("ENABLED", "PAUSED")])).toBe(false);
    expect(changesNothing([{ id: "n", label: "Negative", changes: [{ field: "Added", after: "free" }] }])).toBe(false);
    expect(changesNothing([])).toBe(false);
  });
});

describe("step states", () => {
  const doc = "11111111-2222-3333-4444-555555555555";
  const steps = [{ id: "s1" }, { id: "s2" }, { id: "s3" }];
  const row = (stepId: string, attempt: number, status: string, extra: Partial<StepChangeRow> = {}): StepChangeRow => ({
    id: `${stepId}-${attempt}`,
    client_change_id: stepChangeId(doc, stepId, attempt),
    status,
    error: null,
    undone_at: null,
    created_at: "2026-11-04T10:00:00Z",
    undoable: true,
    ...extra,
  });

  it("reads each step from its latest attempt", () => {
    const states = stepStates(doc, steps, [
      row("s1", 1, "failed", { error: "Budget too low" }),
      row("s1", 2, "applied"),
      row("s2", 1, "failed", { error: "Refused" }),
      row("s3", 1, "applied", { undone_at: "2026-11-04T11:00:00Z" }),
      // Another plan's change is ignored.
      { ...row("s1", 3, "failed"), client_change_id: stepChangeId("99999999-2222-3333-4444-555555555555", "s1", 3) },
    ]);
    expect(states.s1).toMatchObject({ status: "applied", attempts: 2, undoable: true });
    expect(states.s2).toMatchObject({ status: "failed", error: "Refused", attempts: 1 });
    expect(states.s3).toMatchObject({ status: "undone" });
    expect(canApply(states.s1)).toBe(false);
    expect(canApply(states.s2)).toBe(true);
    expect(canApply(states.s3)).toBe(true);
  });

  it("derives the plan's status", () => {
    expect(planStatus(steps, stepStates(doc, steps, []))).toBe("draft");
    expect(planStatus(steps, stepStates(doc, steps, [row("s1", 1, "applied")]))).toBe("in_progress");
    expect(planStatus(steps, stepStates(doc, steps, steps.map((s) => row(s.id, 1, "applied"))))).toBe("applied");
    expect(planStatus(steps, stepStates(doc, steps, [row("s1", 1, "applied", { undone_at: "x" })]))).toBe("undone");
  });
});
