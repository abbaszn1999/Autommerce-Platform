/** Most extra workspaces the platform admin may grant one customer. */
export const MAX_EXTRA_WORKSPACES = 100;

/** Extra workspaces granted on top of the plan, from a subscription row (0 when unset or invalid). */
export function extraWorkspacesOf(subscription: { extra_workspaces?: unknown } | null | undefined): number {
  const value = Number(subscription?.extra_workspaces ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), MAX_EXTRA_WORKSPACES) : 0;
}

/**
 * Workspaces a customer may own: the plan's limit plus what the admin granted them.
 * A plan without a limit (null) stays unlimited.
 */
export function workspaceAllowance(planMax: number | null | undefined, extra: number): number | null {
  if (planMax == null) return null;
  return planMax + extra;
}
