// Business files: the logo, brand guide, catalogue and other files that describe
// the business, kept for the whole workspace (not for one chat) and linked from
// the business knowledge document. The files live in the private
// `store-agent-files` bucket under `{workspaceId}/business/`; the list of files
// is that folder itself, and the document carries the links and what each one is.
// Nothing here touches the network, so the platform, the agent service and the
// tests all use the same rules.

import { getSection, setSection, type ProfileSection } from "./business-profile-doc";

export const BUSINESS_FILES_BUCKET = "store-agent-files";
export const MAX_BUSINESS_FILE_BYTES = 25 * 1024 * 1024;

/** The kinds of business file, what each is called in the document and where it is written. */
export const BUSINESS_FILE_KINDS = {
  logo: { label: "Client logo", section: "brand" },
  brand_guide: { label: "Branding file", section: "brand" },
  palette: { label: "Colour palette", section: "brand" },
  catalogue: { label: "Catalogue", section: "catalog" },
  strategy: { label: "Strategy document", section: "history" },
  report: { label: "Past report", section: "history" },
  policy: { label: "Policy or offers sheet", section: "offers" },
  other: { label: "File", section: "sources" },
} as const satisfies Record<string, { label: string; section: ProfileSection }>;

export type BusinessFileKind = keyof typeof BUSINESS_FILE_KINDS;
export const BUSINESS_FILE_KIND_IDS = Object.keys(BUSINESS_FILE_KINDS) as BusinessFileKind[];
export const isBusinessFileKind = (v: unknown): v is BusinessFileKind => typeof v === "string" && v in BUSINESS_FILE_KINDS;

const ALLOWED_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "webp", "gif", "svg", "pdf", "docx", "doc", "xlsx", "xls", "csv", "tsv", "txt", "md", "json", "pptx", "zip", "ttf", "otf", "woff", "woff2", "ai", "eps",
]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);

const extensionOf = (name: string): string => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

export const isImageFile = (name: string): boolean => IMAGE_EXTENSIONS.has(extensionOf(name));

/** A file name that is safe in a path, a link and Markdown: letters, digits, dots, dashes and underscores. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/-+\./g, ".")
    .replace(/^[.-]+|[-]+$/g, "");
  return cleaned.slice(-120);
}

/** Why a file can't be kept, or null when it can. */
export function businessFileProblem(name: string, size: number): string | null {
  const clean = safeFileName(name);
  if (!clean || !clean.includes(".")) return "The file needs a name with an extension, like logo.png.";
  if (!ALLOWED_EXTENSIONS.has(extensionOf(clean))) return `Files of this type can't be kept (${extensionOf(clean)}). Images, PDF, Word, Excel, CSV, text, Markdown, JSON, PowerPoint, fonts and ZIP are accepted.`;
  if (size <= 0) return "The file is empty.";
  if (size > MAX_BUSINESS_FILE_BYTES) return `The file is larger than ${MAX_BUSINESS_FILE_BYTES / 1024 / 1024} MB.`;
  return null;
}

export const businessFilesFolder = (workspaceId: string): string => `${workspaceId}/business`;
export const businessFilePath = (workspaceId: string, name: string): string => `${businessFilesFolder(workspaceId)}/${safeFileName(name)}`;

/** The link written in the document: it checks the reader belongs to the workspace, then opens the file. */
export const businessFileLink = (workspaceId: string, name: string): string =>
  `/api/business-profile/files?workspaceId=${encodeURIComponent(workspaceId)}&name=${encodeURIComponent(safeFileName(name))}`;

/** The line that records a file in the document, e.g. `- **Client logo:** [logo.png](link): the square version`. */
export function businessFileLine(kind: BusinessFileKind, workspaceId: string, name: string, description?: string): string {
  const note = (description ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  return `- **${BUSINESS_FILE_KINDS[kind].label}:** [${safeFileName(name)}](${businessFileLink(workspaceId, name)})${note ? `: ${note}` : ""}`;
}

const isListLine = (line: string): boolean => /^\s*[-*]\s/.test(line);

function appendLine(doc: string | null | undefined, section: ProfileSection, line: string): string {
  const existing = getSection(doc, section);
  const lastLine = existing.split("\n").pop() ?? "";
  const joined = !existing ? line : isListLine(lastLine) ? `${existing}\n${line}` : `${existing}\n\n${line}`;
  return setSection(doc, section, joined);
}

/**
 * Record a kept file in the document: under its own section (a logo under Brand
 * guidelines) and under "Sources and uploaded files". A file already linked in
 * a section isn't written there twice, so keeping it again (a new version of the
 * logo) never duplicates the line.
 */
export function addFileToDocument(doc: string | null | undefined, kind: BusinessFileKind, workspaceId: string, name: string, description?: string): string {
  const link = businessFileLink(workspaceId, name);
  const line = businessFileLine(kind, workspaceId, name, description);
  let next = doc ?? "";
  const home = BUSINESS_FILE_KINDS[kind].section;
  for (const section of home === "sources" ? (["sources"] as const) : ([home, "sources"] as const)) {
    if (!getSection(next, section).includes(link)) next = appendLine(next, section, line);
  }
  return next;
}

/** Take every line that links a file out of the document (the file was deleted). */
export function removeFileFromDocument(doc: string | null | undefined, workspaceId: string, name: string): string {
  const link = businessFileLink(workspaceId, name);
  let next = doc ?? "";
  for (const section of ["brand", "catalog", "history", "offers", "sources"] as const) {
    const text = getSection(next, section);
    if (!text.includes(link)) continue;
    next = setSection(next, section, text.split("\n").filter((l) => !l.includes(link)).join("\n"));
  }
  return next;
}

export type BusinessFile = { name: string; size: number; updatedAt: string | null; link: string; image: boolean };
