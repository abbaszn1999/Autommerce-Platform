import type { Capability } from "./types";

/** Reading the web: search, and read a page. Cursor's own tools. */
export const web: Capability = {
  id: "web",
  builtinTools: ["webSearch", "webFetch"],
};
