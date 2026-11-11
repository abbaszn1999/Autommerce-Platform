import { describe, expect, it, vi } from "vitest";
import { chargeRun } from "../../src/store-agent/billing/charge";

/** A database with the credits ledger rows already taken for the run, and the deduct function. */
function fakeDb(earlier: number[], rpc = vi.fn(async () => ({ data: { success: true, remaining: 5 }, error: null }))) {
  const query = { select: () => query, eq: () => query, then: (ok: (v: unknown) => unknown) => ok({ data: earlier.map((c) => ({ credits_used: c })), error: null }) };
  return { db: { from: () => query, rpc } as never, rpc };
}
const params = { ownerUserId: "o", workspaceId: "w", actorUserId: "a", runId: "r1", credits: 2, details: {} };

describe("chargeRun", () => {
  it("charges a run once", async () => {
    const { db, rpc } = fakeDb([]);
    expect(await chargeRun(db, params)).toMatchObject({ charged: 2, duplicate: false });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("never charges again a run already charged in part, and reports what was really taken", async () => {
    const { db, rpc } = fakeDb([0.7]);
    expect(await chargeRun(db, params)).toEqual({ charged: 0.7, duplicate: true });
    expect(rpc).not.toHaveBeenCalled();
  });
});
