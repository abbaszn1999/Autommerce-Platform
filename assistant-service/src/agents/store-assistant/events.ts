import { base, clip, str, type ToolEvents } from "../../core/events";

/** How the Store Assistant's own tools read in the chat (the shared and store tools are described by core). */
export const storeAssistantToolEvents: ToolEvents = {
  describe(name, args) {
    switch (name) {
      case "inline_image":
        return { kind: "file", title: "Putting the logo into the page", detail: base(args.image) || undefined };
      case "save_store_note":
        return { kind: "other", title: "Remembering for this store", detail: clip(str(args.note), 120) || undefined };
      default:
        return null;
    }
  },
};
