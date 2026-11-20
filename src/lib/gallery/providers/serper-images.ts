import type { GalleryGoogleSettings } from "@/lib/gallery/types";
import { galleryWarn } from "@/lib/gallery/log";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import sharp from "sharp";
import {
  failureFromStatus,
  isSlowOrigin,
  lighterImageUrl,
  type ImageDownloadFailure,
} from "@/lib/gallery/image-download";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_DOWNLOAD_ATTEMPTS = 3;
/**
 * Shops that build a resized copy on the first request (or slow bot-protected
 * ones) can take well over 20 seconds before the first byte.
 */
const ATTEMPT_TIMEOUT_MS = 30_000;
/** A timed-out first request often warms the origin's cache, so one more try is worth it. */
const MAX_TIMEOUT_ATTEMPTS = 2;

/** Content-Type is a singleton; Fetch joins duplicate headers with ", ". */
export function normalizeDeclaredContentType(raw: string | null): string {
  if (!raw) return "";
  return raw.split(",")[0].split(";")[0].trim().toLowerCase();
}

function isSoftAllowedContentType(declaredType: string): boolean {
  return (
    !declaredType ||
    declaredType === "application/octet-stream" ||
    declaredType === "binary/octet-stream" ||
    /^image\/(jpeg|jpg|png|webp|gif|avif)$/.test(declaredType)
  );
}

function isRetryableDownloadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("socket") ||
    msg.includes("tls") ||
    msg.includes("undici")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type DownloadedImage = { buffer: Buffer; contentType: string; ext: string };
type DownloadConstraints = Pick<GalleryGoogleSettings, "minResolution" | "aspectRatio">;

export async function downloadImageBytes(
  imageUrl: string,
  constraints?: DownloadConstraints
): Promise<DownloadedImage | null> {
  return (await downloadImageBytesDetailed(imageUrl, constraints)).image;
}

/**
 * Downloads one picture. When the shop is slow or unreachable, a lighter copy of
 * the same link (a smaller `?size=` or `?width=`) is tried before giving up, and
 * the result says why it failed so the row can tell the owner what to do.
 */
export async function downloadImageBytesDetailed(
  imageUrl: string,
  constraints?: DownloadConstraints
): Promise<{ image: DownloadedImage | null; failure?: ImageDownloadFailure }> {
  const first = await downloadOneImage(imageUrl, constraints);
  if (first.image || !isSlowOrigin(first.failure)) return first;
  const lighter = lighterImageUrl(imageUrl);
  if (!lighter) return first;
  galleryWarn("download", "Retrying with a lighter copy of the image", {
    reasonCode: "lighter_variant",
    imageUrl: imageUrl.slice(0, 200),
    lighter: lighter.slice(0, 200),
  });
  const second = await downloadOneImage(lighter, constraints);
  return second.image ? second : first;
}

async function downloadOneImage(
  imageUrl: string,
  constraints?: DownloadConstraints
): Promise<{ image: DownloadedImage | null; failure?: ImageDownloadFailure }> {
  let failure: ImageDownloadFailure | undefined;
  const isPrivateAddress = (address: string): boolean => {
    const value = address.toLowerCase();
    if (value === "::1" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) {
      return true;
    }
    if (value.startsWith("::ffff:")) {
      return isPrivateAddress(value.slice("::ffff:".length));
    }
    const parts = value.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] >= 224
    );
  };

  const assertSafeUrl = async (value: string): Promise<URL> => {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Unsupported image URL protocol");
    }
    if (
      url.username ||
      url.password ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".local")
    ) {
      throw new Error("Unsafe image URL");
    }
    const addresses = isIP(url.hostname)
      ? [{ address: url.hostname }]
      : await lookup(url.hostname, { all: true });
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => isPrivateAddress(address))
    ) {
      throw new Error("Image URL resolves to a private address");
    }
    return url;
  };

  const detectImageType = (
    buffer: Buffer
  ): { contentType: string; ext: string } | null => {
    if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
      return { contentType: "image/jpeg", ext: "jpg" };
    }
    if (
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return { contentType: "image/png", ext: "png" };
    }
    if (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
      return { contentType: "image/webp", ext: "webp" };
    }
    if (buffer.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/)) {
      return { contentType: "image/gif", ext: "gif" };
    }
    const boxType = buffer.subarray(4, 12).toString("ascii");
    if (/^ftyp(avif|avis|heic|heix|mif1)/.test(boxType)) {
      return { contentType: "image/avif", ext: "avif" };
    }
    return null;
  };

  const attemptDownload = async (): Promise<{
    buffer: Buffer;
    contentType: string;
    ext: string;
  } | null> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      let currentUrl = (await assertSafeUrl(imageUrl)).toString();
      let res: Response | null = null;
      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        res = await fetch(currentUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: new URL(currentUrl).origin + "/",
          },
          redirect: "manual",
        });
        if (![301, 302, 303, 307, 308].includes(res.status)) break;
        const location = res.headers.get("location");
        if (!location || redirect === MAX_REDIRECTS) {
          galleryWarn("download", "Image redirect chain exhausted", {
            reasonCode: "redirect_exhausted",
            imageUrl: imageUrl.slice(0, 200),
            status: res.status,
          });
          failure = "other";
          return null;
        }
        currentUrl = (
          await assertSafeUrl(new URL(location, currentUrl).toString())
        ).toString();
      }
      if (!res?.ok || !res.body) {
        galleryWarn("download", "Image HTTP response not OK", {
          reasonCode: "http_not_ok",
          imageUrl: imageUrl.slice(0, 200),
          status: res?.status ?? null,
        });
        failure = failureFromStatus(res?.status);
        return null;
      }

      const declaredLength = Number(res.headers.get("content-length") || 0);
      if (declaredLength > MAX_IMAGE_BYTES) {
        galleryWarn("download", "Image content-length too large", {
          reasonCode: "content_length_exceeded",
          imageUrl: imageUrl.slice(0, 200),
          declaredLength,
        });
        failure = "too_large";
        return null;
      }

      const rawDeclaredType = res.headers.get("content-type");
      const declaredType = normalizeDeclaredContentType(rawDeclaredType);
      // CDNs often omit type, use octet-stream, or send duplicate Content-Type
      // headers (Fetch joins them as "image/png, image/png"). Never hard-reject
      // on header alone — magic bytes below are authoritative.
      if (!isSoftAllowedContentType(declaredType)) {
        galleryWarn("download", "Image content-type suspicious; trusting magic bytes", {
          reasonCode: "content_type_suspicious",
          imageUrl: imageUrl.slice(0, 200),
          declaredType,
          rawDeclaredType: rawDeclaredType?.slice(0, 120) ?? null,
        });
      }

      const reader = res.body.getReader();
      const chunks: Buffer[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          await reader.cancel();
          galleryWarn("download", "Image body exceeded size limit", {
            reasonCode: "body_size_exceeded",
            imageUrl: imageUrl.slice(0, 200),
          });
          failure = "too_large";
          return null;
        }
        chunks.push(Buffer.from(value));
      }
      if (total === 0) {
        galleryWarn("download", "Image body empty", {
          reasonCode: "empty_body",
          imageUrl: imageUrl.slice(0, 200),
        });
        failure = "not_image";
        return null;
      }

      const buffer = Buffer.concat(chunks, total);
      const detected = detectImageType(buffer);
      if (!detected) {
        galleryWarn("download", "Body is not a recognized image", {
          reasonCode: "unrecognized_image",
          imageUrl: imageUrl.slice(0, 200),
          declaredType,
          bytes: total,
        });
        failure = "not_image";
        return null;
      }
      const dimensions = await sharp(buffer, {
        animated: false,
        limitInputPixels: 100_000_000,
      }).metadata();
      const width = dimensions.width || 0;
      const height = dimensions.height || 0;
      if (!width || !height || width * height > 100_000_000) {
        galleryWarn("download", "Image dimensions invalid", {
          reasonCode: "invalid_dimensions",
          imageUrl: imageUrl.slice(0, 200),
          width,
          height,
        });
        failure = "not_image";
        return null;
      }
      if (
        constraints?.minResolution &&
        (width < constraints.minResolution || height < constraints.minResolution)
      ) {
        galleryWarn("download", "Image below minResolution", {
          reasonCode: "below_min_resolution",
          imageUrl: imageUrl.slice(0, 200),
          width,
          height,
          minResolution: constraints.minResolution,
        });
        failure = "other";
        return null;
      }
      if (constraints?.aspectRatio && constraints.aspectRatio !== "any") {
        const ratio = width / height;
        const bucket =
          ratio >= 1.6 ? "landscape" : ratio <= 0.75 ? "portrait" : "square";
        if (bucket !== constraints.aspectRatio) {
          galleryWarn("download", "Image aspect ratio rejected", {
            reasonCode: "aspect_ratio_rejected",
            imageUrl: imageUrl.slice(0, 200),
            bucket,
            required: constraints.aspectRatio,
          });
          failure = "other";
          return null;
        }
      }
      return { buffer, ...detected };
    } finally {
      clearTimeout(timeout);
    }
  };

  let lastError: unknown = null;
  let timeouts = 0;
  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const image = await attemptDownload();
      return image ? { image } : { image: null, failure };
    } catch (error) {
      lastError = error;
      const timedOut = error instanceof Error && error.name === "AbortError";
      if (timedOut) timeouts += 1;
      failure = classifyDownloadError(error);
      if (
        (!timedOut && !isRetryableDownloadError(error)) ||
        timeouts >= MAX_TIMEOUT_ATTEMPTS ||
        attempt === MAX_DOWNLOAD_ATTEMPTS
      ) {
        break;
      }
      galleryWarn("download", "Image download retrying after network error", {
        reasonCode: timedOut ? "download_retry_timeout" : "download_retry",
        imageUrl: imageUrl.slice(0, 200),
        attempt,
        maxAttempts: MAX_DOWNLOAD_ATTEMPTS,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(250 * attempt);
    }
  }

  galleryWarn("download", "Image download threw", {
    reasonCode: "download_error",
    imageUrl: imageUrl.slice(0, 200),
    failure,
    error:
      lastError instanceof Error ? lastError.message : String(lastError ?? "unknown"),
  });
  return { image: null, failure };
}

function classifyDownloadError(error: unknown): ImageDownloadFailure {
  if (!(error instanceof Error)) return "other";
  if (error.name === "AbortError") return "timeout";
  const message = error.message.toLowerCase();
  if (message.includes("unsafe") || message.includes("private address") || message.includes("protocol")) {
    return "unsafe";
  }
  if (message.includes("enotfound")) return "missing";
  return "network";
}
