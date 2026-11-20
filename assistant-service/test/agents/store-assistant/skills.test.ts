import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { veraRule } from "../../../src/agents/store-assistant/instructions";
import type { SDKCustomTool } from "@cursor/sdk";
import { createReadSkillTool, skillsSection } from "../../../src/core/guides";
import { STORE_ASSISTANT_GUIDES } from "../../../src/agents/store-assistant/guides";
import { createInlineImageTool, imageDataUri } from "../../../src/agents/store-assistant/guides/inline-image";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "vera-skills-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

type Execute = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
const run = (tools: Record<string, SDKCustomTool>, name: string, args: Record<string, unknown>) => (tools[name]!.execute as unknown as Execute)(args);

describe("guides", () => {
  it("lists each guide in Vera's rules without its body", () => {
    const rule = veraRule({ storeName: "Kalema", shopDomain: "kalema.test", mode: "agent", autoRun: false });
    expect(rule).toContain("`read_skill`");
    expect(rule).toContain("`website-restructure`");
    expect(rule).not.toContain("3-click reachability");
    expect(skillsSection([])).toBe("");
  });

  it("returns a guide's full text, and refuses an unknown name", async () => {
    const tools = createReadSkillTool(STORE_ASSISTANT_GUIDES);
    const ok = await run(tools, "read_skill", { name: "website-restructure" });
    expect(ok.isError).toBeUndefined();
    expect(ok.content[0]!.text).toBe(STORE_ASSISTANT_GUIDES[0]!.body);
    expect(ok.content[0]!.text).toContain("3-click reachability");
    const bad = await run(tools, "read_skill", { name: "nope" });
    expect(bad.isError).toBe(true);
  });

  it("keeps the website guide consistent with what the report panel allows", () => {
    const body = STORE_ASSISTANT_GUIDES.find((s) => s.name === "website-restructure")!.body;
    expect(body).toContain("inline_image");
    expect(body).toContain('href is exactly "#"');
    // The old builder's page tools are gone.
    expect(body).not.toMatch(/website_get_state|WR_LOGO_SRC|editsLeft/);
  });
});

describe("inline_image", () => {
  const html = '<header><img src="{{LOGO}}" alt="logo"></header><img src="{{LOGO}}">';
  const setup = async (image: Uint8Array | string, page = html) => {
    await fs.mkdir(path.join(root, "attachments"), { recursive: true });
    await fs.mkdir(path.join(root, "website-restructure"), { recursive: true });
    await fs.writeFile(path.join(root, "attachments", "logo.bin"), image);
    await fs.writeFile(path.join(root, "website-restructure", "header.html"), page);
  };
  const args = { html: "website-restructure/header.html", image: "attachments/logo.bin" };

  it("recognises images by their bytes", () => {
    expect(imageDataUri(PNG)).toMatch(/^data:image\/png;base64,/);
    expect(imageDataUri(new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="x"/>'))).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(imageDataUri(new TextEncoder().encode("plain text"))).toBeNull();
  });

  it("replaces every placeholder with the image and reports the file as written", async () => {
    await setup(PNG);
    const written: string[] = [];
    const out = await run(createInlineImageTool(root, (r) => written.push(r)), "inline_image", args);
    expect(out.isError).toBeUndefined();
    const page = await fs.readFile(path.join(root, "website-restructure", "header.html"), "utf8");
    expect(page).not.toContain("{{LOGO}}");
    expect(page.match(/data:image\/png;base64,/g)).toHaveLength(2);
    expect(written).toEqual(["website-restructure/header.html"]);
  });

  it("refuses what is not an image, a missing placeholder, a big image and paths outside the folder", async () => {
    await setup("just text");
    const tools = createInlineImageTool(root, () => undefined);
    expect((await run(tools, "inline_image", args)).isError).toBe(true);

    await setup(PNG, "<header>no placeholder</header>");
    const missing = await run(tools, "inline_image", args);
    expect(missing.isError).toBe(true);
    expect(missing.content[0]!.text).toContain("{{LOGO}}");

    await setup(new Uint8Array(1024 * 1024 + 1).fill(0));
    const big = await run(tools, "inline_image", args);
    expect(big.content[0]!.text).toContain("larger than 1 MB");

    await setup(PNG);
    expect((await run(tools, "inline_image", { ...args, image: "../outside.png" })).isError).toBe(true);
    expect((await run(tools, "inline_image", { ...args, html: "attachments/logo.bin" })).isError).toBe(true);
  });
});
