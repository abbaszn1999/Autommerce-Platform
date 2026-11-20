import type { SDKCustomTool } from "@cursor/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentDomain } from "../../../src/lib/store-agent/protocol";
import type { Capability } from "./capabilities";
import type { ToolEvents } from "./events";
import type { StoreAgentRun } from "./run";
import type { StoreSession } from "./store-access/store-session";
import type { ToolContext } from "./tool-helpers";

/**
 * What every agent is made of. The runner knows only these types: it never
 * imports an agent. Each agent (agents/store-assistant, agents/google-ads,
 * agents/meta-ads) brings its own connections, rules, guides and tools, and
 * agents/index.ts lists them, so a capability added to one agent cannot
 * reach another.
 */

/** The workspace's shared business profile, as the agents read it. */
export type BusinessContext = {
  brief: string;
  filled: boolean;
  onboarding: "interview" | "filling" | null;
};

/** What an agent may use while it prepares for a run. */
export type AgentEnv = {
  db: SupabaseClient;
  run: StoreAgentRun;
  workspaceId: string;
  /** The site the ads agents call, and the secret they sign with. */
  platformUrl?: string;
  secret?: string;
  log: (message: string, extra?: unknown) => void;
};

export type RuleInput = {
  business: BusinessContext;
  mode: "agent" | "plan";
  autoRun: boolean;
  autoRunBulk: boolean;
  /** The standing file lists, for agents that ask for them (wantsFileLists). */
  files: { businessFiles: { name: string; size: number }[]; chatFiles: { path: string; size: number }[] } | null;
};

/** One agent, ready for one run. */
export type AgentSession = {
  /** What the agent works on, as the run's notes name it: "store", "Google Ads account". */
  where: string;
  /** How a change is named in the notes about an earlier run. */
  changesLabel: string;
  /** Every change waits for a person: auto-run is switched off whatever the request says. */
  approvalOnly: boolean;
  /** In plan mode the agent delivers its plan through Cursor's own createPlan. */
  usesCursorPlan: boolean;
  /** The agent's rules list the business files and the chat's folder. */
  wantsFileLists: boolean;
  /** The account's currency, for the business profile; empty when the agent has no account. */
  currency: string;
  store: StoreSession;
  /** What the agent shares with the others (core/capabilities): web, files, images, chat. Its own tools are in `tools`. */
  capabilities: readonly Capability[];
  /** How the agent's own tools read in the chat (titles and result summaries). */
  toolEvents?: ToolEvents;
  /** The agent's rules (written to .cursor/rules before the run). */
  rule(input: RuleInput): Promise<string>;
  /** The agent's own tools, on top of the shared file, script, document, Excel and image tools. */
  tools(ctx: ToolContext, helpers: { cwd: string; markWritten: (relative: string) => void }): Record<string, SDKCustomTool>;
};

export type AgentDefinition = {
  id: AgentDomain;
  /** Shown in logs and errors. */
  name: string;
  prepare(env: AgentEnv): Promise<AgentSession>;
};

export type AgentRegistry = Readonly<Record<AgentDomain, AgentDefinition>>;
