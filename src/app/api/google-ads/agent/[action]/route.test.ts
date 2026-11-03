import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verify = vi.fn();
const apply = vi.fn();
const load = vi.fn();
const tables: Record<string, unknown> = {};

vi.mock("@/lib/google-ads/agent-auth.server", () => ({ verifyAgentRequest: (...a: unknown[]) => verify(...a) }));
vi.mock("@/lib/google-ads/live-mutate.server", () => ({
  applyLiveChange: (...a: unknown[]) => apply(...a),
  fetchBefore: vi.fn(),
  googleMessage: (d: string) => d,
}));
vi.mock("@/lib/google-ads/live-report.server", () => ({ loadLiveAccount: vi.fn() }));
vi.mock("@/lib/google-ads/connection.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google-ads/connection.server")>("@/lib/google-ads/connection.server");
  return { ...actual, loadConnection: (...a: unknown[]) => load(...a), searchGaql: vi.fn(), batchMutate: vi.fn() };
});
/** A tiny Supabase stand-in: each table answers maybeSingle() with what the test put in `tables`. */
vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: () => chain,
        maybeSingle: async () => ({ data: tables[table] ?? null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
      };
      return chain;
    },
  }),
}));

const { POST } = await import("./route");

const WS = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CHAT = "cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee";
const APPROVAL = "dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee";
const ops = [{ kind: "budget.update", budgetId: "900", amount: 30 }];
const post = (action: string, body: Record<string, unknown>) =>
  POST(new NextRequest(`http://x/api/google-ads/agent/${action}`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ action }) });

beforeEach(() => {
  verify.mockReset().mockReturnValue({ ok: true, userId: "u1" });
  apply.mockReset().mockResolvedValue({ status: "applied", id: "srv", inverse: [{ kind: "budget.update" }], warnings: [] });
  load.mockReset().mockResolvedValue({ workspace_id: WS, kind: "ads", composio_connected_account_id: "ca", account_id: "2046362164", account_currency: "USD" });
  tables.workspace_members = { role: "admin" };
  tables.store_agent_chats = { id: CHAT };
  tables.store_agent_approvals = { id: APPROVAL, status: "approved", decided_by: "u1" };
});

describe("POST /api/google-ads/agent/[action]", () => {
  it("refuses requests not signed by the agent service", async () => {
    verify.mockReturnValue({ ok: false, reason: "bad signature" });
    expect((await post("apply", { workspaceId: WS, chatId: CHAT, approvalId: APPROVAL, title: "t", ops })).status).toBe(401);
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses members who aren't owners or admins any more", async () => {
    tables.workspace_members = { role: "editor" };
    expect((await post("apply", { workspaceId: WS, chatId: CHAT, approvalId: APPROVAL, title: "t", ops })).status).toBe(403);
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses a chat that isn't this user's Google Ads chat", async () => {
    tables.store_agent_chats = null;
    expect((await post("apply", { workspaceId: WS, chatId: CHAT, approvalId: APPROVAL, title: "t", ops })).status).toBe(404);
    expect(apply).not.toHaveBeenCalled();
  });

  it("never applies a change nobody approved", async () => {
    for (const approval of [null, { id: APPROVAL, status: "pending", decided_by: null }, { id: APPROVAL, status: "rejected", decided_by: "u1" }]) {
      tables.store_agent_approvals = approval;
      expect((await post("apply", { workspaceId: WS, chatId: CHAT, approvalId: APPROVAL, title: "t", ops })).status).toBe(403);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("applies an approved change once, under the approval's id and the person who approved it", async () => {
    const res = await post("apply", { workspaceId: WS, chatId: CHAT, approvalId: APPROVAL, title: "Raise budget", ops });
    expect(res.status).toBe(200);
    expect(apply.mock.calls[0]![0]).toMatchObject({ userId: "u1", input: { clientChangeId: APPROVAL, title: "Raise budget", source: "AGENT", ops } });
    expect(load).toHaveBeenCalledWith(expect.anything(), WS, "ads");
  });

  it("needs a connected account", async () => {
    load.mockResolvedValue(null);
    expect((await post("overview", { workspaceId: WS, chatId: CHAT })).status).toBe(409);
  });

  it("refuses unknown actions and bad ids", async () => {
    expect((await post("delete", { workspaceId: WS, chatId: CHAT })).status).toBe(404);
    expect((await post("overview", { workspaceId: "nope", chatId: CHAT })).status).toBe(400);
  });

  it("refuses non-SELECT queries before reaching Google", async () => {
    const res = await post("query", { workspaceId: WS, chatId: CHAT, query: "DELETE FROM campaign" });
    expect(await res.json()).toMatchObject({ ok: false, error: expect.stringMatching(/Only SELECT/) });
  });
});
