// Tools for the creative and landing-page phases: give an image made in the chat
// a public link an ad can use, and check that the pages ads send people to are
// fit to receive them (alive, not redirected away, indexable, fast, in stock, with
// a price).

import { promises as fs } from "node:fs";
import dns from "node:dns/promises";
import net from "node:net";
import type { SDKCustomTool } from "@cursor/sdk";
import { BUSINESS_FILES_BUCKET, safeFileName } from "../../../../src/lib/business-files";
import { mimeFor, resolveInChat } from "../files";
import { failure, stamp, text, type ToolContext } from "../tool-helpers";

/** How long a hosted image link works: long enough for the owner to approve the change that uses it. */
export const HOSTED_IMAGE_SECONDS = 24 * 3600;
/** Google Ads takes JPG, PNG and GIF under 5 MB. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif" };

/** Width and height read from the file's header (PNG, JPEG, GIF). */
export function imageSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length > 24 && bytes.toString("ascii", 1, 4) === "PNG") return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.length > 10 && bytes.toString("ascii", 0, 3) === "GIF") return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1]!;
      // Start-of-frame markers carry the size.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
      i += 2 + bytes.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** Which ad image shape a size is (landscape 1.91:1, square 1:1, portrait 4:5), within a few percent. */
export function imageShape(width: number, height: number): "landscape" | "square" | "portrait" | "other" {
  const ratio = width / height;
  const near = (target: number) => Math.abs(ratio - target) / target < 0.04;
  if (near(1.91)) return "landscape";
  if (near(1)) return "square";
  if (near(0.8)) return "portrait";
  return "other";
}

// ── Landing pages ──────────────────────────────────────────────────────────

const MAX_PAGES = 30;
const MAX_REDIRECTS = 5;
const PAGE_TIMEOUT_MS = 15_000;
const MAX_HTML = 1_500_000;
const SLOW_MS = 3000;

/** True for an address a public web server must never be asked to open (this machine, private networks, metadata services). */
export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number) as [number, number];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(address)) {
    const v = address.toLowerCase();
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
  }
  return true;
}

async function assertPublic(url: URL): Promise<void> {
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http and https pages can be checked.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("That address is not a public web page.");
    return;
  }
  const answers = await dns.lookup(host, { all: true }).catch(() => []);
  if (!answers.length) throw new Error("The domain does not resolve.");
  if (answers.some((a) => isPrivateAddress(a.address))) throw new Error("That address is not a public web page.");
}

export type PageFacts = {
  title: string | null;
  h1: string | null;
  noindex: boolean;
  canonical: string | null;
  viewport: boolean;
  lang: string | null;
  price: string | null;
  currency: string | null;
  availability: string | null;
};

const attr = (tag: string, name: string) => new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
const attrValue = (tag: string, name: string) => {
  const m = attr(tag, name);
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
};
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

/** What matters for an ad landing page, read from its HTML. */
export function pageFacts(html: string): PageFacts {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = (key: string, value: string) => metas.find((m) => attrValue(m, key)?.toLowerCase() === value);
  const robots = meta("name", "robots") ?? meta("name", "googlebot");
  const canonicalTag = (html.match(/<link\b[^>]*>/gi) ?? []).find((l) => /rel\s*=\s*["']?canonical/i.test(l));
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];

  // Price and stock from the product's structured data, then the Open Graph tags.
  let price: string | null = null;
  let currency: string | null = null;
  let availability: string | null = null;
  for (const block of html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? []) {
    const body = block.replace(/^<script[^>]*>|<\/script>$/gi, "");
    price ??= /"(?:lowPrice|price)"\s*:\s*"?([0-9][0-9.,]*)/.exec(body)?.[1] ?? null;
    currency ??= /"priceCurrency"\s*:\s*"([A-Za-z]{3})"/.exec(body)?.[1] ?? null;
    availability ??= /"availability"\s*:\s*"[^"]*?([A-Za-z]+)"/.exec(body)?.[1] ?? null;
  }
  price ??= attrValue(meta("property", "product:price:amount") ?? "", "content") ?? attrValue(meta("property", "og:price:amount") ?? "", "content");
  currency ??= attrValue(meta("property", "product:price:currency") ?? "", "content") ?? attrValue(meta("property", "og:price:currency") ?? "", "content");

  return {
    title: title ? decode(title.replace(/<[^>]+>/g, "")).slice(0, 200) : null,
    h1: h1 ? decode(h1.replace(/<[^>]+>/g, "")).slice(0, 200) : null,
    noindex: robots ? /noindex/i.test(attrValue(robots, "content") ?? "") : false,
    canonical: canonicalTag ? attrValue(canonicalTag, "href") : null,
    viewport: !!meta("name", "viewport"),
    lang: /<html\b[^>]*\blang\s*=\s*["']?([A-Za-z-]+)/i.exec(html)?.[1] ?? null,
    price,
    currency,
    availability,
  };
}

export type PageCheck = {
  url: string;
  finalUrl: string | null;
  status: number | null;
  redirects: number;
  ms: number | null;
  sizeKb: number | null;
  facts: PageFacts | null;
  /** Problems an ad buyer would act on, most serious first. */
  problems: string[];
};

/** The problems in a fetched page, most serious first. */
export function pageProblems(input: { url: string; finalUrl: string | null; status: number | null; redirects: number; ms: number | null; facts: PageFacts | null; error?: string }): string[] {
  const out: string[] = [];
  if (input.error) return [input.error];
  if (input.status === null) return ["The page did not answer."];
  if (input.status >= 400) out.push(`The page returns an error (${input.status}): ads sent here waste every click.`);
  if (input.finalUrl) {
    try {
      const from = new URL(input.url);
      const to = new URL(input.finalUrl);
      if (input.redirects > 0 && to.pathname.replace(/\/+$/, "") === "" && from.pathname.replace(/\/+$/, "") !== "")
        out.push("The link redirects to the home page: the visitor does not land on the product or category the ad promises.");
      else if (input.redirects >= 3) out.push(`The link goes through ${input.redirects} redirects: slow and some clicks are lost.`);
      if (from.protocol === "https:" && to.protocol === "http:") out.push("The page ends on plain http.");
    } catch {
      /* urls that do not parse have already failed */
    }
  }
  const facts = input.facts;
  if (facts) {
    if (facts.noindex) out.push("The page is marked noindex: fine for ads, but it cannot rank organically and Merchant Center may not accept it.");
    if (/outofstock|soldout|discontinued/i.test(facts.availability ?? "")) out.push(`The product is shown as ${facts.availability}: do not advertise it until it is back.`);
    if (!facts.price) out.push("No price in the page's structured data (expected on a product page): Shopping and the page may not show one.");
    if (!facts.viewport) out.push("No mobile viewport tag: the page may not be usable on phones, where most clicks come from.");
    if (facts.canonical && input.finalUrl) {
      try {
        if (new URL(facts.canonical, input.finalUrl).pathname.replace(/\/+$/, "") !== new URL(input.finalUrl).pathname.replace(/\/+$/, "")) out.push(`The page's canonical address is different (${facts.canonical}).`);
      } catch {
        /* an unusable canonical is not worth a warning */
      }
    }
  }
  if (input.ms !== null && input.ms > SLOW_MS) out.push(`The page took ${(input.ms / 1000).toFixed(1)} s to load (over ${SLOW_MS / 1000} s): conversions drop with every second.`);
  return out;
}

async function fetchPage(rawUrl: string, signal?: AbortSignal): Promise<PageCheck> {
  const started = Date.now();
  let current: URL;
  try {
    current = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return { url: rawUrl, finalUrl: null, status: null, redirects: 0, ms: null, sizeKb: null, facts: null, problems: ["This is not a valid web address."] };
  }
  let redirects = 0;
  try {
    for (;;) {
      await assertPublic(current);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort);
      try {
        const res = await fetch(current, {
          redirect: "manual",
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AutommerceAdsCheck/1.0)", Accept: "text/html,application/xhtml+xml" },
        });
        const location = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && location) {
          if (++redirects > MAX_REDIRECTS) return { url: rawUrl, finalUrl: current.toString(), status: res.status, redirects, ms: Date.now() - started, sizeKb: null, facts: null, problems: ["Too many redirects."] };
          current = new URL(location, current);
          continue;
        }
        const html = /html|xml|text/i.test(res.headers.get("content-type") ?? "") ? (await res.text()).slice(0, MAX_HTML) : "";
        const ms = Date.now() - started;
        const facts = html ? pageFacts(html) : null;
        const base = { url: rawUrl, finalUrl: current.toString(), status: res.status, redirects, ms, facts };
        return { ...base, sizeKb: Math.round(html.length / 1024), problems: pageProblems(base) };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    }
  } catch (error) {
    const message = (error as Error).name === "AbortError" ? "The page did not answer within 15 seconds." : (error as Error).message;
    return { url: rawUrl, finalUrl: current.toString(), status: null, redirects, ms: null, sizeKb: null, facts: null, problems: [message] };
  }
}

export function createCreativeTools(ctx: ToolContext): Record<string, SDKCustomTool> {
  return {
    host_image: {
      description:
        "Give an image from this chat's folder (one you made with generateImage, or a product image you saved) a public https link an ad can use. " +
        "The image must be a JPG, PNG or GIF under 5 MB; you get its size and which ad shape it fits (landscape 1.91:1, square 1:1, portrait 4:5). " +
        `The link works for ${HOSTED_IMAGE_SECONDS / 3600} hours, enough for the owner to approve the change that uses it. A WebP or larger image must be re-made as PNG or JPG first (run_script can convert it).`,
      inputSchema: {
        type: "object",
        properties: { path: { type: "string", description: "The image in this chat's folder, e.g. generated/banner.png." } },
        required: ["path"],
      },
      execute: async (args) => {
        try {
          const relative = typeof args.path === "string" ? args.path : "";
          const bytes = await fs.readFile(resolveInChat(ctx.files.cwd, relative)).catch(() => null);
          if (!bytes) return failure(`There is no file ${relative} in this chat's folder.`);
          const extension = relative.split(".").pop()?.toLowerCase() ?? "";
          if (!IMAGE_TYPES[extension]) return failure("Google Ads takes JPG, PNG and GIF images. Convert this one first (run_script) or make it again as PNG.");
          if (bytes.length > MAX_IMAGE_BYTES) return failure(`This image is ${(bytes.length / 1024 / 1024).toFixed(1)} MB; Google Ads takes images under 5 MB. Make it smaller first.`);
          const size = imageSize(bytes);
          const key = `${ctx.run.workspaceId}/hosted/${stamp()}-${safeFileName(relative.split("/").pop() ?? "image")}`;
          const upload = await ctx.db.storage.from(BUSINESS_FILES_BUCKET).upload(key, bytes, { contentType: IMAGE_TYPES[extension] ?? mimeFor(relative), upsert: true, cacheControl: "3600" });
          if (upload.error) return failure(`The image could not be hosted: ${upload.error.message}`);
          const signed = await ctx.db.storage.from(BUSINESS_FILES_BUCKET).createSignedUrl(key, HOSTED_IMAGE_SECONDS);
          if (!signed.data?.signedUrl) return failure("The image was stored but no link could be made. Try again.");
          return text(
            JSON.stringify({
              url: signed.data.signedUrl,
              validFor: `${HOSTED_IMAGE_SECONDS / 3600} hours`,
              width: size?.width ?? null,
              height: size?.height ?? null,
              fits: size ? imageShape(size.width, size.height) : "unknown",
              kb: Math.round(bytes.length / 1024),
            })
          );
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    check_landing_pages: {
      description:
        "Open the pages your ads would send people to and report what a buyer would fix: dead links (404), redirects to the home page, long redirect chains, noindex, slow loading, no price, out of stock, no mobile viewport, a different canonical address. " +
        "Also returns the price, currency and availability the page shows, so you can compare them with the feed or the store. Up to 30 pages per call. " +
        "Speed here is how long the page took to arrive, not a full browser test: say so. Run it on every final URL of a plan before proposing it, and after the store changes.",
      inputSchema: {
        type: "object",
        properties: { urls: { type: "array", items: { type: "string" }, description: "Page addresses to check (up to 30)." } },
        required: ["urls"],
      },
      execute: async (args) => {
        const urls = [...new Set((Array.isArray(args.urls) ? args.urls : []).map((u) => String(u ?? "").trim()).filter(Boolean))].slice(0, MAX_PAGES);
        if (!urls.length) return failure("Give at least one page address.");
        const results: PageCheck[] = [];
        // Four at a time: polite to the store and fast enough.
        for (let i = 0; i < urls.length; i += 4) {
          if (ctx.run.cancelled) break;
          results.push(...(await Promise.all(urls.slice(i, i + 4).map((u) => fetchPage(u, ctx.run.signal)))));
        }
        const bad = results.filter((r) => r.problems.length);
        return text(JSON.stringify({ checked: results.length, withProblems: bad.length, pages: results }, null, 1));
      },
    },
  };
}
