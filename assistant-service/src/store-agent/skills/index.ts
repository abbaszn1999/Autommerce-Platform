import { promises as fs } from "node:fs";
import path from "node:path";
import type { SDKCustomTool } from "@cursor/sdk";
import { resolveConfined } from "../file-tools";
import { WEBSITE_RESTRUCTURE_DESCRIPTION, WEBSITE_RESTRUCTURE_SKILL } from "./website-restructure";

/**
 * Guides for bigger kinds of work. Vera sees only each guide's name and
 * description in her rules; the full text is read with read_skill when a
 * request matches, so other chats do not carry it.
 */
export type Skill = { name: string; description: string; body: string };

export const SKILLS: readonly Skill[] = [{ name: "website-restructure", description: WEBSITE_RESTRUCTURE_DESCRIPTION, body: WEBSITE_RESTRUCTURE_SKILL }];

/** The part of her rules that lists the guides. */
export function skillsSection(skills: readonly Skill[] = SKILLS): string {
  if (!skills.length) return "";
  return `## Guides
You have guides for bigger kinds of work. When a request matches one, call \`read_skill\` with its name BEFORE you start, then follow it step by step. Do not call it for anything else, and read each guide once per chat.
${skills.map((s) => `- \`${s.name}\`: ${s.description}`).join("\n")}
`;
}

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });
const failure = (value: string) => ({ content: [{ type: "text" as const, text: value }], isError: true as const });

const MAX_LOGO_BYTES = 1024 * 1024;
const MAX_HTML_BYTES = 2 * 1024 * 1024;

/** The data address of an image file, from its first bytes (not its name), or null when it is not a web image. */
export function imageDataUri(bytes: Uint8Array): string | null {
  const b = bytes;
  let mime: string | null = null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) mime = "image/png";
  else if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) mime = "image/jpeg";
  else if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) mime = "image/gif";
  else if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) mime = "image/webp";
  else {
    const head = Buffer.from(b.slice(0, 512)).toString("utf8").trimStart().toLowerCase();
    if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) mime = "image/svg+xml";
  }
  return mime ? `data:${mime};base64,${Buffer.from(b).toString("base64")}` : null;
}

export function createSkillTools(root: string, onWrite: (relative: string) => void, skills: readonly Skill[] = SKILLS): Record<string, SDKCustomTool> {
  const names = skills.map((s) => s.name);
  return {
    read_skill: {
      description: `Read one of your guides in full. Available: ${names.join(", ")}.`,
      inputSchema: {
        type: "object",
        properties: { name: { type: "string", enum: names, description: "The guide's name." } },
        required: ["name"],
      },
      execute: async (args) => {
        const skill = skills.find((s) => s.name === String(args.name ?? "").trim());
        if (!skill) return failure(`There is no guide named "${String(args.name ?? "")}". Available: ${names.join(", ")}.`);
        return text(skill.body);
      },
    },
    inline_image: {
      description:
        "Put an image from your folder (a logo the user attached, PNG, JPEG, GIF, WebP or SVG, up to 1 MB) into an HTML file you wrote, as an inline data address. " +
        "In the HTML write the placeholder (default {{LOGO}}) where the address goes, for example src=\"{{LOGO}}\"; this replaces every occurrence. " +
        "The report panel cannot load images from your folder, so this is the only way to show an attached logo.",
      inputSchema: {
        type: "object",
        properties: {
          html: { type: "string", description: "The HTML file in your folder." },
          image: { type: "string", description: "The image file in your folder (for example attachments/logo.png)." },
          placeholder: { type: "string", description: "Text in the HTML to replace. Default {{LOGO}}." },
        },
        required: ["html", "image"],
      },
      execute: async (args) => {
        try {
          const placeholder = typeof args.placeholder === "string" && args.placeholder.trim() ? args.placeholder.trim() : "{{LOGO}}";
          const htmlPath = await resolveConfined(root, args.html, { mustExist: true });
          if (!/\.html?$/i.test(htmlPath)) return failure("html must be an .html file.");
          const imagePath = await resolveConfined(root, args.image, { mustExist: true });
          const [htmlStat, imageStat] = await Promise.all([fs.stat(htmlPath), fs.stat(imagePath)]);
          if (htmlStat.size > MAX_HTML_BYTES) return failure("That HTML file is too large.");
          if (imageStat.size > MAX_LOGO_BYTES) return failure("The image is larger than 1 MB. Ask the user for a smaller logo.");
          const uri = imageDataUri(new Uint8Array(await fs.readFile(imagePath)));
          if (!uri) return failure("That file is not a PNG, JPEG, GIF, WebP or SVG image.");
          const html = await fs.readFile(htmlPath, "utf8");
          const count = html.split(placeholder).length - 1;
          if (!count) return failure(`The HTML has no ${placeholder}. Write the placeholder where the image goes, then call this again.`);
          await fs.writeFile(htmlPath, html.split(placeholder).join(uri), "utf8");
          onWrite(path.relative(await fs.realpath(root), htmlPath).split(path.sep).join("/"));
          return text(`Placed the image in ${count} place${count > 1 ? "s" : ""}.`);
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },
  };
}
