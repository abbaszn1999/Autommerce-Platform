import { describe, expect, it } from "vitest";
import { collectProjectImagePaths } from "./delete-session";

describe("collectProjectImagePaths", () => {
  const ws = "ws-1";

  it("finds sheet pictures in source cells, including several in one cell", () => {
    const paths = collectProjectImagePaths(ws, [
      {
        originalData: {
          Name: "Shirt",
          Image: `vz-storage:${ws}/catalog/images/a.png\nvz-storage:${ws}/catalog/images/b.jpg`,
        },
      },
      { originalData: { Image: `vz-storage:${ws}/catalog/images/a.png` } },
    ]);
    expect(paths.sort()).toEqual([`${ws}/catalog/images/a.png`, `${ws}/catalog/images/b.jpg`]);
  });

  it("ignores other workspaces, traversal and plain links", () => {
    const paths = collectProjectImagePaths(ws, [
      {
        originalData: {
          A: "vz-storage:other-ws/catalog/images/x.png",
          B: `vz-storage:${ws}/catalog/images/../../secret.png`,
          C: "https://example.com/a.png",
        },
        enrichedData: { D: 5 },
      },
    ]);
    expect(paths).toEqual([]);
  });
});
