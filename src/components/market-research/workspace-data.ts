import { type MockSeedRow, type SeedProbe } from "./mock-data";
import {
  EXTRACT_CAP_PER_SEED,
} from "@/lib/market-research/cost";

/** Full-page workspace after Stage 3 Extract. Agent is gone. */
export type WorkspaceTab = "extract" | "collections" | "content";
export type FlowTab = "niches" | "catalog" | "seeds" | WorkspaceTab;

export const FLOW_TABS: {
  id: FlowTab;
  n: number;
  label: string;
}[] = [
  { id: "niches", n: 1, label: "Niches" },
  { id: "catalog", n: 2, label: "Catalog" },
  { id: "seeds", n: 3, label: "Seed terms" },
  { id: "extract", n: 4, label: "Extract" },
  { id: "collections", n: 5, label: "Collections" },
  { id: "content", n: 6, label: "On-page" },
];

export const WORKSPACE_TABS = FLOW_TABS.filter(
  (tab): tab is { id: WorkspaceTab; n: number; label: string } =>
    tab.n >= 4
);

export const TAB_ORDER: WorkspaceTab[] = WORKSPACE_TABS.map((t) => t.id);

export function isWorkspaceTab(tab: FlowTab): tab is WorkspaceTab {
  return (
    tab === "extract" ||
    tab === "collections" ||
    tab === "content"
  );
}

export function briefStageFromFlow(tab: FlowTab): 1 | 2 | 3 | null {
  if (tab === "niches") return 1;
  if (tab === "catalog") return 2;
  if (tab === "seeds") return 3;
  return null;
}

export { EXTRACT_CAP_PER_SEED };

export type KeywordSheet = "category" | "informational" | "excluded";

export type ExtractedKeyword = {
  id: string;
  seedId: string;
  seed: string;
  keyword: string;
  volume: number;
  difficulty: number;
  wordCount: number;
  isQuestion: boolean;
  sheet: KeywordSheet;
  productMatches: number;
  exclusionReason?: string;
  plpConcept?: string;
  /**
   * True when this row's `sheet` came from a real Gemini verdict; false
   * means the regex heuristic fallback was used. Undefined means no
   * classification has overlaid this row yet (still the extract default).
   */
  isAiGenerated?: boolean;
  /** Kept keyword when this row is an exact same-intent copy and stays off the category sheet. */
  sameIntentOf?: string;
};

export type SeedExtractProgress = {
  seedId: string;
  seed: string;
  cap: number;
  pulled: number;
};

export type MarketResearchProductAttribute = {
  name: string;
  value: string;
};

export type MarketResearchProductPrice = {
  amount: number;
  currency: string;
  compareAtPrice?: number;
  priceFormatted: string;
};

export type MarketResearchProduct = {
  id: string;
  title: string;
  handle: string;
  url: string;
  primaryImage?: string;
  images: string[];
  price: MarketResearchProductPrice;
  shortDescription?: string;
  fullDescription?: string;
  vendor?: string;
  productType?: string;
  tags: string[];
  attributes: MarketResearchProductAttribute[];
  collectionIds: string[];
  collectionNames: string[];
  inStock: boolean;
  totalInventory?: number;
};

export type CollectionProductMatch = {
  productId: string;
  score: number;
  rationale?: string;
};

export type ProposedCollection = {
  id: string;
  name: string;
  headKeyword: string;
  parentNiche: string;
  volume: number;
  difficulty: number;
  productCount: number;
  keywordCount: number;
  status: "new" | "existing" | "merge" | "duplicate";
  existingName?: string;
  /** Live store PLPs the duplicate agent named as the same shopper intent. */
  duplicateMatches?: Array<{ id: string; name: string }>;
  /**
   * Whether the duplicate check actually ran for this collection. "unknown"
   * means the live catalog fetch or the Gemini call failed — this must be
   * re-checked before the collection can be published, since a silent "new"
   * here could really be an unflagged duplicate.
   */
  dedupeCheckStatus?: "ok" | "unknown";
  matchedProductIds?: string[];
  productMatches?: CollectionProductMatch[];
  candidateMatches?: CollectionProductMatch[];
  /** Real handle/slug assigned by the store after push. Source of truth for widget matching. */
  storeHandle?: string;
  storeCollectionId?: string;
};

export type CollectionContent = {
  collectionId: string;
  seoTitle: string;
  seoDescription: string;
  collectionDescription: string;
  /**
   * When this copy last reached the live store. Kept on the content itself so
   * the status survives a refresh, and so regenerating the copy resets it —
   * new copy that never left the dashboard is not synced.
   */
  seoSyncedAt?: number;
  seoSyncError?: string;
  /** True when Gemini could not write this collection after retries. */
  ungenerated?: boolean;
};

export type OnPageInstructionField =
  | "seoTitle"
  | "seoDescription"
  | "collectionDescription";

export type OnPageInstructions = Record<OnPageInstructionField, string>;

export const EMPTY_ON_PAGE_INSTRUCTIONS: OnPageInstructions = {
  seoTitle: "",
  seoDescription: "",
  collectionDescription: "",
};

export function normalizeOnPageInstructions(
  value: unknown
): OnPageInstructions {
  if (typeof value === "string") {
    const t = value.trim();
    return {
      seoTitle: t,
      seoDescription: t,
      collectionDescription: t,
    };
  }
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    return {
      seoTitle: String(v.seoTitle ?? ""),
      seoDescription: String(v.seoDescription ?? ""),
      collectionDescription: String(v.collectionDescription ?? ""),
    };
  }
  return { ...EMPTY_ON_PAGE_INSTRUCTIONS };
}

export type KeywordFilters = {
  minVolume: number;
  maxKd: number;
  questionsOnly: boolean;
  /** Inclusive lower bound on the number of words in the phrase. */
  minWordCount: number;
  /** Inclusive upper bound on the number of words in the phrase. */
  maxWordCount: number;
};

/**
 * Auto-applied on the Extract tab: search volume ≥ 1, KD ≤ 50, word count
 * ≥ 2 (drops bare single-word seeds, keeps everything else). The data is
 * already extracted, so these only filter what is shown and applied.
 */
export const DEFAULT_FILTERS: KeywordFilters = {
  minVolume: 1,
  maxKd: 50,
  questionsOnly: false,
  minWordCount: 2,
  maxWordCount: 12,
};

export type SheetKeywordFilters = {
  category: KeywordFilters;
  informational: KeywordFilters;
};

export const DEFAULT_SHEET_FILTERS: SheetKeywordFilters = {
  category: DEFAULT_FILTERS,
  informational: DEFAULT_FILTERS,
};

export function normalizeKeywordFilters(raw: unknown): KeywordFilters {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const minVolume = Number(value.minVolume);
  const maxKd = Number(value.maxKd);
  const minWordCount = Number(value.minWordCount);
  const maxWordCount = Number(value.maxWordCount);
  const safeMinWordCount = Number.isFinite(minWordCount)
    ? Math.max(DEFAULT_FILTERS.minWordCount, Math.floor(minWordCount))
    : DEFAULT_FILTERS.minWordCount;
  const safeMaxWordCount = Number.isFinite(maxWordCount)
    ? Math.min(
        DEFAULT_FILTERS.maxWordCount,
        Math.max(safeMinWordCount, Math.floor(maxWordCount))
      )
    : DEFAULT_FILTERS.maxWordCount;
  return {
    minVolume:
      Number.isFinite(minVolume) && minVolume > 0
        ? Math.max(DEFAULT_FILTERS.minVolume, Math.floor(minVolume))
        : DEFAULT_FILTERS.minVolume,
    maxKd: Number.isFinite(maxKd)
      ? Math.min(DEFAULT_FILTERS.maxKd, Math.max(0, Math.floor(maxKd)))
      : DEFAULT_FILTERS.maxKd,
    questionsOnly: value.questionsOnly === true,
    minWordCount: safeMinWordCount,
    maxWordCount: safeMaxWordCount,
  };
}

export function normalizeSheetFilters(raw: unknown): SheetKeywordFilters {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    category: normalizeKeywordFilters(value.category),
    informational: normalizeKeywordFilters(value.informational),
  };
}

export function filtersEqual(a: KeywordFilters, b: KeywordFilters): boolean {
  return (
    a.minVolume === b.minVolume &&
    a.maxKd === b.maxKd &&
    a.questionsOnly === b.questionsOnly &&
    a.minWordCount === b.minWordCount &&
    a.maxWordCount === b.maxWordCount
  );
}

export function keywordPassesFilters(
  row: Pick<
    ExtractedKeyword,
    "keyword" | "seed" | "volume" | "difficulty" | "isQuestion" | "wordCount"
  >,
  filters: KeywordFilters
): boolean {
  if (row.volume < filters.minVolume) return false;
  // Semrush reports KD as "N/A" for terms it hasn't scored. Our provider
  // parser already coerces that to 0 (never undefined/NaN), so unscored
  // terms are treated as easy and pass a max-KD ceiling instead of being
  // dropped just because they're unscored.
  if (row.difficulty > filters.maxKd) return false;
  if (row.wordCount < filters.minWordCount) return false;
  if (row.wordCount > filters.maxWordCount) return false;
  if (filters.questionsOnly && !row.isQuestion) return false;
  return true;
}

export function pulledCountForSeed(
  seed: MockSeedRow,
  probes: Record<string, SeedProbe>
): number {
  const probe = probes[seed.id];
  if (!probe || probe.failed) return 400;
  return Math.min(EXTRACT_CAP_PER_SEED, probe.rawKeywords);
}

export function filterKeywords(
  rows: ExtractedKeyword[],
  filters: KeywordFilters,
  sheet?: KeywordSheet
): ExtractedKeyword[] {
  return rows.filter((row) => {
    if (sheet && row.sheet !== sheet) return false;
    if (sheet === "category" && row.sameIntentOf) return false;
    return keywordPassesFilters(row, filters);
  });
}

export function buildCollectionContent(
  collection: ProposedCollection,
  instructions?: OnPageInstructions | string
): CollectionContent {
  const fields = normalizeOnPageInstructions(instructions);
  const clip = (value: string) =>
    value.trim() ? ` Written to follow: “${value.trim().slice(0, 80)}”.` : "";
  const name = collection.name;
  return {
    collectionId: collection.id,
    seoTitle: `${name} | Shop ${collection.headKeyword}`,
    seoDescription: `Browse ${collection.productCount.toLocaleString("en-US")} ${name.toLowerCase()}. Compare styles, find the right fit, and buy with fast shipping.${clip(fields.seoDescription)}`,
    collectionDescription: `${name} for every budget and style. This collection groups products your catalog already carries for “${collection.headKeyword}” — ${collection.productCount.toLocaleString("en-US")} matching items, covering ${collection.keywordCount} related search terms.${clip(fields.collectionDescription)}`,
  };
}

export function tabIndex(tab: WorkspaceTab): number {
  return TAB_ORDER.indexOf(tab);
}

export function clampWorkspaceTab(
  value: unknown,
  fallback: WorkspaceTab = "extract"
): WorkspaceTab {
  if (value === "analyze") return "extract";
  // The retired content-strategy tab folds into the last tab that remains.
  if (value === "strategy") return "content";
  return TAB_ORDER.includes(value as WorkspaceTab)
    ? (value as WorkspaceTab)
    : fallback;
}

export function maxTab(
  a: WorkspaceTab,
  b: WorkspaceTab
): WorkspaceTab {
  return tabIndex(a) >= tabIndex(b) ? a : b;
}
