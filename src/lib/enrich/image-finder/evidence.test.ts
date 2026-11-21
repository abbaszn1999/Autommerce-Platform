import { describe, expect, it } from "vitest";
import { imageFileKey, normalizeImageKey } from "./evidence";

describe("normalizeImageKey", () => {
  it("treats size/format variants of one image as the same image", () => {
    const base = normalizeImageKey("https://cdn.test/files/dozer-20260108.jpg");
    expect(normalizeImageKey("https://cdn.test/files/dozer-20260108_800x.jpg?v=1767870968&width=1080")).toBe(base);
    expect(normalizeImageKey("https://cdn.test/files/dozer-20260108-300x300.jpg")).toBe(base);
  });

  it("keeps different images different", () => {
    expect(normalizeImageKey("https://cdn.test/files/a-20260108.jpg")).not.toBe(
      normalizeImageKey("https://cdn.test/files/b-20260108.jpg")
    );
  });
});

describe("imageFileKey", () => {
  it("matches the same distinctive file across a store domain and its CDN", () => {
    expect(imageFileKey("https://store.test/cdn/shop/files/Untitled_design_-_2026-01-08T131555.580.jpg?width=1080")).toBe(
      imageFileKey("https://cdn.test/s/files/1/0881/files/Untitled_design_-_2026-01-08T131555.580.jpg?v=1")
    );
  });

  it("ignores generic filenames so unrelated sites never match", () => {
    expect(imageFileKey("https://a.test/image1.jpg")).toBeNull();
  });
});
