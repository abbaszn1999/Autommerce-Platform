// Undo a Google Ads or Merchant Center change approved in a Vera chat, the way the
// card's Undo does (POST /api/store-agent/approvals/{id}/undo), and print the result.
// Usage: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/google-ads-undo-approval.ts <workspace-slug> <approvalId>

import { createAdminClient } from "@/lib/supabase-admin";
import { loadConnection } from "@/lib/google-ads/connection.server";
import { applyLiveChange } from "@/lib/google-ads/live-mutate.server";
import { applyMerchantChange } from "@/lib/google-ads/merchant.server";

async function main() {
  const [slug, approvalId] = process.argv.slice(2);
  if (!slug || !approvalId) throw new Error("usage: <slug> <approvalId>");
  const admin = createAdminClient();
  const { data: ws } = await admin.from("workspaces").select("id").eq("slug", slug).single();
  const { data: change } = await admin.from("google_ads_changes").select("id, target").eq("client_change_id", approvalId).eq("status", "applied").single();
  const { data: approval } = await admin.from("store_agent_approvals").select("decided_by").eq("id", approvalId).single();
  const merchant = change!.target === "merchant";
  const row = (await loadConnection(admin, ws!.id, merchant ? "merchant" : "ads"))!;
  const undo = { admin, row, userId: approval!.decided_by, input: { clientChangeId: `undo:${approvalId}`, undoOf: change!.id } };
  const result = merchant ? await applyMerchantChange(undo) : await applyLiveChange(undo);
  console.log(`undo (${change!.target}):`, JSON.stringify(result));
  if (result.status === "applied") await admin.from("store_agent_approvals").update({ undone_at: new Date().toISOString(), undoable: false }).eq("id", approvalId);
  const again = merchant ? await applyMerchantChange(undo) : await applyLiveChange(undo);
  console.log("pressing Undo again returns the same result:", again.id === result.id);
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.message} ${(err as { detail?: string }).detail ?? ""}` : err);
  process.exit(1);
});
