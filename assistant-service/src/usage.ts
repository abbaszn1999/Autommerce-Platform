import type { SDKAgent } from "@cursor/sdk";

/** Cents Cursor reported for a run: what it charged, or the raw model cost when the plan covered it (charged is 0 then). */
export function billedCents(cost: { chargedCents: number; rawCostCents: number } | undefined): number | undefined {
  if (!cost) return undefined;
  return cost.chargedCents > 0 ? cost.chargedCents : cost.rawCostCents;
}

/** Billed usage for local agents is enabled per account; while Cursor says it is unavailable, stop asking for an hour. */
let billedUsageUnavailableUntil = 0;

/** The agent's total billed cents so far, or undefined when Cursor does not report billed usage. */
export async function readBilledCents(agent: SDKAgent): Promise<number | undefined> {
  if (Date.now() < billedUsageUnavailableUntil) return undefined;
  try {
    const usage = await agent.getUsage();
    return usage.cost ? (billedCents(usage.cost) ?? 0) : 0;
  } catch (error) {
    if ((error as { code?: string }).code === "feature_unavailable") billedUsageUnavailableUntil = Date.now() + 60 * 60 * 1000;
    return undefined;
  }
}

/** Billed cost settles shortly after a run ends, so poll briefly until the total moves. */
export async function waitForBilledCents(agent: SDKAgent, before: number): Promise<number | undefined> {
  let latest: number | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    latest = await readBilledCents(agent);
    if (latest === undefined || latest > before) return latest;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return latest;
}
