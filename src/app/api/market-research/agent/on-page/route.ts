import { NextRequest, NextResponse } from "next/server";
import {
  agentOnPageBodySchema,
  jsonError,
  requireMrWrite,
} from "@/lib/market-research/api-schema";
import { runStage6OnPageGeneration } from "@/lib/market-research/agent/stage6-on-page-generator";
import {
  loadProjectSliceAdmin,
  saveProjectSliceAdmin,
} from "@/lib/market-research/storage-admin";
import type {
  CollectionContent,
  ProposedCollection,
} from "@/components/market-research/workspace-data";

export const maxDuration = 60;

// One page of the selected collection ids per call. Each page is chunked
// into Gemini copywriting batches of 10, 5 batches running concurrently.
const PAGE_SIZE = 100;

/**
 * "Generate" is an SEO-only pass: the canonical collection list (with real
 * storeHandles) is loaded from storage rather than trusted from the request
 * body, so this route only ever needs the ids of the collections to write copy
 * for. Looped by the client
 * (runOnPageGenerationLoop) until `done`, so a 10k-collection store keeps
 * filling the content table in the background instead of dying at 60s.
 */
export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = agentOnPageBodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonError("Invalid on-page payload", 400);
  }

  const auth = await requireMrWrite(parsed.data.workspaceId);
  if (!auth.ok) return auth.response;

  try {
    const { data: integrationRow } = await auth.admin
      .from("workspace_integrations")
      .select("integration_name")
      .eq("workspace_id", parsed.data.workspaceId)
      .maybeSingle();
    const storeName =
      (integrationRow?.integration_name as string | undefined)?.trim() || "Ecommerce Store";

    // Collection titles on the store carry the workspace naming prefix.
    const { data: workspaceRow } = await auth.admin
      .from("workspaces")
      .select("collection_prefix")
      .eq("id", parsed.data.workspaceId)
      .maybeSingle();
    const collectionPrefix =
      (workspaceRow?.collection_prefix ?? "AI").trim() || "AI";

    const allProposed = await loadProjectSliceAdmin<ProposedCollection[]>(
      auth.admin,
      parsed.data.workspaceId,
      parsed.data.projectId,
      "collections"
    ).catch(() => null);
    const proposedById = new Map(
      (Array.isArray(allProposed) ? allProposed : []).map((c) => [c.id, c])
    );

    const total = parsed.data.collectionIds.length;
    const offset = Math.min(parsed.data.offset, total);
    const pageIds = parsed.data.collectionIds.slice(offset, offset + PAGE_SIZE);
    const nextOffset = offset + pageIds.length;
    const done = nextOffset >= total;

    const pageCollections = pageIds
      .map((id) => proposedById.get(id))
      .filter((c): c is ProposedCollection => Boolean(c));

    let pageContentById: Record<string, CollectionContent> = {};
    let isAiGenerated = false;
    let degradedCount = 0;
    if (pageCollections.length > 0) {
      const result = await runStage6OnPageGeneration({
        storeName,
        parentNiches: parsed.data.parentNiches,
        collections: pageCollections,
        customInstructions: parsed.data.customInstructions,
        collectionPrefix,
      });
      pageContentById = result.contentById;
      isAiGenerated = result.isAiGenerated;
      degradedCount = result.degradedCount;
    }

    if (Object.keys(pageContentById).length > 0) {
      const existingContent = await loadProjectSliceAdmin<
        Record<string, CollectionContent>
      >(
        auth.admin,
        parsed.data.workspaceId,
        parsed.data.projectId,
        "content"
      ).catch(() => null);

      const mergedContent: Record<string, CollectionContent> = {
        ...(existingContent ?? {}),
        ...pageContentById,
      };

      await saveProjectSliceAdmin(
        auth.admin,
        parsed.data.workspaceId,
        parsed.data.projectId,
        "content",
        mergedContent
      ).catch((err) => console.error("[on-page] Error saving content slice:", err));
    }

    return NextResponse.json(
      {
        offset,
        nextOffset,
        done,
        processed: pageIds.length,
        total,
        contentById: pageContentById,
        isAiGenerated,
        degradedCount,
      },
      { headers: auth.headers }
    );
  } catch (err) {
    console.error("[api/market-research/agent/on-page] Error:", err);
    const msg = err instanceof Error ? err.message : "Failed to generate on-page content";
    return jsonError(msg, 500);
  }
}
