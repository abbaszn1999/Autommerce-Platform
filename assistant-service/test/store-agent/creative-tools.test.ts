import { describe, expect, it } from "vitest";
import { imageShape, imageSize, isPrivateAddress, pageFacts, pageProblems } from "../../src/store-agent/google-ads/creative-tools";

/** A PNG header with a size (only the bytes the reader looks at). */
const png = (w: number, h: number) => {
  const b = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

describe("host_image helpers", () => {
  it("reads PNG and GIF sizes and names the ad shape", () => {
    expect(imageSize(png(1200, 628))).toEqual({ width: 1200, height: 628 });
    expect(imageShape(1200, 628)).toBe("landscape");
    expect(imageShape(1200, 1200)).toBe("square");
    expect(imageShape(960, 1200)).toBe("portrait");
    expect(imageShape(1000, 300)).toBe("other");
    const gif = Buffer.alloc(16);
    gif.write("GIF89a", 0, "ascii");
    gif.writeUInt16LE(300, 6);
    gif.writeUInt16LE(250, 8);
    expect(imageSize(gif)).toEqual({ width: 300, height: 250 });
  });

  it("reads a JPEG's size from its frame header", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x04, 0xb0, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
    expect(imageSize(jpeg)).toEqual({ width: 1200, height: 600 });
    expect(imageSize(Buffer.from("not an image"))).toBeNull();
  });
});

describe("check_landing_pages", () => {
  it("refuses private and local addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.20.1.1", "169.254.169.254", "::1", "fd00::1"]) expect(isPrivateAddress(ip)).toBe(true);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
  });

  it("reads title, price, stock and robots from a product page", () => {
    const html = `<html lang="ar"><head><title>Oud &amp; Musk</title><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,follow">
      <link rel="canonical" href="https://shop.com/p/oud"><script type="application/ld+json">{"@type":"Product","offers":{"price":"129.00","priceCurrency":"AED","availability":"https://schema.org/OutOfStock"}}</script></head><body><h1>Oud <b>Royal</b></h1></body></html>`;
    expect(pageFacts(html)).toMatchObject({ title: "Oud & Musk", h1: "Oud Royal", noindex: true, viewport: true, lang: "ar", price: "129.00", currency: "AED", availability: "OutOfStock", canonical: "https://shop.com/p/oud" });
  });

  it("flags what an ad buyer would act on, worst first", () => {
    const facts = { ...pageFacts("<html><head><title>x</title></head></html>"), availability: "OutOfStock" };
    const problems = pageProblems({ url: "https://shop.com/p/oud", finalUrl: "https://shop.com/", status: 200, redirects: 1, ms: 4200, facts });
    expect(problems[0]).toContain("redirects to the home page");
    expect(problems.join(" ")).toMatch(/OutOfStock/);
    expect(problems.join(" ")).toMatch(/No price/);
    expect(problems.join(" ")).toMatch(/viewport/);
    expect(problems.join(" ")).toMatch(/4\.2 s/);
    expect(pageProblems({ url: "u", finalUrl: "u", status: 404, redirects: 0, ms: 100, facts: null })[0]).toContain("404");
    expect(pageProblems({ url: "u", finalUrl: null, status: null, redirects: 0, ms: null, facts: null, error: "Boom" })).toEqual(["Boom"]);
  });
});