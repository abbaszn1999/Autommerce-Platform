import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUSINESS_FILES_BUCKET,
  businessFileLink,
  businessFilePath,
  businessFileProblem,
  businessFilesFolder,
  isImageFile,
  safeFileName,
  type BusinessFile,
} from "./business-files";

/** The files kept for this workspace, newest first. The folder is the list. */
export async function listBusinessFiles(admin: SupabaseClient, workspaceId: string): Promise<BusinessFile[]> {
  const { data, error } = await admin.storage.from(BUSINESS_FILES_BUCKET).list(businessFilesFolder(workspaceId), { limit: 200, sortBy: { column: "updated_at", order: "desc" } });
  if (error) throw new Error(`Could not list the business files: ${error.message}`);
  return (data ?? [])
    .filter((f) => f.id && !f.name.startsWith("."))
    .map((f) => ({
      name: f.name,
      size: Number((f.metadata as { size?: number } | null)?.size ?? 0),
      updatedAt: f.updated_at ?? f.created_at ?? null,
      link: businessFileLink(workspaceId, f.name),
      image: isImageFile(f.name),
    }));
}

/** Keep a file (a file with the same name is replaced). Returns the name it is kept under. */
export async function saveBusinessFile(admin: SupabaseClient, workspaceId: string, name: string, bytes: Buffer | Uint8Array, contentType: string): Promise<string> {
  const clean = safeFileName(name);
  const problem = businessFileProblem(clean, bytes.length);
  if (problem) throw new Error(problem);
  const { error } = await admin.storage.from(BUSINESS_FILES_BUCKET).upload(businessFilePath(workspaceId, clean), bytes, { upsert: true, contentType: contentType || "application/octet-stream", cacheControl: "0" });
  if (error) throw new Error(`Could not save ${clean}: ${error.message}`);
  return clean;
}

export async function deleteBusinessFile(admin: SupabaseClient, workspaceId: string, name: string): Promise<void> {
  const { error } = await admin.storage.from(BUSINESS_FILES_BUCKET).remove([businessFilePath(workspaceId, name)]);
  if (error) throw new Error(`Could not delete ${name}: ${error.message}`);
}

/** A short-lived address to open or download a kept file; null when it doesn't exist. */
export async function businessFileUrl(admin: SupabaseClient, workspaceId: string, name: string, opts: { download?: boolean; seconds?: number } = {}): Promise<string | null> {
  const clean = safeFileName(name);
  const { data, error } = await admin.storage
    .from(BUSINESS_FILES_BUCKET)
    .createSignedUrl(businessFilePath(workspaceId, clean), opts.seconds ?? 300, opts.download ? { download: clean } : undefined);
  return error || !data?.signedUrl ? null : data.signedUrl;
}
