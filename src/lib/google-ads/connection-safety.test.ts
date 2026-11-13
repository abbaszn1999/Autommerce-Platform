import { beforeEach, describe, expect, it, vi } from "vitest";

const composio = { delete: vi.fn(), list: vi.fn() };
let cookie: string | undefined;

vi.mock("@composio/core", () => ({
  Composio: class {
    connectedAccounts = { delete: (id: string) => composio.delete(id), list: (q: unknown) => composio.list(q) };
  },
  AuthScheme: { OAuth2: () => ({}) },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookie ? { value: cookie } : undefined) }) }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) } }) }));
vi.mock("@/lib/supabase-admin", () => ({ createAdminClient: () => fakeAdmin([]) }));

type Call = { table: string; op: string; filters: [string, string, unknown][]; values?: unknown };

/** A Supabase stand-in that records what was asked and answers from `rows`. */
function fakeAdmin(rows: Record<string, unknown>[], log: Call[] = []) {
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    log.push(call);
    const result = () => {
      if (table === "workspace_members") return { data: { role: "owner" }, error: null };
      if (call.op === "update") return { data: rows.filter((r) => r.status === "applying").map((r) => ({ undo_of: r.undo_of ?? null })), error: null };
      return { data: table === "google_ads_connections" ? rows : [], error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const name of ["eq", "lt", "in", "is", "not"]) chain[name] = (col: string, val: unknown) => (call.filters.push([name, col, val]), chain);
    chain.select = () => chain;
    chain.update = (values: unknown) => ((call.op = "update"), (call.values = values), chain);
    chain.delete = () => ((call.op = "delete"), chain);
    chain.maybeSingle = async () => result();
    chain.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad);
    return chain;
  };
  return { from } as never;
}

process.env.COMPOSIO_API_KEY = "test";
const { closeStuckChanges, disconnect, removeWorkspaceConnections, requireConnectionAccess } = await import("./connection.server");
const { allowForcedRefresh } = await import("./refresh-limit");
const { previewToken } = await import("./preview-access");

const row = { workspace_id: "w1", kind: "ads", composio_connected_account_id: "ca_1", pending_connected_account_id: "ca_2", composio_auth_config_id: "ac" };

beforeEach(() => {
  composio.delete.mockReset();
  composio.list.mockReset();
  cookie = undefined;
  delete process.env.GOOGLE_ADS_LAUNCHED;
});

describe("disconnecting", () => {
  it("removes the Google sign-in at Composio, then the row", async () => {
    const log: Call[] = [];
    await disconnect(fakeAdmin([row], log), "w1", "ads");
    expect(composio.delete.mock.calls.map((c) => c[0])).toEqual(["ca_1", "ca_2"]);
    expect(log.some((c) => c.table === "google_ads_connections" && c.op === "delete")).toBe(true);
  });

  it("keeps the row when Composio can't remove the tokens, so it can be retried", async () => {
    composio.delete.mockRejectedValueOnce(Object.assign(new Error("Internal error"), { status: 500 }));
    const log: Call[] = [];
    await expect(disconnect(fakeAdmin([row], log), "w1", "ads")).rejects.toThrow("disconnect_failed");
    expect(log.some((c) => c.op === "delete")).toBe(false);
  });

  it("treats a sign-in Composio no longer has as removed", async () => {
    composio.delete.mockRejectedValue(Object.assign(new Error("Connected account not found"), { status: 404 }));
    await expect(disconnect(fakeAdmin([row]), "w1", "ads")).resolves.toBeUndefined();
  });
});

describe("deleting a workspace", () => {
  it("removes every sign-in Composio holds for it, even ones our table lost", async () => {
    composio.list.mockResolvedValue({ items: [{ id: "ca_1" }, { id: "ca_orphan" }] });
    expect(await removeWorkspaceConnections(fakeAdmin([row]), "w1")).toBe(3);
    expect(composio.list).toHaveBeenCalledWith({ userIds: ["w1"] });
    expect(composio.delete.mock.calls.map((c) => c[0]).sort()).toEqual(["ca_1", "ca_2", "ca_orphan"]);
  });

  it("stops the deletion when one can't be removed", async () => {
    composio.list.mockResolvedValue({ items: [] });
    composio.delete.mockRejectedValue(new Error("Service unavailable"));
    await expect(removeWorkspaceConnections(fakeAdmin([row]), "w1")).rejects.toThrow();
  });
});

describe("changes cut off by a restart", () => {
  it("closes only this workspace's changes stuck for over 10 minutes and frees what they were undoing", async () => {
    const log: Call[] = [];
    await closeStuckChanges(fakeAdmin([{ status: "applying", undo_of: "c9" }], log), "w1");
    const close = log.find((c) => c.table === "google_ads_changes" && c.op === "update" && (c.values as { status?: string }).status === "failed")!;
    expect(close.filters).toEqual(expect.arrayContaining([["eq", "workspace_id", "w1"], ["eq", "status", "applying"]]));
    const cutoff = Date.parse(close.filters.find((f) => f[0] === "lt")![2] as string);
    expect(Date.now() - cutoff).toBeGreaterThanOrEqual(10 * 60 * 1000 - 1000);
    const release = log.find((c) => c.op === "update" && (c.values as { undone_at?: null }).undone_at === null)!;
    expect(release.filters).toContainEqual(["in", "id", ["c9"]]);
  });
});

describe("preview gate on the API", () => {
  it("answers as if nothing is there without the preview cookie", async () => {
    await expect(requireConnectionAccess("w1")).rejects.toThrow("not_found");
  });

  it("opens with the signed cookie, or for everyone once launched", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= "secret";
    cookie = previewToken()!;
    await expect(requireConnectionAccess("w1")).resolves.toMatchObject({ role: "owner" });
    cookie = undefined;
    process.env.GOOGLE_ADS_LAUNCHED = "1";
    await expect(requireConnectionAccess("w1")).resolves.toMatchObject({ role: "owner" });
  });

  it("can be skipped for pages outside Google Ads", async () => {
    await expect(requireConnectionAccess("w1", { preview: false })).resolves.toMatchObject({ role: "owner" });
  });
});

describe("Refresh button", () => {
  it("goes to Google once a minute per workspace and kind", () => {
    expect(allowForcedRefresh("w9", "ads", 0)).toBe(true);
    expect(allowForcedRefresh("w9", "ads", 30_000)).toBe(false);
    expect(allowForcedRefresh("w9", "merchant", 30_000)).toBe(true);
    expect(allowForcedRefresh("w8", "ads", 30_000)).toBe(true);
    expect(allowForcedRefresh("w9", "ads", 60_000)).toBe(true);
  });
});
