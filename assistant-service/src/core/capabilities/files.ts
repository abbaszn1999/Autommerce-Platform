import { createDocumentTool } from "../document-tool";
import { createExcelTool } from "../excel-tool";
import { createFileTools } from "../file-tools";
import { createScriptTool } from "../script-tool";
import type { Capability } from "./types";

/** Working with files: read and write in the chat's folder, run data scripts, make Excel, Word and PDF files. */
export const files: Capability = {
  id: "files",
  tools: (ctx, { cwd, markWritten }) => ({
    ...createFileTools(cwd, markWritten),
    ...createScriptTool(cwd, (relative, inputs) => {
      markWritten(relative);
      // Made from the store's data: it stays Store data when it is opened, unless the agent says otherwise.
      if (inputs.some((input) => ctx.files.isFromStore(input))) ctx.files.markFromStore(relative);
    }),
    // An Excel file is made for the user to download: a result, though the panel cannot open it.
    ...createExcelTool(cwd, (relative, sources, folder) => {
      markWritten(relative);
      ctx.files.markShown(relative);
      if (sources.some((source) => ctx.files.isFromStore(source))) ctx.files.markFromStore(relative);
      if (folder) ctx.files.setFolderHint(relative, folder);
    }),
    ...createDocumentTool(cwd, (relative, folder) => {
      markWritten(relative);
      ctx.files.markShown(relative);
      if (folder) ctx.files.setFolderHint(relative, folder);
    }),
  }),
};
