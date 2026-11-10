/**
 * What a run costs, and how much of an owner's balance runs in progress are
 * already using. Runs are charged when they end, so without the second part two
 * chats could each spend the whole balance.
 */

export type RunCost = { usd: number; source: "billed" | "estimated" | "none" };

export function settledCost(input: {
  status: string;
  /** Dollars Cursor charged for this run, when it reports that for this account. */
  billedUsd?: number;
  /** Paid work Cursor's figure for this agent does not include (the chat title, a separate agent). */
  outsideAgentUsd: number;
  /** Priced from the token counts of the run, with images and the like included. */
  reportedUsd: number;
  /** The running estimate of the whole run. */
  runningEstimateUsd: number;
  /** The last send to the model reported its token counts. */
  lastSendReported: boolean;
  /** The model wrote something or called a tool. */
  didWork: boolean;
}): RunCost {
  if (input.billedUsd !== undefined && input.billedUsd > 0) return { usd: input.billedUsd + input.outsideAgentUsd, source: "billed" };
  // A run cut short may never report its last send, though Cursor billed the work done in it.
  const unreported = input.status !== "finished" && !input.lastSendReported && input.didWork;
  const usd = unreported ? Math.max(input.reportedUsd, input.runningEstimateUsd) : input.reportedUsd;
  return { usd, source: usd > 0 ? "estimated" : "none" };
}

/**
 * Running runs save their estimate every 30 seconds. During a deploy the new
 * process starts while the old one is still working, so a run is only treated
 * as abandoned once it has stopped saving.
 */
export const ABANDONED_AFTER_MS = 90_000;

export function isAbandoned(row: { estimate_saved_at?: string | null; started_at?: string | null }, now: number): boolean {
  const last = Date.parse(row.estimate_saved_at ?? row.started_at ?? "");
  return !Number.isFinite(last) || now - last >= ABANDONED_AFTER_MS;
}

type OwnerHolds = { runs: Map<string, number>; settled: number };
const holds = new Map<string, OwnerHolds>();

const ownerHolds = (owner: string) => {
  let entry = holds.get(owner);
  if (!entry) holds.set(owner, (entry = { runs: new Map(), settled: 0 }));
  return entry;
};

/** A run starts: returns the point to count other runs' finished charges from. */
export function startHold(owner: string, runId: string): number {
  const entry = ownerHolds(owner);
  entry.runs.set(runId, 0);
  return entry.settled;
}

/** Records this run's cost so far; returns the credits other runs used since this one started. */
export function updateHold(owner: string, runId: string, base: number, credits: number): number {
  const entry = ownerHolds(owner);
  entry.runs.set(runId, credits);
  let others = entry.settled - base;
  for (const [id, held] of entry.runs) if (id !== runId) others += held;
  return others;
}

/** A run ended and was charged. */
export function finishHold(owner: string, runId: string, charged: number): void {
  const entry = ownerHolds(owner);
  entry.runs.delete(runId);
  entry.settled += charged;
}
