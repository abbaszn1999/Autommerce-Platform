import { describe, expect, it } from "vitest";
import { veraAdsRule } from "../../../src/agents/google-ads/instructions";
import { planningSkill } from "../../../src/agents/google-ads/planning-skill";

const base = { accountName: "Kalema", customerId: "123", currency: "USD", profile: "- Business name: Kalema", mode: "agent" as const };

describe("the campaign-planning skill", () => {
  it("is part of Vera's permanent rules", () => {
    const rule = veraAdsRule(base);
    expect(rule).toContain("## Campaign planning");
    expect(rule.indexOf("## Campaign planning")).toBeLessThan(rule.indexOf("## Plans and reports"));
  });

  it("walks every phase in order, with the owner's four check-ins", () => {
    const text = planningSkill({ store: true, merchant: true });
    const phases = [...text.matchAll(/### Phase (\d+)/g)].map((m) => Number(m[1]));
    expect(phases).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const point of ["**A**", "**B**", "**C**", "**D**"]) expect(text).toContain(point);
    expect(text).toContain("quick");
    expect(text).toContain("standard");
    expect(text).toContain("full");
  });

  it("carries the decision rules a senior buyer applies", () => {
    const text = planningSkill({ store: true, merchant: true });
    expect(text).toContain("Break-even ROAS = 1 / margin");
    expect(text).toContain("about 3-5x its target cost per sale");
    expect(text).toContain("Broad match only with Smart Bidding");
    expect(text).toContain("about 30 (CPA) or 50 (ROAS) conversions");
    expect(text).toContain("check_landing_pages");
    expect(text).toContain("host_image");
  });

  it("points at the catalogue source Vera really has", () => {
    expect(planningSkill({ store: true, merchant: true })).toContain("`store_sales`");
    expect(planningSkill({ store: true, merchant: true })).toContain("`merchant_products` for what Google accepts");
    const feedOnly = planningSkill({ store: false, merchant: true });
    expect(feedOnly).not.toContain("`store_sales`");
    expect(feedOnly).toContain("the store is not connected");
    const neither = planningSkill({ store: false, merchant: false });
    expect(neither).toContain("neither the store nor Merchant Center is connected");
  });

  it("leaves the theme to the owner", () => {
    expect(planningSkill({ store: true, merchant: false })).toContain("The theme and storefront are out of your reach");
  });
});
