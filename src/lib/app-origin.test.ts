import { afterEach, describe, expect, it, vi } from "vitest";
import { trustedOriginFromRequest } from "./app-origin";

const request = (headers: Record<string, string>) => new Request("https://internal.example/api/x", { headers });

describe("trustedOriginFromRequest", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("never points a callback at a host the app does not run on", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ORIGIN", "https://platform.example.com");
    expect(trustedOriginFromRequest(request({ "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" }))).toBe("https://platform.example.com");
    expect(trustedOriginFromRequest(request({ host: "evil.example" }))).toBe("https://platform.example.com");
  });

  it("keeps the request's origin when it is the app's own or an allowed host", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ORIGIN", "https://platform.example.com");
    vi.stubEnv("APP_ALLOWED_HOSTS", "staging.example.com");
    expect(trustedOriginFromRequest(request({ "x-forwarded-host": "platform.example.com", "x-forwarded-proto": "https" }))).toBe("https://platform.example.com");
    expect(trustedOriginFromRequest(request({ "x-forwarded-host": "staging.example.com", "x-forwarded-proto": "https" }))).toBe("https://staging.example.com");
  });
});