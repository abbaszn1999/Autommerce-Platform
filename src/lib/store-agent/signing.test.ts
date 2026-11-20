import { describe, expect, it } from "vitest";
import { signServiceRequest } from "./signing";

describe("service signing", () => {
  it("is deterministic and depends on every field", () => {
    const base = { secret: "s".repeat(40), timestamp: 1, userId: "u", method: "POST", path: "/store-agent/runs", body: "{}" };
    const a = signServiceRequest(base);
    expect(signServiceRequest(base)).toBe(a);
    expect(signServiceRequest({ ...base, userId: "v" })).not.toBe(a);
    expect(signServiceRequest({ ...base, body: "{ }" })).not.toBe(a);
    expect(signServiceRequest({ ...base, path: "/other" })).not.toBe(a);
    expect(signServiceRequest({ ...base, secret: "t".repeat(40) })).not.toBe(a);
  });
});
