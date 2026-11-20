import { promises as fs } from "node:fs";
import path from "node:path";
import type { SDKCustomTool } from "@cursor/sdk";
import { GoogleGenAI } from "@google/genai";
import {
  ASPECT_RATIOS,
  DEFAULT_IMAGE_MODEL,
  GPT_QUALITIES,
  IMAGE_MODELS,
  IMAGE_MODEL_IDS,
  IMAGE_SIZES,
  gptImageCost,
  gptImageSize,
  nanoBananaCost,
  type AspectRatio,
  type GptQuality,
  type ImageCost,
  type ImageModelId,
  type ImageSize,
} from "../../../src/lib/store-agent/image-models";
import { resolveConfined } from "./file-tools";

/**
 * Vera's own image tool. Cursor's built-in generateImage picks its model itself
 * and reports no price, so images are made here instead: Nano Banana 2.1 by
 * default, GPT Image 2.6 (Sunburst or Flare) when the user asks for it. Each
 * image is charged from the token counts the provider returns with it, failed
 * calls included when the provider still billed them.
 */

/** Images one run may make: a loop or a misunderstanding cannot run up a bill. */
export const MAX_IMAGES_PER_RUN = 10;
const MAX_REFERENCES = 8;
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const CALL_TIMEOUT_MS = 180_000;
const REFERENCE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });
const failure = (value: string) => ({ content: [{ type: "text" as const, text: value }], isError: true as const });

export type ImageToolDeps = {
  cwd: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
  /** Adds a provider's charge to the run (every billed call, made image or not). */
  onCost: (usd: number, label: string) => void;
  /** A new image in the chat folder, to show in the panel. */
  onImage: (relative: string) => void;
  log?: (message: string, extra?: unknown) => void;
  /** Test seam: the HTTP client for OpenAI and the Google client. */
  fetchImpl?: typeof fetch;
  google?: Pick<GoogleGenAI, "interactions">;
};

type Reference = { name: string; mime: string; bytes: Buffer };
type Made = { bytes: Buffer | null; extension: string; cost: ImageCost; error?: string };

const RETRYABLE = /\b(429|500|502|503|504)\b|timeout|timed out|deadline|unavailable|overloaded|fetch failed|ECONNRESET|socket/i;
/** A 429 that is about money, not load: retrying cannot help. */
const NO_CREDIT = /credit|quota|billing|insufficient/i;
const retryable = (message: string) => RETRYABLE.test(message) && !NO_CREDIT.test(message);
/** Failed calls per model in one message before the tool stops trying that model. */
const MAX_FAILURES_PER_MODEL = 2;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("The image model timed out")), ms);
    }),
  ]);
}

async function makeWithGoogle(deps: ImageToolDeps, prompt: string, aspect: AspectRatio, size: ImageSize, refs: Reference[]): Promise<Made> {
  const ai = deps.google ?? new GoogleGenAI({ apiKey: deps.geminiApiKey! });
  const input = [
    { type: "text", text: prompt },
    ...refs.map((r) => ({ type: "image", mime_type: r.mime, data: r.bytes.toString("base64") })),
  ];
  const interaction = (await withTimeout(
    ai.interactions.create({
      model: "gemini-nano-banana-2.1",
      input,
      // Nano Banana 2.1 returns JPEG only ("image/png" is refused).
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: aspect, image_size: size },
    } as never),
    CALL_TIMEOUT_MS
  )) as { status?: string; usage?: unknown; output_image?: { data?: string; mime_type?: string } };
  const data = interaction.output_image?.data;
  const returned = interaction.status === "completed" && !!data;
  const cost = nanoBananaCost(interaction.usage, size, returned);
  if (!returned) return { bytes: null, extension: ".png", cost, error: interaction.status === "completed" ? "The image model returned no image" : `The image model stopped (${interaction.status ?? "unknown"})` };
  const mime = interaction.output_image?.mime_type ?? "image/jpeg";
  return { bytes: Buffer.from(data!, "base64"), extension: mime.includes("jpeg") ? ".jpg" : mime.includes("webp") ? ".webp" : ".png", cost };
}

async function makeWithOpenAI(deps: ImageToolDeps, model: ImageModelId, prompt: string, aspect: AspectRatio, quality: GptQuality, refs: Reference[]): Promise<Made> {
  const doFetch = deps.fetchImpl ?? fetch;
  const size = gptImageSize(aspect);
  const headers = { Authorization: `Bearer ${deps.openaiApiKey!}` };
  let response: Response;
  if (refs.length) {
    // With reference images: the edits endpoint, as multipart form data.
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", quality);
    form.append("output_format", "png");
    for (const r of refs) form.append("image[]", new Blob([new Uint8Array(r.bytes)], { type: r.mime }), r.name);
    response = await doFetch("https://api.openai.com/v1/images/edits", { method: "POST", headers, body: form, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
  } else {
    response = await doFetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, size, quality, n: 1, output_format: "png" }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  }
  const body = (await response.json().catch(() => ({}))) as { data?: Array<{ b64_json?: string }>; usage?: unknown; error?: { message?: string } };
  const data = body.data?.[0]?.b64_json;
  const cost = gptImageCost(body.usage, quality, !!data);
  if (!response.ok || !data) return { bytes: null, extension: ".png", cost, error: body.error?.message ? `OpenAI: ${body.error.message} (${response.status})` : `OpenAI returned no image (${response.status})` };
  return { bytes: Buffer.from(data, "base64"), extension: ".png", cost };
}

async function readReferences(cwd: string, paths: unknown): Promise<Reference[]> {
  if (paths === undefined) return [];
  if (!Array.isArray(paths)) throw new Error("reference_images must be a list of paths in your folder.");
  if (paths.length > MAX_REFERENCES) throw new Error(`Use at most ${MAX_REFERENCES} reference images.`);
  const refs: Reference[] = [];
  for (const p of paths) {
    const local = await resolveConfined(cwd, p, { mustExist: true });
    const mime = REFERENCE_TYPES[path.extname(local).toLowerCase()];
    if (!mime) throw new Error(`${p} is not a PNG, JPG or WebP image.`);
    const bytes = await fs.readFile(local);
    if (bytes.length > MAX_REFERENCE_BYTES) throw new Error(`${p} is larger than ${MAX_REFERENCE_BYTES / 1024 / 1024} MB.`);
    refs.push({ name: path.basename(local), mime, bytes });
  }
  return refs;
}

/** A free name under images/ for the new picture. */
async function freeImagePath(cwd: string, wanted: unknown, extension: string): Promise<string> {
  const base = (typeof wanted === "string" ? path.parse(wanted).name : "").replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `image-${Date.now()}`;
  for (let n = 1; ; n++) {
    const relative = `images/${n === 1 ? base : `${base}-${n}`}${extension}`;
    try {
      await fs.access(path.join(cwd, ...relative.split("/")));
    } catch {
      return relative;
    }
  }
}

export function createImageTool(deps: ImageToolDeps): Record<string, SDKCustomTool> {
  let made = 0;
  const failures = new Map<ImageModelId, number>();
  return {
    generate_image: {
      description:
        "Create a new image (banner, lifestyle scene, background, concept, ad visual) and show it to the user. " +
        "Model: Nano Banana 2.1 by default; GPT Image 2.6 only when the user asks for GPT or OpenAI (sunburst for quality, flare for speed). " +
        "Optional reference_images (files in your folder: an attachment or a saved product photo) to edit or keep a product's look. " +
        "Not for a photo of a real product you have not been given. The result tells you the model used and what the image cost.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "What the image shows, in detail: subject, setting, style, colors, text in the image." },
          model: { type: "string", enum: IMAGE_MODEL_IDS, description: `Default ${DEFAULT_IMAGE_MODEL}. Only the GPT models when the user asks for GPT/OpenAI.` },
          aspect_ratio: { type: "string", enum: [...ASPECT_RATIOS], description: "Default 1:1. GPT models give 1:1, landscape (3:2) or portrait (2:3) and pick the closest." },
          size: { type: "string", enum: [...IMAGE_SIZES], description: "Nano Banana only. Default 1K; 2K or 4K only when the user needs a large image (they cost more)." },
          quality: { type: "string", enum: [...GPT_QUALITIES], description: "GPT models only. Default medium." },
          reference_images: { type: "array", items: { type: "string" }, description: `Up to ${MAX_REFERENCES} images in your folder to base the new image on.` },
          file_name: { type: "string", description: "Optional short file name, without folder." },
        },
        required: ["prompt"],
      },
      execute: async (args: Record<string, unknown>) => {
        const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
        if (!prompt) return failure("Describe the image in prompt.");
        const model = (IMAGE_MODEL_IDS as string[]).includes(String(args.model)) ? (args.model as ImageModelId) : DEFAULT_IMAGE_MODEL;
        const aspect = (ASPECT_RATIOS as readonly string[]).includes(String(args.aspect_ratio)) ? (args.aspect_ratio as AspectRatio) : "1:1";
        const size = (IMAGE_SIZES as readonly string[]).includes(String(args.size)) ? (args.size as ImageSize) : "1K";
        const quality = (GPT_QUALITIES as readonly string[]).includes(String(args.quality)) ? (args.quality as GptQuality) : "medium";
        const { label, provider } = IMAGE_MODELS[model];
        if (provider === "google" && !deps.geminiApiKey) return failure("Image generation with Nano Banana is not set up on this platform yet (no Google key). Tell the user.");
        if (provider === "openai" && !deps.openaiApiKey) return failure("Image generation with GPT Image is not set up on this platform yet (no OpenAI key). Tell the user, or offer Nano Banana 2.1.");
        if (made >= MAX_IMAGES_PER_RUN) return failure(`This message already made ${MAX_IMAGES_PER_RUN} images, the limit for one message. Show the user what you made and let them ask for more.`);
        if ((failures.get(model) ?? 0) >= MAX_FAILURES_PER_MODEL)
          return failure(`${label} failed ${MAX_FAILURES_PER_MODEL} times in this message, so it is stopped for now. Tell the user what went wrong; do not try again or switch models unless they ask.`);

        let refs: Reference[];
        try {
          refs = await readReferences(deps.cwd, args.reference_images);
        } catch (error) {
          return failure((error as Error).message);
        }

        let result: Made | null = null;
        let lastError = "Image generation failed";
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            result = provider === "google" ? await makeWithGoogle(deps, prompt, aspect, size, refs) : await makeWithOpenAI(deps, model, prompt, aspect, quality, refs);
          } catch (error) {
            lastError = (error as Error).message || lastError;
            result = null;
            if (attempt === 1 && retryable(lastError)) continue;
            break;
          }
          // A billed attempt is charged whether or not it gave an image.
          if (result.cost.usd > 0) deps.onCost(result.cost.usd, `${label} image${result.bytes ? "" : " (failed)"}`);
          if (result.bytes) break;
          lastError = result.error ?? lastError;
          if (!(attempt === 1 && retryable(lastError))) break;
        }
        if (!result?.bytes) {
          failures.set(model, (failures.get(model) ?? 0) + 1);
          deps.log?.(`generate_image failed (${model})`, lastError);
          const reason = NO_CREDIT.test(lastError) ? `${label} is unavailable: the platform's account with the provider has no credit left.` : `The image could not be made with ${label}: ${lastError.slice(0, 300)}`;
          return failure(`${reason} Tell the user. Do not switch to another model unless the user asks for it.`);
        }

        made += 1;
        const relative = await freeImagePath(deps.cwd, args.file_name, result.extension);
        const target = path.join(deps.cwd, ...relative.split("/"));
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, result.bytes);
        deps.onImage(relative);
        const settings = provider === "google" ? `${aspect}, ${size}` : `${gptImageSize(aspect)}, ${quality} quality`;
        return text(
          `Made ${relative} with ${label} (${settings}) and showed it to the user. Cost: $${result.cost.usd.toFixed(4)}` +
            `${result.cost.source === "table" ? " (provider's list price; no usage was returned)" : ""}. ` +
            "If the user asks which model made it, it was " + label + "."
        );
      },
    },
  };
}
