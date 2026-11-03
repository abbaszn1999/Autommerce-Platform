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
    expect(calls.at(-1)).toMatchObject({ method: "POST", body: { workspaceId: "ws1", kind: "ads", accountId: "2046362164" } });
    expect(s.customerId).toBe("2046362164");
    expect(s.accounts["2046362164"]!.data.account).toMatchObject({ name: "Kalema", currency: "USD" });
    // A real account starts empty: no demo campaigns leak in.
    expect(s.accounts["2046362164"]!.data.campaigns).toEqual([]);
    expect(s.entered).toBe(false);
  });

  it("reopens a connected account and its Merchant Center without calling Google", async () => {
    routes["GET /api/google-ads/connection"] = {
      configured: true,
      ads: { ...none, status: "connected", accountId: "2046362164", accountName: "Kalema", currency: "USD", timeZone: "Asia/Beirut" },
      merchant: { ...none, status: "connected", accountId: "5898433148", accountName: "Autommerce" },
    };
    await useGoogleAds.getState().initLive("ws1");
    const s = useGoogleAds.getState();
    expect(s.status).toBe("connected");
    expect(s.merchant).toMatchObject({ status: "connected", merchantId: "5898433148" });
    expect(calls).toHaveLength(1);
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
