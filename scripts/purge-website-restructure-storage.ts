/**
 * One-off: deletes the files of retired Website Restructure projects from the
 * `workspace-files` bucket (`<workspace_id>/website-restructure/...`).
 *
 * Dry run by default (only counts). Add --delete to remove them.
 *   npx tsx --env-file=.env scripts/purge-website-restructure-storage.ts
 *   npx tsx --env-file=.env scripts/purge-website-restructure-storage.ts --delete
 *
 * Uses the service role; it runs against the project in NEXT_PUBLIC_SUPABASE_URL.
 */
import { createClient } from "@supabase/supabase-js";

const BUCKET = "workspace-files";
const FOLDER = "website-restructure";
const doDelete = process.argv.includes("--delete");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
const storage = createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET);

/** Every file path under a folder (folders have no id). */
async function files(folder: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await storage.list(folder, { limit: 100, offset });
    if (error) throw error;
    if (!data?.length) break;
    for (const item of data) {
      const path = `${folder}/${item.name}`;
      if (item.id) out.push(path);
      else out.push(...(await files(path)));
    }
    if (data.length < 100) break;
  }
  return out;
}

async function main() {
  const workspaces: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await storage.list("", { limit: 100, offset });
    if (error) throw error;
    if (!data?.length) break;
    workspaces.push(...data.filter((d) => !d.id).map((d) => d.name));
    if (data.length < 100) break;
  }

  let total = 0;
  for (const workspace of workspaces) {
    const found = await files(`${workspace}/${FOLDER}`).catch(() => [] as string[]);
    if (!found.length) continue;
    total += found.length;
    console.log(`${workspace}: ${found.length} files`);
    if (!doDelete) continue;
    for (let i = 0; i < found.length; i += 100) {
      const { error } = await storage.remove(found.slice(i, i + 100));
      if (error) throw error;
    }
  }
  console.log(doDelete ? `Deleted ${total} files.` : `${total} files would be deleted. Run again with --delete.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
