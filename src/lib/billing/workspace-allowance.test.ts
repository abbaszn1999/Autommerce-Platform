import { describe, expect, it } from "vitest";
import { MAX_EXTRA_WORKSPACES, extraWorkspacesOf, workspaceAllowance } from "./workspace-allowance";

describe("workspace allowance", () => {
  it("adds the admin's grant to the plan limit", () => {
    expect(workspaceAllowance(2, extraWorkspacesOf({ extra_workspaces: 1 }))).toBe(3);
  });

  it("changes nothing for customers without a grant", () => {
    expect(workspaceAllowance(2, extraWorkspacesOf({}))).toBe(2);
    expect(workspaceAllowance(2, extraWorkspacesOf(null))).toBe(2);
    expect(workspaceAllowance(5, extraWorkspacesOf({ extra_workspaces: 0 }))).toBe(5);
  });

  it("keeps an unlimited plan unlimited", () => {
    expect(workspaceAllowance(null, 3)).toBeNull();
  });

  it("ignores bad values", () => {
    expect(extraWorkspacesOf({ extra_workspaces: -2 })).toBe(0);
    expect(extraWorkspacesOf({ extra_workspaces: "x" })).toBe(0);
    expect(extraWorkspacesOf({ extra_workspaces: 1.7 })).toBe(1);
    expect(extraWorkspacesOf({ extra_workspaces: 5000 })).toBe(MAX_EXTRA_WORKSPACES);
  });
});
