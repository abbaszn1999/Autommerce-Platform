import type { SupabaseClient } from "@supabase/supabase-js";

/** The merchant's standing notes for this store (the Store Assistant keeps them with save_store_note). */
export async function loadStoreNotes(db: SupabaseClient, workspaceId: string): Promise<string> {
  const { data } = await db.from("store_agent_notes").select("content").eq("workspace_id", workspaceId).maybeSingle();
  return String(data?.content ?? "").trim();
}
