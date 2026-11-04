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
const runReport = vi.fn();
vi.mock("@/lib/google-ads/live-reports.server", () => ({ runReport: (...a: unknown[]) => runReport(...a), forgetReports: vi.fn() }));
const merchantApply = vi.fn();
const merchantPreview = vi.fn();
vi.mock("@/lib/google-ads/merchant.server", () => ({
  applyMerchantChange: (...a: unknown[]) => merchantApply(...a),
  previewMerchantChange: (...a: unknown[]) => merchantPreview(...a),
  loadMerchantSnapshot: vi.fn().mockResolvedValue({ merchantId: "5898578821", products: [], accountIssues: [], truncated: false, fetchedAt: "now" }),
}));
const editProfile = vi.fn();
const loadProfile = vi.fn();
vi.mock("@/lib/business-profile.server", () => ({
  editProfile: (...a: unknown[]) => editProfile(...a),
  loadProfile: (...a: unknown[]) => loadProfile(...a),
}));
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
  loadProfile.mockReset().mockResolvedValue({ values: {}, meta: {}, updatedAt: null, revision: null });
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

  describe("reports", () => {
    beforeEach(() => runReport.mockReset().mockResolvedValue({ report: "conversions", findings: [] }));

    it("runs a named report on the workspace's own account, 30 days by default", async () => {
      const res = await post("report", { workspaceId: WS, chatId: CHAT, report: "conversions" });
      expect(await res.json()).toMatchObject({ ok: true, report: { report: "conversions" } });
      expect(runReport).toHaveBeenCalledWith(expect.objectContaining({ account_id: "2046362164" }), "conversions", 30, { targetRoas: undefined, force: false });
    });

    it("accepts only known reports and periods, and a sane target ROAS", async () => {
      expect(await (await post("report", { workspaceId: WS, chatId: CHAT, report: "everything" })).json()).toMatchObject({ ok: false });
      await post("report", { workspaceId: WS, chatId: CHAT, report: "products", days: 365, targetRoas: 1000 });
      expect(runReport).toHaveBeenCalledWith(expect.anything(), "products", 30, { targetRoas: undefined, force: false });
      await post("report", { workspaceId: WS, chatId: CHAT, report: "products", days: 90, targetRoas: 4 });
      expect(runReport).toHaveBeenLastCalledWith(expect.anything(), "products", 90, { targetRoas: 4, force: false });
    });

    it("judges products against the target ROAS saved in the business profile", async () => {
      loadProfile.mockResolvedValue({ values: { targetRoas: 5 }, meta: {}, updatedAt: null, revision: 1 });
      await post("report", { workspaceId: WS, chatId: CHAT, report: "products" });
      expect(runReport).toHaveBeenLastCalledWith(expect.anything(), "products", 30, { targetRoas: 5, force: false });
    });
  });

  describe("business profile", () => {
    const saved = { changes: [{ field: "margin", before: null, after: 0.4 }], skipped: [], profile: { values: { margin: 0.4 }, meta: {}, updatedAt: null } };
    beforeEach(() => editProfile.mockReset().mockResolvedValue(saved));

    it("saves what the user said in chat as confirmed, under the chat", async () => {
      const res = await post("profile_update", { workspaceId: WS, chatId: CHAT, edits: [{ field: "margin", value: 40 }], statedByUser: true });
      expect(await res.json()).toMatchObject({ ok: true, status: "confirmed", saved: [{ field: "margin", before: "(empty)", after: "40%" }] });
      expect(editProfile).toHaveBeenCalledWith(expect.anything(), WS, [{ field: "margin", value: 40 }], { source: "chat", status: "confirmed" }, { userId: "u1", chatId: CHAT });
    });

    it("saves the agent's own findings only as suggestions, never as the owner", async () => {
      for (const source of ["merchant", "owner", "chat", undefined]) {
        await post("profile_update", { workspaceId: WS, chatId: CHAT, edits: [{ field: "brandVoice", value: "Calm." }], statedByUser: false, source });
      }
      expect(editProfile.mock.calls.map((c) => c[3])).toEqual([
        { source: "merchant", status: "suggested" },
        { source: "website", status: "suggested" },
        { source: "website", status: "suggested" },
        { source: "website", status: "suggested" },
      ]);
    });

    it("needs owners or admins, like every other agent action", async () => {
      tables.workspace_members = { role: "editor" };
      expect((await post("profile_update", { workspaceId: WS, chatId: CHAT, edits: [{ field: "margin", value: 40 }], statedByUser: true })).status).toBe(403);
      expect(editProfile).not.toHaveBeenCalled();
    });
  });

  describe("Merchant Center", () => {
    const productOps = [{ kind: "product.update", productId: "en~US~MUG-1", set: { title: "Ceramic Mug 350 ml" } }];
    beforeEach(() => {
      merchantApply.mockReset().mockResolvedValue({ status: "applied", id: "m1", inverse: [{ kind: "product.restore" }], warnings: [] });
      merchantPreview.mockReset().mockResolvedValue({ items: [], warnings: [], writes: [{}] });
      load.mockImplementation(async (_a: unknown, _w: unknown, kind: string) =>
        kind === "merchant" ? { workspace_id: WS, kind: "merchant", composio_connected_account_id: "cm", account_id: "5898578821" } : null
      );
    });

    it("reads products with only Merchant Center connected", async () => {
      const res = await post("merchant", { workspaceId: WS, chatId: CHAT });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ overview: { merchantId: "5898578821" } });
      expect(load).toHaveBeenCalledWith(expect.anything(), WS, "merchant");
    });

    it("says so when Merchant Center isn't connected", async () => {
      load.mockResolvedValue(null);
      expect((await post("merchant", { workspaceId: WS, chatId: CHAT })).status).toBe(409);
    });

    it("never applies a product fix nobody approved", async () => {
      for (const approval of [null, { id: APPROVAL, status: "pending", decided_by: null }, { id: APPROVAL, status: "rejected", decided_by: "u1" }]) {
        tables.store_agent_approvals = approval;
        expect((await post("merchant_apply", { workspaceId: WS, chatId: CHAT, approvalId: APPROVAL, title: "t", ops: productOps })).status).toBe(403);
      }
      expect(merchantApply).not.toHaveBeenCalled();
    });

    it("applies an approved fix under the approval's id", async () => {
      const res = await post("merchant_apply", { workspaceId: WS, chatId: CHAT, approvalId: APPROVAL, title: "Better title", ops: productOps });
      expect(res.status).toBe(200);
      expect(merchantApply.mock.calls[0]![0]).toMatchObject({ userId: "u1", input: { clientChangeId: APPROVAL, source: "AGENT", ops: productOps } });
    });

    it("accepts only product updates from the agent (restores are the server's own, for undo)", async () => {
      const restore = [{ kind: "product.restore", productId: "en~US~MUG-1", offerId: "MUG-1", contentLanguage: "en", feedLabel: "US", attributes: null }];
      for (const action of ["merchant_preview", "merchant_apply"]) {
        const res = await post(action, { workspaceId: WS, chatId: CHAT, approvalId: APPROVAL, title: "t", ops: restore });
        expect(await res.json()).toMatchObject({ ok: false });
      }
      expect(merchantApply).not.toHaveBeenCalled();
      expect(merchantPreview).not.toHaveBeenCalled();
    });

    it("refuses Merchant actions from members who aren't owners or admins", async () => {
      tables.workspace_members = { role: "editor" };
      expect((await post("merchant_apply", { workspaceId: WS, chatId: CHAT, approvalId: APPROVAL, title: "t", ops: productOps })).status).toBe(403);
      expect(merchantApply).not.toHaveBeenCalled();
    });
  });

  it("refuses non-SELECT queries before reaching Google", async () => {
    const res = await post("query", { workspaceId: WS, chatId: CHAT, query: "DELETE FROM campaign" });
    expect(await res.json()).toMatchObject({ ok: false, error: expect.stringMatching(/Only SELECT/) });
  });
});
