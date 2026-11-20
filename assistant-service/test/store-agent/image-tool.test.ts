import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MAX_IMAGES_PER_RUN, createImageTool, type ImageToolDeps } from "../../src/store-agent/image-tool";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

async function setup(overrides: Partial<ImageToolDeps> = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "image-tool-"));
  const costs: Array<[number, string]> = [];
  const images: string[] = [];
  const create = vi.fn(async () => ({
    status: "completed",
    output_image: { data: PNG.toString("base64"), mime_type: "image/png" },
    usage: { total_input_tokens: 100, total_output_tokens: 1120, output_tokens_by_modality: [{ modality: "image", tokens: 1120 }] },
  }));
  const deps: ImageToolDeps = {
    cwd,
    geminiApiKey: "g",
    openaiApiKey: "o",
    onCost: (usd, label) => costs.push([usd, label]),
    onImage: (relative) => images.push(relative),
    google: { interactions: { create } } as never,
    ...overrides,
  };
  const tool = createImageTool(deps).generate_image!;
  const run = (args: Record<string, unknown>) => tool.execute(args as never, {} as never) as Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
  return { cwd, costs, images, create, run };
}

describe("generate_image", () => {
  it("makes a Nano Banana 2.1 image by default, saves it, shows it and charges Google's usage", async () => {
    const { cwd, costs, images, create, run } = await setup();
    const result = await run({ prompt: "a red apple", aspect_ratio: "16:9", file_name: "apple" });
    expect(result.isError).toBeUndefined();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: "gemini-nano-banana-2.1",
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "16:9", image_size: "1K" },
    }));
    expect(images).toEqual(["images/apple.png"]); // the fake returns PNG bytes and says image/png
    expect(await readFile(path.join(cwd, "images", "apple.png"))).toEqual(PNG);
    expect(costs).toEqual([[(100 * 1.5 + 1120 * 30) / 1e6, "Nano Banana 2.1 image"]]);
    expect(result.content[0]!.text).toContain("Nano Banana 2.1");
  });

  it("calls OpenAI for a GPT model and charges its usage", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: PNG.toString("base64") }], usage: { input_tokens: 20, output_tokens: 1056, input_tokens_details: { text_tokens: 20, image_tokens: 0 } } }), { status: 200 }));
    const { costs, images, run } = await setup({ fetchImpl: fetchImpl as never });
    await run({ prompt: "a red apple", model: "gpt-image-2.6-flare", quality: "low" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "gpt-image-2.6-flare", size: "1024x1024", quality: "low", n: 1 });
    expect(images).toHaveLength(1);
    expect(costs[0]![0]).toBeCloseTo((20 * 5 + 1056 * 30) / 1e6, 10);
  });

  it("sends reference images from the chat folder and refuses paths outside it", async () => {
    const { cwd, create, run } = await setup();
    await writeFile(path.join(cwd, "product.png"), PNG);
    await run({ prompt: "same product on a beach", reference_images: ["product.png"] });
    const input = (create.mock.calls[0] as unknown as [{ input: Array<{ type: string; mime_type?: string }> }])[0].input;
    expect(input[1]).toMatchObject({ type: "image", mime_type: "image/png" });
    const outside = await run({ prompt: "x", reference_images: ["../secret.png"] });
    expect(outside.isError).toBe(true);
  });

  it("charges a billed failure, says why, and shows nothing", async () => {
    const create = vi.fn(async () => ({ status: "failed", usage: { total_input_tokens: 500 } }));
    const { costs, images, run } = await setup({ google: { interactions: { create } } as never });
    const result = await run({ prompt: "x" });
    expect(result.isError).toBe(true);
    expect(images).toEqual([]);
    expect(costs).toEqual([[(500 * 1.5) / 1e6, "Nano Banana 2.1 image (failed)"]]);
  });

  it("does not retry an out-of-credit error, and stops a model after two failures", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: "You have no credits remaining." } }), { status: 429 }));
    const { run } = await setup({ fetchImpl: fetchImpl as never });
    const first = await run({ prompt: "x", model: "gpt-image-2.6-sunburst" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.content[0]!.text).toContain("no credit left");
    expect(first.content[0]!.text).toContain("Do not switch to another model");
    await run({ prompt: "x", model: "gpt-image-2.6-sunburst" });
    const third = await run({ prompt: "x", model: "gpt-image-2.6-sunburst" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(third.content[0]!.text).toContain("stopped for now");
  });

  it("is off without a key, and stops after the per-message limit", async () => {
    const noKey = await setup({ geminiApiKey: undefined });
    expect((await noKey.run({ prompt: "x" })).isError).toBe(true);
    const { run, images } = await setup();
    for (let i = 0; i < MAX_IMAGES_PER_RUN; i++) await run({ prompt: `image ${i}` });
    expect(images).toHaveLength(MAX_IMAGES_PER_RUN);
    expect((await run({ prompt: "one more" })).isError).toBe(true);
  });
});
