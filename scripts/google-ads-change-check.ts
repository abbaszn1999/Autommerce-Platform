// End-to-end check of live changes on the PAUSED test campaign made by google-ads-sandbox.ts:
// each change is applied through the real server code, read back from Google, undone, and
// read back again. Also checks the safety refusals. Never enables a campaign or ad group.
// Usage: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/google-ads-change-check.ts <workspace-slug>

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase-admin";
import { loadConnection, searchGaql, type ConnectionRow } from "@/lib/google-ads/connection.server";
import { applyLiveChange, type LiveChangeResult } from "@/lib/google-ads/live-mutate.server";
import type { GaqlRow } from "@/lib/google-ads/live-report";
import type { MutateOp } from "@/lib/google-ads/types";

const TEST = "Autommerce API test – do not enable";
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const slug = process.argv[2];
  if (!slug) throw new Error("Pass a workspace slug.");
  const admin = createAdminClient();
  const { data: ws } = await admin.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws) throw new Error(`No workspace ${slug}`);
  const row = (await loadConnection(admin, ws.id, "ads")) as ConnectionRow;
  const cid = row.account_id!;
  const { data: owner } = await admin.from("workspace_members").select("user_id").eq("workspace_id", ws.id).eq("role", "owner").limit(1).single();
  const q = (query: string) => searchGaql<GaqlRow>(row, cid, query);

  const [camp] = await q(`SELECT campaign.id, campaign.status, campaign.campaign_budget FROM campaign WHERE campaign.name = '${TEST}' AND campaign.status != 'REMOVED'`);
  if (!camp) throw new Error("Run scripts/google-ads-sandbox.ts --apply first.");
  const campaignId = String(camp.campaign.id);
  if (camp.campaign.status !== "PAUSED") throw new Error("The test campaign is not paused. Stopping.");
  const budgetId = String(camp.campaign.campaignBudget).split("/").pop()!;
  const [group] = await q(`SELECT ad_group.id FROM ad_group WHERE campaign.id = ${campaignId}`);
  const adGroupId = String(group!.adGroup.id);
  const crit = await q(`SELECT ad_group_criterion.criterion_id, ad_group_criterion.negative, ad_group_criterion.keyword.text FROM ad_group_criterion WHERE ad_group.id = ${adGroupId} AND ad_group_criterion.status != 'REMOVED'`);
  const keywordId = `${adGroupId}~${crit.find((c) => !c.adGroupCriterion.negative && c.adGroupCriterion.keyword.text === "autommerce api test")!.adGroupCriterion.criterionId}`;
  const negativeId = `${adGroupId}~${crit.find((c) => c.adGroupCriterion.negative)!.adGroupCriterion.criterionId}`;

  const run = (ops: MutateOp[], title: string, id = randomUUID()) =>
    applyLiveChange({ admin, row, userId: owner!.user_id, input: { clientChangeId: id, title, source: "USER", ops } });
  const undo = (change: LiveChangeResult) => applyLiveChange({ admin, row, userId: owner!.user_id, input: { clientChangeId: randomUUID(), undoOf: change.id } });
  const budget = async () => Number((await q(`SELECT campaign_budget.amount_micros FROM campaign_budget WHERE campaign_budget.id = ${budgetId}`))[0]!.campaignBudget.amountMicros) / 1e6;
  const keyword = async () => (await q(`SELECT ad_group_criterion.status FROM ad_group_criterion WHERE ad_group.id = ${adGroupId} AND ad_group_criterion.criterion_id = ${keywordId.split("~")[1]}`))[0]!.adGroupCriterion.status;
  const campaignName = async () => (await q(`SELECT campaign.name FROM campaign WHERE campaign.id = ${campaignId}`))[0]!.campaign.name;
  const groupBid = async () => Number((await q(`SELECT ad_group.cpc_bid_micros FROM ad_group WHERE ad_group.id = ${adGroupId}`))[0]!.adGroup.cpcBidMicros) / 1e6;

  // 1. Budget: change, verify in Google, undo, verify.
  const b0 = await budget();
  const b = await run([{ kind: "budget.update", budgetId, amount: b0 * 2 }], "Double the test budget");
  check("budget change applied", b.status === "applied", b.status === "failed" ? b.error : "");
  check("Google shows the new budget", (await budget()) === b0 * 2, `${await budget()}`);
  const bu = await undo(b);
  check("budget undo applied", bu.status === "applied", bu.status === "failed" ? bu.error : "");
  check("Google shows the old budget again", (await budget()) === b0);
  const twice = await undo(b).then(
    () => "ran",
    (err: Error) => err.message
  );
  check("a second undo of the same change is refused", twice === "cannot_undo", twice);
  check("budget still the old value after the refused undo", (await budget()) === b0);

  // 2. Safety: big raises, removals, enabling ids from another account, immutable match type.
  const big = await run([{ kind: "budget.update", budgetId, amount: b0 * 10 }], "10x budget");
  check("a 10x budget raise is refused", big.status === "failed", big.status === "failed" ? big.error : "");
  const rm = await run([{ kind: "status.set", entity: "CAMPAIGN", ids: [campaignId], status: "REMOVED" }], "Remove campaign");
  check("removing a campaign is refused", rm.status === "failed", rm.status === "failed" ? rm.error : "");
  const foreign = await run([{ kind: "status.set", entity: "CAMPAIGN", ids: ["9999999999"], status: "PAUSED" }], "Other account");
  check("an id from outside this account is refused", foreign.status === "failed", foreign.status === "failed" ? foreign.error : "");
  const match = await run([{ kind: "keyword.update", keywordId, patch: { matchType: "BROAD" } }], "Change match type");
  check("changing match type is refused with an explanation", match.status === "failed", match.status === "failed" ? match.error : "");
  check("budget unchanged after refusals", (await budget()) === b0);

  // 3. Keyword status inside the paused campaign (it can't serve), then undo.
  const k0 = await keyword();
  const k = await run([{ kind: "status.set", entity: "KEYWORD", ids: [keywordId], status: k0 === "PAUSED" ? "ENABLED" : "PAUSED" }], "Toggle test keyword");
  check("keyword status applied", k.status === "applied", k.status === "failed" ? k.error : "");
  check("Google shows the keyword toggled", (await keyword()) !== k0);
  await undo(k);
  check("keyword status restored", (await keyword()) === k0);

  // 4. Rename campaign and change the ad group bid, as one change; undo restores both.
  const n0 = await campaignName();
  const g0 = await groupBid();
  const multi = await run(
    [
      { kind: "campaign.update", campaignId, patch: { name: `${TEST} (renamed)` } },
      { kind: "adGroup.update", adGroupId, patch: { defaultCpcBid: g0 * 2 } },
    ],
    "Rename and bid"
  );
  check("two edits in one change applied", multi.status === "applied", multi.status === "failed" ? multi.error : "");
  check("Google shows both edits", (await campaignName()) === `${TEST} (renamed)` && (await groupBid()) === g0 * 2);
  await undo(multi);
  check("undo restores both", (await campaignName()) === n0 && (await groupBid()) === g0);

  // 5. Add a keyword and negatives; undo removes exactly what was added and restores what was removed.
  const add = await run(
    [
      { kind: "keyword.create", keywords: [{ id: "tmp1", adGroupId, text: "autommerce change check", matchType: "PHRASE", status: "PAUSED", policy: "APPROVED" }] },
      { kind: "negative.create", negatives: [{ id: "tmp2", text: "cheap", matchType: "PHRASE", level: "CAMPAIGN", parentId: campaignId }] },
      { kind: "negative.remove", ids: [negativeId] },
    ],
    "Keyword and negatives"
  );
  check("keyword + negatives applied", add.status === "applied", add.status === "failed" ? add.error : "");
  const afterAdd = await q(`SELECT ad_group_criterion.keyword.text, ad_group_criterion.negative FROM ad_group_criterion WHERE ad_group.id = ${adGroupId} AND ad_group_criterion.status != 'REMOVED'`);
  const campNeg = await q(`SELECT campaign_criterion.keyword.text FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD'`);
  check(
    "Google shows the new keyword, the campaign negative, and the ad group negative gone",
    afterAdd.some((r) => r.adGroupCriterion.keyword.text === "autommerce change check") &&
      !afterAdd.some((r) => r.adGroupCriterion.negative) &&
      campNeg.some((r) => r.campaignCriterion.keyword.text === "cheap")
  );
  const dup = await run([{ kind: "keyword.create", keywords: [{ id: "tmp3", adGroupId, text: "autommerce change check", matchType: "PHRASE", status: "PAUSED", policy: "APPROVED" }] }], "Duplicate");
  check("adding the same keyword again is refused", dup.status === "failed", dup.status === "failed" ? dup.error : "");
  await undo(add);
  const afterUndo = await q(`SELECT ad_group_criterion.keyword.text, ad_group_criterion.negative FROM ad_group_criterion WHERE ad_group.id = ${adGroupId} AND ad_group_criterion.status != 'REMOVED'`);
  const campNegAfter = await q(`SELECT campaign_criterion.keyword.text FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD'`);
  check(
    "undo removed the added keyword and negative, and restored the removed negative",
    !afterUndo.some((r) => r.adGroupCriterion.keyword.text === "autommerce change check") && afterUndo.some((r) => r.adGroupCriterion.negative && r.adGroupCriterion.keyword.text === "free") && !campNegAfter.length
  );

  // 6. Same change id twice: applied once.
  const id = randomUUID();
  const first = await run([{ kind: "status.set", entity: "KEYWORD", ids: [keywordId], status: k0 === "PAUSED" ? "ENABLED" : "PAUSED" }], "Idempotent", id);
  const again = await run([{ kind: "status.set", entity: "KEYWORD", ids: [keywordId], status: k0 === "PAUSED" ? "ENABLED" : "PAUSED" }], "Idempotent", id);
  check("the same change id returns the first result", first.id === again.id);
  await undo(first);
  check("keyword back to its original status", (await keyword()) === k0);

  const [final] = await q(`SELECT campaign.status FROM campaign WHERE campaign.id = ${campaignId}`);
  check("test campaign is still PAUSED", final!.campaign.status === "PAUSED");
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  if (failures) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.message} ${(err as { detail?: string }).detail ?? ""}` : err);
  process.exit(1);
});
