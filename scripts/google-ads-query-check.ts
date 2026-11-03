// Runs every live GAQL query once against a workspace's connected account, so field
// mistakes show up even when the account has no data, then builds the full snapshot
// the page would show. Prints row counts or Google's error.
// Usage: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/google-ads-query-check.ts <workspace-slug>

import { createAdminClient } from "@/lib/supabase-admin";
import { ConnectionHttpError, loadConnection, searchGaql } from "@/lib/google-ads/connection.server";
import { LIVE_QUERIES } from "@/lib/google-ads/live-queries";
import { loadLiveAccount } from "@/lib/google-ads/live-report.server";
import { accountBase, rangeFor } from "@/lib/google-ads/metrics";

async function main() {
  const slug = process.argv[2];
  if (!slug) throw new Error("Pass a workspace slug.");
  const admin = createAdminClient();
  const { data: ws } = await admin.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws) throw new Error(`No workspace ${slug}`);
  const row = await loadConnection(admin, ws.id, "ads");
  if (!row?.account_id) throw new Error("No Google Ads account picked for this workspace.");

  const range = rangeFor("LAST_30_DAYS");
  let failed = 0;
  for (const [name, build] of Object.entries(LIVE_QUERIES)) {
    try {
      const rows = await searchGaql(row, row.account_id, (build as (s: string, e: string) => string)(range.start, range.end), 1);
      console.log(`ok   ${name}: ${rows.length} rows${rows[0] ? ` e.g. ${JSON.stringify(rows[0]).slice(0, 220)}` : ""}`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${name}: ${err instanceof ConnectionHttpError ? err.detail : (err as Error).message}`);
    }
  }
  if (failed) process.exit(1);

  const started = Date.now();
  const { data } = await loadLiveAccount(row, range, { force: true });
  const total = accountBase(data, range);
  console.log(
    `snapshot in ${Date.now() - started} ms: ${data.account.name} ${data.account.currency}, ${data.campaigns.length} campaigns, ${data.adGroups.length} ad groups, ` +
      `${data.keywords.length} keywords, ${data.ads.length} ads, ${data.searchTerms.length} search terms; ` +
      `${range.start}..${range.end}: ${total.impressions} impressions, ${total.clicks} clicks, cost ${total.cost.toFixed(2)}, ${total.conversions} conversions`
  );
  const cached = Date.now();
  await loadLiveAccount(row, range);
  console.log(`second load (cache) in ${Date.now() - cached} ms`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
