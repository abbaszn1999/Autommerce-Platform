// Runs the connection code paths for one workspace without the browser:
// lists the accounts the Google sign-in reaches, then (with --select <id>) saves the pick.
// Usage: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/google-ads-connection-check.ts <workspace-slug> [--select <id>]

import { createAdminClient } from "@/lib/supabase-admin";
import { listAdsAccounts, listMerchantAccounts, loadConnections, selectAccount, toClientConnection } from "@/lib/google-ads/connection.server";

async function main() {
  const [slug, flag, pick] = process.argv.slice(2);
  if (!slug) throw new Error("Pass a workspace slug.");
  const admin = createAdminClient();
  const { data: ws } = await admin.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws) throw new Error(`No workspace ${slug}`);

  const rows = await loadConnections(admin, ws.id);
  console.log("ads:", toClientConnection(rows.ads));
  console.log("merchant:", toClientConnection(rows.merchant));

  if (rows.ads?.composio_connected_account_id) {
    const accounts = await listAdsAccounts(rows.ads);
    for (const a of accounts) console.log(`  ads ${a.customerId} ${a.usable ? "usable" : "not active"} ${a.name} ${a.currency} ${a.timeZone}`);
    if (flag === "--select" && pick) {
      const a = accounts.find((x) => x.customerId === pick && x.usable && !x.isManager);
      if (!a) throw new Error(`${pick} is not a usable account for this sign-in`);
      await selectAccount(admin, rows.ads, { id: a.customerId, name: a.name, currency: a.currency, timeZone: a.timeZone });
      console.log("selected:", toClientConnection((await loadConnections(admin, ws.id)).ads));
    }
  }
  if (rows.merchant?.composio_connected_account_id)
    for (const m of await listMerchantAccounts(rows.merchant)) console.log(`  merchant ${m.merchantId} ${m.name} ${m.website}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
