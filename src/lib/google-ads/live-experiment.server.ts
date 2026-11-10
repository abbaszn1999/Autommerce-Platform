// Runs Google's steps for an experiment: create it, create its two arms, set the
// change on the trial's copy of the campaign, schedule it. A step that fails
// removes what the earlier steps made, so no half-built experiment is left.

import { batchMutate, execute, type ConnectionRow } from "./connection.server";
import type { ExperimentPlan } from "./live-experiment";

type Created = { resource_name?: string; resourceName?: string; results?: { resource_name?: string; resourceName?: string; in_design_campaigns?: string[]; inDesignCampaigns?: string[]; experiment_arm?: Record<string, unknown>; experimentArm?: Record<string, unknown> }[] } & Record<string, unknown>;

const nameOf = (r: { resource_name?: string; resourceName?: string } | undefined) => r?.resource_name ?? r?.resourceName;

/** Only the first step can be checked by Google without making anything: the arms need the experiment to exist. */
export async function validateExperiment(row: ConnectionRow, customerId: string, plan: ExperimentPlan): Promise<void> {
  if (plan.kind === "end") {
    await execute(row, "GOOGLEADS_END_EXPERIMENT", { customer_id: customerId, experiment: `customers/${customerId}/experiments/${plan.experimentId}`, validate_only: true });
    return;
  }
  await execute(row, "GOOGLEADS_CREATE_EXPERIMENT", { customer_id: customerId, validate_only: true, experiment: experimentBody(plan) });
}

function experimentBody(plan: Extract<ExperimentPlan, { kind: "new" }>) {
  return { name: plan.name, type: plan.type, status: "SETUP", suffix: "[trial]", start_date: plan.startDate, end_date: plan.endDate, description: plan.description.slice(0, 2048) };
}

/** Returns the undo for what was done. */
export async function runExperiment(row: ConnectionRow, customerId: string, plan: ExperimentPlan): Promise<{ inverse: { kind: "experiment.end"; experimentId: string }[]; created: string[] }> {
  if (plan.kind === "end") {
    await execute(row, "GOOGLEADS_END_EXPERIMENT", { customer_id: customerId, experiment: `customers/${customerId}/experiments/${plan.experimentId}` });
    return { inverse: [], created: [] };
  }
  const made = await execute<Created>(row, "GOOGLEADS_CREATE_EXPERIMENT", { customer_id: customerId, experiment: experimentBody(plan) });
  const experiment = nameOf(made) ?? nameOf(made.results?.[0]);
  if (!experiment) throw new Error("Google didn't return the new experiment.");
  try {
    const arms = await execute<Created>(row, "GOOGLEADS_CREATE_EXPERIMENT_ARMS", {
      customer_id: customerId,
      response_content_type: "MUTABLE_RESOURCE",
      experiment_arms: [
        { experiment, name: "Original", control: true, traffic_split: 100 - plan.split, campaigns: [`customers/${customerId}/campaigns/${plan.campaignId}`] },
        { experiment, name: "Trial", control: false, traffic_split: plan.split },
      ],
    });
    const trialArm = (arms.results ?? []).map((r) => r.experiment_arm ?? r.experimentArm ?? r).find((a) => (a as { control?: boolean }).control === false) as { in_design_campaigns?: string[]; inDesignCampaigns?: string[] } | undefined;
    const draft = trialArm?.in_design_campaigns?.[0] ?? trialArm?.inDesignCampaigns?.[0];
    if (!draft) throw new Error("Google didn't return the trial's campaign.");
    await batchMutate(row, customerId, [{ campaign_operation: { update: { resourceName: draft, ...plan.trial.fields }, updateMask: plan.trial.mask } }], { validateOnly: false });
    await execute(row, "GOOGLEADS_SCHEDULE_EXPERIMENT", { customer_id: customerId, resource_name: experiment });
  } catch (err) {
    // Nothing half-built stays behind: an experiment that never started can be removed.
    await batchMutate(row, customerId, [{ experiment_operation: { remove: experiment } }], { validateOnly: false }).catch(() => undefined);
    throw err;
  }
  const experimentId = experiment.split("/").pop()!;
  return { inverse: [{ kind: "experiment.end", experimentId }], created: [experiment] };
}
