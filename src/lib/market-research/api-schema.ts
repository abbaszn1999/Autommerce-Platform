import { z } from "zod";
import { NextResponse } from "next/server";
import { requireGalleryAuth } from "@/lib/gallery/auth";

export const workspaceIdSchema = z.string().uuid();
export const projectIdSchema = z.string().uuid();

export const seedInputSchema = z.object({
  id: z.string().min(1).max(120),
  term: z.string().min(1).max(200),
});

export const probeBodySchema = z.object({
  workspaceId: workspaceIdSchema,
  projectId: projectIdSchema,
  market: z.string().min(2).max(16),
  seeds: z.array(seedInputSchema).min(1).max(100),
});

export const extractStartBodySchema = z.object({
  workspaceId: workspaceIdSchema,
  projectId: projectIdSchema,
  market: z.string().min(2).max(16),
  seeds: z
    .array(
      seedInputSchema.extend({
        rawKeywordEstimate: z.number().int().nonnegative().max(1_000_000),
      })
    )
    .min(1)
    .max(100),
  /** Applied by Semrush server-side, before rows are returned — narrower filters give fewer rows. */
  minVolume: z.number().int().min(0).max(1_000_000).optional(),
  maxDifficulty: z.number().int().min(0).max(100).optional(),
});

export const extractPollBodySchema = z.object({
  workspaceId: workspaceIdSchema,
  projectId: projectIdSchema,
  extractId: z.string().uuid(),
  cursors: z
    .array(
      z.object({
        seedId: z.string().min(1).max(120),
        cursor: z.string().max(32).optional(),
        status: z.enum(["running", "succeeded", "failed", "aborted"]).optional(),
      })
    )
    .max(100)
    .optional(),
});

export const extractCancelBodySchema = z.object({
  workspaceId: workspaceIdSchema,
  projectId: projectIdSchema,
  extractId: z.string().uuid(),
});

export const extractDownloadQuerySchema = z.object({
  workspaceId: workspaceIdSchema,
  projectId: projectIdSchema,
  /** Omit to export every extract archived for the project. */
  extractId: z.string().uuid().optional(),
});

export const pushBodySchema = z.object({
  workspaceId: workspaceIdSchema,
  projectId: projectIdSchema,
  collectionIds: z.array(z.string().min(1).max(120)).min(1).max(200),
});

export const agentAnalyzeBodySchema = z.object({
  workspaceId: workspaceIdSchema,
  projectId: projectIdSchema.optional(),
});

export const agentChatBodySchema = z.object({
  workspaceId: workspaceIdSchema,
  projectId: projectIdSchema.optional(),
  stage: z.number().int().min(1).max(6).default(1),
  market: z.string().optional(),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string().max(4000),
    })
  ).max(50),
  userMessage: z.string().min(1).max(2000),
  currentNiches: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        summary: z.string(),
      })
    )
    .optional(),
  selectedCollectionIds: z.array(z.string()).optional(),
  seedRows: z
    .array(
      z.object({
        id: z.string(),
        collectionId: z.string(),
        broadSeedVariation: z.string(),
        canonicalNicheSeed: z.string(),
        selectedCollection: z.string(),
        broadParentNiche: z.string(),
        productCount: z.number(),
        variationType: z.string(),
        scopeMatch: z.string(),
      })
    )
    .optional(),
  probes: z
    .record(
      z.string(),
      z.object({
        volume: z.string().optional(),
        rawKeywordCount: z.number().optional(),
        cpc: z.string().optional(),
        failed: z.boolean().optional(),
      })
    )
    .optional(),
});

const productFetchCursorSchema = z.object({
  collectionIndex: z.number().int().nonnegative(),
  shopifyAfter: z.string().nullable(),
  wooPage: z.number().int().positive(),
  totalFetched: z.number().int().nonnegative(),
  perCollectionFetched: z.record(z.string(), z.number()),
  done: z.boolean(),
});

// Drives the resumable, paginated product fetch (Tab 2 -> Tab 3 transition).
// One call pages through selected collections for up to ~40s server-side;
// the client loops, feeding back the returned `cursor`, until `done`.
export const productsFetchBodySchema = z.object({
  workspaceId: workspaceIdSchema,
  projectId: projectIdSchema,
  selectedCollections: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        productCount: z.number().int().nonnegative().optional(),
        parentNicheName: z.string().optional(),
      })
    )
    .min(1)
    .max(100),
  /** Omit or null to start a fresh fetch from the first selected collection. */
  cursor: productFetchCursorSchema.nullable().optional(),
});

// Embeds products already fetched for the given collections (Tab 3 -> 4
// loading). Cursor job: one call embeds one page, client loops on `offset`.
export const embeddingsProductsBodySchema = z.object({
  workspaceId: workspaceIdSchema,
  projectId: projectIdSchema,
  collectionIds: z.array(z.string().min(1)).min(1).max(500),
  offset: z.number().int().nonnegative(),
});

export const keywordSheetFiltersSchema = z.object({
  minVolume: z.number().nonnegative().optional(),
  maxKd: z.number().min(0).max(100).optional(),
  questionsOnly: z.boolean().optional(),
  query: z.string().max(200).optional(),
});

// Embeds surviving category terms with their PLP context (Tab 4 -> 5
// loading). Cursor job over the classified archive after Tab 4 Apply.
export const embeddingsTermsBodySchema = z.object({
  workspaceId: workspaceIdSchema,
  projectId: projectIdSchema,
  offset: z.number().int().nonnegative(),
  /** Applied "Suitable for categories" sheet filters from Tab 4. */
  filters: keywordSheetFiltersSchema.optional(),
});

export const agentSeedsBodySchema = z.object({
  workspaceId: workspaceIdSchema,
  projectId: projectIdSchema.optional(),
  selectedCollections: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        productCount: z.number().int().nonnegative(),
        parentNicheName: z.string(),
        /**
         * True when every PLP under this PLP's parent niche was selected in
         * Stage 2 (the whole niche was picked as a unit), false when only
         * specific PLPs within a bigger niche were chosen. Lets Stage 3
         * decide whether a niche-level canonical seed is appropriate.
         */
        nicheFullySelected: z.boolean().optional(),
        /** The searchable subcategory this PLP was placed under by the
         *  Stage 1 taxonomy agent (e.g. "Kids Hats") — the actual
         *  search-intent label, more reliable than the PLP's own raw name. */
        subcategoryName: z.string().optional(),
        /** Same as `nicheFullySelected` but at subcategory granularity —
         *  the level that represents one real search intent. */
        subcategoryFullySelected: z.boolean().optional(),
        /** Breadcrumb from the client's own store hierarchy down to this
         *  PLP (e.g. ["Kids", "Hats"]) — supporting context only, never a
         *  substitute for `subcategoryName`. */
        taxonomyPath: z.array(z.string()).optional(),
      })
    )
    .min(1)
    .max(100),
});

// Stage 5 Phase 3 (duplicate-collection exclusion) runs once, after the
// Phase 2 cursor loop above has fully finished and the "collections" slice
// holds the complete final list — no offset/paging needed here.
export const agentDedupeCollectionsBodySchema = z.object({
  workspaceId: workspaceIdSchema,
  projectId: projectIdSchema,
});

// Stage 6 on-page copywriting is a cursor job over the project's pushed
// collections: the client sends only the ids it wants generated (up to
// 20k), and the route resolves them against the canonical "collections"
// slice server-side, so it always sees the real storeHandle the push step
// persisted rather than trusting whatever the client happened to have in
// memory. `offset` drives the resumable page loop, same as Stage 4/5.
export const agentOnPageBodySchema = z.object({
  workspaceId: workspaceIdSchema,
  projectId: projectIdSchema,
  parentNiches: z.array(z.string()).optional(),
  customInstructions: z
    .object({
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
      collectionDescription: z.string().optional(),
    })
    .optional(),
  collectionIds: z.array(z.string().min(1)).min(1).max(20000),
  offset: z.number().int().nonnegative().default(0),
});

export async function requireMrWrite(workspaceId: string) {
  return requireGalleryAuth({ workspaceId, requireWrite: true });
}

export async function requireMrAdmin(workspaceId: string) {
  return requireGalleryAuth({ workspaceId, requireWrite: true, requireAdmin: true });
}

export async function requireMrRead(workspaceId: string) {
  return requireGalleryAuth({ workspaceId });
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
