// Client-side credit helpers — per-user model
// All credit operations now go through API routes that use getOwnerSubscription

export async function getBalance(workspaceId: string): Promise<{ used: number; total: number; bonus: number; remaining: number }> {
  const res = await fetch(`/api/credits/balance?workspaceId=${workspaceId}`);
  if (!res.ok) return { used: 0, total: 0, bonus: 0, remaining: 0 };
  const data = await res.json();
  return {
    used: data.used ?? 0,
    total: data.total ?? 0,
    bonus: data.bonus ?? 0,
    remaining: data.remaining ?? 0,
  };
}
