/**
 * Image identity helpers: the same picture is recognised regardless of the
 * size or format it was requested in, and across a store's domain and its CDN.
 */

const SIZE_PARAMS = new Set([
  "width", "height", "w", "h", "size", "quality", "q", "fit", "crop", "format", "fm", "auto", "dpr", "v", "resize", "scale",
]);
const SIZE_SUFFIX =
  /(?:_(?:\d+x\d*|\d*x\d+|pico|icon|thumb|small|compact|medium|large|grande|original|master)(?:@\dx)?|-\d+x\d+|-scaled)(?=\.[a-z0-9]+$)/i;

/** Same image regardless of requested size/format: size query params and size suffixes removed. */
export function normalizeImageKey(raw: string): string {
  try {
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
    for (const key of [...url.searchParams.keys()]) {
      if (SIZE_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    const path = url.pathname.replace(SIZE_SUFFIX, "");
    const query = url.searchParams.toString();
    return `${url.hostname.toLowerCase()}${path}${query ? `?${query}` : ""}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/**
 * Filename key used to match the same file served from two hosts (a store's
 * own domain and its CDN). Only distinctive names count, so generic names like
 * `image1.jpg` never cause a cross-site match.
 */
export function imageFileKey(raw: string): string | null {
  try {
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
    const file = decodeURIComponent(url.pathname.split("/").pop() ?? "")
      .replace(SIZE_SUFFIX, "")
      .toLowerCase();
    const stem = file.replace(/\.[a-z0-9]+$/, "");
    if (stem.length < 12 || !/\d/.test(stem)) return null;
    return file;
  } catch {
    return null;
  }
}
