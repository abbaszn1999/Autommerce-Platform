/**
 * Server-side storage helpers for API routes.
 * Uses supabase-server (cookies-based) instead of supabase-browser.
 */
import { createAdminClient } from "@/lib/supabase-admin";
import type { CategoryJson } from "@/lib/storage-helpers";
import { getCategoriesStoragePath, getCategoriesRawStoragePath } from "@/lib/storage-helpers";

const BUCKET = "workspace-files";

export async function loadJsonFromStorageServer<T = unknown>(storagePath: string): Promise<T | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .download(storagePath);
  if (error) {
    if (error.message?.includes("not found") || error.message?.includes("Object not found")) return null;
    throw error;
  }
  const text = await data.text();
  return JSON.parse(text) as T;
}

export async function saveJsonToStorageServer(storagePath: string, data: unknown): Promise<void> {
  const admin = createAdminClient();
  const blob = new Blob([JSON.stringify(data)], { type: "application/octet-stream" });
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, blob, { cacheControl: "0", upsert: true });
  if (error) throw error;
}

// ─── Server-side Caching of Counts (prevents downloading massive JSONs repeatedly) ───
//
// Counting used to download + parse the ENTIRE categories.json just to read
// `.length`. We now persist a tiny "count sidecar" file next to the dataset
// and read THAT instead. The in-memory cache is a first-level (per-instance)
// hit; the sidecar is the cross-invocation source of truth; a full load is the
// last-resort fallback (and it backfills the sidecar so it's a one-time cost).
const countsCache = new Map<string, { count: number; ts: number }>();
const COUNTS_TTL_MS = 3 * 60 * 1000; // 3 minutes

function getCategoriesCountSidecarPath(workspaceId: string): string {
  return `${workspaceId}/categories.count.json`;
}

async function readCountSidecar(path: string): Promise<number | null> {
  try {
    const data = await loadJsonFromStorageServer<{ count: number }>(path);
    if (data && typeof data.count === "number") return data.count;
    return null;
  } catch {
    return null;
  }
}

async function writeCountSidecar(path: string, count: number): Promise<void> {
  try {
    await saveJsonToStorageServer(path, { count, ts: Date.now() });
  } catch (err) {
    console.warn("[storage] failed to write count sidecar:", (err as Error).message);
  }
}

export function invalidateCachedCounts(workspaceId: string) {
  countsCache.delete(`categories:${workspaceId}`);
}

export async function getCachedCategoriesCountServer(workspaceId: string): Promise<number> {
  const key = `categories:${workspaceId}`;
  const cached = countsCache.get(key);
  if (cached && Date.now() - cached.ts < COUNTS_TTL_MS) {
    return cached.count;
  }
  const sidecar = await readCountSidecar(getCategoriesCountSidecarPath(workspaceId));
  if (sidecar !== null) {
    countsCache.set(key, { count: sidecar, ts: Date.now() });
    return sidecar;
  }
  const categories = await loadCategoriesJsonServer(workspaceId);
  const count = categories.length;
  countsCache.set(key, { count, ts: Date.now() });
  void writeCountSidecar(getCategoriesCountSidecarPath(workspaceId), count);
  return count;
}

export async function loadCategoriesJsonServer(workspaceId: string): Promise<CategoryJson[]> {
  const path = getCategoriesStoragePath(workspaceId);
  const data = await loadJsonFromStorageServer<CategoryJson[]>(path);
  return data ?? [];
}

export async function loadCategoriesRawJsonServer(workspaceId: string): Promise<Record<string, string>[]> {
  const path = getCategoriesRawStoragePath(workspaceId);
  const data = await loadJsonFromStorageServer<Record<string, string>[]>(path);
  return data ?? [];
}
