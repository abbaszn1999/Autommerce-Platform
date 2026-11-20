/**
 * The image models Vera's own `generate_image` tool calls, and what each image costs.
 * Prices are the providers' published rates in USD per million tokens, read 2026-11-20:
 * - Google, aistudio.google.com/docs/pricing: Nano Banana 2.1.
 * - OpenAI, developers.openai.com/api/docs/models: GPT Image 2.6 Sunburst and Flare.
 * Every image is charged from the token counts the provider returns with it; the
 * per-image figures are only used when a provider returns an image without usage.
 */

export const IMAGE_MODELS = {
  "gemini-nano-banana-2.1": { label: "Nano Banana 2.1", provider: "google" },
  "gpt-image-2.6-sunburst": { label: "GPT Image 2.6 Sunburst", provider: "openai" },
  "gpt-image-2.6-flare": { label: "GPT Image 2.6 Flare", provider: "openai" },
} as const;

export type ImageModelId = keyof typeof IMAGE_MODELS;
export const IMAGE_MODEL_IDS = Object.keys(IMAGE_MODELS) as ImageModelId[];
export const DEFAULT_IMAGE_MODEL: ImageModelId = "gemini-nano-banana-2.1";

export const IMAGE_SIZES = ["1K", "2K", "4K"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];
export const ASPECT_RATIOS = ["1:1", "4:5", "5:4", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9", "21:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export const GPT_QUALITIES = ["low", "medium", "high"] as const;
export type GptQuality = (typeof GPT_QUALITIES)[number];

/** Nano Banana 2.1: input (text and images), text and thinking output, image output. */
export const NANO_BANANA_21_RATES = { input: 1.5, textOutput: 7.5, imageOutput: 30 };
/** Google's published price of one image, when a call returns no usage breakdown. */
export const NANO_BANANA_21_PER_IMAGE: Record<ImageSize, number> = { "1K": 0.0336, "2K": 0.0504, "4K": 0.113 };

/** GPT Image 2.6 (Sunburst and Flare share these rates). */
export const GPT_IMAGE_26_RATES = { textInput: 5, cachedTextInput: 1.25, imageInput: 8, cachedImageInput: 2, imageOutput: 30 };
/**
 * OpenAI publishes no per-image price for 2.6; the GPT Image 2 figures for
 * 1024x1024, used only when a call returns an image without usage.
 */
export const GPT_IMAGE_26_FALLBACK: Record<GptQuality, number> = { low: 0.006, medium: 0.053, high: 0.211 };

export type ImageCost = { usd: number; source: "usage" | "table" | "none" };

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

/** Image tokens out of a Google Interactions usage object (`output_tokens_by_modality`). */
export function googleImageTokens(usage: unknown): number {
  const list = (usage as { output_tokens_by_modality?: unknown } | null)?.output_tokens_by_modality;
  if (!Array.isArray(list)) return 0;
  return list.reduce((sum: number, entry) => {
    const record = entry as { modality?: unknown; tokens?: unknown };
    return String(record?.modality ?? "").toLowerCase() === "image" ? sum + num(record.tokens) : sum;
  }, 0);
}

/**
 * One Nano Banana 2.1 call, priced from Google's usage: input at the input rate,
 * image tokens at the image rate, the remaining output and thinking at the text rate.
 * Without an image breakdown, a returned image is priced from Google's per-image table.
 */
export function nanoBananaCost(usage: unknown, size: ImageSize, imageReturned: boolean): ImageCost {
  const u = (usage ?? {}) as Record<string, unknown>;
  const input = num(u.total_input_tokens);
  const output = num(u.total_output_tokens);
  const thoughts = num(u.total_thought_tokens);
  const imageTokens = googleImageTokens(usage);
  const r = NANO_BANANA_21_RATES;
  if (imageTokens > 0) {
    const text = Math.max(0, output - imageTokens) + thoughts;
    return { usd: (input * r.input + imageTokens * r.imageOutput + text * r.textOutput) / 1_000_000, source: "usage" };
  }
  const base = (input * r.input + thoughts * r.textOutput) / 1_000_000;
  if (imageReturned) return { usd: base + NANO_BANANA_21_PER_IMAGE[size], source: "table" };
  // No image: the input and any thinking Google reported are still billed.
  return { usd: base + (output * r.textOutput) / 1_000_000, source: base > 0 || output > 0 ? "usage" : "none" };
}

/**
 * One GPT Image 2.6 call, priced from OpenAI's usage: text and image input
 * (cached parts at the cached rates) and every output token at the image rate.
 */
export function gptImageCost(usage: unknown, quality: GptQuality, imageReturned: boolean): ImageCost {
  const u = (usage ?? {}) as Record<string, unknown>;
  const details = (u.input_tokens_details ?? {}) as Record<string, unknown>;
  const input = num(u.input_tokens);
  const output = num(u.output_tokens);
  if (input > 0 || output > 0) {
    const imageIn = num(details.image_tokens);
    const textIn = details.text_tokens !== undefined ? num(details.text_tokens) : Math.max(0, input - imageIn);
    const cachedText = num(details.cached_text_tokens);
    const cachedImage = num(details.cached_image_tokens);
    const r = GPT_IMAGE_26_RATES;
    const usd =
      (Math.max(0, textIn - cachedText) * r.textInput +
        cachedText * r.cachedTextInput +
        Math.max(0, imageIn - cachedImage) * r.imageInput +
        cachedImage * r.cachedImageInput +
        output * r.imageOutput) /
      1_000_000;
    return { usd, source: "usage" };
  }
  return imageReturned ? { usd: GPT_IMAGE_26_FALLBACK[quality], source: "table" } : { usd: 0, source: "none" };
}

/** OpenAI's sizes for an aspect ratio: square, landscape or portrait. */
export function gptImageSize(aspect: AspectRatio): "1024x1024" | "1536x1024" | "1024x1536" {
  const [w, h] = aspect.split(":").map(Number) as [number, number];
  if (w === h) return "1024x1024";
  return w > h ? "1536x1024" : "1024x1536";
}
