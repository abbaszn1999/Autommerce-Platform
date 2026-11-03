import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionHttpError, errorStatus, normalizeCustomerId, toClientConnection, type ConnectionRow } from "./connection.server";
import { useGoogleAds } from "./store";

vi.mock("@/lib/supabase-server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ createAdminClient: vi.fn() }));

const row = (patch: Partial<ConnectionRow> = {}): ConnectionRow => ({
  workspace_id: "ws1",
  kind: "ads",
  composio_connected_account_id: "ca_live",
  pending_connected_account_id: null,
  composio_auth_config_id: "ac_x",
  login_customer_id: "2046362164",
  pending_login_customer_id: null,
  account_id: null,
  account_name: null,
  account_currency: null,
  account_time_zone: null,
  ...patch,
});

describe("normalizeCustomerId", () => {
  it("accepts the formats people paste", () => {
    expect(normalizeCustomerId("204-636-2164")).toBe("2046362164");
    expect(normalizeCustomerId(" 204 636 2164 ")).toBe("2046362164");
    expect(normalizeCustomerId("2046362164")).toBe("2046362164");
  });
  it("rejects anything that is not 10 digits", () => {
    for (const bad of ["", "204-636-216", "20463621645", "abc-def-ghij", null, 2046362164]) expect(normalizeCustomerId(bad)).toBeNull();
  });
});

describe("errorStatus", () => {
  it("tells a network outage apart from a bug", () => {
    const timeout = Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
    expect(errorStatus(timeout)).toEqual({ status: 503, code: "network" });
    expect(errorStatus(new ConnectionHttpError(403, "forbidden"))).toEqual({ status: 403, code: "forbidden" });
    expect(errorStatus(new Error("boom"))).toEqual({ status: 500, code: "internal_error" });
  });
});

describe("toClientConnection", () => {
  it("never exposes Composio ids", () => {
    const out = toClientConnection(row({ account_id: "2046362164", account_name: "Kalema", account_currency: "USD", account_time_zone: "Asia/Beirut" }));
    expect(out).toEqual({ status: "connected", loginCustomerId: "2046362164", accountId: "2046362164", accountName: "Kalema", currency: "USD", timeZone: "Asia/Beirut" });
    expect(JSON.stringify(out)).not.toContain("ca_");
  });
  it("is 'selecting' until an account is picked, 'none' while only a sign-in is pending", () => {
    expect(toClientConnection(row()).status).toBe("selecting");
    expect(toClientConnection(row({ composio_connected_account_id: null, pending_connected_account_id: "ca_new" })).status).toBe("none");
    expect(toClientConnection(null).status).toBe("none");
  });
});

describe("store in live mode", () => {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  let routes: Record<string, unknown>;

  beforeEach(() => {
    calls.length = 0;
    routes = {};
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const key = `${method} ${url.split("?")[0]}${url.includes("kind=merchant") ? "#merchant" : ""}`;
      const payload = routes[key] ?? { error: "not_found" };
      return new Response(JSON.stringify(payload), { status: routes[key] ? 200 : 404 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const none = { status: "none", loginCustomerId: null, accountId: null, accountName: null, currency: null, timeZone: null };

  it("shows the picker with unusable accounts greyed out, then opens the picked account", async () => {
    routes["GET /api/google-ads/connection"] = { configured: true, ads: { ...none, status: "selecting" }, merchant: none };
    routes["GET /api/google-ads/connection/accounts"] = {
      accounts: [
        { customerId: "2046362164", name: "Kalema", currency: "USD", timeZone: "Asia/Beirut", isManager: false, usable: true },
        { customerId: "1221904098", name: "1221904098", currency: "", timeZone: "", isManager: false, usable: false },
      ],
    };
    await useGoogleAds.getState().initLive("ws1", { result: "connected", kind: "ads" });
    let s = useGoogleAds.getState();
    expect(s.mode).toBe("live");
    expect(s.status).toBe("selecting");
    expect(s.accessible.map((a) => a.customerId)).toEqual(["2046362164", "1221904098"]);
    expect(s.live.unusable).toEqual(["1221904098"]);

    routes["POST /api/google-ads/connection/accounts"] = { account: { customerId: "2046362164", name: "Kalema", currency: "USD", timeZone: "Asia/Beirut", isManager: false, usable: true } };
    useGoogleAds.getState().chooseAccount("2046362164");
    await vi.waitFor(() => expect(useGoogleAds.getState().status).toBe("connected"));
    s = useGoogleAds.getState();
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ body: { workspaceId: "ws1", kind: "ads", accountId: "2046362164" } });
    // Opening the account loads its data right away.
    expect(calls.at(-1)!.url).toMatch(/^\/api\/google-ads\/data\?workspaceId=ws1&start=/);
    expect(s.customerId).toBe("2046362164");
    expect(s.accounts["2046362164"]!.data.account).toMatchObject({ name: "Kalema", currency: "USD" });
    // A real account starts empty: no demo campaigns leak in.
    expect(s.accounts["2046362164"]!.data.campaigns).toEqual([]);
    expect(s.entered).toBe(false);
  });

  it("reopens a connected account and its Merchant Center without listing accounts again", async () => {
    routes["GET /api/google-ads/connection"] = {
      configured: true,
      ads: { ...none, status: "connected", accountId: "2046362164", accountName: "Kalema", currency: "USD", timeZone: "Asia/Beirut" },
      merchant: { ...none, status: "connected", accountId: "5898433148", accountName: "Autommerce" },
    };
    await useGoogleAds.getState().initLive("ws1");
    const s = useGoogleAds.getState();
    expect(s.status).toBe("connected");
    expect(s.merchant).toMatchObject({ status: "connected", merchantId: "5898433148" });
    // The connection, then the account's data; no account list.
    expect(calls.map((c) => c.url.split("?")[0])).toEqual(["/api/google-ads/connection", "/api/google-ads/data"]);
  });

  it("loads the real account for the range on screen, and reloads when the range changes", async () => {
    routes["GET /api/google-ads/connection"] = {
      configured: true,
      ads: { ...none, status: "connected", accountId: "2046362164", accountName: "Kalema", currency: "USD", timeZone: "Asia/Beirut" },
      merchant: none,
    };
    const snapshot = (start: string, end: string) => ({
      data: {
        ...useGoogleAds.getState().accounts["2046362164"]?.data,
        account: { customerId: "2046362164", name: "Kalema", currency: "USD", timeZone: "Asia/Beirut", isManager: false, optimizationScore: 0.5, autoTagging: true },
        campaigns: [{ id: "111", name: "Brand – Search" }],
        exact: { start, end, byId: {} },
      },
      fetchedAt: new Date().toISOString(),
    });
    const range = useGoogleAds.getState().range;
    routes["GET /api/google-ads/data"] = snapshot(range.start, range.end);
    // Opening the connected account loads it; no extra call needed.
    await useGoogleAds.getState().initLive("ws1");
    await vi.waitFor(() => expect(useGoogleAds.getState().accounts["2046362164"]!.data.campaigns).toHaveLength(1));
    const load = calls.find((c) => c.url.startsWith("/api/google-ads/data"))!;
    expect(load.url).toBe(`/api/google-ads/data?workspaceId=ws1&start=${range.start}&end=${range.end}`);

    calls.length = 0;
    useGoogleAds.getState().setRange("LAST_7_DAYS");
    await vi.waitFor(() => expect(calls.some((c) => c.url.startsWith("/api/google-ads/data"))).toBe(true));
    const week = useGoogleAds.getState().range;
    expect(calls.find((c) => c.url.startsWith("/api/google-ads/data"))!.url).toContain(`start=${week.start}`);

    // Refresh button: skips the server cache.
    await vi.waitFor(() => expect(useGoogleAds.getState().accounts["2046362164"]!.sync.status).toBe("ready"));
    calls.length = 0;
    await useGoogleAds.getState().refreshData({ force: true });
    expect(calls.at(-1)!.url).toContain("refresh=1");
    useGoogleAds.getState().setRange("LAST_30_DAYS");
  });

  describe("approving changes on a live account", () => {
    const connect = async () => {
      routes["GET /api/google-ads/connection"] = {
        configured: true,
        ads: { ...none, status: "connected", accountId: "2046362164", accountName: "Kalema", currency: "USD", timeZone: "Asia/Beirut" },
        merchant: none,
      };
      await useGoogleAds.getState().initLive("ws1");
      await vi.waitFor(() => expect(useGoogleAds.getState().accounts["2046362164"]!.sync.status).not.toBe("loading"));
      calls.length = 0;
    };
    const acc = () => useGoogleAds.getState().accounts["2046362164"]!;
    const op = { kind: "budget.update" as const, budgetId: "900", amount: 30 };

    it("Approve sends the change to the server, then history gets the server's id and undo", async () => {
      await connect();
      routes["POST /api/google-ads/changes"] = { status: "applied", id: "srv-1", inverse: [{ ...op, amount: 20 }], warnings: [] };
      const change = useGoogleAds.getState().propose({ title: "Raise budget", rationale: "r", ops: [op], risk: "LOW" });
      expect(acc().changes[0]!.status).toBe("PENDING");
      useGoogleAds.getState().applyChange(change.id);
      await vi.waitFor(() => expect(acc().changes[0]!.status).toBe("APPLIED"));
      const sent = calls.find((c) => c.url === "/api/google-ads/changes")!;
      expect(sent.body).toEqual({ workspaceId: "ws1", clientChangeId: change.id, title: "Raise budget", source: "AGENT", ops: [op] });
      expect(acc().history[0]).toMatchObject({ serverId: "srv-1", inverse: [{ ...op, amount: 20 }], title: "Raise budget" });
      // Then it reloads from Google instead of guessing.
      await vi.waitFor(() => expect(calls.some((c) => c.url.includes("refresh=1"))).toBe(true));

      routes["POST /api/google-ads/changes"] = { status: "applied", id: "srv-2", inverse: [], warnings: [] };
      useGoogleAds.getState().undo(acc().history[0]!.id);
      await vi.waitFor(() => expect(acc().history[1]!.undone).toBe(true));
      const undoCall = calls.filter((c) => c.url === "/api/google-ads/changes").at(-1)!;
      // Undo sends only the server id: the server uses its own stored inverse.
      expect(undoCall.body).toMatchObject({ workspaceId: "ws1", undoOf: "srv-1" });
      expect(undoCall.body).not.toHaveProperty("ops");
    });

    it("a refusal marks the change failed with the reason", async () => {
      await connect();
      vi.stubGlobal("fetch", async (url: string) =>
        url === "/api/google-ads/changes"
          ? new Response(JSON.stringify({ status: "failed", id: "srv-3", error: "Raises above 3× must be made in smaller steps." }), { status: 422 })
          : new Response(JSON.stringify({ error: "not_found" }), { status: 404 })
      );
      const change = useGoogleAds.getState().propose({ title: "Huge", rationale: "r", ops: [{ ...op, amount: 999 }], risk: "HIGH" });
      useGoogleAds.getState().applyChange(change.id);
      await vi.waitFor(() => expect(acc().changes[0]!.status).toBe("FAILED"));
      expect(acc().changes[0]!.error).toMatch(/smaller steps/);
      expect(acc().history).toHaveLength(0);
    });

    it("a network failure leaves the change pending so Approve can be pressed again safely", async () => {
      await connect();
      vi.stubGlobal("fetch", async () => {
        throw new TypeError("Failed to fetch");
      });
      const change = useGoogleAds.getState().propose({ title: "Raise budget", rationale: "r", ops: [op], risk: "LOW" });
      useGoogleAds.getState().applyChange(change.id);
      await vi.waitFor(() => expect(acc().changes[0]!.error).toMatch(/never sent twice/));
      expect(acc().changes[0]).toMatchObject({ status: "PENDING", applying: false });
    });

    it("auto-approve can't be turned on, and direct edits go through the same approval path", async () => {
      await connect();
      useGoogleAds.getState().setAutoApprove(true);
      expect(useGoogleAds.getState().autoApprove).toBe(false);
      routes["POST /api/google-ads/changes"] = { status: "applied", id: "srv-4", inverse: [], warnings: [] };
      expect(useGoogleAds.getState().applyDirect("Edit budget", [op])).toEqual({ ok: true });
      await vi.waitFor(() => expect(acc().changes[0]).toMatchObject({ status: "APPLIED", source: "USER" }));
      expect(calls.some((c) => c.url === "/api/google-ads/changes")).toBe(true);
    });
  });

  it("reports a sign-in that didn't finish", async () => {
    routes["GET /api/google-ads/connection"] = { configured: true, ads: none, merchant: none };
    await useGoogleAds.getState().initLive("ws1", { result: "failed", kind: "merchant" });
    expect(useGoogleAds.getState().live.error).toMatch(/Merchant Center sign-in didn't finish/);
  });

  it("disconnect deletes on the server before clearing the screen", async () => {
    routes["GET /api/google-ads/connection"] = {
      configured: true,
      ads: { ...none, status: "connected", accountId: "2046362164", accountName: "Kalema", currency: "USD", timeZone: "Asia/Beirut" },
      merchant: none,
    };
    routes["DELETE /api/google-ads/connection"] = { ok: true };
    await useGoogleAds.getState().initLive("ws1");
    useGoogleAds.getState().disconnect();
    await vi.waitFor(() => expect(useGoogleAds.getState().status).toBe("disconnected"));
    expect(calls.at(-1)).toMatchObject({ method: "DELETE", url: "/api/google-ads/connection?workspaceId=ws1&kind=ads" });
  });

  it("keeps the connection and shows the error when the server refuses", async () => {
    routes["GET /api/google-ads/connection"] = {
      configured: true,
      ads: { ...none, status: "connected", accountId: "2046362164", accountName: "Kalema", currency: "USD", timeZone: "Asia/Beirut" },
      merchant: none,
    };
    await useGoogleAds.getState().initLive("ws1");
    routes["DELETE /api/google-ads/connection"] = undefined;
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }));
    useGoogleAds.getState().disconnect();
    await vi.waitFor(() => expect(useGoogleAds.getState().live.error).toMatch(/owners and admins/));
    expect(useGoogleAds.getState().status).toBe("connected");
  });
});
