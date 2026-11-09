import { describe, expect, it } from "vitest";
import {
  userStatedValue,
  ProfileEditError,
  completeness,
  missingRequired,
  normalizeValue,
  planProfileEdits,
  profileBrief,
  profileForAgent,
  sameValue,
  type BusinessProfileData,
} from "./business-profile";

const empty = (): BusinessProfileData => ({ values: {}, meta: {}, updatedAt: null });
const owner = { source: "owner", status: "confirmed" } as const;
const website = { source: "website", status: "suggested" } as const;
const NOW = "2026-11-05T10:00:00.000Z";

describe("normalizeValue", () => {
  it("reads numbers the way people write them", () => {
    expect(normalizeValue("margin", 40)).toBe(0.4);
    expect(normalizeValue("margin", "40%")).toBe(0.4);
    expect(normalizeValue("margin", 0.35)).toBe(0.35);
    expect(normalizeValue("targetRoas", 4)).toBe(4);
    expect(normalizeValue("targetRoas", "400%")).toBe(4);
    expect(normalizeValue("targetRoas", "4x")).toBe(4);
    expect(normalizeValue("monthlyBudgetCap", "3,000")).toBe(3000);
  });

  it("refuses values that cannot be right", () => {
    expect(() => normalizeValue("margin", 0)).toThrow(ProfileEditError);
    expect(() => normalizeValue("margin", 99)).toThrow(/between 1% and 95%/);
    expect(() => normalizeValue("targetRoas", 0.05)).toThrow(ProfileEditError);
    expect(() => normalizeValue("monthlyBudgetCap", -5)).toThrow(ProfileEditError);
    expect(() => normalizeValue("goal", "fame")).toThrow(/profit, growth, new_customers/);
    expect(() => normalizeValue("website", "javascript:alert(1)")).toThrow(ProfileEditError);
    expect(() => normalizeValue("palette", [{ name: "Red", hex: "red" }])).toThrow(/hex/);
  });

  it("cleans texts, links and lists", () => {
    expect(normalizeValue("website", "kalema.com")).toBe("https://kalema.com");
    expect(normalizeValue("website", "https://kalema.com/")).toBe("https://kalema.com");
    expect(normalizeValue("markets", "Lebanon, UAE،  lebanon\nQatar")).toEqual(["Lebanon", "UAE", "Qatar"]);
    expect(normalizeValue("markets", [])).toBeNull();
    expect(normalizeValue("businessName", "  Kalema   Store ")).toBe("Kalema Store");
    expect(normalizeValue("goal", "New customers")).toBe("new_customers");
    expect(normalizeValue("competitors", ["Noon", { name: "Namshi", url: "namshi.com" }])).toEqual([
      { name: "Noon", url: "" },
      { name: "Namshi", url: "https://namshi.com" },
    ]);
    expect(normalizeValue("palette", [{ name: "Violet", hex: "#400095", role: "Primary" }])).toEqual([{ name: "Violet", hex: "#400095", role: "Primary" }]);
  });
});

describe("userStatedValue", () => {
  it("finds the number however the user wrote it", () => {
    expect(userStatedValue("margin", 40, ["our margin is 40%"])).toBe(true);
    expect(userStatedValue("margin", 0.4, ["\u0627\u0644\u0647\u0627\u0645\u0634 \u0664\u0660"])).toBe(true);
    expect(userStatedValue("targetRoas", 4, ["aim for 400%"])).toBe(true);
    expect(userStatedValue("monthlyBudgetCap", 5000, ["cap it at 5,000 a month"])).toBe(true);
    expect(userStatedValue("monthlyBudgetCap", 5000, ["keep it under 5k"])).toBe(true);
  });

  it("refuses a number the user never wrote, or clearing a guardrail", () => {
    expect(userStatedValue("monthlyBudgetCap", 90000, ["cap it at 5,000"])).toBe(false);
    expect(userStatedValue("margin", 70, ["hello"])).toBe(false);
    expect(userStatedValue("monthlyBudgetCap", null, ["remove the cap"])).toBe(false);
  });

  it("doesn't check fields that aren't numbers", () => {
    expect(userStatedValue("brandVoice", "Calm.", [])).toBe(true);
  });
});

describe("planProfileEdits", () => {
  it("saves the owner's values as confirmed and logs before → after", () => {
    const { next, changes } = planProfileEdits(empty(), [{ field: "margin", value: 40 }, { field: "markets", value: ["Lebanon"] }], owner, NOW);
    expect(next.values).toEqual({ margin: 0.4, markets: ["Lebanon"] });
    expect(next.meta.margin).toEqual({ source: "owner", status: "confirmed", at: NOW });
    expect(changes.map((c) => [c.field, c.before, c.after])).toEqual([
      ["margin", null, 0.4],
      ["markets", null, ["Lebanon"]],
    ]);
  });

  it("never lets an agent's own finding set money fields or replace what the owner confirmed", () => {
    const current = planProfileEdits(empty(), [{ field: "website", value: "kalema.com" }], owner, NOW).next;
    const { next, changes, skipped } = planProfileEdits(
      { ...current, updatedAt: NOW },
      [
        { field: "website", value: "other.com" },
        { field: "targetRoas", value: 5 },
        { field: "brandVoice", value: "Warm and direct." },
      ],
      website,
      NOW
    );
    expect(changes.map((c) => c.field)).toEqual(["brandVoice"]);
    expect(next.values.website).toBe("https://kalema.com");
    expect(next.values.targetRoas).toBeUndefined();
    expect(next.meta.brandVoice?.status).toBe("suggested");
    expect(skipped.map((s) => s.field)).toEqual(["website", "targetRoas"]);
  });

  it("lets a suggestion replace an older suggestion, and the owner confirm or clear it", () => {
    let data = { ...planProfileEdits(empty(), [{ field: "brandVoice", value: "Calm." }], website, NOW).next, updatedAt: NOW };
    data = { ...planProfileEdits(data, [{ field: "brandVoice", value: "Bold." }], website, NOW).next, updatedAt: NOW };
    expect(data.values.brandVoice).toBe("Bold.");

    const confirm = planProfileEdits(data, [{ field: "brandVoice", value: "Bold." }], owner, NOW);
    expect(confirm.changes).toHaveLength(1);
    expect(confirm.next.meta.brandVoice?.status).toBe("confirmed");

    const clear = planProfileEdits(data, [{ field: "brandVoice", value: null }], owner, NOW);
    expect(clear.next.values.brandVoice).toBeUndefined();
    expect(clear.next.meta.brandVoice).toBeUndefined();
  });

  it("skips edits that change nothing, and refuses unknown or repeated fields", () => {
    const data = { ...planProfileEdits(empty(), [{ field: "margin", value: 40 }], owner, NOW).next, updatedAt: NOW };
    expect(planProfileEdits(data, [{ field: "margin", value: "40%" }], owner, NOW).changes).toEqual([]);
    expect(() => planProfileEdits(data, [{ field: "price" as never, value: 1 }], owner)).toThrow(/Unknown field/);
    expect(() => planProfileEdits(data, [{ field: "margin", value: 30 }, { field: "margin", value: 31 }], owner)).toThrow(/twice/);
  });
});

describe("what the agents read", () => {
  it("knows which required fields are missing (margin or target ROAS is enough)", () => {
    expect(missingRequired({})).toEqual(["Business name", "Website", "Countries you sell and ship to", "Main goal", "Gross margin or Target ROAS", "Monthly budget cap"]);
    expect(missingRequired({ businessName: "K", website: "https://k.com", markets: ["LB"], goal: "profit", targetRoas: 4, monthlyBudgetCap: 900 })).toEqual([]);
    expect(completeness({ margin: 0.4 }).sections.find((s) => s.id === "economics")).toMatchObject({ filled: 1, total: 5 });
  });

  it("writes a brief with the break-even ROAS, what is only suggested, and what is missing", () => {
    const data = planProfileEdits(empty(), [{ field: "margin", value: 40 }, { field: "monthlyBudgetCap", value: 3000 }], owner, NOW).next;
    const withSuggestion = planProfileEdits({ ...data, updatedAt: NOW }, [{ field: "brandTerms", value: ["Kalema", "كلمة"] }], website, NOW).next;
    const brief = profileBrief({ ...withSuggestion, updatedAt: NOW }, "USD");
    expect(brief).toContain("- Gross margin: 40%");
    expect(brief).toContain("- Monthly budget cap: 3,000 USD");
    expect(brief).toContain("- Brand names: Kalema; كلمة [suggested from website, not confirmed by the owner]");
    expect(brief).toContain("Break-even ROAS (from the margin): 2.50×");
    expect(brief).toContain("Still missing (required): Business name, Website");
    expect(profileBrief(empty())).toContain("(empty: nothing filled in yet)");
  });

  it("gives the agent every field with its status and source", () => {
    const data = planProfileEdits(empty(), [{ field: "brandVoice", value: "Calm." }], website, NOW).next;
    const fields = profileForAgent({ ...data, updatedAt: NOW }).fields;
    expect(fields.find((f) => f.field === "brandVoice")).toMatchObject({ status: "suggested", source: "website", value: "Calm." });
    expect(fields.find((f) => f.field === "margin")).toMatchObject({ status: "empty", ownerOnly: true });
  });

  it("compares stored values whatever order the database keeps keys in", () => {
    expect(sameValue([{ name: "Noon", url: "" }], [{ url: "", name: "Noon" }])).toBe(true);
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue(["a"], ["b"])).toBe(false);
  });
});
