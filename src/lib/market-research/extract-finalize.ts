import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Closes a running keyword extract. The update only matches while the extract
 * is still `running`, so concurrent pollers and the sweeper close it once.
 * Returns false when another caller already closed it.
 */
export async function finalizeExtract(
  admin: SupabaseClient,
  input: {
    extract: { id: string; project_id: string };
    rowsReturned: number;
    status: "succeeded" | "failed" | "aborted";
  }
): Promise<boolean> {
  const { data: claimed } = await admin
    .from("mr_extracts")
    .update({ status: input.status, rows_returned: input.rowsReturned })
    .eq("id", input.extract.id)
    .eq("status", "running")
    .select("id")
    .maybeSingle();

  if (!claimed) return false;

  await admin
    .from("mr_projects")
    .update({ extract_rows: input.rowsReturned })
    .eq("id", input.extract.project_id);
  return true;
}
