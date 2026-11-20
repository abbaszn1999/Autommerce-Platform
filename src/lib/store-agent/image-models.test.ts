import { describe, expect, it } from "vitest";
import { gptImageCost, gptImageSize, googleImageTokens, nanoBananaCost } from "./image-models";

describe("Nano Banana 2.1 cost", () => {
  it("prices a call from Google's usage: input, image tokens and the remaining text and thinking", () => {
    const usage = {
      total_input_tokens: 1000,
      total_output_tokens: 1200,
      total_thought_tokens: 300,
      output_tokens_by_modality: [{ modality: "image", tokens: 1120 }, { modality: "text", tokens: 80 }],
    };
    // 1000 x $1.50 + 1120 x $30 + (80 + 300) x $7.50, per million
    expect(nanoBananaCost(usage, "1K", true)).toEqual({ usd: (1000 * 1.5 + 1120 * 30 + 380 * 7.5) / 1e6, source: "usage" });
    expect(googleImageTokens(usage)).toBe(1120);
  });

  it("uses Google's per-image price when an image came back without a breakdown", () => {
    expect(nanoBananaCost({ total_input_tokens: 0 }, "2K", true)).toEqual({ usd: 0.0504, source: "table" });
    expect(nanoBananaCost(undefined, "4K", true)).toEqual({ usd: 0.113, source: "table" });
  });

  it("still charges what a failed call was billed, and nothing when nothing was", () => {
    expect(nanoBananaCost({ total_input_tokens: 2000, total_thought_tokens: 100 }, "1K", false)).toEqual({ usd: (2000 * 1.5 + 100 * 7.5) / 1e6, source: "usage" });
    expect(nanoBananaCost(undefined, "1K", false)).toEqual({ usd: 0, source: "none" });
  });
});

describe("GPT Image 2.6 cost", () => {
  it("prices a call from OpenAI's usage, with text and image input apart", () => {
    const usage = { input_tokens: 600, output_tokens: 1056, input_tokens_details: { text_tokens: 100, image_tokens: 500 } };
    expect(gptImageCost(usage, "medium", true)).toEqual({ usd: (100 * 5 + 500 * 8 + 1056 * 30) / 1e6, source: "usage" });
  });

  it("treats input without details as text, and uses the fallback only without usage", () => {
    expect(gptImageCost({ input_tokens: 50, output_tokens: 1000 }, "low", true).usd).toBeCloseTo((50 * 5 + 1000 * 30) / 1e6, 10);
    expect(gptImageCost(undefined, "high", true)).toEqual({ usd: 0.211, source: "table" });
    expect(gptImageCost(undefined, "high", false)).toEqual({ usd: 0, source: "none" });
  });

  it("maps an aspect ratio to OpenAI's square, landscape or portrait size", () => {
    expect(gptImageSize("1:1")).toBe("1024x1024");
    expect(gptImageSize("16:9")).toBe("1536x1024");
    expect(gptImageSize("4:5")).toBe("1024x1536");
  });
});
