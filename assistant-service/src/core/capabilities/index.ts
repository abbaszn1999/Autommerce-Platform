import type { SDKCustomTool, ToolName } from "@cursor/sdk";
import type { ToolContext } from "../tool-helpers";
import { chat } from "./chat";
import { files } from "./files";
import { image } from "./image";
import type { Capability, CapabilityHelpers } from "./types";
import { web } from "./web";

export { chat, files, image, web };
export type { Capability, CapabilityHelpers };

/** Every agent's usual set. An agent lists them itself, so any one can drop or add one. */
export const STANDARD_CAPABILITIES: readonly Capability[] = [web, files, image, chat];

/** Our own tools from a list of capabilities. */
export function capabilityTools(capabilities: readonly Capability[], ctx: ToolContext, helpers: CapabilityHelpers): Record<string, SDKCustomTool> {
  return Object.assign({}, ...capabilities.map((c) => c.tools?.(ctx, helpers) ?? {}));
}

/** Cursor's own tools a list of capabilities switches on. */
export function capabilityBuiltinTools(capabilities: readonly Capability[]): ToolName[] {
  return [...new Set(capabilities.flatMap((c) => c.builtinTools ?? []))];
}
