import type { SupabaseClient } from "@supabase/supabase-js";
import { changedSections } from "./business-profile-doc";
import {
  PROFILE_MAX_BYTES,
  ProfileEditError,
  isProfileField,
  planProfileEdits,
  type BusinessProfileData,
  type Editor,
  type FieldMeta,
  type ProfileEdit,
  type OnboardingStage,
  type ProfileField,
  type ProfileMeta,
  type ProfileSource,
  type ProfileValue,
  type ProfileValues,
} from "./business-profile";

type Stored = BusinessProfileData & { revision: number | null };

export type ProfileChangeRecord = {
  id: string;
  field: ProfileField;
  before: ProfileValue | null;
  after: ProfileValue | null;
  source: ProfileSource;
  chatId: string | null;
  undoOf: string | null;
  undoneAt: string | null;
  createdAt: string;
};

/** The workspace's profile; an empty one when nothing was saved yet (revision null). */
export async function loadProfile(admin: SupabaseClient, workspaceId: string): Promise<Stored> {
  const { data, error } = await admin.from("business_profiles").select("profile, field_meta, revision, updated_at").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw new Error(`business profile: ${error.message}`);
  if (!data) return { values: {}, meta: {}, updatedAt: null, revision: null };
  // Keep only known fields: a field removed from the product is ignored, not shown.
  const values: ProfileValues = {};
  const meta: ProfileMeta = {};
  for (const [k, v] of Object.entries((data.profile ?? {}) as Record<string, unknown>)) if (isProfileField(k) && v != null) values[k] = v as ProfileValue;
  for (const [k, v] of Object.entries((data.field_meta ?? {}) as Record<string, unknown>)) if (isProfileField(k) && values[k] != null) meta[k] = v as FieldMeta;
  return { values, meta, updatedAt: String(data.updated_at), revision: Number(data.revision) };
}

/** Write the whole profile if nobody wrote it since `revision` was read. False: read again and retry. */
async function writeProfile(admin: SupabaseClient, workspaceId: string, revision: number | null, next: { values: ProfileValues; meta: ProfileMeta }, userId: string | null) {
  const row = { profile: next.values, field_meta: next.meta, updated_by: userId, updated_at: new Date().toISOString() };
  if (revision === null) {
    const { error } = await admin.from("business_profiles").insert({ workspace_id: workspaceId, ...row, revision: 1 });
    if (error?.code === "23505") return false;
    if (error) throw new Error(`business profile: ${error.message}`);
    return true;
  }
  const { data, error } = await admin
    .from("business_profiles")
    .update({ ...row, revision: revision + 1 })
    .eq("workspace_id", workspaceId)
    .eq("revision", revision)
    .select("revision");
  if (error) throw new Error(`business profile: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * Apply edits under the editor's rules (see planProfileEdits) and log each
 * changed field (a record of who changed what). Safe against two people saving at once.
 * `edits` can be a function of the profile as it is when the write happens, so a
 * change built from the current text (add to a section) is never lost to a parallel write.
 */
export async function editProfile(
  admin: SupabaseClient,
  workspaceId: string,
  edits: ProfileEdit[] | ((current: BusinessProfileData) => ProfileEdit[]),
  editor: Editor,
  actor: { userId: string | null; chatId?: string | null },
  opts: { allowHidden?: boolean } = {}
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await loadProfile(admin, workspaceId);
    const list = typeof edits === "function" ? edits(current) : edits;
    if (!list.length) return { changes: [] as ProfileChangeRecord[], skipped: [], profile: current as BusinessProfileData };
    const plan = planProfileEdits(current, list, editor, undefined, opts);
    if (!plan.changes.length) return { changes: [] as ProfileChangeRecord[], skipped: plan.skipped, profile: current as BusinessProfileData };
    if (new TextEncoder().encode(JSON.stringify(plan.next.values)).length > PROFILE_MAX_BYTES)
      throw new ProfileEditError("The business profile would be over its size limit (about 100 KB in all). Shorten the knowledge document or a long list, then save again.", "too_large");
    if (!(await writeProfile(admin, workspaceId, current.revision, plan.next, actor.userId))) continue;

    const { data, error } = await admin
      .from("business_profile_changes")
      .insert(
        plan.changes.map((c) => ({
          workspace_id: workspaceId,
          field: c.field,
          before_value: c.before,
          after_value: c.after,
          before_meta: c.beforeMeta,
          after_meta: c.afterMeta,
          source: editor.source,
          user_id: actor.userId,
          chat_id: actor.chatId ?? null,
        }))
      )
      .select("id, field, before_value, after_value, source, chat_id, undo_of, undone_at, created_at");
    if (error) console.error("[business-profile] change log", error.message);
    return { changes: (data ?? []).map(toRecord), skipped: plan.skipped, profile: await loadProfile(admin, workspaceId) as BusinessProfileData };
  }
  throw new ProfileEditError("The profile is being changed by someone else right now. Try again.", "conflict");
}

const toRecord = (r: Record<string, unknown>): ProfileChangeRecord => ({
  id: String(r.id),
  field: r.field as ProfileField,
  before: (r.before_value ?? null) as ProfileValue | null,
  after: (r.after_value ?? null) as ProfileValue | null,
  source: r.source as ProfileSource,
  chatId: (r.chat_id as string | null) ?? null,
  undoOf: (r.undo_of as string | null) ?? null,
  undoneAt: (r.undone_at as string | null) ?? null,
  createdAt: String(r.created_at),
});

export type SetupStatus = "completed" | "skipped" | null;

/** Whether the owner finished or skipped the first-run setup screen (null: not yet). */
export async function loadSetupStatus(admin: SupabaseClient, workspaceId: string): Promise<SetupStatus> {
  const { data, error } = await admin.from("business_profiles").select("setup_status").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw new Error(`business profile: ${error.message}`);
  return (data?.setup_status as SetupStatus) ?? null;
}

/** Only the setup columns: the profile itself is left as it is (or created empty). */
export async function saveSetupStatus(admin: SupabaseClient, workspaceId: string, status: Exclude<SetupStatus, null>, userId: string) {
  const { error } = await admin
    .from("business_profiles")
    .upsert({ workspace_id: workspaceId, setup_status: status, setup_at: new Date().toISOString(), updated_by: userId }, { onConflict: "workspace_id" });
  if (error) throw new Error(`business profile: ${error.message}`);
}

/**
 * Moves the first-run onboarding on (interview, filling, done). Platform state,
 * not an edit of the document, so it is not in the change history.
 */
export async function setOnboardingStage(admin: SupabaseClient, workspaceId: string, stage: OnboardingStage, userId: string | null) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await loadProfile(admin, workspaceId);
    const plan = planProfileEdits(current, [{ field: "onboardingStage", value: stage }], { source: "owner", status: "confirmed" }, undefined, { allowHidden: true });
    if (!plan.changes.length) return;
    if (await writeProfile(admin, workspaceId, current.revision, plan.next, userId)) return;
  }
  throw new ProfileEditError("The profile is being changed by someone else right now. Try again.", "conflict");
}

/**
 * Change the knowledge document: `change` gets the text as it is when the write
 * happens and returns the new text. Logged like every edit (the version history).
 */
export function editDocument(
  admin: SupabaseClient,
  workspaceId: string,
  change: (document: string) => string,
  editor: Editor,
  actor: { userId: string | null; chatId?: string | null }
) {
  return editProfile(admin, workspaceId, (current) => [{ field: "document", value: change(typeof current.values.document === "string" ? current.values.document : "") }], editor, actor, { allowHidden: true });
}

export type DocumentVersion = { id: string; source: ProfileSource; createdAt: string; chatId: string | null; changed: string[] };

/** The latest saved versions of the document, newest first, with the sections each one changed. */
export async function listDocumentVersions(admin: SupabaseClient, workspaceId: string, limit = 30): Promise<DocumentVersion[]> {
  const { data, error } = await admin
    .from("business_profile_changes")
    .select("id, source, chat_id, created_at, before_value, after_value")
    .eq("workspace_id", workspaceId)
    .eq("field", "document")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`business profile: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    source: r.source as ProfileSource,
    createdAt: String(r.created_at),
    chatId: (r.chat_id as string | null) ?? null,
    changed: changedSections(typeof r.before_value === "string" ? r.before_value : "", typeof r.after_value === "string" ? r.after_value : ""),
  }));
}

/** The whole document as one saved version left it (null: no such version in this workspace). */
export async function getDocumentVersion(admin: SupabaseClient, workspaceId: string, id: string): Promise<string | null> {
  const { data, error } = await admin.from("business_profile_changes").select("after_value").eq("workspace_id", workspaceId).eq("field", "document").eq("id", id).maybeSingle();
  if (error) throw new Error(`business profile: ${error.message}`);
  return data && typeof data.after_value === "string" ? data.after_value : data ? "" : null;
}
