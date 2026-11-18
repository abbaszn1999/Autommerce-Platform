// Which of Meta's Ads MCP server tools our agent may use, and how. Pure, so the
// rules are testable and the same on every call (meta-ads/connect-plan.md §9).

import { createHash } from "node:crypto";

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Meta asks every tool call to carry a `client_conversation_id`: exactly 20
 * letters and digits, the same for the whole conversation, never an account id
 * or personal data. Ours is derived from our own chat id (or "panel:<workspace>"),
 * so it stays stable per chat without the agent having to manage it.
 */
export function conversationId(seed: string): string {
  const bytes = createHash("sha256").update(`meta-conversation:${seed}`).digest();
  let out = "";
  for (let i = 0; i < 20; i++) out += ALNUM[bytes[i] % ALNUM.length];
  return out;
}

const CONVERSATION_ID = /^[A-Za-z0-9]{20}$/;

/** Adds our conversation id when the tool takes one and the call has no valid one. */
export function withConversationId(tool: Pick<AgentTool, "inputSchema">, args: Record<string, unknown>, seed: string): Record<string, unknown> {
  const props = (tool.inputSchema as { properties?: Record<string, unknown> }).properties;
  if (!props || !("client_conversation_id" in props)) return args;
  if (typeof args.client_conversation_id === "string" && CONVERSATION_ID.test(args.client_conversation_id)) return args;
  return { ...args, client_conversation_id: conversationId(seed) };
}

/** One tool as Meta's server lists it (only the parts we use). */
export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; title?: string };
};

/** A tool as our agent gets it. */
export type AgentTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** read: runs at once. write: shown on an approval card and run only after a person approves. */
  kind: "read" | "write";
  /** Meta marks it irreversible (a delete, a permanent update). */
  destructive: boolean;
};

/**
 * Never given to the agent:
 * - app-only tools of Meta's own Ads MCP app (they don't work outside it);
 * - offer_report: Meta's own scheduled reports, outside our product;
 * - ads_update_custom_audience_users: uploads customer lists (hashed personal
 *   data), which our Privacy Policy does not cover yet.
 */
export const HIDDEN_TOOLS: ReadonlySet<string> = new Set([
  "ads_get_ad_preview_screenshot",
  "ads_log_ui_interaction",
  "ads_creative_upload_local_image",
  "ads_finalize_local_ad_image_upload",
  "ads_delete_local_ad_image",
  "offer_report",
  "ads_update_custom_audience_users",
]);

const NAME = /^[a-z][a-z0-9_]{1,119}$/;
const MAX_DESCRIPTION = 4000;

/**
 * Meta's annotations decide read vs write. A tool without `readOnlyHint: true`
 * is treated as a write, so a new or unlabeled tool can never change an account
 * without approval.
 */
export function toAgentTools(tools: McpTool[]): AgentTool[] {
  const out: AgentTool[] = [];
  const seen = new Set<string>();
  for (const tool of tools) {
    if (!tool || typeof tool.name !== "string" || !NAME.test(tool.name)) continue;
    if (HIDDEN_TOOLS.has(tool.name) || seen.has(tool.name)) continue;
    seen.add(tool.name);
    const readOnly = tool.annotations?.readOnlyHint === true;
    const schema = tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : { type: "object", properties: {} };
    out.push({
      name: tool.name,
      description: (tool.description ?? "").slice(0, MAX_DESCRIPTION),
      inputSchema: schema,
      kind: readOnly ? "read" : "write",
      destructive: !readOnly && tool.annotations?.destructiveHint === true,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function findAgentTool(tools: AgentTool[], name: unknown): AgentTool | undefined {
  return typeof name === "string" ? tools.find((t) => t.name === name) : undefined;
}

/** Arguments the agent sends must be a plain object of reasonable size. */
export function cleanArguments(value: unknown, maxBytes = 100_000): Record<string, unknown> | null {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const json = JSON.stringify(value);
  if (json.length > maxBytes) return null;
  return JSON.parse(json) as Record<string, unknown>;
}

export type Asset = { id: string; name: string; extra: Record<string, unknown> };

/**
 * The list of things (ad accounts, businesses, Pages, catalogs) inside a tool's
 * JSON answer. Meta's answers wrap the list in a key (e.g. `ad_accounts`), and
 * ids and names carry the thing's prefix (`ad_account_id`, `ad_account_name`),
 * so both are found by shape rather than by one fixed key.
 */
export function pickAssets(json: unknown, prefix: string): Asset[] {
  const list = findList(json);
  const out: Asset[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const rawId = o[`${prefix}_id`] ?? o.id;
    const id = String(rawId ?? "").replace(/^act_/, "");
    if (!/^[0-9]{1,30}$/.test(id)) continue;
    const rawName = o[`${prefix}_name`] ?? o.name;
    out.push({ id, name: typeof rawName === "string" && rawName.trim() ? rawName.trim() : id, extra: o });
  }
  return out;
}

function findList(json: unknown, depth = 0): unknown[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object" || depth > 3) return [];
  const values = Object.values(json as Record<string, unknown>);
  const direct = values.find((v) => Array.isArray(v) && v.some((x) => x && typeof x === "object"));
  if (direct) return direct as unknown[];
  for (const v of values) {
    const nested = findList(v, depth + 1);
    if (nested.length) return nested;
  }
  return [];
}

const short = (value: unknown): string => {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > 300 ? `${s.slice(0, 299)}…` : s;
};

/** Bookkeeping fields Meta asks for on every call; they change nothing, so the card leaves them out. */
const META_CONTEXT_FIELDS = new Set(["client_conversation_id", "advertiser_request", "advertiser_job", "scheduled_task_run", "after_answer_offer_report"]);

/** The approval card for one write tool call: every argument that changes something. */
export function changeCard(tool: AgentTool, args: Record<string, unknown>) {
  const changes = Object.entries(args)
    .filter(([field]) => !META_CONTEXT_FIELDS.has(field))
    .map(([field, value]) => ({ field, after: short(value) }));
  const warnings: string[] = [];
  if (tool.destructive) warnings.push("Meta marks this action as permanent: it cannot be undone.");
  if (tool.name === "ads_activate_entity") warnings.push("This makes the campaign, ad set or ad live: it starts spending the budget.");
  return {
    items: [{ id: tool.name, label: tool.name.replace(/_/g, " "), changes: changes.length ? changes : [{ field: "(no arguments)" }] }],
    warnings,
  };
}
