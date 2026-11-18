import { describe, expect, it } from "vitest";
import {
  DOC_MAX_BYTES,
  appendToSection,
  buildDocument,
  changedSections,
  emptyDocument,
  getSection,
  isDocumentEmpty,
  isProfileSection,
  normalizeDocument,
  parseDocument,
  sectionsFilled,
  setSection,
} from "./business-profile-doc";
import {
  userStatedValue,
  ProfileEditError,
  DOC_FIELDS,
  SECTIONS,
  PROFILE_FIELDS,
  boardLocked,
  onboardingStageOf,
  completeness,
  documentBrief,
  missingRequired,
  normalizeValue,
  planProfileEdits,
  profileBrief,
  profileForAgent,
  sameValue,
  type BusinessProfileData, PROFILE_UNREADABLE } from "./business-profile";

const empty = (): BusinessProfileData => ({ values: {}, meta: {}, updatedAt: null });
const owner = { source: "owner", status: "confirmed" } as const;
const website = { source: "website", status: "suggested" } as const;
const NOW = "2026-11-05T10:00:00.000Z";

describe("normalizeValue", () => {
  it("reads numbers the way people write them", () => {
    expect(normalizeValue("margin", 40)).toBe(0.4);
    expect(normalizeValue("margin", "40%")).toBe(0.4);
    expect(normalizeValue("margin", 0.35)).toBe(0.35);
    // The page and the setup screen send the box text with a % sign: it is always a percentage.
    expect(normalizeValue("margin", "1%")).toBe(0.01);
    expect(normalizeValue("margin", 1)).toBe(0.01);
    expect(normalizeValue("margin", "12.5%")).toBe(0.125);
    expect(() => normalizeValue("margin", "0.5%")).toThrow(/between 1% and 95%/);
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
    expect(userStatedValue("brandTerms", ["Kalema"], [])).toBe(true);
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
        { field: "brandTerms", value: ["Kalema"] },
      ],
      website,
      NOW
    );
    expect(changes.map((c) => c.field)).toEqual(["brandTerms"]);
    expect(next.values.website).toBe("https://kalema.com");
    expect(next.values.targetRoas).toBeUndefined();
    expect(next.meta.brandTerms?.status).toBe("suggested");
    expect(skipped.map((s) => s.field)).toEqual(["website", "targetRoas"]);
  });

  it("lets a suggestion replace an older suggestion, and the owner confirm or clear it", () => {
    let data = { ...planProfileEdits(empty(), [{ field: "brandTerms", value: ["Calm"] }], website, NOW).next, updatedAt: NOW };
    data = { ...planProfileEdits(data, [{ field: "brandTerms", value: ["Bold"] }], website, NOW).next, updatedAt: NOW };
    expect(data.values.brandTerms).toEqual(["Bold"]);

    const confirm = planProfileEdits(data, [{ field: "brandTerms", value: ["Bold"] }], owner, NOW);
    expect(confirm.changes).toHaveLength(1);
    expect(confirm.next.meta.brandTerms?.status).toBe("confirmed");

    const clear = planProfileEdits(data, [{ field: "brandTerms", value: null }], owner, NOW);
    expect(clear.next.values.brandTerms).toBeUndefined();
    expect(clear.next.meta.brandTerms).toBeUndefined();
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
    expect(completeness({ margin: 0.4 }).sections.find((s) => s.id === "economics")).toMatchObject({ filled: 1, total: 6 });
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
    const data = planProfileEdits(empty(), [{ field: "brandTerms", value: ["Calm"] }], website, NOW).next;
    const fields = profileForAgent({ ...data, updatedAt: NOW }).fields;
    expect(fields.find((f) => f.field === "brandTerms")).toMatchObject({ status: "suggested", source: "website", value: ["Calm"] });
    expect(fields.find((f) => f.field === "margin")).toMatchObject({ status: "empty", ownerOnly: true });
  });

  it("compares stored values whatever order the database keeps keys in", () => {
    expect(sameValue([{ name: "Noon", url: "" }], [{ url: "", name: "Noon" }])).toBe(true);
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue(["a"], ["b"])).toBe(false);
  });
});

describe("profileBrief", () => {
  it("gives the written document whole, section by section", () => {
    const text = "Warm, plain and short. ".repeat(100).trim();
    const document = setSection(null, "brand", text);
    const brief = profileBrief({ values: { document }, meta: {}, updatedAt: null });
    expect(brief).toContain("Business knowledge document");
    expect(brief).toContain("### Brand guidelines");
    expect(brief).toContain(text);
    expect(brief).not.toContain("### Offers");
  });

  it("never cuts a section in the middle: what does not fit is listed in an index", () => {
    let document = setSection(null, "overview", "A".repeat(40_000));
    document = setSection(document, "history", "B".repeat(30_000));
    document = setSection(document, "offers", "Free returns.");
    const brief = documentBrief({ document });
    expect(brief).toContain("A".repeat(40_000));
    expect(brief).not.toContain("BBBB");
    expect(brief).toContain("Free returns.");
    expect(brief).toMatch(/Not shown here[\s\S]*Marketing history and learnings \(30,000 characters\)/);
  });

  it("has a notice for a profile that couldn't be read, which never says empty", () => {
    expect(PROFILE_UNREADABLE).toContain("NOT empty");
    expect(PROFILE_UNREADABLE).not.toMatch(/nothing filled/);
  });
});

describe("the profile document", () => {
  it("has the same fifteen headings for everyone, and every field sits under one", () => {
    expect(SECTIONS).toHaveLength(15);
    expect(SECTIONS[0]!.id).toBe("facts");
    const ids = new Set(SECTIONS.map((s) => s.id));
    for (const f of DOC_FIELDS) expect(ids.has(PROFILE_FIELDS[f].section)).toBe(true);
  });

  it("keeps the onboarding stage out of the document and out of every agent's reach", () => {
    expect(DOC_FIELDS).not.toContain("onboardingStage");
    expect(() => planProfileEdits(empty(), [{ field: "onboardingStage", value: "done" }], owner, NOW)).toThrow(/Unknown field/);
    expect(() => planProfileEdits(empty(), [{ field: "onboardingStage", value: "done" }], website, NOW)).toThrow(/Unknown field/);
    expect(profileForAgent(empty()).fields.some((f) => f.field === "onboardingStage")).toBe(false);
    const withStage: BusinessProfileData = { values: { onboardingStage: "interview", businessName: "Kalema" }, meta: {}, updatedAt: null };
    expect(profileBrief(withStage)).not.toContain("Onboarding");
    expect(completeness(withStage.values).total).toBe(DOC_FIELDS.length + SECTIONS.length);
  });

  it("lets the platform move the stage, and locks the board only while Vera works", () => {
    const plan = planProfileEdits(empty(), [{ field: "onboardingStage", value: "interview" }], owner, NOW, { allowHidden: true });
    expect(onboardingStageOf(plan.next.values)).toBe("interview");
    expect(boardLocked("interview")).toBe(true);
    expect(boardLocked("filling")).toBe(true);
    expect(boardLocked("done")).toBe(false);
    expect(boardLocked(null)).toBe(false);
    expect(onboardingStageOf({})).toBeNull();
  });

  it("holds the long document Vera writes, and refuses one past the limit", () => {
    const text = "- point\n".repeat(2000);
    const stored = normalizeValue("document", setSection(null, "overview", text)) as string;
    expect(stored).toContain("## Business overview");
    expect(stored).toContain("- point");
    expect(normalizeValue("document", "")).toBeNull();
    expect(() => normalizeValue("document", "x".repeat(DOC_MAX_BYTES + 1))).toThrow(/too long/);
  });

  it("keeps the document out of reach of editing as a plain field unless the platform allows it", () => {
    expect(() => planProfileEdits(empty(), [{ field: "document", value: "# x" }], owner, NOW)).toThrow(/Unknown field/);
    const plan = planProfileEdits(empty(), [{ field: "document", value: setSection(null, "offers", "Free shipping over 50.") }], owner, NOW, { allowHidden: true });
    expect(getSection(plan.next.values.document as string, "offers")).toBe("Free shipping over 50.");
  });

  it("gives the agent the document by section with its guide", () => {
    const withDoc: BusinessProfileData = { values: { document: setSection(null, "overview", "We sell abayas.") }, meta: {}, updatedAt: null };
    const doc = profileForAgent(withDoc).document;
    expect(doc.maxBytes).toBe(DOC_MAX_BYTES);
    expect(doc.sections).toHaveLength(15);
    expect(doc.sections.find((s) => s.id === "overview")?.text).toBe("We sell abayas.");
    expect(doc.sections.find((s) => s.id === "offers")?.text).toBe("");
  });
});

describe("the document format", () => {
  it("always has the same headings, in the same order, whatever is written", () => {
    const doc = buildDocument({ offers: "Free returns." });
    const headings = doc.split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3));
    expect(headings).toEqual(SECTIONS.map((s) => s.label));
    expect(parseDocument(doc).offers).toBe("Free returns.");
    expect(isDocumentEmpty(emptyDocument())).toBe(true);
  });

  it("reads a document back unchanged and keeps text a user typed above the first heading", () => {
    const doc = buildDocument({ overview: "A\n\n### Sub\n- x", history: "Tried PMax in 2025." });
    expect(normalizeDocument(doc)).toBe(doc);
    expect(parseDocument("Loose note\n\n## Offers, shipping and returns\nFree returns.").facts).toBe("Loose note");
  });

  it("cannot be broken by a heading inside a section or a code block", () => {
    const doc = setSection(null, "overview", "# Big\n## Other\ntext\n```\n## not a heading\n```");
    const parsed = parseDocument(doc);
    expect(parsed.overview).toContain("### Big");
    expect(parsed.overview).toContain("### Other");
    expect(parsed.overview).toContain("## not a heading");
    expect(Object.keys(parsed)).toHaveLength(15);
  });

  it("appends to a section without touching the others, and reports what changed", () => {
    const one = setSection(null, "offers", "Free returns.");
    const two = appendToSection(one, "offers", "Free shipping over 50.");
    expect(getSection(two, "offers")).toBe("Free returns.\n\nFree shipping over 50.");
    const three = setSection(two, "history", "Tried PMax.");
    expect(changedSections(two, three)).toEqual(["Marketing history and learnings"]);
    expect(sectionsFilled(three).offers).toBe(true);
    expect(sectionsFilled(three).seasonality).toBe(false);
    expect(isProfileSection("offers")).toBe(true);
    expect(isProfileSection("nope")).toBe(false);
  });
});
