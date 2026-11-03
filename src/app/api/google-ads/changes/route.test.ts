import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const access = vi.fn();
const load = vi.fn();
const apply = vi.fn();

vi.mock("@/lib/google-ads/connection.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google-ads/connection.server")>("@/lib/google-ads/connection.server");
  return { ...actual, requireConnectionAccess: (...a: unknown[]) => access(...a), loadConnection: (...a: unknown[]) => load(...a) };
});
vi.mock("@/lib/google-ads/live-mutate.server", () => ({ applyLiveChange: (...a: unknown[]) => apply(...a) }));

const { POST } = await import("./route");
const { ConnectionHttpError } = await import("@/lib/google-ads/connection.server");

const post = (body: unknown) => POST(new NextRequest("http://x/api/google-ads/changes", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const op = { kind: "budget.update", budgetId: "900", amount: 30 };
const valid = { workspaceId: "ws1", clientChangeId: "chg_1", title: "Raise", source: "AGENT", ops: [op] };

beforeEach(() => {
  access.mockReset().mockResolvedValue({ user: { id: "u1" }, admin: {} });
  load.mockReset().mockResolvedValue({ workspace_id: "ws1", kind: "ads", composio_connected_account_id: "ca_1", account_id: "2046362164" });
  apply.mockReset().mockResolvedValue({ status: "applied", id: "srv", inverse: [], warnings: [] });
});

describe("POST /api/google-ads/changes", () => {
  it("applies with the workspace's own connection, as an admin-only action", async () => {
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(access).toHaveBeenCalledWith("ws1", { admin: true });
    expect(load).toHaveBeenCalledWith({}, "ws1", "ads");
    expect(apply.mock.calls[0]![0]).toMatchObject({ userId: "u1", input: { clientChangeId: "chg_1", title: "Raise", source: "AGENT", ops: [op] } });
  });

  it("refuses members who aren't owners or admins", async () => {
    access.mockRejectedValue(new ConnectionHttpError(403, "forbidden"));
    const res = await post(valid);
    expect(res.status).toBe(403);
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses malformed changes before touching anything", async () => {
    for (const bad of ["not json", { ...valid, clientChangeId: "" }, { ...valid, ops: [] }, { ...valid, source: "HACKER" }, { ...valid, ops: [null] }, { ...valid, title: " " }]) {
      const res = await post(bad);
      expect(res.status).toBe(400);
    }
    expect(access).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("an undo request carries no ops: only the id of the change to undo", async () => {
    await post({ workspaceId: "ws1", clientChangeId: "u_1", undoOf: "srv", ops: [op] });
    expect(apply.mock.calls[0]![0].input).toEqual({ clientChangeId: "u_1", undoOf: "srv" });
  });

  it("needs a connected account with a picked ad account", async () => {
    load.mockResolvedValue({ workspace_id: "ws1", kind: "ads", composio_connected_account_id: "ca_1", account_id: null });
    const res = await post(valid);
    expect(res.status).toBe(409);
    expect(apply).not.toHaveBeenCalled();
  });

  it("a refused change answers 422 with the reason", async () => {
    apply.mockResolvedValue({ status: "failed", id: "srv", error: "Pause it instead." });
    const res = await post(valid);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ status: "failed", error: "Pause it instead." });
  });

  it("refuses oversized bodies", async () => {
    const res = await post({ ...valid, title: "x".repeat(250_000) });
    expect(res.status).toBe(413);
  });
});
