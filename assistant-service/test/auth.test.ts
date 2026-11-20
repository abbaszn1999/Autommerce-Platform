import { describe, expect, it } from "vitest";
import { signRequest, verifyRequest } from "../src/auth";

describe("request signing", () => {
  const base = { secret: "s".repeat(40), userId: "u1", method: "POST", path: "/store-agent/runs", body: "{}" };
  const now = Date.now();
  const sig = signRequest({ ...base, timestamp: now });

  it("accepts a valid signature", () => {
    expect(verifyRequest({ ...base, timestamp: String(now), signature: sig, now }).ok).toBe(true);
  });

  it("rejects tampering, other users and stale timestamps", () => {
    expect(verifyRequest({ ...base, body: "{\"x\":1}", timestamp: String(now), signature: sig, now }).ok).toBe(false);
    expect(verifyRequest({ ...base, userId: "u2", timestamp: String(now), signature: sig, now }).ok).toBe(false);
    expect(verifyRequest({ ...base, timestamp: String(now), signature: sig, now: now + 10 * 60_000 }).ok).toBe(false);
    expect(verifyRequest({ ...base, timestamp: undefined, signature: sig }).ok).toBe(false);
  });
});
