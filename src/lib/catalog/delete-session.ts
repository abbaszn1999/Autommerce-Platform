import type { createAdminClient } from "@/lib/supabase-admin";
import { splitStoredImageRefs, storedImagePath } from "@/lib/stored-image-ref";
import { getProjectStoragePath } from "@/lib/storage-helpers";
import { loadProjectJsonAdmin } from "@/lib/jobs/project-json";

type Admin = ReturnType<typeof createAdminClient>;

const BUCKET = "workspace-files";
const REMOVE_CHUNK = 100;

/** Pictures pasted into the sheet are saved here on upload; nothing else shares this folder. */
export function catalogImagePrefix(workspaceId: string): string {
  return `${workspaceId}/catalog/images/`;
}

/** Every sheet-picture path a project's rows point at (only ones inside this workspace's picture folder). */
export function collectProjectImagePaths(
  workspaceId: string,
  rows: Array<{ originalData?: Record<string, unknown>; enrichedData?: Record<string, unknown> }>
): string[] {
  const prefix = catalogImagePrefix(workspaceId);
  const paths = new Set<string>();
  const scan = (record?: Record<string, unknown>) => {
    if (!record) return;
    for (const value of Object.values(record)) {
      if (typeof value !== "string" || !value.toLowerCase().includes("vz-storage:")) continue;
      for (const ref of splitStoredImageRefs(value)) {
        const path = storedImagePath(ref);
        if (path.startsWith(prefix) && !path.includes("..")) paths.add(path);
      }
    }
  };
  for (const row of rows) {
    scan(row.originalData);
    scan(row.enrichedData);
  }
  return [...paths];
}

async function removeStoragePaths(admin: Admin, paths: string[]): Promise<void> {
  for (let start = 0; start < paths.length; start += REMOVE_CHUNK) {
    const { error } = await admin.storage.from(BUCKET).remove(paths.slice(start, start + REMOVE_CHUNK));
    if (error) throw new Error(error.message);
  }
}

export type DeleteCatalogSessionResult = {
  /** False when files were left behind (the project itself is gone either way). */
  storageClean: boolean;
  removedFiles: number;
};

/**
 * Removes a Catalog Intelligence project everywhere it lives: its share links,
 * run history (and the notifications hanging off those runs), the row store, the
 * project record, the saved project file and the pictures that came with the
 * sheet. The database goes first so a half-finished delete never leaves a
 * project in the list that has lost its data.
 */
export async function deleteCatalogSession(
  admin: Admin,
  params: { workspaceId: string; sessionId: string }
): Promise<DeleteCatalogSessionResult> {
  const { workspaceId, sessionId } = params;

  // Read what the files are before the records that name them disappear.
  let imagePaths: string[] = [];
  try {
    const project = await loadProjectJsonAdmin(workspaceId, sessionId, admin);
    if (project) imagePaths = collectProjectImagePaths(workspaceId, project.rows);
  } catch (error) {
    console.warn("[catalog:delete] could not read project to find pictures", error);
  }

  const failures: string[] = [];
  const step = async (label: string, run: () => PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await run();
    if (error) failures.push(`${label}: ${error.message}`);
  };

  await step("share links", () =>
    admin
      .from("share_links")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("resource_type", "catalog")
      .eq("resource_id", sessionId)
  );
  await step("run history", () =>
    admin
      .from("job_runs")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("kind", "catalog")
      .eq("session_id", sessionId)
  );
  await step("rows", () => admin.from("catalog_session_rows").delete().eq("session_id", sessionId));
  if (failures.length > 0) {
    throw new Error(`Could not remove project data (${failures.join("; ")})`);
  }

  let sessionError: { message: string } | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { error } = await admin
      .from("catalog_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("workspace_id", workspaceId);
    if (!error) {
      sessionError = null;
      break;
    }
    sessionError = error;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (attempt - 1)));
  }
  if (sessionError) throw new Error(`Could not remove the project record: ${sessionError.message}`);

  const files = [getProjectStoragePath(workspaceId, sessionId), ...imagePaths];
  try {
    await removeStoragePaths(admin, files);
    return { storageClean: true, removedFiles: files.length };
  } catch (error) {
    console.warn("[catalog:delete] project removed but file cleanup failed", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { storageClean: false, removedFiles: 0 };
  }
}
