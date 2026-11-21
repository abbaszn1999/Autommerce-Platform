/**
 * One-off: deletes the files of retired tools (Website Restructure, Free
 * Assessment, the old Products tab) from the `workspace-files` bucket
 * (`<workspace_id>/<tool folder>/...`). Storage does not allow deleting its
 * rows from SQL, so the migrations that drop a tool leave its files to this.
 *
 * It also cleans Market Research projects (`<workspace_id>/market-research/<project_id>/`):
 * removes the retired strategy, articles, article-jobs and internal-links
 * files, and strips the FAQ list and internal links from content.json.
 *
 * Dry run by default (only counts). Add --delete to remove them.
 *   npx tsx --env-file=.env scripts/purge-retired-storage.ts
 *   npx tsx --env-file=.env scripts/purge-retired-storage.ts --delete
 *
 * Uses the service role; it runs against the project in NEXT_PUBLIC_SUPABASE_URL.
 */
import { createClient } from "@supabase/supabase-js";

const BUCKET = "workspace-files";
const FOLDERS = ["website-restructure", "free-assessment", "master"];
const RETIRED_MR_FILES = ["strategy.json", "articles.json", "article-jobs.json", "internal-links.json"];
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

/** Folder names (no files) directly under a path. */
async function subfolders(folder: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await storage.list(folder, { limit: 100, offset });
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data.filter((d) => !d.id).map((d) => d.name));
    if (data.length < 100) break;
  }
  return out;
}

/** Removes faqs / links from every collection in a project's content.json. */
async function scrubContent(path: string): Promise<boolean> {
  const { data, error } = await storage.download(path);
  if (error || !data) return false;
  const content = JSON.parse(await data.text()) as Record<string, unknown>;
  let changed = false;
  for (const entry of Object.values(content)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if ("faqs" in record || "links" in record) {
      delete record.faqs;
      delete record.links;
      changed = true;
    }
  }
  if (!changed) return false;
  if (doDelete) {
    const blob = new Blob([JSON.stringify(content)], { type: "application/octet-stream" });
    const { error: uploadError } = await storage.upload(path, blob, { cacheControl: "0", upsert: true });
    if (uploadError) throw uploadError;
  }
  return true;
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
    for (const folder of FOLDERS) {
      const found = await files(`${workspace}/${folder}`).catch(() => [] as string[]);
      if (!found.length) continue;
      total += found.length;
      console.log(`${workspace}/${folder}: ${found.length} files`);
      if (!doDelete) continue;
      for (let i = 0; i < found.length; i += 100) {
        const { error } = await storage.remove(found.slice(i, i + 100));
        if (error) throw error;
      }
    }
  }
  let scrubbed = 0;
  for (const workspace of workspaces) {
    const projects = await subfolders(`${workspace}/market-research`).catch(() => [] as string[]);
    for (const project of projects) {
      const base = `${workspace}/market-research/${project}`;
      const { data: entries } = await storage.list(base, { limit: 100 });
      const present = (entries ?? [])
        .filter((entry) => entry.id && RETIRED_MR_FILES.includes(entry.name))
        .map((entry) => `${base}/${entry.name}`);
      if (present.length) {
        total += present.length;
        console.log(`${base}: ${present.length} retired files`);
        if (doDelete) {
          const { error } = await storage.remove(present);
          if (error) throw error;
        }
      }
      if (await scrubContent(`${base}/content.json`).catch(() => false)) {
        scrubbed += 1;
        console.log(`${base}/content.json: FAQ and links ${doDelete ? "removed" : "would be removed"}`);
      }
    }
  }
  console.log(`Market Research content.json files ${doDelete ? "cleaned" : "to clean"}: ${scrubbed}.`);
  console.log(doDelete ? `Deleted ${total} files.` : `${total} files would be deleted. Run again with --delete.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
