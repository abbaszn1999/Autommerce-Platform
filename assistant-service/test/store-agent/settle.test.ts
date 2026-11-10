import { describe, expect, it } from "vitest";
import { ABANDONED_AFTER_MS, finishHold, isAbandoned, settledCost, startHold, updateHold } from "../../src/store-agent/billing/settle";

const base = { status: "finished", outsideAgentUsd: 0, reportedUsd: 0.5, runningEstimateUsd: 0.8, lastSendReported: true, didWork: true };

describe("settledCost", () => {
  it("charges what Cursor billed when it reports it, plus work outside the agent", () => {
    expect(settledCost({ ...base, billedUsd: 4, outsideAgentUsd: 0.01 })).toEqual({ usd: 4.01, source: "billed" });
  });

  it("falls back to the token counts when Cursor does not report a cost", () => {
    expect(settledCost(base)).toEqual({ usd: 0.5, source: "estimated" });
    expect(settledCost({ ...base, billedUsd: 0 })).toEqual({ usd: 0.5, source: "estimated" });
  });

  it("bills a stopped, failed or interrupted run whose last send never reported", () => {
    for (const status of ["cancelled", "error", "interrupted"]) {
      expect(settledCost({ ...base, status, lastSendReported: false, reportedUsd: 0 })).toEqual({ usd: 0.8, source: "estimated" });
    }
  });

  it("keeps earlier sends when only the last one went unreported", () => {
    expect(settledCost({ ...base, status: "cancelled", lastSendReported: false, reportedUsd: 1.2 }).usd).toBe(1.2);
  });

  it("uses the exact count when a stopped run did report", () => {
    expect(settledCost({ ...base, status: "cancelled" }).usd).toBe(0.5);
  });

  it("charges nothing when no work was done", () => {
    expect(settledCost({ ...base, status: "error", lastSendReported: false, reportedUsd: 0, runningEstimateUsd: 0, didWork: false })).toEqual({ usd: 0, source: "none" });
  });
});

describe("isAbandoned", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("leaves alone a run another process is still saving", () => {
    expect(isAbandoned({ estimate_saved_at: ago(30_000), started_at: ago(600_000) }, now)).toBe(false);
  });

  it("treats a run that stopped saving as abandoned", () => {
    expect(isAbandoned({ estimate_saved_at: ago(ABANDONED_AFTER_MS), started_at: ago(600_000) }, now)).toBe(true);
  });

  it("gives a run that has not saved yet time from its start", () => {
    expect(isAbandoned({ estimate_saved_at: null, started_at: ago(5_000) }, now)).toBe(false);
    expect(isAbandoned({ estimate_saved_at: null, started_at: ago(ABANDONED_AFTER_MS + 1) }, now)).toBe(true);
  });

  it("treats a row without dates as abandoned", () => {
    expect(isAbandoned({}, now)).toBe(true);
  });
});

describe("balance holds", () => {
  it("counts runs in progress and runs that ended since this one started", () => {
    const a = startHold("owner", "a");
    const b = startHold("owner", "b");
    expect(updateHold("owner", "a", a, 3)).toBe(0);
    expect(updateHold("owner", "b", b, 2)).toBe(3);
    finishHold("owner", "a", 5);
    expect(updateHold("owner", "b", b, 2)).toBe(5);
    const c = startHold("owner", "c");
    expect(updateHold("owner", "c", c, 1)).toBe(2);
    finishHold("owner", "b", 2);
    finishHold("owner", "c", 1);
  });

  it("keeps owners apart", () => {
    const x = startHold("x", "r1");
    startHold("y", "r2");
    updateHold("y", "r2", 0, 9);
    expect(updateHold("x", "r1", x, 1)).toBe(0);
    finishHold("x", "r1", 1);
    finishHold("y", "r2", 9);
  });
});
