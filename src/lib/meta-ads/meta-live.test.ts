import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HIDDEN_TOOLS, changeCard, cleanArguments, findAgentTool, pickAssets, toAgentTools, type McpTool } from "./mcp-tools";
import { appSecretProof, createState, parseSelection, parseSignedRequest, verifyState } from "./connection.server";
import { approvalBinding } from "@/lib/google-ads/approval-binding";

const SECRET = "test-app-secret-0123456789abcdef";

describe("Meta MCP tool rules", () => {
  const tools: McpTool[] = [
    { name: "ads_get_ad_accounts", annotations: { readOnlyHint: true } },
    { name: "ads_update_entity", annotations: { readOnlyHint: false, destructiveHint: true } },
    { name: "ads_activate_entity", annotations: { readOnlyHint: false } },
    { name: "ads_new_unlabeled_tool" },
    { name: "ads_log_ui_interaction", annotations: { readOnlyHint: true } },
    { name: "ads_update_custom_audience_users", annotations: { readOnlyHint: false } },
    { name: "Bad Name!", annotations: { readOnlyHint: true } },
    { name: "ads_get_ad_accounts", annotations: { readOnlyHint: false } },
  ];
  const agent = toAgentTools(tools);

  it("hides app-only tools, customer-list uploads, bad names and duplicates", () => {
    const names = agent.map((t) => t.name);
    expect(names).toEqual(["ads_activate_entity", "ads_get_ad_accounts", "ads_new_unlabeled_tool", "ads_update_entity"]);
    for (const hidden of HIDDEN_TOOLS) expect(names).not.toContain(hidden);
  });

  it("treats only readOnlyHint: true as read; anything unlabeled needs approval", () => {
    expect(findAgentTool(agent, "ads_get_ad_accounts")?.kind).toBe("read");
    expect(findAgentTool(agent, "ads_new_unlabeled_tool")?.kind).toBe("write");
    expect(findAgentTool(agent, "ads_update_entity")).toMatchObject({ kind: "write", destructive: true });
    expect(findAgentTool(agent, 42)).toBeUndefined();
  });

  it("warns on the card for permanent and spending changes", () => {
    const activate = changeCard(findAgentTool(agent, "ads_activate_entity")!, { entity_id: "1" });
    expect(activate.warnings.join(" ")).toMatch(/spending/);
    expect(activate.items[0].changes).toEqual([{ field: "entity_id", after: "1" }]);
    expect(changeCard(findAgentTool(agent, "ads_update_entity")!, {}).warnings.join(" ")).toMatch(/permanent/);
  });

  it("accepts only plain, bounded argument objects", () => {
    expect(cleanArguments(undefined)).toEqual({});
    expect(cleanArguments({ a: 1 })).toEqual({ a: 1 });
    expect(cleanArguments([1])).toBeNull();
    expect(cleanArguments("x")).toBeNull();
    expect(cleanArguments({ big: "x".repeat(200) }, 100)).toBeNull();
  });

  it("binds an approval to exactly one tool call", () => {
    const a = approvalBinding("meta", { tool: "ads_update_entity", arguments: { id: "1", status: "PAUSED" } });
    expect(approvalBinding("meta", { tool: "ads_update_entity", arguments: { id: "1", status: "PAUSED" } })).toBe(a);
    expect(approvalBinding("meta", { tool: "ads_update_entity", arguments: { id: "1", status: "ACTIVE" } })).not.toBe(a);
    expect(approvalBinding("meta", { tool: "ads_activate_entity", arguments: { id: "1", status: "PAUSED" } })).not.toBe(a);
  });

  it("finds assets in Meta's answers by shape", () => {
    const answer = { ad_accounts: [{ ad_account_id: "730168015458015", ad_account_name: "Main", currency: "USD" }, { ad_account_id: "act_12", ad_account_name: "" }, { ad_account_id: "bad" }] };
    expect(pickAssets(answer, "ad_account").map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "730168015458015", name: "Main" },
      { id: "12", name: "12" },
    ]);
    expect(pickAssets({ data: { pages: [{ id: "55", name: "Shop" }] } }, "page")).toMatchObject([{ id: "55", name: "Shop" }]);
    expect(pickAssets("not json", "page")).toEqual([]);
  });
});

describe("Meta login and callbacks", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.META_APP_ID = "1163327572927496";
    process.env.META_APP_SECRET = SECRET;
    process.env.META_LOGIN_CONFIG_ID = "123456789";
    process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });
  afterEach(() => {
    process.env = { ...env };
  });

  const ws = "11111111-1111-4111-8111-111111111111";
  const user = "22222222-2222-4222-8222-222222222222";

  it("signs the login state and refuses tampered or expired states", () => {
    const state = createState({ workspaceId: ws, slug: "shop", userId: user }, 1_000);
    expect(verifyState(state, 2_000)).toMatchObject({ workspaceId: ws, slug: "shop", userId: user });
    expect(verifyState(state, 1_000 + 16 * 60 * 1000)).toBeNull();
    const [payload, sig] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ workspaceId: ws, slug: "x", userId: user, exp: 9e15 })).toString("base64url");
    expect(verifyState(`${forged}.${sig}`, 2_000)).toBeNull();
    expect(verifyState(`${payload}.AAAA`, 2_000)).toBeNull();
    expect(verifyState("garbage", 2_000)).toBeNull();
  });

  it("checks Meta's signed_request with the app secret", () => {
    const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "987654321" })).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
    expect(parseSignedRequest(`${sig}.${payload}`)).toMatchObject({ user_id: "987654321" });
    const wrong = createHmac("sha256", "another-secret-000000000000").update(payload).digest("base64url");
    expect(parseSignedRequest(`${wrong}.${payload}`)).toBeNull();
    expect(parseSignedRequest("nope")).toBeNull();
  });

  it("computes appsecret_proof as HMAC-SHA256 of the token", () => {
    expect(appSecretProof("TOKEN", SECRET)).toBe(createHmac("sha256", SECRET).update("TOKEN").digest("hex"));
  });

  it("accepts only digit ids for the selected assets", () => {
    expect(parseSelection({ adAccount: { id: "act_123", name: "Main", currency: "USD" }, page: null })).toEqual({
      adAccount: { id: "123", name: "Main", currency: "USD" },
      page: null,
    });
    expect(parseSelection({ business: { id: "12; drop table", name: "x" } })).toBeNull();
    expect(parseSelection({})).toEqual({});
  });
});

describe("Meta conversation id", () => {
  it("is 20 letters and digits, stable per chat, different per chat, and added only when the tool takes it", async () => {
    const { conversationId, withConversationId } = await import("./mcp-tools");
    const a = conversationId("chat-1");
    expect(a).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(conversationId("chat-1")).toBe(a);
    expect(conversationId("chat-2")).not.toBe(a);
    const takes = { inputSchema: { properties: { client_conversation_id: {} } } };
    expect(withConversationId(takes, { x: 1 }, "chat-1")).toEqual({ x: 1, client_conversation_id: a });
    expect(withConversationId(takes, { client_conversation_id: "ABCDEFGHIJ0123456789" }, "chat-1").client_conversation_id).toBe("ABCDEFGHIJ0123456789");
    expect(withConversationId(takes, { client_conversation_id: "act_123" }, "chat-1").client_conversation_id).toBe(a);
    expect(withConversationId({ inputSchema: {} }, { x: 1 }, "chat-1")).toEqual({ x: 1 });
  });

  it("leaves Meta's bookkeeping fields off the approval card", async () => {
    const { changeCard } = await import("./mcp-tools");
    const card = changeCard({ name: "ads_update_entity", description: "", inputSchema: {}, kind: "write", destructive: false }, { id: "1", client_conversation_id: "x", advertiser_request: "pause it" });
    expect(card.items[0].changes.map((c) => c.field)).toEqual(["id"]);
  });
});
