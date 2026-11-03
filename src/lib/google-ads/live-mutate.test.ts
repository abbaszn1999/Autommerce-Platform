import { describe, expect, it } from "vitest";
import { LivePlanError, inverseForCreated, planLiveChange, resultNames, toMicros, type BeforeState } from "./live-mutate";
import { googleMessage } from "./live-mutate.server";
import type { MutateOp } from "./types";

const CID = "2046362164";

const before = (patch: Partial<BeforeState> = {}): BeforeState => ({
  billableUnitMicros: 10_000,
  campaigns: {
    "111": { name: "Brand", status: "PAUSED", budgetId: "900", biddingType: "MAXIMIZE_CONVERSIONS", targetCpa: 10 },
    "222": { name: "Shop", status: "ENABLED", budgetId: "901", biddingType: "TARGET_ROAS", targetRoas: 4 },
  },
  budgets: { "900": { amount: 20, shared: false }, "901": { amount: 50, shared: true } },
  adGroups: { "10": { name: "Brand terms", status: "ENABLED", campaignId: "111", cpcBid: 1.5 } },
  criteria: {
    "10~5001": { text: "stride shoes", matchType: "EXACT", negative: false, status: "ENABLED", cpcBid: 2 },
    "10~5003": { text: "free", matchType: "BROAD", negative: true, status: "ENABLED" },
  },
  ads: { "10~8001": { status: "ENABLED" } },
  campaignNegatives: { "111~7001": { text: "jobs", matchType: "PHRASE" } },
  createdKeywordIds: new Set(["10~6000"]),
  ...patch,
});

const plan = (ops: MutateOp[], b = before()) => planLiveChange(CID, ops, b);
const refused = (ops: MutateOp[], match: RegExp, b = before()) => expect(() => plan(ops, b)).toThrow(match);

describe("planLiveChange", () => {
  it("pauses entities with a status-only update mask and remembers how to undo", () => {
    const p = plan([{ kind: "status.set", entity: "AD", ids: ["10~8001"], status: "PAUSED" }]);
    expect(p.operations).toEqual([
      { ad_group_ad_operation: { update: { resourceName: `customers/${CID}/adGroupAds/10~8001`, status: "PAUSED" }, updateMask: "status" } },
    ]);
    expect(p.inverse).toEqual([{ kind: "status.set", entity: "AD", ids: ["10~8001"], status: "ENABLED" }]);
  });

  it("every resource name is this customer's, whatever the browser sent", () => {
    const p = plan([
      { kind: "status.set", entity: "CAMPAIGN", ids: ["111"], status: "ENABLED" },
      { kind: "budget.update", budgetId: "900", amount: 25 },
      { kind: "keyword.update", keywordId: "10~5001", patch: { cpcBid: 2.5 } },
    ]);
    const names = JSON.stringify(p.operations).match(/customers\/\d+/g)!;
    expect(new Set(names)).toEqual(new Set([`customers/${CID}`]));
  });

  it("refuses ids that aren't in this account, or that look like injection", () => {
    refused([{ kind: "status.set", entity: "CAMPAIGN", ids: ["999"], status: "PAUSED" }], /isn't in this account/);
    refused([{ kind: "status.set", entity: "CAMPAIGN", ids: ["111 OR 1=1"], status: "PAUSED" }], /isn't in this account/);
    refused([{ kind: "budget.update", budgetId: "../900", amount: 10 }], /isn't in this account/);
    refused([{ kind: "keyword.update", keywordId: "10", patch: { cpcBid: 1 } }], /isn't in this account/);
  });

  it("never removes what Google can't bring back", () => {
    refused([{ kind: "status.set", entity: "CAMPAIGN", ids: ["111"], status: "REMOVED" }], /Pause it instead/);
    refused([{ kind: "status.set", entity: "AD", ids: ["10~8001"], status: "REMOVED" }], /Pause it instead/);
    refused([{ kind: "status.set", entity: "KEYWORD", ids: ["10~5001"], status: "REMOVED" }], /Pause it instead/);
    refused([{ kind: "campaign.remove", campaignId: "111" }], /can't be sent/);
  });

  it("removes a keyword only when this app created it (undo of a create)", () => {
    const b = before({ criteria: { ...before().criteria, "10~6000": { text: "new", matchType: "PHRASE", negative: false, status: "PAUSED" } } });
    const p = plan([{ kind: "status.set", entity: "KEYWORD", ids: ["10~6000"], status: "REMOVED" }], b);
    expect(p.operations).toEqual([{ ad_group_criterion_operation: { remove: `customers/${CID}/adGroupCriteria/10~6000` } }]);
  });

  it("rounds money to the currency's billable unit with integer maths", () => {
    expect(toMicros(19.999, 10_000)).toBe("20000000");
    expect(toMicros(0.1 + 0.2, 10_000)).toBe("300000");
    // Yen bills in whole units.
    expect(toMicros(1234.4, 1_000_000)).toBe("1234000000");
    const p = plan([{ kind: "budget.update", budgetId: "900", amount: 33.333 }]);
    expect(p.operations[0]).toMatchObject({ campaign_budget_operation: { update: { amountMicros: "33330000" }, updateMask: "amount_micros" } });
    expect(p.inverse).toEqual([{ kind: "budget.update", budgetId: "900", amount: 20 }]);
  });

  it("caps raises and refuses zero or negative money", () => {
    refused([{ kind: "budget.update", budgetId: "900", amount: 61 }], /smaller steps/);
    expect(() => plan([{ kind: "budget.update", budgetId: "900", amount: 60 }])).not.toThrow();
    refused([{ kind: "budget.update", budgetId: "900", amount: 0 }], /positive/);
    refused([{ kind: "budget.update", budgetId: "900", amount: Number.NaN }], /positive/);
    refused([{ kind: "keyword.update", keywordId: "10~5001", patch: { cpcBid: 7 } }], /smaller steps/);
    refused([{ kind: "adGroup.update", adGroupId: "10", patch: { defaultCpcBid: 5 } }], /smaller steps/);
    // Lowering is always fine.
    expect(() => plan([{ kind: "budget.update", budgetId: "900", amount: 1 }])).not.toThrow();
  });

  it("warns that a shared budget moves every campaign using it", () => {
    expect(plan([{ kind: "budget.update", budgetId: "901", amount: 60 }]).warnings[0]).toMatch(/shared budget/);
  });

  it("writes target CPA where the campaign's strategy keeps it", () => {
    const p = plan([{ kind: "campaign.update", campaignId: "111", patch: { bidding: { type: "MAXIMIZE_CONVERSIONS", targetCpa: 12 } } }]);
    expect(p.operations[0]).toEqual({
      campaign_operation: {
        update: { resourceName: `customers/${CID}/campaigns/111`, maximizeConversions: { targetCpaMicros: "12000000" } },
        updateMask: "maximize_conversions.target_cpa_micros",
      },
    });
    expect(p.inverse[0]).toEqual({ kind: "campaign.update", campaignId: "111", patch: { bidding: { type: "MAXIMIZE_CONVERSIONS", targetCpa: 10, targetRoas: undefined } } });
    const roas = plan([{ kind: "campaign.update", campaignId: "222", patch: { bidding: { type: "TARGET_ROAS", targetRoas: 5 } } }]);
    expect(roas.operations[0]).toMatchObject({ campaign_operation: { update: { targetRoas: { targetRoas: 5 } }, updateMask: "target_roas.target_roas" } });
  });

  it("refuses strategy switches and fields it can't send yet", () => {
    refused([{ kind: "campaign.update", campaignId: "111", patch: { bidding: { type: "TARGET_ROAS", targetRoas: 3 } } }], /bid strategy type/);
    refused([{ kind: "campaign.update", campaignId: "111", patch: { locations: [] } }], /locations can't be sent/);
    refused([{ kind: "keyword.update", keywordId: "10~5001", patch: { matchType: "BROAD" } }], /match type/);
    refused([{ kind: "ad.create", ads: [] }], /can't be sent/);
  });

  it("adds keywords once, with clean text and a valid URL", () => {
    const k = { id: "tmp1", adGroupId: "10", text: " running shoes ", matchType: "PHRASE" as const, status: "PAUSED" as const, policy: "APPROVED" as const, cpcBid: 1.2, finalUrl: "https://stride.example/run" };
    const p = plan([{ kind: "keyword.create", keywords: [k] }]);
    expect(p.operations[0]).toEqual({
      ad_group_criterion_operation: {
        create: { adGroup: `customers/${CID}/adGroups/10`, status: "PAUSED", keyword: { text: "running shoes", matchType: "PHRASE" }, cpcBidMicros: "1200000", finalUrls: ["https://stride.example/run"] },
      },
    });
    expect(p.created).toEqual([{ index: 0, kind: "keyword", ref: "tmp1" }]);
    refused([{ kind: "keyword.create", keywords: [{ ...k, text: "Stride Shoes", matchType: "EXACT" }] }], /already in this ad group/);
    refused([{ kind: "keyword.create", keywords: [{ ...k, finalUrl: "javascript:alert(1)" }] }], /valid web address/);
    refused([{ kind: "keyword.create", keywords: [{ ...k, text: "a b c d e f g h i j k" }] }], /more than 10 words/);
    refused([{ kind: "keyword.create", keywords: [{ ...k, status: "REMOVED" }] }], /enabled or paused/);
  });

  it("removing negatives can be undone by adding them back", () => {
    const p = plan([{ kind: "negative.remove", ids: ["10~5003", "111~7001"] }]);
    expect(p.operations).toEqual([
      { ad_group_criterion_operation: { remove: `customers/${CID}/adGroupCriteria/10~5003` } },
      { campaign_criterion_operation: { remove: `customers/${CID}/campaignCriteria/111~7001` } },
    ]);
    expect(p.inverse).toEqual([
      {
        kind: "negative.create",
        negatives: [
          { id: "10~5003", text: "free", matchType: "BROAD", level: "AD_GROUP", parentId: "10" },
          { id: "111~7001", text: "jobs", matchType: "PHRASE", level: "CAMPAIGN", parentId: "111" },
        ],
      },
    ]);
    // A positive keyword is not a negative.
    refused([{ kind: "negative.remove", ids: ["10~5001"] }], /isn't in this account/);
  });

  it("undo order is the reverse of the change", () => {
    const p = plan([
      { kind: "budget.update", budgetId: "900", amount: 30 },
      { kind: "status.set", entity: "CAMPAIGN", ids: ["111"], status: "ENABLED" },
    ]);
    expect(p.inverse.map((o) => o.kind)).toEqual(["status.set", "budget.update"]);
  });

  it("refuses an empty or oversized change", () => {
    refused([{ kind: "campaign.update", campaignId: "111", patch: {} }], /doesn't change anything/);
    const many = Array.from({ length: 201 }, () => ({ kind: "status.set" as const, entity: "AD" as const, ids: ["10~8001"], status: "PAUSED" as const }));
    refused(many, /at most 200/);
  });

  it("rejects a bad customer id outright", () => {
    expect(() => planLiveChange("123", [], before())).toThrow(LivePlanError);
  });
});

describe("after Google answers", () => {
  it("reads new ids back and builds the undo for what was created", () => {
    const names = resultNames({
      mutate_operation_responses: [
        { ad_group_criterion_result: { resource_name: `customers/${CID}/adGroupCriteria/10~7777` } },
        { campaign_criterion_result: { resource_name: `customers/${CID}/campaignCriteria/111~8888` } },
      ],
    });
    const { inverse, keywordIds } = inverseForCreated(
      [
        { index: 0, kind: "keyword", ref: "tmp1" },
        { index: 1, kind: "campaignNegative", ref: "tmp2" },
      ],
      names
    );
    expect(keywordIds).toEqual(["10~7777"]);
    expect(inverse).toEqual([
      { kind: "status.set", entity: "KEYWORD", ids: ["10~7777"], status: "REMOVED" },
      { kind: "negative.remove", ids: ["111~8888"] },
    ]);
  });

  it("shows Google's own reason, not the generic wrapper", () => {
    const detail =
      '{"error":{"code":400,"message":"Request contains an invalid argument.","details":[{"errors":[{"message":"Too low."},{"message":"Budget amount is \\"too\\" low."}]}]}}';
    expect(googleMessage(detail)).toBe('Too low. Budget amount is "too" low.');
    expect(googleMessage(undefined)).toMatch(/refused/);
  });
});
