import { createChatTools } from "../chat-tools";
import type { Capability } from "./types";

/** Talking with the user: ask a question with clickable options, and open a file in the panel. */
export const chat: Capability = {
  id: "chat",
  tools: (ctx) => createChatTools(ctx),
};
