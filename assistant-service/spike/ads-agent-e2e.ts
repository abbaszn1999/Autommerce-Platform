// End-to-end run of Vera on the Google Ads page (domain google_ads) against the local
// database, the local site (its signed /api/google-ads/agent/* endpoints) and the real
// Google Ads account. Prints the event stream; approvals follow SPIKE_APPROVE.
// Run (site on :4000): npx tsx --env-file=../.env.local --env-file=.env.local spike/ads-agent-e2e.ts <workspaceId> <userId> "<message>" [chatId]
// Env: SPIKE_APPROVE=1 (approve, else decline), SPIKE_MODEL, SPIKE_MODE=plan, PLATFORM_URL (default http://127.0.0.1:4000)
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { installDnsCache } from "../src/dns-cache";
import { createResilientFetch } from "../src/store-agent/resilient-fetch";
installDnsCache();
import { SupabaseAgentStoreBackend } from "../src/store-agent/agent-store/supabase-backend";
import { WriteBehindAgentStore } from "../src/store-agent/agent-store/write-behind-store";
import { StoreAgentRegistry } from "../src/store-agent/run";
import { executeStoreRun } from "../src/store-agent/runner";

const [workspaceId, userId, message, existingChat] = process.argv.slice(2);
if (!workspaceId || !userId || !message) throw new Error("usage: ads-agent-e2e.ts <workspaceId> <userId> <message> [chatId]");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false }, global: { fetch: createResilientFetch() } });
const store = new WriteBehindAgentStore(new SupabaseAgentStoreBackend(db), console.log);
const registry = new StoreAgentRegistry();
const workRoot = path.join(os.tmpdir(), "store-agent-work");

let chatId = existingChat;
if (!chatId) {
  const { data, error } = await db.from("store_agent_chats").insert({ workspace_id: workspaceId, user_id: userId, domain: "google_ads" }).select("id").single();
  if (error) throw error;
  chatId = data.id as string;
}
console.log("chat:", chatId);

const run = registry.create({
  runId: randomUUID(),
  chatId,
  workspaceId,
  userId,
  message,
  attachments: [],
  model: process.env.SPIKE_MODEL ? { id: process.env.SPIKE_MODEL, params: [] } : { id: "composer-2.5", params: [{ id: "fast", value: "false" }] },
  mode: process.env.SPIKE_MODE === "plan" ? "plan" : "agent",
  // Even with auto-run asked for, Google Ads changes must wait: the test checks that.
  autoRun: true,
  autoRunBulk: true,
  billing: { ownerUserId: userId, remainingCredits: 1000 },
  domain: "google_ads",
});

const approvals: string[] = [];
run.subscribe((event) => {
  if (event.type === "text") process.stdout.write(event.delta);
  else if (event.type === "thinking" || event.type === "progress" || event.type === "ping") return;
  else if (event.type === "approval") {
    approvals.push(event.approvalId);
    console.log(`\n[approval ${event.approvalId}]`, event.summary, JSON.stringify(event.preview));
    setTimeout(() => run.decide(event.approvalId, process.env.SPIKE_APPROVE === "1"), 800);
  } else if (event.type === "question") {
    for (const q of event.questions) console.log("\n[question]", q.text, q.options);
    setTimeout(() => run.answer(event.questionId, event.questions.map((q) => [q.options[0]!])), 500);
  } else console.log(`\n[${event.type}]`, JSON.stringify(event).slice(0, 400));
});

const started = Date.now();
await executeStoreRun(
  {
    db,
    store,
    registry,
    cursorApiKey: process.env.CURSOR_API_KEY!,
    workRoot,
    log: console.log,
    secret: process.env.ASSISTANT_SERVICE_SECRET!,
    platformUrl: (process.env.PLATFORM_URL || "http://127.0.0.1:4000").replace(/\/+$/, ""),
  },
  run
);
console.log(`\n\ntook ${Math.round((Date.now() - started) / 1000)}s`);
const { data: runRow } = await db.from("store_agent_runs").select("status, error, credits").eq("id", run.id).single();
console.log("run row:", JSON.stringify(runRow));
for (const id of approvals) {
  const [{ data: a }, { data: c }] = await Promise.all([
    db.from("store_agent_approvals").select("status, applied_at, undoable").eq("id", id).single(),
    db.from("google_ads_changes").select("id, status, error, inverse").eq("client_change_id", id).maybeSingle(),
  ]);
  console.log("approval:", id, JSON.stringify(a), "google change:", JSON.stringify(c));
}
await store.flush().catch(() => undefined);
process.exit(0);
