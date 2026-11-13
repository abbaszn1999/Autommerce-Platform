import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signServiceRequest } from "@/lib/assistant/service-client";
import { verifyAgentRequest } from "./agent-auth.server";
import { GAQL_MAX_ROWS, GaqlGuardError, describeLiveChange, guardGaql } from "./agent-support";
import type { BeforeState } from "./live-mutate";

const SECRET = "x".repeat(40);
const USER = "11111111-2222-3333-4444-555555555555";

describe("verifyAgentRequest", () => {
  beforeEach(() => vi.stubEnv("ASSISTANT_SERVICE_SECRET", SECRET));
  afterEach(() => vi.unstubAllEnvs());

  const signed = (over: Partial<{ path: string; body: string; ts: number; user: string; secret: string }> = {}) => {
    const ts = over.ts ?? Date.now();
    const headers = new Headers({
      "x-assistant-timestamp": String(ts),
      "x-assistant-user": over.user ?? USER,
      "x-assistant-signature": signServiceRequest({ secret: over.secret ?? SECRET, timestamp: ts, userId: over.user ?? USER, method: "POST", path: over.path ?? "/api/google-ads/agent/apply", body: over.body ?? "{}" }),
    });
    return headers;
  };
  const verify = (headers: Headers, path = "/api/google-ads/agent/apply", body = "{}") => verifyAgentRequest({ method: "POST", path, body, headers });

  it("accepts a request signed by the agent service", () => {
    expect(verify(signed())).toEqual({ ok: true, userId: USER });
  });
  it("refuses a wrong key, another path, a changed body, an old request, or no headers", () => {
    expect(verify(signed({ secret: "y".repeat(40) })).ok).toBe(false);
    expect(verify(signed({ path: "/api/google-ads/agent/query" })).ok).toBe(false);
    expect(verify(signed(), "/api/google-ads/agent/apply", '{"ops":[]}').ok).toBe(false);
    expect(verify(signed({ ts: Date.now() - 10 * 60 * 1000 })).ok).toBe(false);
    expect(verify(new Headers()).ok).toBe(false);
  });
  it("refuses a user header that was swapped after signing", () => {
    const headers = signed();
    headers.set("x-assistant-user", "99999999-2222-3333-4444-555555555555");
    expect(verify(headers).ok).toBe(false);
  });
  it("is off when the secret is not set", () => {
    vi.stubEnv("ASSISTANT_SERVICE_SECRET", "");
    expect(verify(signed()).ok).toBe(false);
  });
});

describe("guardGaql", () => {
  it("keeps the account's users and their emails out of reach", () => {
    expect(() => guardGaql("SELECT change_event.user_email FROM change_event")).toThrow(GaqlGuardError);
    expect(() => guardGaql("SELECT customer_user_access.email_address FROM customer_user_access")).toThrow(GaqlGuardError);
  });

  it("keeps reads to one SELECT and caps the rows", () => {
    expect(guardGaql("SELECT campaign.id FROM campaign")).toBe(`SELECT campaign.id FROM campaign LIMIT ${GAQL_MAX_ROWS}`);
    expect(guardGaql("SELECT campaign.id FROM campaign LIMIT 10;")).toBe("SELECT campaign.id FROM campaign LIMIT 10");
    expect(guardGaql("SELECT campaign.id FROM campaign LIMIT 100000")).toBe(`SELECT campaign.id FROM campaign LIMIT ${GAQL_MAX_ROWS}`);
  });
  it("refuses anything else", () => {
    expect(() => guardGaql("DELETE FROM campaign")).toThrow(/Only SELECT/);
    expect(() => guardGaql("SELECT campaign.id FROM campaign; SELECT 1 FROM customer")).toThrow(/one query/);
    expect(() => guardGaql("SELECT campaign.id")).toThrow(/FROM/);
    expect(() => guardGaql(`SELECT ${"a,".repeat(5000)} FROM campaign`)).toThrow(/too long/);
  });
});

describe("describeLiveChange", () => {
  const before: BeforeState = {
    billableUnitMicros: 10_000,
    campaigns: { "111": { name: "Brand", status: "ENABLED", budgetId: "900", biddingType: "TARGET_CPA", targetCpa: 10 } },
    budgets: { "900": { amount: 20, shared: false } },
    adGroups: { "10": { name: "Brand terms", status: "ENABLED", campaignId: "111", cpcBid: 1.5 } },
    criteria: { "10~5001": { text: "stride shoes", matchType: "EXACT", negative: false, status: "ENABLED", cpcBid: 2 } },
    ads: {},
    campaignNegatives: {},
    createdKeywordIds: new Set(),
  };
  it("shows every edit before → after with names, not ids", () => {
    const items = describeLiveChange(
      [
        { kind: "budget.update", budgetId: "900", amount: 30 },
        { kind: "status.set", entity: "KEYWORD", ids: ["10~5001"], status: "PAUSED" },
        { kind: "campaign.update", campaignId: "111", patch: { bidding: { type: "TARGET_CPA", targetCpa: 12 } } },
        { kind: "negative.create", negatives: [{ id: "n1", text: "free", matchType: "PHRASE", level: "CAMPAIGN", parentId: "111" }] },
      ],
      before,
      "USD"
    );
    expect(items).toEqual([
      { id: "900", label: "Daily budget · Brand", changes: [{ field: "Amount per day", before: "20.00 USD", after: "30.00 USD" }] },
      { id: "10~5001", label: "Keyword · stride shoes (Brand terms)", changes: [{ field: "Status", before: "ENABLED", after: "PAUSED" }] },
      { id: "111", label: "Campaign · Brand", changes: [{ field: "Target CPA", before: "10.00 USD", after: "12.00 USD" }] },
      { id: "n1", label: "New negative keyword · Brand", changes: [{ field: "Excludes", before: undefined, after: "free (phrase)" }] },
    ]);
  });
});
