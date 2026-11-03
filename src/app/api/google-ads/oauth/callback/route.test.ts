import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const call = (url: string) => GET(new NextRequest(url));

describe("GET /api/google-ads/oauth/callback", () => {
  it("forwards the full query to Composio", () => {
    const res = call("https://platform.autommerce.com/api/google-ads/oauth/callback?state=s%2B1&code=4%2Fabc&scope=x%20y");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://backend.composio.dev/api/v3/toolkits/auth/callback?state=s%2B1&code=4%2Fabc&scope=x%20y",
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("forwards Google errors too", () => {
    const res = call("https://platform.autommerce.com/api/google-ads/oauth/callback?error=access_denied&state=s");
    expect(res.headers.get("location")).toBe(
      "https://backend.composio.dev/api/v3/toolkits/auth/callback?error=access_denied&state=s",
    );
  });

  it("always sends to Composio, whatever the request host", () => {
    const res = call("https://evil.example/api/google-ads/oauth/callback");
    expect(res.headers.get("location")).toBe("https://backend.composio.dev/api/v3/toolkits/auth/callback");
  });
});
