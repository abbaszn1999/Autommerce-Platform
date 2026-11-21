import { describe, expect, it } from "vitest";
import { isPushedCollection } from "./pushed-collection";

describe("pushed collection", () => {
  it("treats a collection as pushed only once the push saved a store id", () => {
    expect(isPushedCollection({})).toBe(false);
    expect(isPushedCollection(null)).toBe(false);
    expect(isPushedCollection({ storeHandle: "ai-rugs" })).toBe(true);
    expect(isPushedCollection({ storeCollectionId: "gid://shopify/Collection/1" })).toBe(true);
  });
});
