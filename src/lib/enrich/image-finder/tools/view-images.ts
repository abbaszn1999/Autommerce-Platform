import sharp from "sharp";
import { readCapped, safeFetch } from "./url-safety";

const MAX_IMAGE_BYTES = 10_000_000;
const PREVIEW_EDGE = 640;
const TIMEOUT_MS = 12_000;

export interface ViewedImage {
  url: string;
  ok: boolean;
  width?: number;
  height?: number;
  dataUrl?: string;
  error?: string;
}

export async function loadImagePreview(url: string): Promise<ViewedImage> {
  try {
    const { response } = await safeFetch(url, {
      headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { url, ok: false, error: `HTTP ${response.status}` };
    }
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) {
      await response.body?.cancel().catch(() => undefined);
      return { url, ok: false, error: `Not an image (${contentType || "unknown type"})` };
    }
    const buffer = await readCapped(response, MAX_IMAGE_BYTES);
    if (!buffer) return { url, ok: false, error: "Image too large" };
    const image = sharp(buffer, { failOn: "none", limitInputPixels: 100_000_000 }).timeout({ seconds: 10 });
    const meta = await image.metadata();
    const preview = await image
      .rotate()
      .resize(PREVIEW_EDGE, PREVIEW_EDGE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 72 })
      .toBuffer();
    return {
      url,
      ok: true,
      width: meta.width,
      height: meta.height,
      dataUrl: `data:image/jpeg;base64,${preview.toString("base64")}`,
    };
  } catch (error) {
    return { url, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
