import type { SDKAgent } from "@cursor/sdk";
import { describe, expect, it } from "vitest";
import { billedCents, readBilledCents } from "../src/usage";

describe("billed cost", () => {
  it("uses what Cursor charged, or the raw model cost when the plan covered it", () => {
    expect(billedCents(undefined)).toBeUndefined();
    expect(billedCents({ chargedCents: 0, rawCostCents: 12 })).toBe(12);
    expect(billedCents({ chargedCents: 9, rawCostCents: 12 })).toBe(9);
  });

  it("reads an agent's billed total, and says unknown when Cursor does not report it", async () => {
    const reports = { getUsage: async () => ({ cost: { chargedCents: 5, rawCostCents: 7 } }) } as unknown as SDKAgent;
    expect(await readBilledCents(reports)).toBe(5);
    const fails = {
      getUsage: async () => {
        throw new Error("boom");
      },
    } as unknown as SDKAgent;
    expect(await readBilledCents(fails)).toBeUndefined();
  });
});
