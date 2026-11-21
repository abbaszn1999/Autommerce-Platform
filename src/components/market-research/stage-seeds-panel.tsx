"use client";

import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MARKETS,
  STAGE3_EXCLUDED_EXAMPLES,
  estimateSelection,
  formatProductCount,
  formatRawKeywords,
  groupSeedRowsByCanonical,
  isProbeStale,
  marketLabel,
  seedRowsToCsv,
  type MockSeedRow,
  type ScopeMatch,
  type SeedProbe,
} from "./mock-data";
import {
  cappedKeywordEstimate,
  EXTRACT_CAP_PER_SEED,
  RAW_KEYWORD_SELECTION_CAP,
} from "@/lib/market-research/cost";
import { cn } from "@/lib/utils";

function scopeMatchClass(match: ScopeMatch): string {
  switch (match) {
    case "Exact":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    case "Close":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30";
    case "Broader":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
    case "Ambiguous":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "";
  }
}

/** Capped raw keywords a probed seed would actually extract. Unprobed is unknown. */
function cappedRawKeywords(
  rowId: string,
  probes: Record<string, SeedProbe>
): number | null {
  const probe = probes[rowId];
  if (!probe || probe.failed) return null;
  return cappedKeywordEstimate(probe.rawKeywords);
}

function cappedTotal(
  ids: Iterable<string>,
  probes: Record<string, SeedProbe>
): number {
  let total = 0;
  for (const id of ids) {
    const counted = cappedRawKeywords(id, probes);
    if (counted != null) total += counted;
  }
  return total;
}

/** Unselected ids that still fit under the raw-keyword ceiling, in given order. */
function idsThatFit(
  candidates: { id: string }[],
  already: Set<string>,
  probes: Record<string, SeedProbe>
): string[] {
  let running = cappedTotal(already, probes);
  const added: string[] = [];
  if (running >= RAW_KEYWORD_SELECTION_CAP) return added;
  for (const row of candidates) {
    if (already.has(row.id)) continue;
    const counted = cappedRawKeywords(row.id, probes) ?? 0;
    if (running + counted > RAW_KEYWORD_SELECTION_CAP) continue;
    added.push(row.id);
    running += counted;
  }
  return added;
}

type StageSeedsPanelProps = {
  rows: MockSeedRow[];
  preparing?: boolean;
  stale?: boolean;
  onRegenerate?: () => void;
  selectedIds: string[];
  onChangeSelected: (ids: string[]) => void;
  /** Stage 3b demand probe. */
  market: string;
  onChangeMarket: (market: string) => void;
  probes: Record<string, SeedProbe>;
  probingIds: string[];
  onProbe: (rowIds: string[]) => void;
  /** `collectionId` identifies the exact PLP family to attach the term to
   * — never the canonical NAME alone, since two different PLPs can share
   * the same canonical seed name. */
  onAddManualSeed: (term: string, collectionId: string) => void;
  onConfirmSpend: (filters?: {
    minVolume?: number;
    maxDifficulty?: number;
  }) => void;
  committed?: boolean;
  readOnly?: boolean;
  /**
   * Real fetched product counts per collectionId, from the paginated
   * catalog fetch (Tab 2 -> 3). Falls back to the row's own `productCount`
   * (the catalog's advertised number) when a fetch hasn't landed yet, so
   * the column never briefly shows a blank/zero.
   */
  productCountByCollectionId?: Record<string, number>;
  /** Live progress of the paginated product fetch driving alongside seed generation. */
  productFetchProgress?: { fetched: number; done: boolean } | null;
};

/** Stage 3 — broad seed variations plus the demand decision surface. */
export function StageSeedsPanel({
  rows,
  preparing = false,
  stale = false,
  onRegenerate,
  selectedIds,
  onChangeSelected,
  market,
  onChangeMarket,
  probes,
  probingIds,
  onProbe,
  onAddManualSeed,
  onConfirmSpend,
  committed = false,
  readOnly = false,
  productCountByCollectionId = {},
  productFetchProgress = null,
}: StageSeedsPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [manualTerm, setManualTerm] = useState("");
  const [manualFamily, setManualFamily] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [minVolumeInput, setMinVolumeInput] = useState("1");

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const probing = useMemo(() => new Set(probingIds), [probingIds]);

  const groups = useMemo(() => groupSeedRowsByCanonical(rows), [rows]);
  const selectedCapped = useMemo(
    () => cappedTotal(selected, probes),
    [selected, probes]
  );
  const overSelectionCap = selectedCapped > RAW_KEYWORD_SELECTION_CAP;
  const atSelectionCap = selectedCapped >= RAW_KEYWORD_SELECTION_CAP;

  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.id)),
    [rows, selected]
  );
  const estimate = useMemo(
    () => estimateSelection(selectedRows, probes),
    [selectedRows, probes]
  );

  const allRowsSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.id));

  const targetSeedsToProbe = useMemo(
    () =>
      selectedRows.filter(
        (row) => (!probes[row.id] || probes[row.id].failed) && !probing.has(row.id)
      ),
    [selectedRows, probes, probing]
  );
  const failedSelected = useMemo(
    () => selectedRows.filter((row) => probes[row.id]?.failed && !probing.has(row.id)),
    [selectedRows, probes, probing]
  );
  const unprobedSelected = useMemo(
    () => selectedRows.filter((row) => !probes[row.id] && !probing.has(row.id)),
    [selectedRows, probes, probing]
  );
  const staleSelected = selectedRows.filter(
    (row) => probes[row.id] && !probes[row.id].failed && isProbeStale(probes[row.id], market)
  );

  const handleCheckDemand = (rowIds: string[]) => {
    if (readOnly || rowIds.length === 0) return;
    onProbe(rowIds);
  };

  if (preparing) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-4 py-10">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight">
              Generating broad seed variations
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The agent is building one seed family per selected collection —
              canonical terms plus broad wording only. Follow the chat on the
              left.
            </p>
            {productFetchProgress && !productFetchProgress.done ? (
              <p className="text-[11px] tabular-nums text-muted-foreground">
                Fetching catalog products… {productFetchProgress.fetched.toLocaleString("en-US")} so far
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const toggleRow = (id: string) => {
    if (readOnly) return;
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
      onChangeSelected(Array.from(next));
      return;
    }
    if (idsThatFit([{ id }], next, probes).length === 0) return;
    next.add(id);
    onChangeSelected(Array.from(next));
  };

  const toggleAllVisible = () => {
    if (readOnly) return;
    if (allRowsSelected) {
      onChangeSelected([]);
      return;
    }
    const fit = idsThatFit(rows, selected, probes);
    if (fit.length === 0) return;
    onChangeSelected([...selectedIds, ...fit]);
  };

  const toggleGroup = (groupRows: MockSeedRow[]) => {
    if (readOnly) return;
    const next = new Set(selected);
    const allOn = groupRows.every((r) => next.has(r.id));
    if (allOn) {
      groupRows.forEach((r) => next.delete(r.id));
      onChangeSelected(Array.from(next));
      return;
    }
    const fit = idsThatFit(groupRows, next, probes);
    if (fit.length === 0) return;
    for (const id of fit) next.add(id);
    onChangeSelected(Array.from(next));
  };

  const copySelected = async () => {
    const target = selectedRows.length > 0 ? selectedRows : rows;
    try {
      await navigator.clipboard.writeText(seedRowsToCsv(target));
      toast.success("Copied as CSV", {
        description: `${target.length} rows on your clipboard.`,
      });
    } catch {
      toast.error("Couldn’t copy", {
        description: "Clipboard access was blocked by the browser.",
      });
    }
  };

  const submitManualSeed = () => {
    const term = manualTerm.trim();
    // Keyed by collectionId, not the canonical NAME — two different PLPs
    // can legitimately share the same canonical seed name (e.g. two
    // collections that both distill to "Smartphones"), so the name alone
    // can't reliably identify which family to attach the term to.
    const collectionId = manualFamily || groups[0]?.collectionId;
    if (!term || !collectionId) return;
    onAddManualSeed(term, collectionId);
    setManualTerm("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="space-y-2 shrink-0">
        {stale && onRegenerate && !readOnly ? (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
              Catalog scope changed in Stage 2. These rows are from the previous
              scope until you regenerate.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 shrink-0"
              onClick={onRegenerate}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </Button>
          </div>
        ) : null}

        {/* Demand probe gate — market first, because volume is per market. */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2.5">
          <label className="text-[11px] font-medium text-muted-foreground">
            Market
          </label>
          {readOnly ? (
            <span className="text-xs">
              {MARKETS.find((option) => option.code === market)?.label ?? market}
            </span>
          ) : (
          <select
            value={market}
            onChange={(e) => onChangeMarket(e.target.value)}
            className="h-8 rounded-lg border border-border/70 bg-background px-2 text-xs outline-none focus:border-foreground/30"
            aria-label="Target country and language"
          >
            {MARKETS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
          )}
          {readOnly ? (
            <p className="ml-auto text-[11px] text-muted-foreground">
              View only — demand checks are closed.
            </p>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              {staleSelected.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  onClick={() => handleCheckDemand(staleSelected.map((r) => r.id))}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Re-check {staleSelected.length} stale
                </Button>
              ) : null}

              {failedSelected.length > 0 && unprobedSelected.length === 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                  disabled={probing.size > 0}
                  onClick={() => handleCheckDemand(failedSelected.map((r) => r.id))}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry {failedSelected.length} failed
                </Button>
              ) : null}

              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 text-xs bg-[#400095] hover:bg-[#6B358D] text-white dark:bg-[#F76D01] dark:hover:bg-[#F76D01]/90"
                disabled={targetSeedsToProbe.length === 0 || probing.size > 0}
                onClick={() => handleCheckDemand(targetSeedsToProbe.map((r) => r.id))}
              >
                {probing.size > 0 ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                Check demand
                {targetSeedsToProbe.length > 0 ? ` (${targetSeedsToProbe.length})` : ""}
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[11px] font-medium tabular-nums",
              overSelectionCap
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : atSelectionCap
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                  : "border-border/70 text-muted-foreground"
            )}
          >
            {selectedCapped.toLocaleString("en-US")} /{" "}
            {RAW_KEYWORD_SELECTION_CAP.toLocaleString("en-US")} raw keywords
            {overSelectionCap
              ? " — over the maximum. Deselect seeds before extracting."
              : atSelectionCap
                ? " — maximum reached, more seeds can’t be checked."
                : ""}
          </span>

          <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
            {rows.length} broad terms · {groups.length} canonical
          </span>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="What the agent leaves out of this stage"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px]">
                <p className="font-medium">Left out on purpose</p>
                <ul className="mt-1 space-y-0.5">
                  {STAGE3_EXCLUDED_EXAMPLES.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {readOnly ? null : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={copySelected}
            disabled={rows.length === 0}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy CSV
          </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto custom-scrollbar overscroll-contain rounded-xl border border-border/70 bg-card">
          <table className="w-full min-w-[880px] caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-10 bg-card shadow-xs">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 shrink-0">
                  <SelectBox
                    state={
                      allRowsSelected
                        ? "all"
                        : rows.some((r) => selected.has(r.id))
                          ? "some"
                          : "none"
                    }
                    onClick={
                      readOnly ||
                      (!allRowsSelected &&
                        idsThatFit(rows, selected, probes).length === 0)
                        ? undefined
                        : toggleAllVisible
                    }
                    disabledReason={
                      !readOnly &&
                      !allRowsSelected &&
                      idsThatFit(rows, selected, probes).length === 0
                        ? "Maximum is 100,000 raw keywords"
                        : undefined
                    }
                    label="Select seeds up to 100,000 raw keywords"
                  />
                </TableHead>
                <TableHead className="min-w-[160px] text-xs font-semibold whitespace-nowrap">
                  Broad seed
                </TableHead>
                <TableHead className="min-w-[130px] text-xs font-semibold whitespace-nowrap">
                  Canonical
                </TableHead>
                <TableHead className="min-w-[160px] text-xs font-semibold whitespace-nowrap">
                  Collection
                </TableHead>
                <TableHead className="text-xs whitespace-nowrap text-right">
                  Products
                </TableHead>
                <TableHead className="min-w-[80px] text-xs font-semibold whitespace-nowrap">
                  Scope
                </TableHead>
                <TableHead className="min-w-[100px] text-xs font-semibold whitespace-nowrap text-right">
                  Raw keywords
                </TableHead>
                <TableHead className="min-w-[80px] text-xs font-semibold whitespace-nowrap text-right">
                  Volume
                </TableHead>
                <TableHead className="min-w-[80px] text-xs font-semibold whitespace-nowrap text-right">
                  Share
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-xs text-muted-foreground py-8"
                  >
                    No seed rows for the current selection.
                  </TableCell>
                </TableRow>
              ) : (
                groups.map((group) => {
                  const groupOn = group.rows.every((r) => selected.has(r.id));
                  const groupSome = group.rows.some((r) => selected.has(r.id));
                  const groupFit = idsThatFit(group.rows, selected, probes);
                  const groupBlocked = !readOnly && !groupOn && groupFit.length === 0;
                  const groupProbes = group.rows
                    .map((r) => probes[r.id])
                    .filter((p): p is SeedProbe => Boolean(p) && !p.failed);
                  const groupCapped = groupProbes.reduce(
                    (sum, probe) => sum + cappedKeywordEstimate(probe.rawKeywords),
                    0
                  );
                  const groupVolume = groupProbes.reduce(
                    (sum, probe) => sum + probe.searchVolume,
                    0
                  );
                  return (
                    <Fragment
                      key={`${group.collectionId}-${group.canonicalNicheSeed}`}
                    >
                      <TableRow className="bg-primary/10 hover:bg-primary/10">
                        <TableCell className="w-10 shrink-0">
                          <SelectBox
                            state={groupOn ? "all" : groupSome ? "some" : "none"}
                            onClick={
                              readOnly || groupBlocked
                                ? undefined
                                : () => toggleGroup(group.rows)
                            }
                            disabledReason={
                              groupBlocked
                                ? "Maximum is 100,000 raw keywords"
                                : undefined
                            }
                            label={`Select ${group.canonicalNicheSeed}`}
                          />
                        </TableCell>
                        <TableCell colSpan={3} className="py-2.5">
                          <p className="text-sm font-semibold tracking-tight">
                            {group.canonicalNicheSeed}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {group.selectedCollection} · {group.broadParentNiche} ·{" "}
                            {formatProductCount(
                              productCountByCollectionId[group.collectionId] ??
                                group.productCount
                            )}{" "}
                            products · {group.rows.length} broad term
                            {group.rows.length === 1 ? "" : "s"}
                          </p>
                        </TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell className="text-xs tabular-nums text-right font-medium whitespace-nowrap">
                          {groupProbes.length > 0
                            ? groupCapped.toLocaleString("en-US")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-right whitespace-nowrap">
                          {groupProbes.length > 0
                            ? groupVolume.toLocaleString("en-US")
                            : "—"}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                  {group.rows.map((row) => {
                  const on = selected.has(row.id);
                  const probe = probes[row.id];
                  const isProbing = probing.has(row.id);
                  const share =
                    probe && estimate.rawKeywords > 0 && on
                      ? (probe.rawKeywords / estimate.rawKeywords) * 100
                      : null;
                  const expanded = expandedId === row.id;
                  return (
                    <Fragment key={row.id}>
                      <TableRow
                        onClick={() =>
                          setExpandedId(expanded ? null : row.id)
                        }
                        className={cn(
                          "cursor-pointer hover:bg-muted/40",
                          on && "bg-primary/5"
                        )}
                      >
                        <TableCell className="w-10 shrink-0">
                          <SelectBox
                            state={on ? "all" : "none"}
                            onClick={
                              readOnly ||
                              (!on &&
                                idsThatFit([{ id: row.id }], selected, probes)
                                  .length === 0)
                                ? undefined
                                : () => toggleRow(row.id)
                            }
                            disabledReason={
                              !readOnly &&
                              !on &&
                              idsThatFit([{ id: row.id }], selected, probes)
                                .length === 0
                                ? "Maximum is 100,000 raw keywords"
                                : undefined
                            }
                            label={`Select ${row.broadSeedVariation}`}
                          />
                        </TableCell>
                        <TableCell className="min-w-[160px] text-sm font-medium whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <ChevronRight
                              className={cn(
                                "h-3 w-3 text-muted-foreground transition-transform",
                                expanded && "rotate-90"
                              )}
                            />
                            {row.broadSeedVariation}
                            {row.manual ? (
                              <span className="rounded-full border border-border/70 px-1.5 text-[9px] text-muted-foreground">
                                Manual
                              </span>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className="min-w-[130px] text-xs text-muted-foreground whitespace-nowrap">
                          {row.canonicalNicheSeed}
                        </TableCell>
                        <TableCell className="min-w-[160px] text-xs whitespace-nowrap">
                          {row.selectedCollection}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-right whitespace-nowrap text-muted-foreground">
                          {formatProductCount(
                            productCountByCollectionId[row.collectionId] ??
                              row.productCount
                          )}
                        </TableCell>
                        <TableCell className="min-w-[80px] whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-medium ${scopeMatchClass(row.scopeMatch)}`}
                          >
                            {row.scopeMatch}
                          </Badge>
                        </TableCell>
                        <TableCell className="min-w-[100px] text-xs tabular-nums text-right whitespace-nowrap">
                          <ProbeCell
                            probe={probe}
                            probing={isProbing}
                            market={market}
                            value={probe?.rawKeywords}
                            format={formatRawKeywords}
                          />
                        </TableCell>
                        <TableCell className="min-w-[80px] text-xs tabular-nums text-right whitespace-nowrap">
                          <ProbeCell
                            probe={probe}
                            probing={isProbing}
                            market={market}
                            value={probe?.searchVolume}
                          />
                        </TableCell>
                        <TableCell className="min-w-[80px] text-xs tabular-nums text-right whitespace-nowrap">
                          {share === null ? (
                            "—"
                          ) : (
                            <span
                              className={cn(
                                share >= 50 &&
                                  "font-semibold text-amber-700 dark:text-amber-400"
                              )}
                            >
                              {share.toFixed(0)}%
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={9} className="bg-muted/20">
                            <SeedDetail
                              row={row}
                              probe={probe}
                              probing={isProbing}
                              onProbe={() => handleCheckDemand([row.id])}
                              readOnly={readOnly}
                            />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </table>
      </div>


      {/* Manual seed — the client knows regional wording we may miss. */}
      {readOnly ? null : (
      <div className="shrink-0 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border/70 px-3 py-2">
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={manualTerm}
          onChange={(e) => setManualTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitManualSeed();
            }
          }}
          placeholder="Add a broad seed we missed…"
          className="h-8 w-[220px] text-xs"
          aria-label="Add a broad seed variation"
        />
        <select
          value={manualFamily || groups[0]?.collectionId || ""}
          onChange={(e) => setManualFamily(e.target.value)}
          className="h-8 max-w-[240px] rounded-lg border border-border/70 bg-background px-2 text-xs outline-none"
          aria-label="Canonical seed family"
        >
          {groups.map((group) => (
            <option key={group.collectionId} value={group.collectionId}>
              {group.canonicalNicheSeed} — {group.selectedCollection}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={!manualTerm.trim() || groups.length === 0}
          onClick={submitManualSeed}
        >
          Add seed
        </Button>
      </div>
      )}

      <div className="shrink-0 space-y-2 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium tracking-tight">
            {selected.size === 0
              ? "No seeds selected yet"
              : `${selected.size} seed${selected.size === 1 ? "" : "s"} selected · ${estimate.rows} checked in ${marketLabel(market)}`}
          </p>
        </div>

        {estimate.rows === 0 ? (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Select seeds and run a demand check to see raw keyword counts and
            how many rows extract would pull.
          </p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <Metric
                label="Raw keywords"
                value={estimate.rawKeywords.toLocaleString("en-US")}
              />
              <Metric
                label="Rows to extract (capped)"
                value={estimate.cappedKeywords.toLocaleString("en-US")}
                highlight
              />
              <Metric
                label="Search volume"
                value={estimate.searchVolume.toLocaleString("en-US")}
              />
            </div>

            {estimate.rows > 0 ? (
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Each selected seed starts its own extraction run. Overlapping
                synonyms are pulled separately — deselect broad or duplicate
                wording to keep the pull small.
              </p>
            ) : null}

            {readOnly ? (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Locked after extract — this is the seed selection that was
                extracted.
              </p>
            ) : (
            <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="ml-auto h-8 text-xs bg-[#400095] hover:bg-[#6B358D] text-white dark:bg-[#F76D01] dark:hover:bg-[#F76D01]/90"
                onClick={() => setConfirmOpen(true)}
                disabled={
                  estimate.rows === 0 ||
                  committed ||
                  unprobedSelected.length > 0 ||
                  overSelectionCap
                }
              >
                {committed ? "Extracted" : "Extract"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Extract pulls up to {EXTRACT_CAP_PER_SEED.toLocaleString("en-US")} keywords per selected seed. The figure above is an estimate from
              the demand check; the pull returns the rows actually found.
            </p>
            {overSelectionCap ? (
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Selected seeds total {selectedCapped.toLocaleString("en-US")} raw
                keywords, over the{" "}
                {RAW_KEYWORD_SELECTION_CAP.toLocaleString("en-US")} maximum.
                Deselect seeds before extracting. A term shown as 10,000+ counts
                as 10,000.
              </p>
            ) : null}
            {!committed && unprobedSelected.length > 0 ? (
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {unprobedSelected.length} selected seed
                {unprobedSelected.length === 1 ? "" : "s"} haven&apos;t been
                checked yet — run &ldquo;Check demand&rdquo; on{" "}
                {unprobedSelected.length === 1 ? "it" : "all of them"} before
                you can extract. Unchecked seeds are never silently skipped.
              </p>
            ) : null}
            </>
            )}
          </>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm keyword extract</DialogTitle>
            <DialogDescription>
              Semrush applies your minimum search volume filter before the
              pull, so a higher floor returns fewer rows. Difficulty and word
              count can be filtered after the pull, in the Extract tab.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <label
              htmlFor="mr-extract-min-volume"
              className="text-xs font-medium text-muted-foreground"
            >
              Min. search volume
            </label>
            <Input
              id="mr-extract-min-volume"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="No minimum"
              value={minVolumeInput}
              onChange={(e) => setMinVolumeInput(e.target.value)}
              className="max-w-[160px]"
            />
          </div>
          <div className="max-h-56 overflow-auto rounded-xl border border-border/70">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Seed</th>
                  <th className="px-3 py-1.5 text-right font-medium">
                    Est. rows
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedRows
                  .filter((row) => probes[row.id] && !probes[row.id].failed)
                  .map((row) => (
                    <tr key={row.id} className="border-t border-border/50">
                      <td className="px-3 py-1.5">{row.broadSeedVariation}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatRawKeywords(probes[row.id].rawKeywords)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end text-xs">
            <span className="font-semibold tabular-nums">
              {estimate.cappedKeywords.toLocaleString("en-US")} rows
            </span>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                const minVolume = Number(minVolumeInput);
                onConfirmSpend({
                  minVolume:
                    minVolumeInput.trim() && Number.isFinite(minVolume)
                      ? Math.max(0, Math.floor(minVolume))
                      : undefined,
                });
              }}
              className="bg-[#400095] hover:bg-[#6B358D] text-white dark:bg-[#F76D01] dark:hover:bg-[#F76D01]/90"
            >
              Start extract
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        highlight
          ? "border-primary/30 bg-primary/5"
          : "border-border/70 bg-background"
      )}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  );
}

function ProbeCell({
  probe,
  probing,
  market,
  value,
  format,
}: {
  probe?: SeedProbe;
  probing: boolean;
  market: string;
  value?: number;
  /** Defaults to a plain locale-formatted number; pass `formatRawKeywords` to cap the display at the extract ceiling. */
  format?: (value: number) => string;
}) {
  if (probing) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
      </span>
    );
  }
  if (!probe) return <span className="text-muted-foreground/60">—</span>;
  if (probe.failed) {
    return (
      <span className="text-[10px] font-medium text-destructive">Failed</span>
    );
  }
  return (
    <span
      className={cn(
        isProbeStale(probe, market) && "text-amber-700 dark:text-amber-400"
      )}
    >
      {format ? format(value ?? 0) : (value ?? 0).toLocaleString("en-US")}
    </span>
  );
}

function SeedDetail({
  row,
  probe,
  probing,
  onProbe,
  readOnly = false,
}: {
  row: MockSeedRow;
  probe?: SeedProbe;
  probing: boolean;
  onProbe: () => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-2 py-1">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          Parent niche:{" "}
          <span className="text-foreground/80">{row.broadParentNiche}</span>
        </span>
        <span>
          Variation:{" "}
          <span className="text-foreground/80">{row.variationType}</span>
        </span>
        <span>
          Products:{" "}
          <span className="text-foreground/80 tabular-nums">
            {formatProductCount(row.productCount)}
          </span>
        </span>
      </div>

      {probing ? (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          Checking what this seed returns…
        </p>
      ) : probe && !probe.failed ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Sample of what this seed returns
          </p>
          <div className="flex flex-wrap gap-1.5">
            {probe.sampleKeywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px]"
              >
                {keyword}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Checked {new Date(probe.checkedAt).toLocaleDateString()} ·{" "}
            {marketLabel(probe.market)}
          </p>
        </div>
      ) : probe?.failed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-2.5">
          <p className="text-[11px] text-destructive leading-relaxed">
            The demand check failed for this seed. Try again or drop the term.
          </p>
          {!readOnly && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10 shrink-0"
              onClick={onProbe}
            >
              <RefreshCw className="h-3 w-3" />
              Retry check
            </Button>
          )}
        </div>
      ) : readOnly ? (
        <p className="text-[11px] text-muted-foreground">No demand check on this seed.</p>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-[11px]"
          onClick={onProbe}
        >
          <Search className="h-3 w-3" />
          Check this seed
        </Button>
      )}
    </div>
  );
}

function SelectBox({
  state,
  onClick,
  label,
  disabledReason,
}: {
  state: "all" | "some" | "none";
  onClick?: () => void;
  label: string;
  disabledReason?: string;
}) {
  const box = (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
        disabledReason && "cursor-not-allowed opacity-40",
        state === "all"
          ? "border-primary bg-primary text-primary-foreground"
          : state === "some"
            ? "border-primary bg-primary/15 text-primary"
            : "border-muted-foreground/40 bg-background"
      )}
    >
      {state === "all" ? (
        <Check className="h-3 w-3" />
      ) : state === "some" ? (
        <span className="h-0.5 w-2 rounded bg-current" />
      ) : null}
    </span>
  );

  if (!onClick) {
    return (
      <span role="img" aria-label={disabledReason ?? label} title={disabledReason}>
        {box}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      aria-pressed={state === "all"}
    >
      {box}
    </button>
  );
}
