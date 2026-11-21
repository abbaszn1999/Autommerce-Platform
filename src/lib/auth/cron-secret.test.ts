import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cronAuthorized } from "./cron-secret";

const call = (bearer?: string) =>
  new Request("http://test/api/jobs/sweep", {
    method: "POST",
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });

const admin = (answer: { data: unknown; error: { message: string } | null }) => {
  const rpc = vi.fn(async () => answer);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
};

afterEach(() => {
  delete process.env.JOBS_CRON_SECRET;
  vi.restoreAllMocks();
});

describe("cronAuthorized", () => {
  it("accepts the env secret without asking the database", async () => {
    process.env.JOBS_CRON_SECRET = "env-secret";
    const { client, rpc } = admin({ data: false, error: null });
    expect(await cronAuthorized(call("env-secret"), client)).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("falls back to the Vault check when the env secret is unset", async () => {
    const { client, rpc } = admin({ data: true, error: null });
    expect(await cronAuthorized(call("vault-secret"), client)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("verify_jobs_cron_secret", { p_secret: "vault-secret" });
  });

  it("falls back to the Vault check when the env secret is stale", async () => {
    process.env.JOBS_CRON_SECRET = "old";
    const { client } = admin({ data: true, error: null });
    expect(await cronAuthorized(call("vault-secret"), client)).toBe(true);
  });

  it("rejects a wrong bearer, a missing bearer and a failed lookup", async () => {
    expect(await cronAuthorized(call("nope"), admin({ data: false, error: null }).client)).toBe(false);
    const { client, rpc } = admin({ data: true, error: null });
    expect(await cronAuthorized(call(), client)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await cronAuthorized(call("x"), admin({ data: null, error: { message: "boom" } }).client)).toBe(false);
  });
});
