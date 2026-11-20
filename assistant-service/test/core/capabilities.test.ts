import { describe, expect, it } from "vitest";
import { STANDARD_CAPABILITIES, capabilityBuiltinTools, capabilityTools, chat, files, image, web, type CapabilityHelpers } from "../../src/core/capabilities";
import type { ToolContext } from "../../src/core/tool-helpers";

const helpers: CapabilityHelpers = { cwd: "/tmp/chat", markWritten: () => undefined, addCost: () => undefined, imageMade: () => undefined };
// The tools only touch the context when they run, so building them needs none.
const ctx = {} as ToolContext;
const names = (list: Parameters<typeof capabilityTools>[0]) => Object.keys(capabilityTools(list, ctx, helpers)).sort();

describe("shared capabilities", () => {
  it("each one brings its own tools, and no two bring the same name", () => {
    const each = [web, files, image, chat].map((c) => names([c]));
    expect(each[0]).toEqual([]); // web is Cursor's own tools
    expect(each[1]).toEqual(expect.arrayContaining(["read_file", "write_file", "run_script", "make_excel", "make_document"]));
    expect(each[2]).toEqual(["generate_image"]);
    expect(each[3]).toEqual(["ask_user", "show_file"]);
    expect(names(STANDARD_CAPABILITIES)).toHaveLength(each.flat().length);
  });

  it("the web capability switches on Cursor's web tools, and nothing else does", () => {
    expect(capabilityBuiltinTools(STANDARD_CAPABILITIES)).toEqual(["webSearch", "webFetch"]);
    expect(capabilityBuiltinTools([files, image, chat])).toEqual([]);
  });

  it("an agent can drop one: without image, it has no generate_image", () => {
    const withoutImage = STANDARD_CAPABILITIES.filter((c) => c.id !== "image");
    expect(names(withoutImage)).not.toContain("generate_image");
    expect(names(withoutImage)).toContain("ask_user");
  });
});
