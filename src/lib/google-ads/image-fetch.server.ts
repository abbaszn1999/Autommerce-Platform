// Downloads images for new ads and asset groups from public web addresses.
// The address comes from a chat, so it is treated as hostile: https only, no
// private, loopback or cloud-metadata hosts (checked again on every redirect),
// image types Google accepts, 5 MB at most, 10 seconds at most.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const TYPES = new Set(["image/jpeg", "image/png", "image/gif"]);

export class ImageFetchError extends Error {}

/** Addresses no request from our servers may reach. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number) as [number, number];
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff");
}

async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== "https:") throw new ImageFetchError("only https links");
  if (url.username || url.password) throw new ImageFetchError("links with a user name aren't allowed");
  if (url.port && url.port !== "443") throw new ImageFetchError("only the standard https port");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|metadata\.google\.internal)$/i.test(host) || host.endsWith(".local") || host.endsWith(".internal")) throw new ImageFetchError("not a public address");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new ImageFetchError("the site can't be found");
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new ImageFetchError("not a public address");
}

/** One image as base64, ready for an image asset. */
export async function fetchImage(raw: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImageFetchError("not a web address");
  }
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const res = await fetch(url, { redirect: "manual", signal, headers: { Accept: "image/jpeg,image/png,image/gif" } });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new ImageFetchError("a redirect with no address");
      url = new URL(next, url);
      continue;
    }
    if (!res.ok || !res.body) throw new ImageFetchError(`the site answered ${res.status}`);
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!TYPES.has(type)) throw new ImageFetchError("not a JPG, PNG or GIF image");
    if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) throw new ImageFetchError("larger than 5 MB");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new ImageFetchError("larger than 5 MB");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("base64");
  }
  throw new ImageFetchError("too many redirects");
}

/** Every image a change uses; one that fails is left out and the planner names it. */
export async function fetchImages(urls: string[]): Promise<{ images: Record<string, string>; failed: Record<string, string> }> {
  const images: Record<string, string> = {};
  const failed: Record<string, string> = {};
  await Promise.all(
    urls.slice(0, 40).map(async (u) => {
      try {
        images[u] = await fetchImage(u);
      } catch (err) {
        failed[u] = err instanceof ImageFetchError ? err.message : "couldn't be downloaded";
      }
    })
  );
  return { images, failed };
}
