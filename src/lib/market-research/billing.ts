"use client";

/**
 * Client helpers kept for Market Research receipts. Charges themselves run
 * inside the API routes so Apify cannot start without a successful hold.
 */

export async function previewBalance(workspaceId: string): Promise<number> {
  if (!workspaceId) return 0;
  const response = await fetch(
    `/api/wallet?workspaceId=${encodeURIComponent(workspaceId)}`
  );
  if (!response.ok) return 0;
  const data = (await response.json().catch(() => ({}))) as {
    wallet?: { balance?: number };
  };
  return Number(data.wallet?.balance ?? 0);
}
