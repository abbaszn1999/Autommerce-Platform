import { createClient } from "@/lib/supabase-browser";

const BUCKET = "workspace-files";

export async function uploadWorkspaceFile(
  workspaceId: string,
  folder: "master" | "supplier" | "exports" | "logos" | "categories",
  file: File | Blob,
  fileName: string
): Promise<{ storagePath: string; publicUrl?: string }> {
  const supabase = createClient();
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${workspaceId}/${folder}/${safeName}_${timestamp}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw error;
  return { storagePath };
}
