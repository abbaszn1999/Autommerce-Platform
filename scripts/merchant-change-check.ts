// Real checks of Merchant Center reads and fixes on a workspace's connected Merchant
// account (use a Merchant Center *test* account: its products never serve). Reads
// the products, refuses bad fixes, applies one fix through our supplemental data
// source, undoes it, and checks a second undo changes nothing.
// Usage: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/merchant-change-check.ts <workspace-slug> [merchantId to select first]

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase-admin";
import { listMerchantAccounts, loadConnection, selectAccount } from "@/lib/google-ads/connection.server";
import { MerchantPlanError, merchantOverview } from "@/lib/google-ads/merchant-live";
import { applyMerchantChange, loadMerchantSnapshot, previewMerchantChange } from "@/lib/google-ads/merchant.server";

let failures = 0;
const check = (ok: boolean, label: string, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
};

async function main() {
  const [slug, pick] = process.argv.slice(2);
  if (!slug) throw new Error("Pass a workspace slug.");
  const admin = createAdminClient();
  const { data: ws } = await admin.from("workspaces").select("id").eq("slug", slug).single();
  const { data: owner } = await admin.from("workspace_members").select("user_id").eq("workspace_id", ws!.id).eq("role", "owner").single();
  let row = (await loadConnection(admin, ws!.id, "merchant"))!;

  const accounts = await listMerchantAccounts(row);
  console.log("reachable:", accounts.map((a) => `${a.merchantId} ${a.name}`).join(" | "));
  if (pick && row.account_id !== pick) {
    const a = accounts.find((x) => x.merchantId === pick);
    if (!a) throw new Error(`${pick} isn't reachable from this connection.`);
    await selectAccount(admin, row, { id: a.merchantId, name: a.name, timeZone: a.timeZone });
    row = (await loadConnection(admin, ws!.id, "merchant"))!;
  }
  console.log("merchant:", row.account_id, row.account_name);

  const snap = await loadMerchantSnapshot(row, { force: true });
  check(snap.products.length > 0, "reads products", `${snap.products.length} products, ${snap.accountIssues.length} account issues`);
  const overview = merchantOverview(snap);
  console.log("status:", JSON.stringify(overview.status), "top issues:", overview.issues.slice(0, 4).map((i) => `${i.code}×${i.products}`).join(", "));

  const target = snap.products.find((p) => p.offerId === "GLS-TMB-06") ?? snap.products[0]!;
  console.log("target:", target.id, JSON.stringify(target.title));

  const refuses = async (label: string, ops: unknown[]) => {
    try {
      await previewMerchantChange(admin, row, ops as never);
      check(false, `refuses ${label}`);
    } catch (e) {
      check(e instanceof MerchantPlanError, `refuses ${label}`, (e as Error).message);
    }
  };
  await refuses("a price change", [{ kind: "product.update", productId: target.id, set: { price: "1" } }]);
  await refuses("a bad GTIN", [{ kind: "product.update", productId: target.id, set: { gtin: "1234567890123" } }]);
  await refuses("a product from another account", [{ kind: "product.update", productId: "en~US~NOT-HERE", set: { title: "x" } }]);
  await refuses("an unchanged value", [{ kind: "product.update", productId: target.id, set: { title: target.title } }]);
  await refuses("a too long title", [{ kind: "product.update", productId: target.id, set: { title: "x".repeat(151) } }]);

  const newTitle = "Recycled Glass Tumblers 300 ml – Set of 6";
  const preview = await previewMerchantChange(admin, row, [{ kind: "product.update", productId: target.id, set: { title: newTitle } }]);
  check(preview.items[0]?.changes[0]?.after === newTitle, "preview shows before → after", JSON.stringify(preview.items[0]?.changes[0]));

  const changeId = randomUUID();
  const applied = await applyMerchantChange({ admin, row, userId: owner!.user_id, input: { clientChangeId: changeId, title: "Clearer title for the glass tumblers", source: "USER", ops: [{ kind: "product.update", productId: target.id, set: { title: newTitle } }] } });
  check(applied.status === "applied", "applies the fix", applied.status === "failed" ? applied.error : `inverse ${JSON.stringify(applied.inverse)}`);
  const again = await applyMerchantChange({ admin, row, userId: owner!.user_id, input: { clientChangeId: changeId, title: "same", source: "USER", ops: [{ kind: "product.update", productId: target.id, set: { title: "other" } }] } });
  check(again.id === applied.id, "the same change id never applies twice");

  const { data: override } = await admin.from("merchant_product_overrides").select("attributes").eq("workspace_id", ws!.id).eq("product_id", target.id).maybeSingle();
  check(override?.attributes?.title === newTitle, "keeps what Autommerce supplies", JSON.stringify(override?.attributes));

  // Google needs a few minutes to process; poll for the new title.
  let seen = "";
  for (let i = 0; i < 12 && seen !== newTitle; i++) {
    await new Promise((r) => setTimeout(r, 20_000));
    seen = (await loadMerchantSnapshot(row, { force: true })).products.find((p) => p.id === target.id)?.title ?? "";
    console.log(`  waiting for Google… title now ${JSON.stringify(seen)}`);
  }
  check(seen === newTitle, "Google shows the new title");

  if (applied.status === "applied") {
    const undo = await applyMerchantChange({ admin, row, userId: owner!.user_id, input: { clientChangeId: `undo:${changeId}`, undoOf: applied.id } });
    check(undo.status === "applied", "undo applies", undo.status === "failed" ? undo.error : "");
    const { data: gone } = await admin.from("merchant_product_overrides").select("product_id").eq("workspace_id", ws!.id).eq("product_id", target.id).maybeSingle();
    check(!gone, "undo removes Autommerce's values");
    try {
      await applyMerchantChange({ admin, row, userId: owner!.user_id, input: { clientChangeId: `undo2:${changeId}`, undoOf: applied.id } });
      check(false, "a second undo is refused");
    } catch (e) {
      check((e as Error).message === "cannot_undo", "a second undo is refused");
    }
    let back = "";
    for (let i = 0; i < 12 && back !== target.title; i++) {
      await new Promise((r) => setTimeout(r, 20_000));
      back = (await loadMerchantSnapshot(row, { force: true })).products.find((p) => p.id === target.id)?.title ?? "";
      console.log(`  waiting for Google… title now ${JSON.stringify(back)}`);
    }
    check(back === target.title, "Google shows the original title again");
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.message} ${(e as { detail?: string }).detail ?? ""}` : e);
  process.exit(1);
});
