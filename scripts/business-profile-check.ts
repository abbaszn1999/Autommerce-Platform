// Real checks of the business profile against a database (local by default):
// owner edits, agent suggestions, concurrent saves, the change log. Leaves the
// workspace's profile as it found it.
// npx tsx --env-file=.env.local scripts/business-profile-check.ts <workspaceId>

import { createClient } from "@supabase/supabase-js";
import { profileBrief } from "../src/lib/business-profile";
import { editProfile, loadProfile } from "../src/lib/business-profile.server";

const workspaceId = process.argv[2] ?? "";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const owner = { source: "owner", status: "confirmed" } as const;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`);
};

async function main() {
  const started = new Date().toISOString();
  const original = await loadProfile(admin, workspaceId);
  const { data: member } = await admin.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("role", "owner").limit(1).maybeSingle();
  const userId = String(member?.user_id);

  const a = await editProfile(admin, workspaceId, [{ field: "margin", value: "40%" }, { field: "markets", value: ["Lebanon"] }], owner, { userId });
  check("owner saves two fields", a.changes.length === 2 && a.profile.values.margin === 0.4, a.changes);

  const b = await editProfile(admin, workspaceId, [{ field: "margin", value: 0.2 }, { field: "brandVoice", value: "Warm and direct." }], { source: "website", status: "suggested" }, { userId });
  check("a suggestion never replaces the owner's margin", b.profile.values.margin === 0.4 && b.skipped.some((s) => s.field === "margin"), b.skipped);
  check("a suggestion fills an empty field", b.profile.meta.brandVoice?.status === "suggested");

  const confirm = await editProfile(admin, workspaceId, [{ field: "brandVoice", value: "Warm and direct." }], owner, { userId });
  check("the owner confirms a suggestion", confirm.profile.meta.brandVoice?.status === "confirmed" && confirm.changes.length === 1);

  // Two saves at the same moment, different fields: both must survive.
  await Promise.all([
    editProfile(admin, workspaceId, [{ field: "targetRoas", value: 4 }], owner, { userId }),
    editProfile(admin, workspaceId, [{ field: "monthlyBudgetCap", value: 3000 }], owner, { userId }),
  ]);
  const both = await loadProfile(admin, workspaceId);
  check("concurrent saves keep both fields", both.values.targetRoas === 4 && both.values.monthlyBudgetCap === 3000, both.values);

  const { count } = await admin.from("business_profile_changes").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("created_at", started);
  check("every change is logged", count === 6, count);
  console.log("\nBrief Vera reads:\n" + profileBrief(both, "USD"));

  // Put everything back as it was.
  await admin.from("business_profile_changes").delete().eq("workspace_id", workspaceId).gte("created_at", started);
  if (original.revision === null) await admin.from("business_profiles").delete().eq("workspace_id", workspaceId);
  else await admin.from("business_profiles").update({ profile: original.values, field_meta: original.meta }).eq("workspace_id", workspaceId);
  console.log(`\n${failed ? `${failed} FAILED` : "all passed"}; profile restored.`);
  process.exit(failed ? 1 : 0);
}

void main();
