"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  Eye,
  ExternalLink,
  Loader2,
  MapPinned,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { stripTags } from "@/lib/market-research/plain-text";
import { TableSelectHeader } from "@/components/table-select-header";
import { WorksheetPaginationBar } from "@/components/worksheet-pagination-bar";
import {
  WORKSHEET_PAGE_SIZE,
  pageSelectionState,
  removeSelectedIds,
  unionSelectedIds,
} from "@/lib/market-research/collection-sheet";
import { buildCollectionsSitemapXml } from "@/lib/market-research/sitemap";
import { buildStoreLinks } from "@/lib/market-research/store-links";
import {
  type CollectionContent,
  type OnPageInstructionField,
  type OnPageInstructions,
  type ProposedCollection,
} from "./workspace-data";

type FullTextField = "seoTitle" | "seoDescription" | "collectionDescription";

const FULL_TEXT_FIELD_LABEL: Record<FullTextField, string> = {
  seoTitle: "SEO title",
  seoDescription: "SEO description",
  collectionDescription: "Collection description",
};

const FIELD_META: {
  id: OnPageInstructionField;
  label: string;
  hint: string;
  placeholder: string;
}[] = [
  {
    id: "seoTitle",
    label: "SEO title",
    hint: "How the title tag should be written for every collection.",
    placeholder: "e.g. Include the brand, keep under 60 characters…",
  },
  {
    id: "seoDescription",
    label: "SEO description",
    hint: "How the meta description should sound.",
    placeholder: "e.g. Mention shipping, avoid hype, include a CTA…",
  },
  {
    id: "collectionDescription",
    label: "Collection description",
    hint: "How the on-page description should be written.",
    placeholder: "e.g. Conversational, 80–120 words, no medical claims…",
  },
];

export function StageContentPanel({
  collections,
  contentById,
  instructions,
  onInstruction,
  generating,
  contentGenProgress,
  ready,
  syncingSeo = false,
  seoSynced = false,
  onStart,
  onPush,
  onSyncSeo,
  storeUrl,
  storeProvider,
}: {
  collections: ProposedCollection[];
  contentById: Record<string, CollectionContent>;
  instructions: OnPageInstructions;
  onInstruction: (field: OnPageInstructionField, value: string) => void;
  generating: boolean;
  /** Live progress across the Stage 6 on-page copywriting cursor job's pages. */
  contentGenProgress?: { processed: number; total: number } | null;
  ready: boolean;
  syncingSeo?: boolean;
  seoSynced?: boolean;
  onStart: (ids: string[]) => void;
  onPush?: () => void;
  onSyncSeo?: () => void;
  /** Storefront origin, used to build each collection's live URL and the
   *  sitemap export. */
  storeUrl?: string;
  /** Connected store's provider id, used to pick the right URL pattern
   *  (Shopify's "/collections/{handle}" vs WooCommerce's
   *  "/product-category/{handle}"). Defaults to Shopify's convention. */
  storeProvider?: string | null;
}) {
  const [openField, setOpenField] = useState<OnPageInstructionField | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    collections.map((c) => c.id)
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(WORKSHEET_PAGE_SIZE);

  // Hover-eye "view full text" modal for SEO title / description / collection description
  const [activeTextCell, setActiveTextCell] = useState<{
    colId: string;
    field: FullTextField;
  } | null>(null);
  const [sitemapDialogOpen, setSitemapDialogOpen] = useState(false);
  const [sitemapUrlCopied, setSitemapUrlCopied] = useState(false);

  const fieldMeta = FIELD_META.find((f) => f.id === openField);
  const locked = generating || ready;
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const idsKey = collections.map((c) => c.id).join(",");
  const prevIdsKey = useRef(idsKey);

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    const previous = new Set(prevIdsKey.current ? prevIdsKey.current.split(",") : []);
    prevIdsKey.current = idsKey;
    setSelectedIds((prev) => {
      if (ids.length === 0) return [];
      if (prev.length === 0 && previous.size === 0) return ids;
      const allowed = new Set(ids);
      const kept = prev.filter((id) => allowed.has(id));
      const added = ids.filter((id) => !previous.has(id));
      return unionSelectedIds(kept, added);
    });
    setPageIndex(0);
  }, [idsKey]);

  useEffect(() => {
    setPageIndex(0);
  }, [pageSize]);

  const pageCount = Math.max(1, Math.ceil(collections.length / pageSize) || 1);
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pagedCollections = collections.slice(
    safePageIndex * pageSize,
    (safePageIndex + 1) * pageSize
  );
  const pagedIds = pagedCollections.map((c) => c.id);
  const { allSelected: pageAllSelected, someSelected: pageSomeSelected } =
    pageSelectionState(pagedIds, selected);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const selectThisPage = () => setSelectedIds((prev) => unionSelectedIds(prev, pagedIds));
  const selectAllOnSheet = () => setSelectedIds(collections.map((c) => c.id));
  const unselectAll = () => setSelectedIds([]);
  const togglePageSelection = () => {
    if (pageAllSelected) setSelectedIds((prev) => removeSelectedIds(prev, pagedIds));
    else selectThisPage();
  };

  const activeTextCol = activeTextCell
    ? collections.find((c) => c.id === activeTextCell.colId)
    : null;
  const activeTextValue =
    activeTextCell && contentById[activeTextCell.colId]
      ? contentById[activeTextCell.colId][activeTextCell.field]
      : "";

  // Real, absolute storefront links — built once from the connected store's
  // provider + origin, then filled in per row with that row's own handle.
  // Same pattern helper the taxonomy export already trusts, so Shopify's
  // "/collections/{handle}" and WooCommerce/WordPress's
  // "/product-category/{handle}" are never guessed here.
  const storeLinks = useMemo(
    () => (storeUrl ? buildStoreLinks(storeProvider || "shopify", storeUrl) : null),
    [storeUrl, storeProvider]
  );
  const liveUrlFor = (row: ProposedCollection): string | null => {
    if (!storeLinks || !row.storeHandle) return null;
    return storeLinks.collectionUrlPattern.replace("{handle}", row.storeHandle);
  };
  const liveCollectionUrls = collections
    .map((c) => liveUrlFor(c))
    .filter((url): url is string => Boolean(url));
  const sitemapExampleOrigin = storeLinks?.baseUrl || "https://yourstore.com";
  const sitemapExampleUrl = `${sitemapExampleOrigin}/collections-sitemap.xml`;

  const handleDownloadSitemap = () => {
    const xml = buildCollectionsSitemapXml(liveCollectionUrls);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "collections-sitemap.xml";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(
      `Sitemap downloaded — ${liveCollectionUrls.length} collection${
        liveCollectionUrls.length === 1 ? "" : "s"
      }`
    );
  };

  const handleCopySitemapUrl = async () => {
    try {
      await navigator.clipboard.writeText(sitemapExampleUrl);
      setSitemapUrlCopied(true);
      window.setTimeout(() => setSitemapUrlCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — select and copy the URL manually.");
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-3">
      <div className="shrink-0 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold tracking-tight">On-page Copywriting</h2>
            <p className="text-[11px] text-muted-foreground">
              Click the sparkle on any column to customize AI generation rules before starting.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {ready ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  disabled={liveCollectionUrls.length === 0}
                  title={
                    liveCollectionUrls.length === 0
                      ? "No published collection URLs yet"
                      : undefined
                  }
                  onClick={() => setSitemapDialogOpen(true)}
                >
                  <MapPinned className="h-3.5 w-3.5" />
                  Sitemap
                </Button>
                <Button
                  size="sm"
                  variant={seoSynced ? "outline" : "default"}
                  className={cn(
                    "h-8 text-xs gap-1.5 font-medium transition-all",
                    seoSynced &&
                      "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10"
                  )}
                  disabled={syncingSeo || seoSynced}
                  onClick={onSyncSeo ?? onPush}
                >
                  {syncingSeo ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Syncing SEO…</span>
                    </>
                  ) : seoSynced ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Synced to Store</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-3.5 w-3.5" />
                      <span>Sync SEO to Store</span>
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  disabled={generating || selected.size === 0}
                  onClick={() => onStart(selectedIds)}
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {generating
                    ? contentGenProgress
                      ? `Writing Copy… ${contentGenProgress.processed.toLocaleString()}/${contentGenProgress.total.toLocaleString()}`
                      : "Writing Copy…"
                    : "Start"}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={generating || selected.size === 0}
                onClick={() => onStart(selectedIds)}
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {generating
                  ? contentGenProgress
                    ? `Writing Copy… ${contentGenProgress.processed.toLocaleString()}/${contentGenProgress.total.toLocaleString()}`
                    : "Writing Copy…"
                  : "Start"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70">
        <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14 px-2">
                <div className={cn(generating && "pointer-events-none opacity-75")}>
                  <TableSelectHeader
                    allSelected={pageAllSelected}
                    someSelected={pageSomeSelected}
                    pageCount={pagedCollections.length}
                    totalCount={collections.length}
                    onTogglePage={togglePageSelection}
                    onSelectPage={selectThisPage}
                    onSelectAll={selectAllOnSheet}
                    onClear={unselectAll}
                  />
                </div>
              </TableHead>
              <TableHead className="text-xs min-w-[160px]">Collection</TableHead>
              {FIELD_META.map((field) => {
                const filled = Boolean(instructions[field.id].trim());
                return (
                  <TableHead key={field.id} className="text-xs min-w-[200px]">
                    <button
                      type="button"
                      onClick={() => setOpenField(field.id)}
                      title={
                        filled
                          ? "Edit custom instruction"
                          : "Add custom instruction"
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-1 py-0.5 -ml-1 text-left transition-colors hover:bg-muted/70",
                        filled && "text-primary font-medium"
                      )}
                    >
                      <span>{field.label}</span>
                      <Sparkles
                        className={cn(
                          "h-3 w-3 shrink-0",
                          filled
                            ? "text-primary fill-primary/20"
                            : "text-muted-foreground/60"
                        )}
                      />
                    </button>
                  </TableHead>
                );
              })}
              <TableHead className="text-xs min-w-[120px]">Store</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedCollections.map((row) => {
              const content = contentById[row.id];
              const filled = Boolean(content) && (ready || generating);
              const rowGenerating = generating && selected.has(row.id) && !content;
              const on = selected.has(row.id);
              const liveUrl = liveUrlFor(row);
              return (
                <TableRow key={row.id} className={cn(on && "bg-primary/5")}>
                  <TableCell className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => toggleSelect(row.id)}
                      disabled={generating}
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                        generating ? "cursor-not-allowed opacity-75" : "",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:border-primary/60"
                      )}
                      aria-label={`Select ${row.name}`}
                    >
                      {on ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm font-medium whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-left text-foreground flex items-center gap-1.5">
                        <span>{row.name}</span>
                        {content?.ungenerated ? (
                          <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                            Not generated
                          </span>
                        ) : null}
                      </span>
                      {liveUrl ? (
                        <a
                          href={liveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title={`Open ${liveUrl} in a new tab`}
                          className="text-muted-foreground/60 hover:text-primary transition-colors shrink-0"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </TableCell>
                  <ContentCell
                    ready={filled}
                    generating={rowGenerating}
                    text={content?.seoTitle}
                    onView={() =>
                      setActiveTextCell({ colId: row.id, field: "seoTitle" })
                    }
                  />
                  <ContentCell
                    ready={filled}
                    generating={rowGenerating}
                    text={content?.seoDescription}
                    onView={() =>
                      setActiveTextCell({ colId: row.id, field: "seoDescription" })
                    }
                  />
                  <ContentCell
                    ready={filled}
                    generating={rowGenerating}
                    text={content?.collectionDescription}
                    onView={() =>
                      setActiveTextCell({
                        colId: row.id,
                        field: "collectionDescription",
                      })
                    }
                  />
                  <TableCell className="whitespace-nowrap text-[11px]">
                    <SyncStatusCell
                      content={content}
                      syncing={syncingSeo}
                      generating={rowGenerating}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
        <WorksheetPaginationBar
          pageIndex={safePageIndex}
          pageSize={pageSize}
          totalRows={collections.length}
          readyCount={0}
          colCount={6}
          itemLabel="collections"
          onPageChange={setPageIndex}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPageIndex(0);
          }}
        />
      </div>

      {ready ? (
        <div className="flex items-center justify-between gap-2 shrink-0">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {seoSynced ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <Check className="h-3.5 w-3.5" />
                SEO copy and descriptions synced directly to your live store collections.
              </span>
            ) : (
              <span>
                Use &ldquo;Sync SEO to Store&rdquo; to update collection descriptions &amp; meta tags on your live storefront.
              </span>
            )}
          </p>
        </div>
      ) : null}

      {/* Custom Instruction Dialog */}
      <Dialog
        open={Boolean(openField)}
        onOpenChange={(open) => !open && setOpenField(null)}
      >
        <DialogContent className="sm:max-w-md">
          {fieldMeta ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  Custom instruction · {fieldMeta.label}
                </DialogTitle>
                <DialogDescription>{fieldMeta.hint}</DialogDescription>
              </DialogHeader>
              <textarea
                value={instructions[fieldMeta.id]}
                onChange={(e) => onInstruction(fieldMeta.id, e.target.value)}
                placeholder={fieldMeta.placeholder}
                disabled={locked}
                rows={5}
                className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-none rounded-md border bg-transparent px-3 py-2 text-xs shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
              />
              <DialogFooter>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setOpenField(null)}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Full Text View Modal — hover-eye on SEO title / SEO description / collection description cells */}
      <Dialog
        open={Boolean(activeTextCell)}
        onOpenChange={(open) => !open && setActiveTextCell(null)}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              <span>
                {activeTextCell ? FULL_TEXT_FIELD_LABEL[activeTextCell.field] : ""} ·{" "}
                {activeTextCol?.name}
              </span>
            </DialogTitle>
            <DialogDescription>Full generated text for this field.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {activeTextValue ? (
              <p className="text-sm leading-relaxed text-foreground">
                {stripTags(activeTextValue)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Nothing generated yet.</p>
            )}
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => setActiveTextCell(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sitemap Export Modal */}
      <Dialog
        open={sitemapDialogOpen}
        onOpenChange={(open) => {
          setSitemapDialogOpen(open);
          if (!open) setSitemapUrlCopied(false);
        }}
      >
        <DialogContent className="overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <MapPinned className="h-4 w-4 text-primary" />
              <span>Download XML sitemap</span>
            </DialogTitle>
            <DialogDescription>
              A standards-compliant sitemap (sitemaps.org format) listing the{" "}
              {liveCollectionUrls.length} published collection page
              {liveCollectionUrls.length === 1 ? "" : "s"} shown in this tab —
              ready for Google Search Console.
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 space-y-3 overflow-hidden py-1">
            <ol className="space-y-2.5 text-xs text-muted-foreground">
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  1
                </span>
                <span className="pt-0.5">
                  Click <span className="font-medium text-foreground">Download sitemap</span> below to save{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">collections-sitemap.xml</code>.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  2
                </span>
                <span className="pt-0.5">
                  Upload that file to the root folder of your website (via your
                  host&rsquo;s file manager, FTP, or your theme&rsquo;s file
                  editor) — the same level your homepage lives at — so it
                  becomes reachable at a URL like:
                </span>
              </li>
            </ol>
            <div className="flex min-w-0 items-center gap-1.5 overflow-hidden rounded-lg border border-border/70 bg-muted/40 px-2.5 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                {sitemapExampleUrl}
              </code>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 shrink-0 px-1.5"
                onClick={handleCopySitemapUrl}
                title="Copy URL"
              >
                {sitemapUrlCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <ol start={3} className="space-y-2.5 text-xs text-muted-foreground">
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  3
                </span>
                <span className="pt-0.5">
                  In{" "}
                  <a
                    href="https://search.google.com/search-console/sitemaps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    Google Search Console
                  </a>{" "}
                  → your property → <span className="font-medium text-foreground">Sitemaps</span> → paste that
                  same URL and click <span className="font-medium text-foreground">Submit</span>.
                </span>
              </li>
            </ol>
            <p className="text-[11px] text-muted-foreground/80">
              Only <code className="font-mono">&lt;loc&gt;</code> and{" "}
              <code className="font-mono">&lt;lastmod&gt;</code> are included —
              Google&rsquo;s own documentation says it ignores{" "}
              <code className="font-mono">changefreq</code> and{" "}
              <code className="font-mono">priority</code>, so this stays lean
              on purpose.
            </p>
          </div>
          <DialogFooter className="flex-wrap gap-2 sm:gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => setSitemapDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={liveCollectionUrls.length === 0}
              onClick={handleDownloadSitemap}
            >
              <Download className="h-3.5 w-3.5" />
              Download sitemap
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContentCell({
  ready,
  generating,
  text,
  onView,
}: {
  ready: boolean;
  generating: boolean;
  text?: string;
  /** Opens the full-text dialog for this cell's field. */
  onView?: () => void;
}) {
  if (generating) {
    return (
      <TableCell>
        <Pulse />
      </TableCell>
    );
  }
  if (!ready || !text) {
    return (
      <TableCell className="text-[11px] text-muted-foreground">—</TableCell>
    );
  }
  return (
    <TableCell className="max-w-[220px] text-[11px] text-muted-foreground">
      <button
        type="button"
        onClick={onView}
        className="group flex w-full items-start gap-1.5 text-left"
      >
        <span className="line-clamp-2 flex-1">{stripTags(text)}</span>
        <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
      </button>
    </TableCell>
  );
}

function Pulse() {
  return <div className="h-3 w-28 animate-pulse rounded bg-muted" />;
}

/** Whether this row's copy is live on the store, per row rather than per batch. */
function SyncStatusCell({
  content,
  syncing,
  generating,
}: {
  content?: CollectionContent;
  syncing: boolean;
  generating: boolean;
}) {
  if (!content) {
    return generating ? (
      <Pulse />
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }

  if (content.seoSyncError) {
    return (
      <span
        className="flex items-center gap-1 font-medium text-destructive"
        title={content.seoSyncError}
      >
        <AlertCircle className="h-3.5 w-3.5" />
        Failed
      </span>
    );
  }

  if (content.seoSyncedAt) {
    return (
      <span
        className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400"
        title={`Synced ${new Date(content.seoSyncedAt).toLocaleString()}`}
      >
        <Check className="h-3.5 w-3.5" />
        Synced
      </span>
    );
  }

  if (syncing) {
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Syncing
      </span>
    );
  }

  return <span className="text-muted-foreground">Not synced</span>;
}
