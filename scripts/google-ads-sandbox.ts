// Creates a fully PAUSED test campaign (budget, campaign, ad group, keyword, ad) in a
// workspace's connected Google Ads account, so live edits can be tested without spend.
// Validates first; pass --apply to create it. Never enables anything.
// Usage: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/google-ads-sandbox.ts <workspace-slug> [--apply]

import { createAdminClient } from "@/lib/supabase-admin";
import { ConnectionHttpError, batchMutate, loadConnection, searchGaql } from "@/lib/google-ads/connection.server";

const NAME = "Autommerce API test – do not enable";

async function main() {
  const [slug, flag] = process.argv.slice(2);
  if (!slug) throw new Error("Pass a workspace slug.");
  const admin = createAdminClient();
  const { data: ws } = await admin.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws) throw new Error(`No workspace ${slug}`);
  const row = await loadConnection(admin, ws.id, "ads");
  const cid = row?.account_id;
  if (!row || !cid) throw new Error("No Google Ads account picked for this workspace.");

  const existing = await searchGaql(row, cid, `SELECT campaign.id, campaign.status FROM campaign WHERE campaign.name = '${NAME}' AND campaign.status != 'REMOVED'`);
  if (existing.length) {
    console.log("Test campaign already exists:", JSON.stringify(existing));
    return;
  }

  const r = (kind: string, id: number) => `customers/${cid}/${kind}/${id}`;
  const operations = [
    { campaign_budget_operation: { create: { resourceName: r("campaignBudgets", -1), name: `${NAME} budget`, amountMicros: "1000000", deliveryMethod: "STANDARD", explicitlyShared: false } } },
    {
      campaign_operation: {
        create: {
          resourceName: r("campaigns", -2),
          name: NAME,
          status: "PAUSED",
          advertisingChannelType: "SEARCH",
          campaignBudget: r("campaignBudgets", -1),
          manualCpc: {},
          networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        },
      },
    },
    { ad_group_operation: { create: { resourceName: r("adGroups", -3), name: "Test ad group", campaign: r("campaigns", -2), status: "PAUSED", type: "SEARCH_STANDARD", cpcBidMicros: "100000" } } },
    { ad_group_criterion_operation: { create: { adGroup: r("adGroups", -3), status: "PAUSED", keyword: { text: "autommerce api test", matchType: "EXACT" }, cpcBidMicros: "100000" } } },
    { ad_group_criterion_operation: { create: { adGroup: r("adGroups", -3), negative: true, keyword: { text: "free", matchType: "BROAD" } } } },
    {
      ad_group_ad_operation: {
        create: {
          adGroup: r("adGroups", -3),
          status: "PAUSED",
          ad: {
            finalUrls: ["https://autommerce.com"],
            responsiveSearchAd: {
              headlines: [{ text: "Autommerce API Test" }, { text: "Catalog Operations" }, { text: "Test Ad Do Not Run" }],
              descriptions: [{ text: "Internal API test ad. It is paused and never runs." }, { text: "Created by Autommerce to test changes safely." }],
            },
          },
        },
      },
    },
  ];

  const check = await batchMutate(row, cid, operations, { validateOnly: true });
  console.log("validate_only:", JSON.stringify(check).slice(0, 400));
  if (flag !== "--apply") return;
  const done = await batchMutate(row, cid, operations, { validateOnly: false });
  console.log("created:", JSON.stringify(done).slice(0, 1200));
}

main().catch((err) => {
  console.error(err instanceof ConnectionHttpError ? `${err.message}: ${err.detail}` : err instanceof Error ? err.message : err);
  process.exit(1);
});
