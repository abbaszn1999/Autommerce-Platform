import { describe, expect, it } from "vitest";
import { buildUnits, mergeRows, type BatchRow } from "../../src/store-agent/google-ads/keyword-batch";

describe("keyword_batch units", () => {
  it("splits keywords into groups of 20 and keeps a page or a site whole", () => {
    const keywords = Array.from({ length: 45 }, (_, i) => `kw ${i}`);
    const units = buildUnits([{ keywords }, { site: "rival.com" }, { url: "https://shop.com/oud" }], undefined);
    expect(units.map((u) => u.seed.keywords?.length ?? u.seed.site ?? u.seed.url)).toEqual([20, 20, 5, "rival.com", "https://shop.com/oud"]);
    expect(new Set(units.map((u) => u.id)).size).toBe(units.length);
    expect(units.every((u) => u.kind === "ideas" && u.status === "pending")).toBe(true);
  });

  it("splits a long list to measure into calls of 1000, de-duplicated and lower-cased", () => {
    const list = [...Array.from({ length: 1500 }, (_, i) => `Word ${i}`), "word 1"];
    const units = buildUnits(undefined, list);
    expect(units.map((u) => u.seed.keywords!.length)).toEqual([1000, 500]);
    expect(units.every((u) => u.kind === "metrics")).toBe(true);
  });

  it("gives the same seed the same id, so a repeat call adds nothing", () => {
    expect(buildUnits([{ keywords: ["a", "b"] }], undefined)[0]!.id).toBe(buildUnits([{ keywords: ["b", "a"].reverse() }], undefined)[0]!.id);
  });

  it("ignores empty seeds", () => {
    expect(buildUnits([{}, null, { keywords: [] }], [])).toEqual([]);
  });
});

describe("keyword_batch merge", () => {
  const row = (keyword: string, searches: number | null): Omit<BatchRow, "seen"> => ({ keyword, searches, competition: "high", bid: [1, 2] });

  it("keeps a keyword once and counts the seeds that returned it", () => {
    const map = new Map<string, BatchRow>();
    expect(mergeRows(map, [row("Oud Perfume", 1000), row("musk", 50)])).toBe(2);
    expect(mergeRows(map, [row("oud perfume", 1000), row("amber", 10)])).toBe(1);
    expect(map.size).toBe(3);
    expect(map.get("oud perfume")!.seen).toBe(2);
  });

  it("fills missing volume and keeps account flags", () => {
    const map = new Map<string, BatchRow>();
    mergeRows(map, [row("a", null)]);
    mergeRows(map, [{ ...row("a", 300), inAccount: true }]);
    expect(map.get("a")).toMatchObject({ searches: 300, inAccount: true, seen: 2 });
  });
});