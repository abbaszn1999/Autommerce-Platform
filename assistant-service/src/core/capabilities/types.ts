import type { SDKCustomTool, ToolName } from "@cursor/sdk";
import type { ToolContext } from "../tool-helpers";

/** What a shared capability may use from the run it belongs to. */
export type CapabilityHelpers = {
  /** The chat's working folder. */
  cwd: string;
  /** Tell the run a file was written, so it is filed and shown. */
  markWritten: (relative: string) => void;
  /** Paid work outside the model's tokens (an image, a lookup), added to the run's cost. */
  addCost: (usd: number, label: string) => void;
  /** An image was made (counted in the run's record). */
  imageMade: () => void;
  /** Keys for our own image models. */
  imageKeys?: { gemini?: string; openai?: string };
};

/**
 * Something several agents share: reading the web, working with files and
 * documents, making images, asking the user. It lives in core/capabilities/,
 * and each agent lists the ones it takes (AgentSession.capabilities), so it
 * can be added to one agent, to all, or taken away from one, without touching
 * the others. What only one agent has lives in that agent's own folder.
 */
export type Capability = {
  id: string;
  /** Cursor's own tools this capability switches on (the web ones, for example). */
  builtinTools?: readonly ToolName[];
  /** Our own tools. */
  tools?: (ctx: ToolContext, helpers: CapabilityHelpers) => Record<string, SDKCustomTool>;
};
