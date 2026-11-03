// Undo a Google Ads change approved in a Vera chat, the way the card's Undo does
// (POST /api/store-agent/approvals/{id}/undo), and print the budget before and after.
// Usage: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/google-ads-undo-approval.ts <workspace-slug> <approvalId> <budgetId>

import { createAdminClient } from "@/lib/supabase-admin";
import { loadConnection, searchGaql } from "@/lib/google-ads/connection.server";
import { applyLiveChange } from "@/lib/google-ads/live-mutate.server";
import type { GaqlRow } from "@/lib/google-ads/live-report";

async function main() {
  const [slug, approvalId, budgetId] = process.argv.slice(2);
  if (!slug || !approvalId || !budgetId) throw new Error("usage: <slug> <approvalId> <budgetId>");
  const admin = createAdminClient();
  const { data: ws } = await admin.from("workspaces").select("id").eq("slug", slug).single();
  const row = (await loadConnection(admin, ws!.id, "ads"))!;
  const budget = async () => Number((await searchGaql<GaqlRow>(row, row.account_id!, `SELECT campaign_budget.amount_micros FROM campaign_budget WHERE campaign_budget.id = ${budgetId}`))[0]!.campaignBudget.amountMicros) / 1e6;
  console.log("budget in Google now:", await budget());
  const { data: change } = await admin.from("google_ads_changes").select("id").eq("client_change_id", approvalId).eq("status", "applied").single();
  const { data: approval } = await admin.from("store_agent_approvals").select("decided_by").eq("id", approvalId).single();
  const result = await applyLiveChange({ admin, row, userId: approval!.decided_by, input: { clientChangeId: `undo:${approvalId}`, undoOf: change!.id } });
  console.log("undo:", JSON.stringify(result));
  if (result.status === "applied") await admin.from("store_agent_approvals").update({ undone_at: new Date().toISOString(), undoable: false }).eq("id", approvalId);
  console.log("budget in Google after undo:", await budget());
  const again = await applyLiveChange({ admin, row, userId: approval!.decided_by, input: { clientChangeId: `undo:${approvalId}`, undoOf: change!.id } });
  console.log("pressing Undo again returns the same result:", again.id === result.id);
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.message} ${(err as { detail?: string }).detail ?? ""}` : err);
  process.exit(1);
});
