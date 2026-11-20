import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The structure that keeps each agent separate as capabilities are added:
 *  - core/ is the shared engine and imports no agent;
 *  - an agent imports core, never another agent;
 *  - only agents/index.ts (the registry) knows every agent.
 */
const SRC = path.resolve(__dirname, "..", "src");
const AGENTS_DIR = path.join(SRC, "agents");

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** The relative imports of a file, resolved to absolute paths (without extension). */
async function importsOf(file: string): Promise<string[]> {
  const text = await fs.readFile(file, "utf8");
  const found: string[] = [];
  for (const match of text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^"'\n;]*?\bfrom\s+["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)|(?:^|\n)\s*import\s+["']([^"']+)["']/g)) {
    const spec = match[1] ?? match[2] ?? match[3];
    if (spec?.startsWith(".")) found.push(path.resolve(path.dirname(file), spec));
  }
  return found;
}

const within = (target: string, dir: string) => target === dir || target.startsWith(dir + path.sep);
const agentOf = (target: string): string | null => {
  if (!within(target, AGENTS_DIR)) return null;
  return path.relative(AGENTS_DIR, target).split(path.sep)[0]?.replace(/\.ts$/, "") ?? null;
};

describe("architecture", () => {
  it("core imports no agent", async () => {
    const violations: string[] = [];
    for (const file of await sourceFiles(path.join(SRC, "core"))) {
      for (const target of await importsOf(file)) {
        if (within(target, AGENTS_DIR)) violations.push(`${path.relative(SRC, file)} -> ${path.relative(SRC, target)}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("an agent imports another agent's folder never, and the registry only from agents/index.ts", async () => {
    const violations: string[] = [];
    for (const file of await sourceFiles(AGENTS_DIR)) {
      const own = agentOf(file);
      if (own === "index") continue; // the registry lists every agent
      for (const target of await importsOf(file)) {
        const other = agentOf(target);
        if (other !== null && other !== own) violations.push(`${path.relative(SRC, file)} -> ${path.relative(SRC, target)}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("the registry holds one agent for every domain", async () => {
    const { AGENTS } = await import("../src/agents");
    const { AGENT_DOMAINS } = await import("../../src/lib/store-agent/protocol");
    expect(Object.keys(AGENTS).sort()).toEqual([...AGENT_DOMAINS].sort());
    for (const [domain, agent] of Object.entries(AGENTS)) expect(agent.id).toBe(domain);
    // Loads every agent (and the Cursor SDK), which is slow when the whole suite runs at once.
  }, 30_000);

  it("the import scanner sees imports (so the checks above are not empty)", async () => {
    const runner = await importsOf(path.join(SRC, "core", "runner.ts"));
    expect(runner).toContain(path.join(SRC, "core", "agents"));
    const registry = await importsOf(path.join(SRC, "agents", "index.ts"));
    expect(registry.map(agentOf).filter(Boolean).sort()).toEqual(["google-ads", "meta-ads", "store-assistant"]);
  });
});
