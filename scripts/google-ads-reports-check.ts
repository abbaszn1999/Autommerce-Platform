// Runs every expert report of the Google Ads agent for real (read only) and prints
// a short summary of each: findings, counts and any query Google refused.
// Usage: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/google-ads-reports-check.ts <workspace-slug> [days]
//   or:  ... scripts/google-ads-reports-check.ts --connection <composio connected account id> <workspace id> <customer id> [days]

import { createAdminClient } from "@/lib/supabase-admin";
import { loadConnection, type ConnectionRow } from "@/lib/google-ads/connection.server";
import { REPORTS, type ReportDays } from "@/lib/google-ads/live-reports";
import { runReport } from "@/lib/google-ads/live-reports.server";

async function connection(): Promise<{ row: ConnectionRow; days: ReportDays }> {
  const args = process.argv.slice(2);
  if (args[0] === "--connection") {
    const [, ca, ws, customer, days] = args;
    return { row: { workspace_id: ws!, kind: "ads", composio_connected_account_id: ca!, account_id: customer!, account_currency: "USD" } as ConnectionRow, days: Number(days ?? 30) as ReportDays };
  }
  const admin = createAdminClient();
  const { data: ws } = await admin.from("workspaces").select("id").eq("slug", args[0]).single();
  return { row: (await loadConnection(admin, ws!.id, "ads"))!, days: Number(args[1] ?? 30) as ReportDays };
}

async function main() {
  const { row, days } = await connection();
  let failed = 0;
  for (const name of REPORTS) {
    try {
      const r = (await runReport(row, name, days, { force: true })) as Record<string, unknown> & { findings?: { severity: string; check: string; detail: string }[]; unavailable?: Record<string, string> };
      const counts = Object.entries(r)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => `${k}=${(v as unknown[]).length}`)
        .join(" ");
      console.log(`\nok   ${name}: ${counts}`);
      for (const f of r.findings ?? []) console.log(`     [${f.severity}] ${f.check}: ${f.detail.slice(0, 160)}`);
      for (const [q, why] of Object.entries(r.unavailable ?? {})) console.log(`     unavailable ${q}: ${why.slice(0, 200)}`);
    } catch (err) {
      failed++;
      console.log(`\nFAIL ${name}: ${(err as Error).message} ${(err as { detail?: string }).detail ?? ""}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
