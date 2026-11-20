import { createClient } from "@/lib/supabase-browser";
import type { Role } from "@/lib/permissions";
import type { EnrichmentPreset, SessionKind } from "@/types";

// Re-export a convenience singleton for client-side use
function getClient() {
  return createClient();
}

// ─── Types ───────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  logo_url: string | null;
  cms_type: string;
  collection_prefix?: string;
  owner_id: string;
  enrichment_presets?: EnrichmentPreset[];
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: Role;
  joined_at: string;
  profiles?: { full_name: string; avatar_url: string | null };
  email?: string | null;
}

export interface Category {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string;
  parent_id: string | null;
  sort_order: number;
  attributes: any[];
  created_at: string;
}

export interface ImportSession {
  id: string;
  workspace_id: string;
  name: string;
  notes: string;
  /** 'product' | 'plp'. Sessions created before the split have 'product'. */
  kind: SessionKind;
  status: string;
  supplier_match_column: string | null;
  master_match_column: string;
  target_category_ids: string[];
  matching_rules: any[];
  total_rows: number;
  existing_count: number;
  new_count: number;
  enriched_count: number;
  storage_path: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}


export interface WorkspaceIntegration {
  id: string;
  workspace_id: string;
  provider: "shopify" | "woocommerce" | "wordpress";
  integration_name: string;
  base_url: string;
  config: Record<string, any>;
  credential_fingerprint?: string | null;
  status: "connected";
  created_at: string;
  updated_at: string;
}

export interface WorkspaceIntegrationTestResult {
  provider: "shopify" | "woocommerce" | "wordpress";
  accountLabel: string;
  baseUrl: string;
  metadata?: Record<string, any>;
}

// ─── Profiles ────────────────────────────────────────────

export async function updateProfile(userId: string, updates: { full_name?: string; avatar_url?: string }) {
  const supabase = getClient();
  const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
  if (error) throw error;
}

// ─── Workspaces CRUD ─────────────────────────────────────

export interface WorkspaceWithRole extends Workspace {
  memberRole?: string;
}

export async function getWorkspaces(): Promise<WorkspaceWithRole[]> {
  const supabase = getClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(*)")
    .eq("user_id", user.id);
  if (error) throw error;
  return (data ?? [])
    .filter((m: any) => m.workspaces)
    .map((m: any) => ({ ...m.workspaces, memberRole: m.role }));
}

async function presetsRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(body.error || `Saved settings request failed (${res.status})`);
  return body;
}

/** Saved settings of a workspace (columns + custom instructions + sources + language), newest first. */
export async function getEnrichmentPresets(workspaceId: string): Promise<EnrichmentPreset[]> {
  const { presets } = await presetsRequest<{ presets: EnrichmentPreset[] }>(
    `/api/catalog-intelligence/presets?workspaceId=${encodeURIComponent(workspaceId)}`
  );
  return presets;
}

/** Saves a setting; one with the same name (per workspace and kind) is overwritten. */
export async function saveEnrichmentPreset(workspaceId: string, preset: EnrichmentPreset): Promise<EnrichmentPreset> {
  const { preset: saved } = await presetsRequest<{ preset: EnrichmentPreset }>("/api/catalog-intelligence/presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, name: preset.name, kind: preset.kind ?? "product", settings: preset.settings }),
  });
  return saved;
}

export async function renameEnrichmentPreset(workspaceId: string, id: string, name: string): Promise<EnrichmentPreset> {
  const { preset } = await presetsRequest<{ preset: EnrichmentPreset }>("/api/catalog-intelligence/presets", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, id, name }),
  });
  return preset;
}

export async function deleteEnrichmentPreset(workspaceId: string, id: string): Promise<void> {
  await presetsRequest<{ ok: boolean }>(
    `/api/catalog-intelligence/presets?workspaceId=${encodeURIComponent(workspaceId)}&id=${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}

export async function createWorkspace(workspace: {
  name: string;
  slug: string;
  description?: string;
  cms_type?: string;
}): Promise<Workspace> {
  // Use server-side API route with admin client to bypass RLS
  const res = await fetch("/api/workspaces/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(workspace),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create workspace");

  return data as Workspace;
}

export async function updateWorkspace(id: string, updates: Partial<Pick<Workspace, "name" | "description" | "cms_type" | "logo_url" | "collection_prefix">>) {
  const supabase = getClient();
  const { error } = await supabase.from("workspaces").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteWorkspace(id: string) {
  const res = await fetch("/api/workspaces/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId: id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete workspace");
}

export async function getWorkspaceIntegration(workspaceId: string): Promise<WorkspaceIntegration | null> {
  const res = await fetch(`/api/integrations?workspaceId=${encodeURIComponent(workspaceId)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load integration");
  return data.integration ?? null;
}

/** The scopes the connected Shopify token has now; null when not Shopify or Shopify would not say. */
export async function getWorkspaceIntegrationScopes(workspaceId: string): Promise<string[] | null> {
  const res = await fetch(`/api/integrations/access?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to check store access");
  return Array.isArray(data.grantedScopes) ? data.grantedScopes : null;
}

export async function testWorkspaceIntegration(input: {
  workspaceId: string;
  provider: "shopify" | "woocommerce" | "wordpress";
  integrationName: string;
  config: Record<string, any>;
}): Promise<WorkspaceIntegrationTestResult> {
  const res = await fetch("/api/integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, action: "test" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to test integration");
  return data.result;
}

export async function saveWorkspaceIntegration(input: {
  workspaceId: string;
  provider: "shopify" | "woocommerce" | "wordpress";
  integrationName: string;
  config: Record<string, any>;
}): Promise<WorkspaceIntegration> {
  const res = await fetch("/api/integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, action: "save" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to save integration");
  return data.integration;
}

export async function disconnectWorkspaceIntegration(workspaceId: string): Promise<void> {
  const res = await fetch("/api/integrations", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to disconnect integration");
}

// ─── Workspace Members ───────────────────────────────────

export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const res = await fetch(`/api/team/members?workspaceId=${encodeURIComponent(workspaceId)}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to load members");
  return json.members ?? [];
}

export async function updateMemberRole(memberId: string, role: Role) {
  const res = await fetch("/api/team/members", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberId, role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update role");
}

export async function removeMember(memberId: string) {
  const res = await fetch("/api/team/members", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to remove member");
}

// ─── Workspace Invites ───────────────────────────────────

export async function getWorkspaceInvites(workspaceId: string) {
  const supabase = getClient();
  // Try filtering by accepted_at first; fall back to fetching all if column doesn't exist
  let { data, error } = await supabase
    .from("workspace_invites")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    // Fallback: column may not exist yet, fetch all invites
    const res = await supabase
      .from("workspace_invites")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (res.error) throw res.error;
    data = res.data;
  }
  return data ?? [];
}

export async function cancelInvite(inviteId: string, workspaceId: string) {
  const res = await fetch("/api/team/invite", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteId, workspaceId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to cancel invite");
}

// ─── Categories, Products, Suppliers ─────────────────────
// NOTE: These are now stored as JSON files in Supabase Storage.
// See src/lib/storage-helpers.ts for the new CRUD functions.

// ─── Image Classification Sessions ───────────────────────

export interface ImageClassificationSession {
  id: string;
  workspace_id: string;
  name: string;
  notes: string;
  status: "pending" | "processing" | "completed" | "failed";
  total_images: number;
  group_count: number;
  model: string;
  storage_path: string | null;
  images_prefix: string | null;
  total_cost: number;
  total_credits: number;
  total_tokens: number;
  error_message: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export async function getImageClassificationSessions(workspaceId: string) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("image_classification_sessions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ImageClassificationSession[];
}

export async function getImageClassificationSession(id: string): Promise<ImageClassificationSession | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("image_classification_sessions")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as ImageClassificationSession;
}

export async function createImageClassificationSession(
  workspaceId: string,
  payload: { name: string; notes?: string; total_images: number; model?: string }
) {
  const supabase = getClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("image_classification_sessions")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      name: payload.name,
      notes: payload.notes ?? "",
      total_images: payload.total_images,
      model: payload.model ?? "standard",
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data as ImageClassificationSession;
}

export async function updateImageClassificationSession(
  id: string,
  updates: Partial<ImageClassificationSession>
) {
  const supabase = getClient();
  const { error } = await supabase
    .from("image_classification_sessions")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteImageClassificationSession(id: string) {
  const supabase = getClient();
  const { data: session } = await supabase
    .from("image_classification_sessions")
    .select("workspace_id, storage_path, images_prefix")
    .eq("id", id)
    .single();

  if (session?.workspace_id) {
    const resultPath =
      session.storage_path ??
      `${session.workspace_id}/image-classification/${id}/result.json`;
    const imagesPrefix =
      session.images_prefix ??
      `${session.workspace_id}/image-classification/${id}/images`;

    await supabase.storage.from("workspace-files").remove([resultPath]).catch(() => {});

    if (imagesPrefix) {
      const { data: files } = await supabase.storage
        .from("workspace-files")
        .list(imagesPrefix, { limit: 1000 });
      if (files && files.length > 0) {
        await supabase.storage
          .from("workspace-files")
          .remove(files.map((f) => `${imagesPrefix}/${f.name}`))
          .catch(() => {});
      }
    }
  }

  const { error } = await supabase
    .from("image_classification_sessions")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ─── Import Sessions CRUD ────────────────────────────────

export async function getImportSessions(workspaceId: string, opts?: { status?: string; search?: string }) {
  const supabase = getClient();
  let query = supabase
    .from("catalog_sessions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (opts?.status) query = query.eq("status", opts.status);
  if (opts?.search) query = query.or(`name.ilike.%${opts.search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getActiveCatalogJobSessionIds(
  workspaceId: string
): Promise<string[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("job_runs")
    .select("session_id")
    .eq("workspace_id", workspaceId)
    .eq("kind", "catalog")
    .in("status", ["queued", "running"]);
  if (error) throw error;
  return [
    ...new Set((data ?? []).map((row) => String(row.session_id))),
  ];
}

export async function getImportSession(id: string): Promise<ImportSession | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("catalog_sessions")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function createImportSession(workspaceId: string, importSession: {
  name: string;
  notes?: string;
  total_rows: number;
  kind?: SessionKind;
}) {
  const res = await fetch("/api/catalog-intelligence/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, ...importSession }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    session?: ImportSession;
    error?: string;
  };
  if (!res.ok || !data.session) {
    throw new Error(data.error || "Failed to create Catalog Intelligence project");
  }
  return data.session;
}

export async function updateImportSession(id: string, updates: Partial<ImportSession>) {
  const supabase = getClient();
  const { error } = await supabase.from("catalog_sessions").update(updates).eq("id", id);
  if (error) throw error;
}

/**
 * Permanently deletes a project: records, run history, share links, the saved
 * project file and its pictures. Runs on the server so every place is cleaned.
 */
export async function deleteImportSession(workspaceId: string, id: string) {
  const res = await fetch(
    `/api/catalog-intelligence/sessions/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(workspaceId)}`,
    { method: "DELETE" }
  );
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error || "Failed to delete project");
}

// ─── Import Rows ─────────────────────────────────────────
// NOTE: Import rows are now stored as JSON files in Supabase Storage.
// See src/lib/storage-helpers.ts for the new CRUD functions.

// ─── Uploaded Files ──────────────────────────────────────
// NOTE: File metadata is no longer tracked in DB. Files go directly to Storage.

// ─── Activity Log ────────────────────────────────────────
