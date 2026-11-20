import type { SDKCustomTool } from "@cursor/sdk";

/**
 * Guides for bigger kinds of work. An agent sees only each guide's name and
 * description in its rules; the full text is read with read_skill when a
 * request matches, so other chats do not carry it.
 *
 * Core knows no guide: every agent brings its own list, so the Store Assistant,
 * Google Ads and Meta Ads never see each other's guides.
 */
export type Skill = {
  name: string;
  description: string;
  body: string;
  /** False keeps the guide out of the rules' list; it can still be read by name (a stage guide a master guide points to). */
  listed?: boolean;
};

/** The part of an agent's rules that lists its guides. Empty when it has none. */
export function skillsSection(skills: readonly Skill[]): string {
  const listed = skills.filter((s) => s.listed !== false);
  if (!listed.length) return "";
  return `## Guides
You have guides for bigger kinds of work. When a request matches one, call \`read_skill\` with its name BEFORE you start, then follow it step by step. Do not call it for anything else, and read each guide once per chat.
${listed.map((s) => `- \`${s.name}\`: ${s.description}`).join("\n")}
`;
}

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });
const failure = (value: string) => ({ content: [{ type: "text" as const, text: value }], isError: true as const });

/** `read_skill`: the full text of one of the agent's own guides. */
export function createReadSkillTool(skills: readonly Skill[]): Record<string, SDKCustomTool> {
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
  };
}
