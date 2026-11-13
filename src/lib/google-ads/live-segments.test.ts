import { describe, expect, it } from "vitest";
import { cellsFromRows, isValidLiveRange, rowsFromCells, segmentQuery } from "./live-segments";

const metrics = (cost: number, clicks = 10, conv = 2) => ({ impressions: "100", clicks: String(clicks), costMicros: String(cost * 1_000_000), conversions: conv, conversionsValue: conv * 50 });

describe("segmentQuery", () => {
  it("asks Google for the chosen dates and keeps removed campaigns in the total", () => {
    const q = segmentQuery("device", "2026-10-01", "2026-10-31");
    expect(q).toContain("segments.device");
    expect(q).toContain("BETWEEN '2026-10-01' AND '2026-10-31'");
    expect(q).not.toContain("REMOVED");
  });

  it("refuses a date that is not a date", () => {
    expect(() => segmentQuery("hour", "2026-10-01' OR '1'='1", "2026-10-31")).toThrow();
  });
});

describe("breakdowns from Google", () => {
  it("uses Google's device numbers exactly", () => {
    const cells = cellsFromRows("device", [
      { campaign: { id: "1" }, segments: { device: "MOBILE" }, metrics: metrics(12.5) },
      { campaign: { id: "1" }, segments: { device: "DESKTOP" }, metrics: metrics(7.5) },
    ]);
    const rows = rowsFromCells("device", cells);
    expect(rows.map((r) => [r.label, r.base.cost])).toEqual([["Mobile phones", 12.5], ["Computers", 7.5]]);
  });

  it("adds up several rows for one value and several campaigns", () => {
    const cells = cellsFromRows("age", [
      { campaign: { id: "1" }, adGroupCriterion: { ageRange: { type: "AGE_RANGE_25_34" } }, metrics: metrics(1) },
      { campaign: { id: "1" }, adGroupCriterion: { ageRange: { type: "AGE_RANGE_25_34" } }, metrics: metrics(2) },
      { campaign: { id: "2" }, adGroupCriterion: { ageRange: { type: "AGE_RANGE_25_34" } }, metrics: metrics(4) },
    ]);
    expect(cells).toHaveLength(2);
    expect(rowsFromCells("age", cells)).toMatchObject([{ key: "25–34", base: { cost: 7, clicks: 30 } }]);
  });

  it("limits to the campaigns asked for", () => {
    const cells = cellsFromRows("gender", [
      { campaign: { id: "1" }, adGroupCriterion: { gender: { type: "FEMALE" } }, metrics: metrics(3) },
      { campaign: { id: "2" }, adGroupCriterion: { gender: { type: "FEMALE" } }, metrics: metrics(5) },
    ]);
    expect(rowsFromCells("gender", cells, ["2"])[0].base.cost).toBe(5);
    expect(rowsFromCells("gender", cells, ["9"])).toEqual([]);
  });

  it("lists every hour, in order, with quiet hours at zero", () => {
    const rows = rowsFromCells("hour", cellsFromRows("hour", [{ campaign: { id: "1" }, segments: { hour: 13 }, metrics: metrics(4) }]));
    expect(rows).toHaveLength(24);
    expect(rows[0]).toMatchObject({ key: "0", label: "00:00", base: { cost: 0 } });
    expect(rows[13]).toMatchObject({ label: "13:00", base: { cost: 4 } });
  });

  it("reads hour 0 as midnight when Google leaves it out", () => {
    expect(cellsFromRows("hour", [{ campaign: { id: "1" }, segments: {}, metrics: metrics(1) }])[0].key).toBe("0");
  });

  it("names networks, and says when Google doesn't split them", () => {
    const rows = rowsFromCells("network", cellsFromRows("network", [
      { campaign: { id: "1" }, segments: { adNetworkType: "YOUTUBE" }, metrics: metrics(2) },
      { campaign: { id: "1" }, segments: { adNetworkType: "MIXED" }, metrics: metrics(9) },
      { campaign: { id: "1" }, segments: { adNetworkType: "SOMETHING_NEW" }, metrics: metrics(1) },
    ]));
    expect(rows.map((r) => r.label)).toEqual(["Mixed (not split by Google)", "YouTube", "Other"]);
  });

  it("names countries from Google's list and never guesses one", () => {
    const rows = cellsFromRows(
      "country",
      [
        { campaign: { id: "1" }, geographicView: { countryCriterionId: "2422", locationType: "LOCATION_OF_PRESENCE" }, metrics: metrics(2) },
        { campaign: { id: "1" }, geographicView: { countryCriterionId: "2422", locationType: "AREA_OF_INTEREST" }, metrics: metrics(1) },
        { campaign: { id: "1" }, geographicView: { countryCriterionId: "9999" }, metrics: metrics(1) },
      ],
      { "2422": "Lebanon" }
    );
    expect(cells(rows)).toEqual([["Lebanon", 3], ["Unknown location", 1]]);
  });

  it("keeps Google's speed score per landing page and none when Google has none", () => {
    const rows = rowsFromCells("landing", cellsFromRows("landing", [
      { campaign: { id: "1" }, landingPageView: { unexpandedFinalUrl: "https://a.com/x" }, metrics: { ...metrics(3), speedScore: "8" } },
      { campaign: { id: "2" }, landingPageView: { unexpandedFinalUrl: "https://b.com" }, metrics: metrics(1) },
    ]));
    expect(rows[0]).toMatchObject({ key: "https://a.com/x", speed: 8 });
    expect(rows[1].speed).toBeUndefined();
  });

  it("returns nothing, not invented rows, when Google has no data", () => {
    expect(rowsFromCells("device", cellsFromRows("device", []))).toEqual([]);
    expect(rowsFromCells("country", [])).toEqual([]);
  });
});

function cells(list: ReturnType<typeof cellsFromRows>) {
  return list.map((c) => [c.label, c.base.cost]);
}

describe("isValidLiveRange", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  it("accepts a normal range and a day ahead for accounts east of the server", () => {
    expect(isValidLiveRange("2026-10-01", "2026-10-31", now)).toBe(true);
    expect(isValidLiveRange("2026-11-10", "2026-11-10", now)).toBe(true);
  });
  it("refuses reversed, future, overlong and malformed ranges", () => {
    expect(isValidLiveRange("2026-10-31", "2026-10-01", now)).toBe(false);
    expect(isValidLiveRange("2026-11-11", "2026-11-11", now)).toBe(false);
    expect(isValidLiveRange("2025-01-01", "2026-10-31", now)).toBe(false);
    expect(isValidLiveRange("yesterday", "2026-10-31", now)).toBe(false);
  });
});
