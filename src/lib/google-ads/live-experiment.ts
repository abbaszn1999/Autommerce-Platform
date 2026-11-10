// Experiments on a live account: a share of a campaign's traffic tries one
// change (a new target CPA or ROAS) against the rest. Pure checks and card
// lines; the server runs Google's steps (live-experiment.server.ts).
//
// An experiment spends no extra money: the trial shares the campaign's budget.
// It is its own change (never mixed with other edits) and can't be part of a plan.

import type { BeforeState } from "./live-mutate";

export type ExperimentOp =
  | { kind: "experiment.new"; campaignId: string; name: string; split?: number; days?: number; startDate?: string; change: { targetCpa?: number; targetRoas?: number } }
  | { kind: "experiment.end"; experimentId: string };

export const EXPERIMENT_OPS = ["experiment.new", "experiment.end"] as const;

export const isExperimentOp = (op: { kind: string }): op is ExperimentOp => (EXPERIMENT_OPS as readonly string[]).includes(op.kind);

export class ExperimentPlanError extends Error {}

const ID = /^\d{1,20}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const fail = (m: string): never => {
  throw new ExperimentPlanError(m);
};

export type ExperimentPlan = {
  kind: "new";
  campaignId: string;
  type: "SEARCH_CUSTOM" | "DISPLAY_CUSTOM";
  name: string;
  split: number;
  startDate: string;
  endDate: string;
  /** Fields to set on the trial's copy of the campaign, and their update mask. */
  trial: { fields: Record<string, unknown>; mask: string };
  description: string;
} | { kind: "end"; experimentId: string };

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Checks an experiment change against the campaign as Google has it now. */
export function planExperiment(ops: { kind: string }[], before: BeforeState, campaignTypes: Record<string, string>, today: string, toMicros: (n: number) => string): ExperimentPlan {
  if (ops.length !== 1) fail("An experiment is its own change: propose it alone, without other edits.");
  const op = ops[0] as ExperimentOp;
  if (op.kind === "experiment.end") {
    if (!ID.test(String(op.experimentId))) fail("experimentId is the experiment's number.");
    return { kind: "end", experimentId: String(op.experimentId) };
  }
  const c = ID.test(op.campaignId) ? before.campaigns[op.campaignId] : undefined;
  if (!c) fail(`Campaign ${op.campaignId} isn't in this account.`);
  const channel = campaignTypes[op.campaignId];
  const type = channel === "SEARCH" ? "SEARCH_CUSTOM" : channel === "DISPLAY" ? "DISPLAY_CUSTOM" : fail("Google's API runs custom experiments on Search and Display campaigns only.");
  const name = typeof op.name === "string" ? op.name.trim() : "";
  if (!name || name.length > 1024) fail("Give the experiment a name.");
  const split = op.split ?? 50;
  if (!Number.isInteger(split) || split < 10 || split > 90) fail("split is the trial's share of traffic, 10 to 90 (%).");
  const days = op.days ?? 28;
  if (!Number.isInteger(days) || days < 14 || days > 84) fail("Run an experiment for 14 to 84 days; results need at least two weeks.");
  const startDate = op.startDate ?? addDays(today, 1);
  if (!DAY.test(startDate) || startDate <= today) fail("startDate is a future date, YYYY-MM-DD (Google needs at least a day to set it up).");

  const { targetCpa, targetRoas } = op.change ?? {};
  if ((targetCpa === undefined) === (targetRoas === undefined)) fail("The trial changes one thing: a new targetCpa or a new targetRoas.");
  const fields: Record<string, unknown> = {};
  let mask = "";
  let description = "";
  if (targetCpa !== undefined) {
    if (typeof targetCpa !== "number" || !(targetCpa > 0)) fail("targetCpa must be a positive amount.");
    const field = c!.biddingType === "TARGET_CPA" ? "targetCpa" : c!.biddingType === "MAXIMIZE_CONVERSIONS" ? "maximizeConversions" : fail("This campaign's bid strategy has no target CPA.");
    fields[field] = { targetCpaMicros: toMicros(targetCpa!) };
    mask = `${field === "targetCpa" ? "target_cpa" : "maximize_conversions"}.target_cpa_micros`;
    description = `Target CPA ${c!.targetCpa ?? "not set"} → ${targetCpa}`;
  } else {
    if (typeof targetRoas !== "number" || targetRoas < 0.01 || targetRoas > 1000) fail("targetRoas is a ratio, e.g. 4.5 for 450%.");
    const field = c!.biddingType === "TARGET_ROAS" ? "targetRoas" : c!.biddingType === "MAXIMIZE_CONVERSION_VALUE" ? "maximizeConversionValue" : fail("This campaign's bid strategy has no target ROAS.");
    fields[field] = { targetRoas };
    mask = `${field === "targetRoas" ? "target_roas" : "maximize_conversion_value"}.target_roas`;
    description = `Target ROAS ${c!.targetRoas != null ? `${Math.round(c!.targetRoas * 100)}%` : "not set"} → ${Math.round(targetRoas! * 100)}%`;
  }
  return { kind: "new", campaignId: op.campaignId, type, name, split, startDate, endDate: addDays(startDate, days - 1), trial: { fields, mask }, description };
}

export function describeExperiment(plan: ExperimentPlan, before: BeforeState) {
  if (plan.kind === "end")
    return [{ id: `end-${plan.experimentId}`, label: `End experiment ${plan.experimentId}`, changes: [{ field: "Status", before: "running", after: "ended now (the trial stops; the original campaign keeps all traffic)" }] }];
  const campaign = before.campaigns[plan.campaignId]?.name ?? plan.campaignId;
  return [
    {
      id: `exp-${plan.campaignId}`,
      label: `New experiment · ${plan.name} (${campaign})`,
      changes: [
        { field: "Trial change", after: plan.description },
        { field: "Traffic", after: `${plan.split}% trial · ${100 - plan.split}% original` },
        { field: "Dates", after: `${plan.startDate} → ${plan.endDate}` },
        { field: "Budget", after: "No extra spend: the trial shares the campaign's budget" },
      ],
    },
  ];
}
