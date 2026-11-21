import type { KeywordRow } from "./providers/keyword-provider";
import type { SearchIntent } from "./providers/semrush-codes";
import type { MarketResearchPersisted } from "@/components/market-research/persistence";
import type { MarketResearchProject } from "@/components/market-research/mock-data";
import type {
  CollectionContent,
  MarketResearchProduct,
  ProposedCollection,
} from "@/components/market-research/workspace-data";

export type ProbeSeedInput = { id: string; term: string };

export type ProbeSeedResult =
  | {
      seedId: string;
      failed: false;
      volume: number;
      keywordDifficulty: number;
      cpcUsd: number;
      intents: SearchIntent[];
      keywordIdeasTotal: number;
      keywordIdeasTotalVolume: number;
      sampleKeywords: string[];
    }
  | { seedId: string; failed: true };

export type ProbeResponse = {
  market: string;
  database: string;
  results: ProbeSeedResult[];
};

export type ExtractSeedStart = {
  seedId: string;
  term: string;
  runId: string;
  datasetId?: string;
  limitPerSeed: number;
  estimatedRows: number;
};

export type ExtractStartResponse = {
  extractId: string;
  database: string;
  seeds: ExtractSeedStart[];
};

export type ExtractPollSeed = {
  seedId: string;
  term: string;
  runId: string;
  datasetId?: string;
  status: "running" | "succeeded" | "failed" | "aborted";
  rows: KeywordRow[];
  nextCursor?: string;
  error?: string;
  rowsReturned?: number;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export async function loadMrStateApi(
  workspaceId: string
): Promise<MarketResearchPersisted> {
  const response = await fetch(
    `/api/market-research/state?workspaceId=${encodeURIComponent(workspaceId)}`
  );
  const data = await readJson<{ state: MarketResearchPersisted }>(response);
  return data.state;
}

export async function saveMrStateApi(
  workspaceId: string,
  state: MarketResearchPersisted
): Promise<void> {
  // The server owns keywords (extract + classify) and ignores them here; a
  // large project's rows would push the body past the request size limit.
  const response = await fetch("/api/market-research/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, state: { ...state, keywordsByProject: {} } }),
  });
  await readJson(response);
}

export async function createMrProjectApi(
  workspaceId: string,
  input: {
    name: string;
    storeLabel?: string;
    highlightedCollectionIds?: string[];
  }
): Promise<Pick<MarketResearchProject, "id" | "name">> {
  const response = await fetch("/api/market-research/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, ...input }),
  });
  const data = await readJson<{ project: { id: string; name: string } }>(
    response
  );
  return data.project;
}

export async function deleteMrProjectApi(
  workspaceId: string,
  projectId: string
): Promise<void> {
  const response = await fetch("/api/market-research/projects", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, projectId }),
  });
  await readJson(response);
}

export async function probeSeedsApi(
  workspaceId: string,
  projectId: string,
  market: string,
  seeds: ProbeSeedInput[]
): Promise<ProbeResponse> {
  const response = await fetch("/api/market-research/probe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, projectId, market, seeds }),
  });
  return readJson<ProbeResponse>(response);
}

export async function startExtractApi(
  workspaceId: string,
  projectId: string,
  market: string,
  seeds: Array<ProbeSeedInput & { rawKeywordEstimate: number }>,
  /** Applied by Semrush server-side, so narrower filters return fewer rows. */
  filters?: { minVolume?: number; maxDifficulty?: number }
): Promise<ExtractStartResponse> {
  const response = await fetch("/api/market-research/extract/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      projectId,
      market,
      seeds,
      minVolume: filters?.minVolume,
      maxDifficulty: filters?.maxDifficulty,
    }),
  });
  return readJson<ExtractStartResponse>(response);
}

export async function pollExtractApi(
  workspaceId: string,
  projectId: string,
  extractId: string,
  cursors?: Array<{
    seedId: string;
    cursor?: string;
    status?: ExtractPollSeed["status"];
  }>
): Promise<{
  seeds: ExtractPollSeed[];
  allDone: boolean;
  rowsReturned: number;
  sample?: import("./map-keywords").DisplayKeyword[];
}> {
  const response = await fetch("/api/market-research/extract/poll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, projectId, extractId, cursors }),
  });
  return readJson(response);
}

export type ExtractStatusResponse = {
  extract: {
    id: string;
    status: string;
    rowsReturned: number;
    createdAt: string;
  } | null;
  seeds: Array<{
    seedId: string;
    term: string;
    status: string;
    rowsReturned: number;
    limitPerSeed: number;
  }>;
  sample?: import("./map-keywords").DisplayKeyword[];
};

export async function extractStatusApi(
  workspaceId: string,
  projectId: string,
  extractId?: string
): Promise<ExtractStatusResponse> {
  const params = new URLSearchParams({ workspaceId, projectId });
  if (extractId) params.set("extractId", extractId);
  const response = await fetch(
    `/api/market-research/extract/status?${params.toString()}`
  );
  return readJson<ExtractStatusResponse>(response);
}

export async function cancelExtractApi(
  workspaceId: string,
  projectId: string,
  extractId: string
): Promise<{ rowsReturned: number }> {
  const response = await fetch("/api/market-research/extract/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, projectId, extractId }),
  });
  return readJson(response);
}

export type PushCollectionsStoreResult = {
  id: string;
  name: string;
  storeTitle?: string;
  handle?: string;
  storeCollectionId?: string;
  success: boolean;
  error?: string;
};

export type PushCollectionsResponse = {
  ok?: boolean;
  duplicate?: boolean;
  pushedCount?: number;
  failedCount?: number;
  pushedIds?: string[];
  storeResults?: PushCollectionsStoreResult[];
  /** Set when a later chunk failed and the rest were not attempted. */
  stoppedReason?: string;
};

/**
 * Collections per push request. The store API is called one collection at a
 * time, so a very large push in one request would run for an hour and be cut
 * off. Chunks keep each request short; the server skips anything already
 * pushed, so a stopped run resumes by simply selecting the rest again.
 */
export const PUSH_CHUNK_SIZE = 25;

export async function pushCollectionsApi(
  workspaceId: string,
  projectId: string,
  collectionIds: string[],
  onProgress?: (progress: { done: number; total: number }) => void
): Promise<PushCollectionsResponse> {
  const total = collectionIds.length;
  const post = async (ids: string[]): Promise<PushCollectionsResponse> => {
    const response = await fetch("/api/market-research/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, projectId, collectionIds: ids }),
    });
    return readJson(response);
  };
  if (total <= PUSH_CHUNK_SIZE) return post(collectionIds);

  const merged: PushCollectionsResponse = {
    ok: true,
    pushedCount: 0,
    failedCount: 0,
    pushedIds: [],
    storeResults: [],
  };
  for (let offset = 0; offset < total; offset += PUSH_CHUNK_SIZE) {
    const ids = collectionIds.slice(offset, offset + PUSH_CHUNK_SIZE);
    let part: PushCollectionsResponse;
    try {
      part = await post(ids);
    } catch (error) {
      // Nothing done yet: surface the error as before. Otherwise keep what
      // was published and report the rest as not attempted.
      if (offset === 0) throw error;
      merged.stoppedReason =
        error instanceof Error ? error.message : "Publishing stopped before finishing";
      merged.failedCount = (merged.failedCount ?? 0) + (total - offset);
      merged.ok = false;
      break;
    }
    merged.pushedCount = (merged.pushedCount ?? 0) + (part.pushedCount ?? 0);
    merged.failedCount = (merged.failedCount ?? 0) + (part.failedCount ?? 0);
    merged.pushedIds!.push(...(part.pushedIds ?? []));
    merged.storeResults!.push(...(part.storeResults ?? []));
    onProgress?.({ done: Math.min(total, offset + ids.length), total });
  }
  return merged;
}

export type SyncSeoResponse = {
  ok: boolean;
  syncedCount: number;
  results?: Array<{ collectionId: string; ok: boolean; error?: string }>;
  errors?: string[];
};

/** Collections per SEO sync request, for the same reason as PUSH_CHUNK_SIZE. */
export const SYNC_SEO_CHUNK_SIZE = 25;

export async function syncSeoApi(
  workspaceId: string,
  projectId: string,
  collectionIds?: string[]
): Promise<SyncSeoResponse> {
  const post = async (ids?: string[]): Promise<SyncSeoResponse> => {
    const response = await fetch("/api/market-research/sync-seo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, projectId, collectionIds: ids }),
    });
    return readJson(response);
  };
  if (!collectionIds || collectionIds.length <= SYNC_SEO_CHUNK_SIZE) {
    return post(collectionIds);
  }

  const merged: SyncSeoResponse = { ok: true, syncedCount: 0, results: [], errors: [] };
  for (let offset = 0; offset < collectionIds.length; offset += SYNC_SEO_CHUNK_SIZE) {
    const ids = collectionIds.slice(offset, offset + SYNC_SEO_CHUNK_SIZE);
    try {
      const part = await post(ids);
      merged.ok = merged.ok && part.ok;
      merged.syncedCount += part.syncedCount ?? 0;
      merged.results!.push(...(part.results ?? []));
      merged.errors!.push(...(part.errors ?? []));
    } catch (error) {
      // Report this chunk's collections as failed and carry on with the rest.
      const message = error instanceof Error ? error.message : "Sync failed";
      merged.ok = false;
      merged.errors!.push(message);
      for (const collectionId of ids) {
        merged.results!.push({ collectionId, ok: false, error: message });
      }
    }
  }
  return merged;
}

export type AgentAnalyzeResponse = {
  storeName: string;
  provider: string;
  baseUrl: string;
  isMock: boolean;
  niches: Array<{ id: string; name: string; summary: string }>;
  structuredNiches: Array<{
    id: string;
    name: string;
    productCount: number;
    collections: Array<{
      id: string;
      name: string;
      productCount: number;
      description: string;
      plpPath: string;
      lastSyncedLabel?: string;
    }>;
    subcategories?: Array<{
      id: string;
      name: string;
      productCount: number;
      collections: Array<{
        id: string;
        name: string;
        productCount: number;
        description?: string;
        plpPath?: string;
        lastSyncedLabel?: string;
      }>;
    }>;
    overlapping?: boolean;
  }>;
  excludedItems?: Array<{
    id: string;
    name: string;
    reason: "promotional" | "attribute-only" | "duplicate" | "empty" | "unresolved";
  }>;
  agentConclusion: string;
  beats: Array<{ at: number; text: string }>;
  isAiGenerated: boolean;
};

export async function analyzeStoreApi(
  workspaceId: string,
  projectId?: string
): Promise<AgentAnalyzeResponse> {
  const response = await fetch("/api/market-research/agent/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, projectId }),
  });
  const started = await readJson<AgentAnalyzeResponse & { pending?: boolean; jobId?: string }>(
    response
  );
  if (!started.pending || !projectId) return started;
  return watchStoreAnalysisApi(workspaceId, projectId, started.jobId);
}

type AnalyzeStatus = AgentAnalyzeResponse & { pending?: boolean; jobId?: string };

/** The running Tab 1 job for this project, if any (e.g. after a refresh). */
export async function activeStoreAnalysisApi(
  workspaceId: string,
  projectId: string
): Promise<string | null> {
  const params = new URLSearchParams({ workspaceId, projectId });
  const status = await readJson<AnalyzeStatus>(
    await fetch(`/api/market-research/agent/analyze?${params.toString()}`)
  );
  return status.pending && status.jobId ? status.jobId : null;
}

export async function watchStoreAnalysisApi(
  workspaceId: string,
  projectId: string,
  startJobId?: string
): Promise<AgentAnalyzeResponse> {
  const deadline = Date.now() + 30 * 60 * 1000;
  let jobId = startJobId;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error("Store analysis is still running. Refresh to see the result.");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const params = new URLSearchParams({ workspaceId, projectId });
    if (jobId) params.set("jobId", jobId);
    const statusRes = await fetch(`/api/market-research/agent/analyze?${params.toString()}`);
    const status = await readJson<AnalyzeStatus>(statusRes);
    if (status.jobId) jobId = status.jobId;
    if (!status.pending) return status;
  }
}

export async function cancelStoreAnalysisApi(
  workspaceId: string,
  projectId: string
): Promise<void> {
  const params = new URLSearchParams({ workspaceId, projectId });
  await readJson(
    await fetch(`/api/market-research/agent/analyze?${params.toString()}`, {
      method: "DELETE",
    })
  );
}

export type AgentChatResponse = {
  reply: string;
  updatedNiches?: Array<{ id: string; name: string; summary: string }>;
  updatedStructuredNiches?: Array<{
    id: string;
    name: string;
    productCount: number;
    collections: Array<any>;
  }>;
};

export async function chatAgentApi(
  workspaceId: string,
  projectId: string | undefined,
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  userMessage: string,
  currentNiches?: Array<{ id: string; name: string; summary: string }>,
  opts?: {
    stage?: number;
    market?: string;
    selectedCollectionIds?: string[];
    seedRows?: Array<any>;
    probes?: Record<string, any>;
  }
): Promise<AgentChatResponse> {
  const response = await fetch("/api/market-research/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      projectId,
      stage: opts?.stage ?? 1,
      market: opts?.market,
      messages,
      userMessage,
      currentNiches,
      selectedCollectionIds: opts?.selectedCollectionIds,
      seedRows: opts?.seedRows,
      probes: opts?.probes,
    }),
  });
  return readJson<AgentChatResponse>(response);
}

export type AgentSeedsResponse = {
  seedRows: Array<{
    id: string;
    collectionId: string;
    broadSeedVariation: string;
    canonicalNicheSeed: string;
    selectedCollection: string;
    broadParentNiche: string;
    productCount: number;
    variationType: any;
    scopeMatch: any;
  }>;
  isAiGenerated: boolean;
};

// ─── Paginated product fetch (Tab 2 -> Tab 3) ──────────────────────────────

export type ProductFetchCursor = {
  collectionIndex: number;
  shopifyAfter: string | null;
  wooPage: number;
  totalFetched: number;
  perCollectionFetched: Record<string, number>;
  done: boolean;
};

export type ProductsFetchResponse = {
  cursor: ProductFetchCursor;
  fetchedThisCall: number;
  totalFetched: number;
  done: boolean;
  productCountByCollectionId: Record<string, number>;
};

export async function fetchProductsPageApi(
  workspaceId: string,
  projectId: string,
  selectedCollections: Array<{
    id: string;
    name: string;
    description?: string;
    productCount?: number;
    parentNicheName?: string;
  }>,
  cursor: ProductFetchCursor | null
): Promise<ProductsFetchResponse> {
  const response = await fetch("/api/market-research/products/fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, projectId, selectedCollections, cursor }),
  });
  return readJson<ProductsFetchResponse>(response);
}

/**
 * Drives `fetchProductsPageApi` to completion, calling `onProgress` after
 * every page. Sequential by design — pagination cursors are stateful per
 * collection, so calls must never overlap.
 */
export async function runProductsFetchLoop(
  workspaceId: string,
  projectId: string,
  selectedCollections: Array<{
    id: string;
    name: string;
    description?: string;
    productCount?: number;
    parentNicheName?: string;
  }>,
  onProgress?: (state: { totalFetched: number; done: boolean }) => void,
  isCancelled?: () => boolean
): Promise<Record<string, number>> {
  let cursor: ProductFetchCursor | null = null;
  let productCountByCollectionId: Record<string, number> = {};
  let guard = 0;
  const MAX_CALLS = 200; // 200 * ~40s budget covers far more than the 20k cap ever needs

  do {
    if (isCancelled?.()) break;
    const res = await fetchProductsPageApi(
      workspaceId,
      projectId,
      selectedCollections,
      cursor
    );
    cursor = res.cursor;
    productCountByCollectionId = res.productCountByCollectionId;
    onProgress?.({ totalFetched: res.totalFetched, done: res.done });
    guard += 1;
  } while (!cursor.done && guard < MAX_CALLS);

  return productCountByCollectionId;
}

// ─── Embedding passes (Tab 3 -> 4 products, Tab 4 -> 5 terms) ─────────────

export type EmbedPassResponse = {
  offset: number;
  nextOffset: number;
  done: boolean;
  processed: number;
  embedded: number;
  skipped: number;
  total: number;
};

export async function embedProductsPageApi(
  workspaceId: string,
  projectId: string,
  collectionIds: string[],
  offset: number
): Promise<EmbedPassResponse> {
  const response = await fetch("/api/market-research/embeddings/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, projectId, collectionIds, offset }),
  });
  return readJson<EmbedPassResponse>(response);
}

export async function runEmbedProductsLoop(
  workspaceId: string,
  projectId: string,
  collectionIds: string[],
  onProgress?: (state: EmbedPassResponse) => void,
  isCancelled?: () => boolean
): Promise<void> {
  let offset = 0;
  let guard = 0;
  const MAX_CALLS = 200;
  for (;;) {
    if (isCancelled?.() || guard >= MAX_CALLS) break;
    const res = await embedProductsPageApi(workspaceId, projectId, collectionIds, offset);
    onProgress?.(res);
    guard += 1;
    if (res.done) break;
    offset = res.nextOffset;
  }
}

export async function embedTermsPageApi(
  workspaceId: string,
  projectId: string,
  offset: number,
  filters?: {
    minVolume?: number;
    maxKd?: number;
    questionsOnly?: boolean;
    query?: string;
  }
): Promise<EmbedPassResponse> {
  const response = await fetch("/api/market-research/embeddings/terms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, projectId, offset, filters }),
  });
  return readJson<EmbedPassResponse>(response);
}

export async function runEmbedTermsLoop(
  workspaceId: string,
  projectId: string,
  onProgress?: (state: EmbedPassResponse) => void,
  isCancelled?: () => boolean,
  filters?: {
    minVolume?: number;
    maxKd?: number;
    questionsOnly?: boolean;
    query?: string;
  }
): Promise<void> {
  let offset = 0;
  let guard = 0;
  const MAX_CALLS = 200;
  for (;;) {
    if (isCancelled?.() || guard >= MAX_CALLS) break;
    const res = await embedTermsPageApi(workspaceId, projectId, offset, filters);
    onProgress?.(res);
    guard += 1;
    if (res.done) break;
    offset = res.nextOffset;
  }
}

// ─── Stage 4 classification over the full extract archive ────────────────

/**
 * Runs a cursor-paginated agent job (classify, cluster, on-page, …) to
 * completion. `MAX_CALLS_PER_ROUND` exists only as a safety net against a
 * server bug where `nextOffset` never advances or `done` never arrives — it
 * must never be the reason a real, still-in-progress job gets treated as
 * finished. So when the guard trips, the loop resumes automatically from the
 * last `nextOffset` for a few more rounds instead of silently stopping; only
 * if it's still not `done` after every round does this throw, so a caller
 * can never mistake a truncated pass for a completed one.
 */
async function runCursorLoop<TState extends { done: boolean; nextOffset: number }>(
  fetchPage: (offset: number) => Promise<TState>,
  onProgress: ((state: TState) => void) | undefined,
  isCancelled: (() => boolean) | undefined,
  label: string
): Promise<TState | null> {
  const MAX_CALLS_PER_ROUND = 500;
  const MAX_ROUNDS = 4;
  let offset = 0;
  let last: TState | null = null;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    let guard = 0;
    for (;;) {
      if (isCancelled?.()) return last;
      if (guard >= MAX_CALLS_PER_ROUND) break;
      const res = await fetchPage(offset);
      last = res;
      onProgress?.(res);
      guard += 1;
      if (res.done) return last;
      offset = res.nextOffset;
    }
  }
  throw new Error(
    `${label} did not finish after ${MAX_ROUNDS * MAX_CALLS_PER_ROUND} calls. Please retry.`
  );
}

// ─── Stage 5 clustering as a cursor job ───────────────────────────────────

// ─── Stage 5 Phase 3: duplicate-collection exclusion (runs once, after the
// cursor loop above is fully done) ─────────────────────────────────────────

export type DedupeCollectionsResponse = {
  collections: ProposedCollection[];
  duplicateCount: number;
  /** True when the live-catalog fetch or the Gemini comparison failed — some "new" collections may really be unflagged duplicates. */
  dedupeCheckFailed: boolean;
};

export async function dedupeCollectionsApi(
  workspaceId: string,
  projectId: string
): Promise<DedupeCollectionsResponse> {
  const response = await fetch("/api/market-research/agent/dedupe-collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, projectId }),
  });
  return readJson<DedupeCollectionsResponse>(response);
}

/**
 * Read-only snapshot of every fetched product for a project (merged across
 * shards). For display only — never fed back through autosave.
 */
export async function loadProjectProductsApi(
  workspaceId: string,
  projectId: string,
  ids?: string[]
): Promise<MarketResearchProduct[]> {
  const params = new URLSearchParams({ workspaceId, projectId });
  if (ids && ids.length > 0) {
    params.set("ids", ids.slice(0, 500).join(","));
  }
  const response = await fetch(
    `/api/market-research/products/list?${params.toString()}`
  );
  const data = await readJson<{ products: MarketResearchProduct[] }>(response);
  return data.products;
}

export async function generateSeedsApi(
  workspaceId: string,
  projectId: string | undefined,
  selectedCollections: Array<{
    id: string;
    name: string;
    description?: string;
    productCount: number;
    parentNicheName: string;
    nicheFullySelected?: boolean;
    subcategoryName?: string;
    subcategoryFullySelected?: boolean;
    taxonomyPath?: string[];
  }>
): Promise<AgentSeedsResponse> {
  const response = await fetch("/api/market-research/agent/seeds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, projectId, selectedCollections }),
  });
  return readJson<AgentSeedsResponse>(response);
}

// ─── Stage 6 on-page copywriting as a cursor job ──────────────────────────
//
// The route resolves ids against the canonical "collections" slice
// server-side, so only ids travel here.

export type OnPageInstructionsContext = {
  seoTitle?: string;
  seoDescription?: string;
  collectionDescription?: string;
};

export type OnPageGenerationPageResponse = {
  offset: number;
  nextOffset: number;
  done: boolean;
  processed: number;
  total: number;
  contentById: Record<string, CollectionContent>;
  isAiGenerated: boolean;
  /** Collections in this page whose Gemini batch failed and fell back to the heuristic writer. */
  degradedCount: number;
};

export async function generateOnPagePageApi(
  workspaceId: string,
  projectId: string,
  collectionIds: string[],
  offset: number,
  context?: {
    parentNiches?: string[];
    customInstructions?: OnPageInstructionsContext;
  }
): Promise<OnPageGenerationPageResponse> {
  const response = await fetch("/api/market-research/agent/on-page", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      projectId,
      parentNiches: context?.parentNiches,
      customInstructions: context?.customInstructions,
      collectionIds,
      offset,
    }),
  });
  return readJson<OnPageGenerationPageResponse>(response);
}

export async function runOnPageGenerationLoop(
  workspaceId: string,
  projectId: string,
  collectionIds: string[],
  context?: {
    parentNiches?: string[];
    customInstructions?: OnPageInstructionsContext;
  },
  onProgress?: (state: OnPageGenerationPageResponse) => void,
  isCancelled?: () => boolean
): Promise<OnPageGenerationPageResponse | null> {
  return runCursorLoop(
    (offset) =>
      generateOnPagePageApi(workspaceId, projectId, collectionIds, offset, context),
    onProgress,
    isCancelled,
    "On-page generation"
  );
}

export type StoreInfoResponse = {
  provider: string | null;
  /** Storefront origin, used to render clickable absolute collection links. */
  storeUrl: string;
};

export async function fetchStoreInfoApi(
  workspaceId: string
): Promise<StoreInfoResponse> {
  const response = await fetch(
    `/api/market-research/store-info?workspaceId=${encodeURIComponent(workspaceId)}`
  );
  return readJson<StoreInfoResponse>(response);
}