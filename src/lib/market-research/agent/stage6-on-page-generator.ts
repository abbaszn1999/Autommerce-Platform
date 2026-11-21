import type {
  CollectionContent,
  OnPageInstructions,
  ProposedCollection,
} from "@/components/market-research/workspace-data";
import { normalizeOnPageInstructions } from "@/components/market-research/workspace-data";
import { runGeminiMarketResearch } from "./gemini-runner";
import { runWithConcurrency } from "@/lib/sync/core/batch-executor";

const CHUNK_CONCURRENCY = 5;

/** SEO title/description are pushed as plain store meta fields — strip any HTML. */
function stripHtml(value: string): string {
  if (!value) return value;
  return value.replace(/<[^>]*>/g, "");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The store title the push step created ("AI - Name") back to the plain collection name. */
export function stripCollectionPrefix(title: string, prefix?: string): string {
  const clean = (title || "").trim();
  const p = (prefix || "").trim();
  if (!p) return clean;
  return clean
    .replace(new RegExp(`^${escapeRegex(p)}\\s*[-–—:|]\\s*`, "i"), "")
    .replace(new RegExp(`^${escapeRegex(p)}\\s+`, "i"), "")
    .trim();
}

export interface Stage6OnPageInput {
  storeName?: string;
  parentNiches?: string[];
  collections: ProposedCollection[];
  customInstructions?: Partial<OnPageInstructions>;
  /** Prefix the push step prepends to store collection titles, e.g. "AI". */
  collectionPrefix?: string;
}

export interface Stage6OnPageResult {
  contentById: Record<string, CollectionContent>;
  /** True only when every collection in this call was actually written by Gemini. */
  isAiGenerated: boolean;
  /** Collections in this call that fell back to the heuristic writer because their Gemini batch failed. */
  degradedCount: number;
}

interface GeminiCollectionContentItem {
  collectionId: string;
  seoTitle: string;
  seoDescription: string;
  collectionDescription: string;
}

interface GeminiOnPageResponse {
  contents: GeminiCollectionContentItem[];
}

/**
 * Heuristic fallback on-page writer if AI is unavailable.
 */
export function runHeuristicStage6OnPage(
  input: Stage6OnPageInput
): Stage6OnPageResult {
  const instructions = normalizeOnPageInstructions(input.customInstructions);
  const clip = (val: string) =>
    val.trim() ? ` (Follows custom instruction: “${val.trim().slice(0, 80)}”)` : "";

  const contentById: Record<string, CollectionContent> = {};

  for (const col of input.collections) {
    const name = stripCollectionPrefix(col.name, input.collectionPrefix) || col.name;
    const store = input.storeName || "Store";
    const head = col.headKeyword;

    const seoTitle = instructions.seoTitle.trim()
      ? `${name} | Shop ${head} - ${store}${clip(instructions.seoTitle)}`
      : `${name} | Shop ${head} - ${store}`;

    const seoDescription = instructions.seoDescription.trim()
      ? `Browse ${col.productCount || 1} ${name.toLowerCase()}. Find the best ${head} with top quality, great prices, and fast shipping.${clip(instructions.seoDescription)}`
      : `Browse ${col.productCount || 1} ${name.toLowerCase()}. Find the best ${head} with top quality, great prices, and fast shipping.`;

    const collectionDescription = instructions.collectionDescription.trim()
      ? `Explore our curated selection of ${name.toLowerCase()}. Designed for shoppers looking for premium ${head}, this collection brings together verified options for every budget and style.${clip(instructions.collectionDescription)}`
      : `Explore our curated selection of ${name.toLowerCase()}. Designed for shoppers looking for premium ${head}, this collection brings together verified options for every budget and style.`;

    contentById[col.id] = {
      collectionId: col.id,
      seoTitle,
      seoDescription,
      collectionDescription,
    };
  }

  return {
    contentById,
    isAiGenerated: false,
    degradedCount: Object.keys(contentById).length,
  };
}

/**
 * Generates on-page content for a single batch of collections (up to 10).
 */
async function generateBatchStage6(
  input: Stage6OnPageInput,
  batchCollections: ProposedCollection[]
): Promise<Record<string, CollectionContent>> {
  const instructions = normalizeOnPageInstructions(input.customInstructions);

  const customInstructionsContext = {
    seoTitle: instructions.seoTitle.trim() || undefined,
    seoDescription: instructions.seoDescription.trim() || undefined,
    collectionDescription: instructions.collectionDescription.trim() || undefined,
  };

  const userPrompt = JSON.stringify({
    storeName: input.storeName || "Ecommerce Store",
    parentNiches: input.parentNiches || [],
    customInstructions: customInstructionsContext,
    collectionsToGenerate: batchCollections.map((c) => ({
      collectionId: c.id,
      name: c.name,
      headKeyword: c.headKeyword,
      parentNiche: c.parentNiche,
      volume: c.volume,
      difficulty: c.difficulty,
      productCount: c.productCount,
      keywordCount: c.keywordCount,
      status: c.status,
      existingName: c.existingName,
    })),
  });

  const systemInstruction = `You are the Autommerce On-Page Copywriting Agent.
Your task is Stage 6 of Market Research:
Generate compelling, high-converting, and SEO-optimized collection page copy for each collection provided.

### Specific Instructions For The 3 Customizable Fields:
1. "seoTitle":
   ${instructions.seoTitle.trim() ? `CRITICAL USER INSTRUCTION FOR SEO TITLE: "${instructions.seoTitle.trim()}". Follow this strictly.` : "Write a concise, high-CTR title tag containing the head keyword and collection name (~50-60 characters)."}
2. "seoDescription":
   ${instructions.seoDescription.trim() ? `CRITICAL USER INSTRUCTION FOR META DESCRIPTION: "${instructions.seoDescription.trim()}". Follow this strictly.` : "Write a compelling meta description (~140-160 characters) with a clear value proposition and call to action."}
3. "collectionDescription":
   ${instructions.collectionDescription.trim() ? `CRITICAL USER INSTRUCTION FOR COLLECTION DESCRIPTION: "${instructions.collectionDescription.trim()}". Follow this strictly.` : "Write 1-2 engaging, natural paragraphs (80-140 words) describing the collection, its benefits, and shopper use cases."}

All three fields are plain text with absolutely no HTML tags and no links — they are pushed directly to the store.

Output strictly valid JSON with this exact schema:
{
  "contents": [
    {
      "collectionId": "col-id-matching-input",
      "seoTitle": "Collection Title | Shop Head Keyword",
      "seoDescription": "Meta description...",
      "collectionDescription": "Collection description..."
    }
  ]
}`;

  const result = await runGeminiMarketResearch<GeminiOnPageResponse>({
    stage: 6,
    systemInstruction,
    userPrompt,
  });

  const parsed = result.data;
  const batchContent: Record<string, CollectionContent> = {};

  if (parsed && Array.isArray(parsed.contents)) {
    for (const item of parsed.contents) {
      if (!item.collectionId) continue;

      batchContent[item.collectionId] = {
        collectionId: item.collectionId,
        seoTitle: stripHtml(item.seoTitle) || `${item.collectionId} | Shop Now`,
        seoDescription: stripHtml(item.seoDescription) || "",
        collectionDescription: stripHtml(item.collectionDescription || ""),
      };
    }
  }

  return batchContent;
}

function ungenerated(collectionId: string): CollectionContent {
  return {
    collectionId,
    seoTitle: "",
    seoDescription: "",
    collectionDescription: "",
    ungenerated: true,
  };
}

/**
 * Main Stage 6 On-Page generator.
 * Processes collections in chunks of 10 for fast, reliable generation.
 */
export async function runStage6OnPageGeneration(
  input: Stage6OnPageInput,
  chunkSize = 10
): Promise<Stage6OnPageResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey || input.collections.length === 0) {
    return runHeuristicStage6OnPage(input);
  }

  // Split collections into chunks of up to 10
  const chunks: ProposedCollection[][] = [];
  for (let i = 0; i < input.collections.length; i += chunkSize) {
    chunks.push(input.collections.slice(i, i + chunkSize));
  }

  const finalContentById: Record<string, CollectionContent> = {};
  let degradedCount = 0;

  const chunkResults = await runWithConcurrency(
    chunks,
    async (chunk) => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const batchResult = await generateBatchStage6(input, chunk);
          // A reply can succeed and still leave collections out. Ask once
          // more for those, then mark anything still missing as not
          // generated instead of leaving a silent gap in the sheet.
          let omitted = chunk.filter((collection) => !batchResult[collection.id]);
          if (omitted.length > 0) {
            try {
              Object.assign(batchResult, await generateBatchStage6(input, omitted));
            } catch (retryErr) {
              console.error(
                `[runStage6OnPageGeneration] Re-request for ${omitted.length} omitted collection(s) failed:`,
                retryErr
              );
            }
            omitted = chunk.filter((collection) => !batchResult[collection.id]);
            for (const collection of omitted) {
              batchResult[collection.id] = ungenerated(collection.id);
            }
          }
          return { contentById: batchResult, degraded: omitted.length };
        } catch (err) {
          lastError = err;
          console.error(
            `[runStage6OnPageGeneration] Batch failed (attempt ${attempt}/3):`,
            err
          );
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
          }
        }
      }
      console.error(
        "[runStage6OnPageGeneration] Leaving collections ungenerated after retries:",
        lastError
      );
      const contentById: Record<string, CollectionContent> = {};
      for (const collection of chunk) {
        contentById[collection.id] = ungenerated(collection.id);
      }
      return { contentById, degraded: chunk.length };
    },
    { concurrency: CHUNK_CONCURRENCY }
  );

  for (const result of chunkResults.successes) {
    Object.assign(finalContentById, result.contentById);
    degradedCount += result.degraded;
  }

  return {
    contentById: finalContentById,
    // Only claim a full AI pass when every chunk actually succeeded — one
    // chunk's Gemini failure silently falling back to the heuristic writer
    // must never be reported the same as a clean AI-generated pass.
    isAiGenerated: degradedCount === 0 && Object.keys(finalContentById).length > 0,
    degradedCount,
  };
}
