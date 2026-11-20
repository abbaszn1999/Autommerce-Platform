import { createImageTool } from "../image-tool";
import type { Capability } from "./types";

/** Making images from our own models, each charged at what the provider billed for it. */
export const image: Capability = {
  id: "image",
  tools: (ctx, { cwd, markWritten, addCost, imageMade, imageKeys }) =>
    createImageTool({
      cwd,
      geminiApiKey: imageKeys?.gemini,
      openaiApiKey: imageKeys?.openai,
      onCost: addCost,
      onImage: (relative) => {
        imageMade();
        markWritten(relative);
        ctx.files.markShown(relative);
        ctx.files.setFolderHint(relative, "images");
      },
      log: ctx.log,
    }),
};
