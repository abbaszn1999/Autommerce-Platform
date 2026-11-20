import type { SupabaseClient } from "@supabase/supabase-js";
import {
  embedTexts,
  termEmbedText,
} from "./embeddings";
import { judgeSameIntentTerms } from "./stage9-same-intent";
import {
  collapseExactCopies,
  exactIntentKey,
  judgePackedClusters,
  nearestQuantLeader,
  packClusters,
  quantizeVector,
  type QuantVec,
  SAME_INTENT_COSINE,
  SAME_INTENT_EMBEDDING_DIMENSIONS,
  SAME_INTENT_PARALLEL,
  type IntentTerm,
  type SameIntentDrop,
} from "./same-intent";
import {
  clearSameIntentAdmin,
  loadClassifiedItemsAdmin,
  loadExtractRowsAdmin,
  saveSameIntentClusters,
  saveSameIntentState,
  type SameIntentClusterRecord,
  type SameIntentState,
} from "@/lib/market-research/storage-admin";

const EMBED_PAGE = 200;
const CLUSTER_PAGE = 200;

function freshState(total: number, drops: SameIntentDrop[]): SameIntentState {
  return {
    phase: total === 0 ? "done" : "embed",
    total,
    embedOffset: 0,
    clusterOffset: 0,
    judgeOffset: 0,
    drops,
    step: 0,
    updatedAt: new Date().toISOString(),
  };
}

type ClassifiedItem = Awaited<ReturnType<typeof loadClassifiedItemsAdmin>>[number];
type ArchiveRow = Awaited<ReturnType<typeof loadExtractRowsAdmin>>[number];

/** Suitable-for-categories terms with the highest extract volume per exact wording. */
function categoryIntentTerms(
  classified: ClassifiedItem[],
  archive: ArchiveRow[]
): IntentTerm[] {
  const volumeByKey = new Map<string, number>();
  for (const row of archive) {
    const key = exactIntentKey(row.phrase);
    if (!key) continue;
    const volume = row.volume ?? 0;
    if (volume > (volumeByKey.get(key) ?? -1)) volumeByKey.set(key, volume);
  }

  const seen = new Set<string>();
  const terms: IntentTerm[] = [];
  for (const item of classified) {
    if (item.sheet !== "category") continue;
    const keyword = (item.keyword || item.id || "").trim();
    if (!keyword || seen.has(item.id)) continue;
    seen.add(item.id);
    terms.push({
      id: item.id || keyword,
      keyword,
      volume: volumeByKey.get(exactIntentKey(keyword)) ?? 0,
    });
  }
  return terms;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Whole same-intent pass inside one worker: exact copies, embeddings,
 * leader clustering, then Gemini judgement per cluster. Terms and vectors
 * stay in memory from step to step — storage is written for the UI and
 * later reads, never read back to feed the next step, so a stale read right
 * after a write cannot empty the pass.
 */
export async function runSameIntentInMemory(
  admin: SupabaseClient,
  workspaceId: string,
  projectId: string,
  classified: ClassifiedItem[],
  onProgress?: (progress: { done: number; total: number }) => Promise<void>
): Promise<SameIntentDrop[]> {
  await clearSameIntentAdmin(admin, workspaceId, projectId).catch((err) =>
    console.error("[same-intent] Failed to clear previous pass:", err)
  );
  const archive = await loadExtractRowsAdmin(admin, workspaceId, projectId).catch(() => []);
  const collapsed = collapseExactCopies(categoryIntentTerms(classified, archive));
  const survivors = collapsed.kept;
  const state = freshState(survivors.length, collapsed.drops);
  const total = Math.max(1, survivors.length * 3);
  const save = async () => {
    state.updatedAt = new Date().toISOString();
    await saveSameIntentState(admin, workspaceId, projectId, state);
  };
  await save();
  await onProgress?.({ done: 0, total });
  if (survivors.length === 0) return state.drops;

  const vectors: Array<QuantVec | null> = new Array(survivors.length).fill(null);
  for (let offset = 0; offset < survivors.length; offset += EMBED_PAGE) {
    const slice = survivors.slice(offset, offset + EMBED_PAGE);
    const embedded = await embedTexts(
      slice.map((row) => termEmbedText(row.keyword)),
      SAME_INTENT_EMBEDDING_DIMENSIONS
    );
    embedded.forEach((vector, index) => {
      vectors[offset + index] = vector && vector.length > 0 ? quantizeVector(vector) : null;
    });
    state.embedOffset = offset + slice.length;
    await onProgress?.({ done: state.embedOffset, total });
  }
  state.phase = "cluster";
  await save();

  const leaders: Array<{ index: number; vector: QuantVec }> = [];
  // Parallel array of just the vectors, so the hot loop walks a flat list.
  const leaderVectors: QuantVec[] = [];
  const membersByLeader = new Map<number, number[]>();
  for (let index = 0; index < survivors.length; index += 1) {
    const vector = vectors[index];
    if (vector) {
      const best = nearestQuantLeader(vector, leaderVectors, SAME_INTENT_COSINE);
      if (best === -1) {
        leaders.push({ index, vector });
        leaderVectors.push(vector);
      } else {
        const leaderIndex = leaders[best]!.index;
        const list = membersByLeader.get(leaderIndex) ?? [];
        list.push(index);
        membersByLeader.set(leaderIndex, list);
      }
    }
    if (index % CLUSTER_PAGE === CLUSTER_PAGE - 1) {
      state.clusterOffset = index + 1;
      await onProgress?.({ done: survivors.length + state.clusterOffset, total });
      await yieldToEventLoop();
    }
  }
  state.clusterOffset = survivors.length;

  const clusters: SameIntentClusterRecord[] = [];
  for (const [leaderIndex, memberIndexes] of membersByLeader) {
    const members = [leaderIndex, ...memberIndexes].map((i) => {
      const term = survivors[i]!;
      return { id: term.id, keyword: term.keyword, volume: term.volume };
    });
    if (members.length >= 2) clusters.push({ members });
  }
  await saveSameIntentClusters(admin, workspaceId, projectId, clusters).catch((err) =>
    console.error("[same-intent] Failed to save clusters:", err)
  );
  state.phase = clusters.length === 0 ? "done" : "judge";
  await save();
  await onProgress?.({ done: survivors.length * 2, total });

  const bins = packClusters(clusters.map((cluster) => cluster.members));
  for (let offset = 0; offset < bins.length; offset += SAME_INTENT_PARALLEL) {
    const judged = await judgePackedClusters(
      bins.slice(offset, offset + SAME_INTENT_PARALLEL),
      judgeSameIntentTerms
    );
    state.drops = [...state.drops, ...judged.drops];
    state.judgeOffset = offset + judged.judgedBins;
    state.step += 1;
    await save();
    await onProgress?.({
      done: survivors.length * 2 + Math.round((state.judgeOffset / bins.length) * survivors.length),
      total,
    });
  }
  state.phase = "done";
  await save();
  await onProgress?.({ done: total, total });
  return state.drops;
}

