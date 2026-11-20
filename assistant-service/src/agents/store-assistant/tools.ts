import type { SDKCustomTool } from "@cursor/sdk";
import { createStoreCmsTools } from "../../core/store-access/store-tools";
import { failure, text, type ToolContext } from "../../core/tool-helpers";

/** What only the Store Assistant has: the store's platform tools and its lasting notes. */
export function createStoreAssistantTools(ctx: ToolContext): Record<string, SDKCustomTool> {
  return { ...createStoreCmsTools(ctx), ...createStoreNoteTools(ctx) };
}

/** The Store Assistant's lasting notes. They belong to the workspace, so they work without a connected store. */
export function createStoreNoteTools(ctx: ToolContext): Record<string, SDKCustomTool> {
  return {
    save_store_note: {
      description:
        "Remember something lasting about this store for every future chat: brand voice, the language for product text, naming or pricing rules, " +
        "things the user asked you to always or never do. Save only what the user stated or clearly confirmed, as one short line. " +
        "The user can see and edit these notes.",
      inputSchema: { type: "object", properties: { note: { type: "string" } }, required: ["note"] },
      execute: async (args) => {
        const note = String(args.note ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
        if (!note) return failure("The note is empty.");
        const { data } = await ctx.db.from("store_agent_notes").select("content").eq("workspace_id", ctx.run.workspaceId).maybeSingle();
        const current = String(data?.content ?? "").trim();
        if (current.includes(note)) return text("Already noted.");
        const next = `${current ? `${current}\n` : ""}- ${note}`;
        if (next.length > 8000) return failure("The store notes are full. Ask the user to tidy them in Store notes.");
        const { error } = await ctx.db
          .from("store_agent_notes")
          .upsert({ workspace_id: ctx.run.workspaceId, content: next, updated_by: ctx.run.userId, updated_at: new Date().toISOString() });
        if (error) return failure(`Could not save the note: ${error.message}`);
        return text("Saved to the store notes. It applies to every future chat.");
      },
    },
  };
}
