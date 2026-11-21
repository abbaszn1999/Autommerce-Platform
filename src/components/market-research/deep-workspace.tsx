"use client";

import type { ReactNode } from "react";
import { StageCollectionSheet } from "./stage-collection-sheet";
import { StageContentPanel } from "./stage-content-panel";
import { StageExtractPanel } from "./stage-extract-panel";
import { WorkspaceStepper } from "./workspace-stepper";
import { cn } from "@/lib/utils";
import type {
  CollectionContent,
  ExtractedKeyword,
  FlowTab,
  KeywordFilters,
  MarketResearchProduct,
  OnPageInstructionField,
  OnPageInstructions,
  ProposedCollection,
  SeedExtractProgress,
  SheetKeywordFilters,
  WorkspaceTab,
} from "./workspace-data";
import { isWorkspaceTab } from "./workspace-data";
import type { MockSeedRow, SeedProbe } from "./mock-data";

export function DeepWorkspace({
  projectName,
  storeLabel,
  tab,
  opened,
  onTab,
  brief,
  seeds,
  probes,
  keywords,
  extracting,
  extractProgress,
  seedProgress,
  onAnalyze,
  analyzeLoading,
  analyzeProgress,
  productEmbedProgress,
  analyzed,
  onNextCollections,
  onCancelExtract,
  keywordsCsvHref,
  appliedSheetFilters,
  onApplySheetFilters,
  collections,
  products,
  workspaceId,
  projectId,
  clustering,
  clusterProgress,
  termEmbedProgress,
  selectedCollectionIds,
  onChangeSelected,
  paidCollectionIds,
  onStartWorking,
  onPushToStore,
  onRemoveDuplicates,
  onRecheckDuplicates,
  recheckingDuplicates = false,
  pushingCollections = false,
  instructions,
  onInstruction,
  contentById,
  generating,
  contentGenProgress,
  contentReady,
  syncingSeo = false,
  seoSynced = false,
  onStartContent,
  onPush,
  onSyncSeo,
  storeUrl = "",
  storeProvider = null,
  readOnly = false,
}: {
  projectName: string;
  storeLabel: string;
  tab: FlowTab;
  opened: WorkspaceTab;
  onTab: (tab: FlowTab) => void;
  brief?: ReactNode;
  seeds: MockSeedRow[];
  probes: Record<string, SeedProbe>;
  keywords: ExtractedKeyword[];
  extracting: boolean;
  extractProgress: number;
  seedProgress: SeedExtractProgress[];
  onAnalyze: () => void;
  analyzeLoading: boolean;
  /** Live progress across the chunked classification requests (Layer 1). */
  analyzeProgress?: { done: number; total: number; phase?: "classify" | "same-intent" } | null;
  /** Product embedding pass, driven in parallel with the Apify extract poll above. */
  productEmbedProgress?: { embedded: number; total: number; done: boolean } | null;
  analyzed: boolean;
  onNextCollections: (filteredCategoryKeywords?: ExtractedKeyword[]) => void;
  onCancelExtract?: () => void;
  keywordsCsvHref?: string;
  appliedSheetFilters?: SheetKeywordFilters;
  onApplySheetFilters?: (
    sheet: "category" | "informational",
    filters: KeywordFilters
  ) => void;
  collections: ProposedCollection[];
  products?: MarketResearchProduct[];
  workspaceId?: string;
  projectId?: string;
  clustering: boolean;
  /** Live progress across the Stage 5 cluster cursor job's offset pages. */
  clusterProgress?: { processed: number; total: number } | null;
  /** Category-term embedding pass that runs before the cluster job starts. */
  termEmbedProgress?: { embedded: number; total: number; done: boolean } | null;
  selectedCollectionIds: string[];
  onChangeSelected: (ids: string[]) => void;
  /** Collection ids already successfully pushed to the store in this project. */
  paidCollectionIds: string[];
  onStartWorking: () => void;
  onPushToStore?: (selectedIds: string[]) => Promise<void> | void;
  onRemoveDuplicates?: (ids: string[]) => void;
  onRecheckDuplicates?: () => void;
  recheckingDuplicates?: boolean;
  pushingCollections?: boolean;
  instructions: OnPageInstructions;
  onInstruction: (field: OnPageInstructionField, value: string) => void;
  contentById: Record<string, CollectionContent>;
  generating: boolean;
  /** Live progress across the Stage 6 on-page copywriting cursor job's pages. */
  contentGenProgress?: { processed: number; total: number } | null;
  contentReady: boolean;
  syncingSeo?: boolean;
  seoSynced?: boolean;
  onStartContent: (ids: string[]) => void;
  onPush: () => void;
  onSyncSeo?: () => void;
  storeUrl?: string;
  /** Connected store's provider id, used to build the correct live
   *  collection URL pattern (Shopify vs WooCommerce/WordPress paths). */
  storeProvider?: string | null;
  readOnly?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 shrink-0">
        <div className="min-w-0 shrink-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {storeLabel}
          </p>
          <p className="text-sm font-semibold tracking-tight truncate">
            {projectName}
          </p>
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <WorkspaceStepper current={tab} opened={opened} onChange={onTab} />
        </div>
      </header>

      <div
        className={cn(
          "flex-1 min-h-0 p-4 sm:p-5",
          tab === "collections" || tab === "extract"
            ? "flex flex-col overflow-hidden"
            : "overflow-auto"
        )}
      >
        <div
          className={cn(
            readOnly && "pointer-events-none",
            (tab === "collections" || tab === "extract") &&
              "flex min-h-0 flex-1 flex-col overflow-hidden"
          )}
        >
        {!isWorkspaceTab(tab) ? brief : null}
        {tab === "extract" ? (
          <StageExtractPanel
            seeds={seeds}
            probes={probes}
            keywords={keywords}
            extracting={extracting}
            progress={extractProgress}
            seedProgress={seedProgress}
            onAnalyze={onAnalyze}
            analyzeLoading={analyzeLoading}
            analyzeProgress={analyzeProgress}
            productEmbedProgress={productEmbedProgress}
            analyzed={analyzed}
            onNextCollections={onNextCollections}
            clustering={clustering}
            onCancelExtract={onCancelExtract}
            csvHref={keywordsCsvHref}
            appliedSheetFilters={appliedSheetFilters}
            onApplySheetFilters={onApplySheetFilters}
          />
        ) : null}
        {tab === "collections" ? (
          <StageCollectionSheet
            collections={collections}
            products={products}
            workspaceId={workspaceId}
            projectId={projectId}
            loading={clustering}
            loadingProgress={clusterProgress}
            termEmbedProgress={termEmbedProgress}
            selectedIds={selectedCollectionIds}
            onChangeSelected={onChangeSelected}
            paidCollectionIds={paidCollectionIds}
            onStart={onStartWorking}
            onPushToStore={onPushToStore}
            onRemoveDuplicates={onRemoveDuplicates}
            onRecheckDuplicates={onRecheckDuplicates}
            recheckingDuplicates={recheckingDuplicates}
            pushing={pushingCollections}
          />
        ) : null}
        {tab === "content" ? (
          <StageContentPanel
            // Stage 6 must show every collection that's actually live on the
            // store, not whatever is still checked in Stage 5's sheet —
            // handlePushToStore clears successfully-pushed ids out of that
            // selection (so the sheet doesn't show pushed collections as
            // "still selected to push"), which previously emptied this tab
            // the instant a push succeeded.
            collections={collections.filter((c) =>
              paidCollectionIds.includes(c.id)
            )}
            contentById={contentById}
            storeUrl={storeUrl}
            storeProvider={storeProvider}
            instructions={instructions}
            onInstruction={onInstruction}
            generating={generating}
            contentGenProgress={contentGenProgress}
            ready={contentReady}
            syncingSeo={syncingSeo}
            seoSynced={seoSynced}
            onStart={onStartContent}
            onPush={onPush}
            onSyncSeo={onSyncSeo}
          />
        ) : null}
        </div>
      </div>
    </div>
  );
}
