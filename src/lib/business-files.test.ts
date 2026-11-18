import { describe, expect, it } from "vitest";
import {
  addFileToDocument,
  businessFileLine,
  businessFileLink,
  businessFilePath,
  businessFileProblem,
  isBusinessFileKind,
  isImageFile,
  removeFileFromDocument,
  safeFileName,
} from "./business-files";
import { getSection, setSection } from "./business-profile-doc";

const WS = "164c4c00-74b5-46fb-ae98-4265d6d40120";

describe("business file names", () => {
  it("makes any name safe for a path, a link and Markdown", () => {
    expect(safeFileName("My Logo (final).PNG")).toBe("My-Logo-final.PNG");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\brand\\guide v2.pdf")).toBe("guide-v2.pdf");
    expect(safeFileName("شعار المتجر.png")).toBe("شعار-المتجر.png");
    expect(safeFileName("...")).toBe("");
  });

  it("keeps files under the workspace's own folder", () => {
    expect(businessFilePath(WS, "a b.png")).toBe(`${WS}/business/a-b.png`);
    expect(businessFileLink(WS, "a b.png")).toBe(`/api/business-profile/files?workspaceId=${WS}&name=a-b.png`);
  });

  it("refuses what can't be kept", () => {
    expect(businessFileProblem("logo.png", 1000)).toBeNull();
    expect(businessFileProblem("logo", 1000)).toMatch(/extension/);
    expect(businessFileProblem("run.exe", 1000)).toMatch(/can't be kept/);
    expect(businessFileProblem("logo.png", 0)).toMatch(/empty/);
    expect(businessFileProblem("big.pdf", 26 * 1024 * 1024)).toMatch(/larger than 25 MB/);
    expect(isImageFile("logo.SVG")).toBe(true);
    expect(isImageFile("guide.pdf")).toBe(false);
    expect(isBusinessFileKind("logo")).toBe(true);
    expect(isBusinessFileKind("invoice")).toBe(false);
  });
});

describe("files in the document", () => {
  it("writes a file under its own section and under Sources", () => {
    const doc = addFileToDocument(null, "logo", WS, "logo.png", "square logo on white");
    expect(getSection(doc, "brand")).toBe(`- **Client logo:** [logo.png](${businessFileLink(WS, "logo.png")}): square logo on white`);
    expect(getSection(doc, "sources")).toContain("[logo.png]");
  });

  it("files each kind where it belongs, and a plain file only under Sources", () => {
    let doc = addFileToDocument(null, "catalogue", WS, "catalogue.xlsx");
    doc = addFileToDocument(doc, "policy", WS, "returns.pdf");
    doc = addFileToDocument(doc, "other", WS, "notes.txt");
    expect(getSection(doc, "catalog")).toContain("**Catalogue:**");
    expect(getSection(doc, "offers")).toContain("**Policy or offers sheet:**");
    expect(getSection(doc, "sources").split("\n")).toHaveLength(3);
    expect(getSection(doc, "brand")).toBe("");
  });

  it("keeps the lines together as a list and the text the owner already wrote", () => {
    let doc = setSection(null, "brand", "Warm, plain and short.");
    doc = addFileToDocument(doc, "logo", WS, "logo.png");
    doc = addFileToDocument(doc, "brand_guide", WS, "guide.pdf");
    const lines = getSection(doc, "brand").split("\n");
    expect(lines[0]).toBe("Warm, plain and short.");
    expect(lines.filter((l) => l.startsWith("- **"))).toHaveLength(2);
  });

  it("never writes the same file twice when it is kept again", () => {
    let doc = addFileToDocument(null, "logo", WS, "logo.png");
    doc = addFileToDocument(doc, "logo", WS, "logo.png", "new version");
    expect(getSection(doc, "brand").split("\n")).toHaveLength(1);
    expect(getSection(doc, "sources").split("\n")).toHaveLength(1);
  });

  it("takes every line of a deleted file out, and nothing else", () => {
    let doc = setSection(null, "brand", "Warm voice.");
    doc = addFileToDocument(doc, "logo", WS, "logo.png");
    doc = addFileToDocument(doc, "brand_guide", WS, "guide.pdf");
    const next = removeFileFromDocument(doc, WS, "logo.png");
    expect(next).not.toContain("logo.png");
    expect(getSection(next, "brand")).toContain("Warm voice.");
    expect(getSection(next, "brand")).toContain("guide.pdf");
    expect(getSection(next, "sources")).toContain("guide.pdf");
    expect(businessFileLine("logo", WS, "x.png")).toContain("(/api/business-profile/files?");
  });
});
