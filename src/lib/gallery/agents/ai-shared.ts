import type { GalleryAiSettings } from "@/lib/gallery/types";

/**
 * Reference image for Gemini Interactions API.
 * Docs: either inline `data`+`mime_type`, or public `uri`+`mime_type`
 * (https://ai.google.dev/gemini-api/docs/image-understanding).
 */
export type AiReferenceRole = "product" | "model" | "logo" | "brandGuide";

export type AiReferenceImage = {
  /** What the image is for. Roles drive selection and wording; labels are display text only. */
  role: AiReferenceRole;
  /** Stable identity (storage path or source URL); part of the plan fingerprint. */
  key?: string;
  label: string;
  contentType: string;
  /** Inline bytes (preferred for generated / private storage assets). */
  buffer?: Buffer;
  /** Public HTTPS URL fetched by Gemini (`ImageContent.uri`). */
  uri?: string;
};

export type AiImageModel = "gemini-3.1-flash-image" | "gemini-3-pro-image";

export function normalizeMimeType(
  value: string
): "image/jpeg" | "image/png" | "image/webp" {
  if (value === "image/png" || value === "image/webp") return value;
  return "image/jpeg";
}

/**
 * Build a Gemini Interactions `ImageContent` part from a reference.
 * Official shapes:
 * - `{ type: "image", data: base64, mime_type }`
 * - `{ type: "image", uri: "https://...", mime_type }`
 */
export function referenceToGeminiImagePart(
  reference: AiReferenceImage
): Record<string, unknown> {
  if (reference.uri && /^https?:\/\//i.test(reference.uri)) {
    return {
      type: "image",
      uri: reference.uri,
      mime_type: reference.contentType,
    };
  }
  if (reference.buffer && reference.buffer.length > 0) {
    return {
      type: "image",
      data: reference.buffer.toString("base64"),
      mime_type: reference.contentType,
    };
  }
  throw new Error("AI reference image requires buffer or public uri");
}

export function extensionForMime(value: string): string {
  if (value === "image/png") return "png";
  if (value === "image/webp") return "webp";
  return "jpg";
}

export function styleInstruction(style: string, hasSceneReference: boolean): string {
  if (hasSceneReference) {
    return [
      "Base lighting and finish may follow a commercial ecommerce look, but the scene/model reference overrides any default empty studio or pure-white background.",
      "Do not ignore the reference person or environment in favor of a plain catalog backdrop.",
    ].join(" ");
  }
  switch (style) {
    case "white":
      return "Clean ecommerce product photography on a seamless pure white background, soft grounded shadow, no decorative clutter.";
    case "lifestyle":
      return "Photorealistic lifestyle product photography in a natural, commercially useful setting.";
    case "editorial":
      return "Premium editorial campaign photography with art-directed lighting and polished composition.";
    case "custom":
      return "Follow the custom creative instructions exactly; do not add an unrelated house style.";
    default:
      return "Clean professional ecommerce studio photography with controlled softbox lighting, realistic materials, and a polished catalog finish.";
  }
}

export function referenceFlags(references: AiReferenceImage[]) {
  return {
    hasSceneReference: references.some((reference) => reference.role === "model"),
    hasLogo: references.some((reference) => reference.role === "logo"),
    hasBrandGuide: references.some((reference) => reference.role === "brandGuide"),
    referenceList: references
      .map((reference, index) => `Image ${index + 1}: ${reference.label}.`)
      .join("\n"),
  };
}

/** Aspect ratios the Gemini image models accept. */
export const GEMINI_ASPECT_RATIOS = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
] as const;

/**
 * API `image_size` value. Sizes are "512", "1K", "2K", "4K" (uppercase K; 0.5K is
 * written "512"). Only Nano Banana 2 has 512, so Nano Banana Pro falls back to 1K.
 */
export function geminiImageSize(resolution: string, model: AiImageModel): "512" | "1K" | "2K" | "4K" {
  const value = resolution.trim().toUpperCase();
  if (value === "4K") return "4K";
  if (value === "2K") return "2K";
  if (value === "0.5K" || value === "512") return model === "gemini-3.1-flash-image" ? "512" : "1K";
  return "1K";
}

/**
 * Image output format for the Interactions API. `mime_type` only accepts
 * "image/jpeg", so it is sent for JPEG and omitted otherwise; the stored bytes
 * are converted to the chosen format afterwards (see convertImageFormat).
 */
export function buildAiImageResponseFormat(
  settings: Pick<GalleryAiSettings, "aspectRatio" | "resolution" | "outputFormat">,
  model: AiImageModel
) {
  const aspectRatio = (GEMINI_ASPECT_RATIOS as readonly string[]).includes(settings.aspectRatio)
    ? settings.aspectRatio
    : "1:1";
  return {
    type: "image" as const,
    aspect_ratio: aspectRatio,
    image_size: geminiImageSize(settings.resolution, model),
    ...(settings.outputFormat === "image/png" ? {} : { mime_type: "image/jpeg" as const }),
  };
}

const STORABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Workspace storage only accepts JPEG, PNG and WebP. Downloaded originals in any
 * other format (AVIF, GIF, HEIC…) are converted before upload: PNG when they have
 * transparency, JPEG otherwise.
 */
export async function toStorableImage(image: {
  buffer: Buffer;
  contentType: string;
  ext: string;
}): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  if (STORABLE_IMAGE_TYPES.has(image.contentType)) return image;
  const { default: sharp } = await import("sharp");
  const source = sharp(image.buffer, { animated: false });
  const { hasAlpha } = await source.metadata();
  const pipeline = source.rotate();
  return hasAlpha
    ? { buffer: await pipeline.png().toBuffer(), contentType: "image/png", ext: "png" }
    : { buffer: await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer(), contentType: "image/jpeg", ext: "jpg" };
}

/** Convert returned image bytes to the format chosen in settings so stored files always match. */
export async function convertImageFormat(
  buffer: Buffer,
  fromType: string,
  targetType: "image/jpeg" | "image/png"
): Promise<{ buffer: Buffer; contentType: "image/jpeg" | "image/png" }> {
  if (normalizeMimeType(fromType) === targetType) {
    return { buffer, contentType: targetType };
  }
  const { default: sharp } = await import("sharp");
  const pipeline = sharp(buffer);
  const out =
    targetType === "image/png"
      ? await pipeline.png().toBuffer()
      : await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  return { buffer: out, contentType: targetType };
}
