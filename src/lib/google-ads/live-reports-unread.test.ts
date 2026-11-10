import { describe, expect, it } from "vitest";
import { conversionsReport, withoutUnreadChecks, type Finding } from "./live-reports";

describe("findings when Google fails part of a report", () => {
  it("doesn't say tracking is missing when the settings couldn't be read", () => {
    const report = conversionsReport({ campaigns: [], campaignPerf: [], settings: [], actions: [], byAction: [] }, 30);
    const raw = report.findings as Finding[];
    expect(raw.some((f) => f.check === "Conversion tracking")).toBe(true);
    const shown = withoutUnreadChecks(raw, { settings: "QUOTA", actions: "QUOTA" });
    expect(shown.map((f) => f.check)).not.toContain("Conversion tracking");
    expect(shown.map((f) => f.check)).not.toContain("Primary conversion");
    expect(shown[0]).toMatchObject({ check: "Incomplete data", severity: "high" });
    expect(shown[0].detail).toContain("settings, actions");
  });

  it("keeps findings whose data did arrive", () => {
    const f: Finding[] = [{ severity: "medium", check: "Device", detail: "x" }, { severity: "low", check: "Assets", detail: "y" }];
    expect(withoutUnreadChecks(f, { campaignAssets: "QUOTA" }).map((x) => x.check)).toEqual(["Incomplete data", "Device"]);
  });

  it("changes nothing when everything was read", () => {
    const f: Finding[] = [{ severity: "high", check: "Conversion tracking", detail: "x" }];
    expect(withoutUnreadChecks(f, {})).toBe(f);
  });
});
