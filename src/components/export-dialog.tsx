"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSheetStore } from "@/store/sheet-store";
import {
  buildProductGroupIndex,
  orderRowsForExport,
} from "@/lib/catalog/product-groups";
import {
  buildCatalogExport,
  buildPlatformExport,
  exportColumnKey,
  type ExportColumn,
} from "@/lib/catalog/export-file";
import { EXPORT_PLATFORMS, isPlatformId } from "@/lib/catalog/platforms";
import {
  ExportWizard,
  type ExportColumnOption,
  type ExportRequest,
  type ExportScope,
  type ExportScopeOption,
} from "@/components/sheet/export-wizard";
import type { ProductRow } from "@/types";

function hasEnrichedValue(row: ProductRow, columnId: string): boolean {
  const value = row.enrichedData?.[columnId];
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== "";
}

/** Products in sheet order, each with its variant rows (primary first). */
function groupProducts(rows: ProductRow[], groupColumn: string | null | undefined): ProductRow[][] {
  const index = buildProductGroupIndex(rows, groupColumn);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const products: ProductRow[][] = [];
  for (const row of rows) {
    if (index.primaryIdByRowId.get(row.id) !== row.id) continue;
    const others = (index.memberIdsByPrimary.get(row.id) ?? [])
      .filter((id) => id !== row.id)
      .map((id) => byId.get(id))
      .filter((member): member is ProductRow => Boolean(member));
    products.push([row, ...others]);
  }
  return products;
}

export function ExportDialog() {
  const {
    rows,
    originalColumns,
    enrichmentColumns,
    fileName,
    isEnriching,
    productGroupColumn,
    selectedRowIds,
  } = useSheetStore();

  const [open, setOpen] = useState(false);

  const sheetName = "Products";
  const totalRows = rows.length;
  const baseName = (fileName || "export").replace(/\.[^/.]+$/, "");

  // Grid selection holds product (primary) rows; export their variants too.
  const selectedRows = useMemo(() => {
    if (selectedRowIds.size === 0) return [];
    const index = buildProductGroupIndex(rows, productGroupColumn);
    const ids = new Set<string>();
    for (const id of selectedRowIds) {
      const members = index.enabled ? index.memberIdsByPrimary.get(id) : undefined;
      for (const member of members ?? [id]) ids.add(member);
    }
    return rows.filter((row) => ids.has(row.id));
  }, [rows, selectedRowIds, productGroupColumn]);

  const rowsFor = (scope: ExportScope) => (scope === "selected" ? selectedRows : rows);

  const scopes: ExportScopeOption[] = [
    {
      id: "selected",
      title: "Selected rows",
      description:
        selectedRows.length === 0
          ? "Select rows in the table to use this option"
          : "Only the rows you checked in the table",
      count: selectedRows.length,
    },
    {
      id: "all",
      title: "Whole file",
      description: "Every row in the file",
      count: totalRows,
    },
  ];

  const columnsFor = (scope: ExportScope): ExportColumn[] => {
    const scopeRows = rowsFor(scope);
    return [
      ...originalColumns.map((name): ExportColumn => ({ key: name, label: name, source: "original" })),
      ...enrichmentColumns
        .filter((col) => col.enabled || scopeRows.some((row) => hasEnrichedValue(row, col.id)))
        .flatMap((col): ExportColumn[] => {
          const out: ExportColumn[] = [{ key: col.id, label: col.label, source: "enriched" }];
          // Rows where the AI found nothing keep the reason next to the cell;
          // offer it as its own column so the export explains the blanks.
          const reasonKey = `${col.id}__notFoundReason`;
          const hasReason = scopeRows.some((row) => {
            const reason = row.enrichedData?.[reasonKey];
            return typeof reason === "string" && reason.trim() !== "";
          });
          if (hasReason) {
            out.push({ key: reasonKey, label: `${col.label} - not found reason`, source: "enriched" });
          }
          return out;
        }),
    ];
  };

  const getColumns = (scope: ExportScope): ExportColumnOption[] =>
    columnsFor(scope).map((column) => ({
      key: exportColumnKey(column),
      label: column.label,
      tag: column.source === "enriched" ? "AI" : undefined,
    }));

  const handleExport = async ({
    scope,
    format,
    platform,
    mapping,
    columnKeys,
    onProgress,
    signal,
  }: ExportRequest) => {
    const exportRows = rowsFor(scope);
    const suffix = scope === "selected" ? "selected" : "export";
    const reportProgress = (unit: string) => ({ done, total, phase }: { done: number; total: number; phase: string }) =>
      onProgress(
        phase === "packaging"
          ? { label: "Packaging the file…", percent: 100 }
          : {
              label: `Writing ${unit} ${done.toLocaleString()} of ${total.toLocaleString()}`,
              percent: total > 0 ? (done / total) * 100 : 100,
            }
      );

    if (isPlatformId(platform)) {
      onProgress({ label: "Preparing image links…", percent: null });
      const blob = await buildPlatformExport({
        platform,
        products: groupProducts(exportRows, productGroupColumn),
        columns: columnsFor(scope),
        mapping,
        isCancelled: () => signal.aborted,
        onProgress: reportProgress("products"),
      });
      return {
        blob,
        filename: `${baseName}_${suffix}_${platform}.csv`,
        rows: exportRows.length,
        columns: Object.values(mapping).filter(Boolean).length,
      };
    }

    const picked = new Set(columnKeys);
    const columns = columnsFor(scope).filter((column) => picked.has(exportColumnKey(column)));
    const blob = await buildCatalogExport({
      format,
      sections: [{ name: sheetName, rows: orderRowsForExport(exportRows, productGroupColumn) }],
      columns,
      isCancelled: () => signal.aborted,
      onProgress: reportProgress("rows"),
    });
    return {
      blob,
      filename: `${baseName}_${suffix}.${format}`,
      rows: exportRows.length,
      columns: columns.length,
    };
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={isEnriching || totalRows === 0}
        variant="outline"
        className="w-full gap-2 font-medium h-9"
        size="sm"
      >
        <Download className="h-4 w-4" />
        Export ({totalRows} rows)
      </Button>

      <ExportWizard
        open={open}
        onOpenChange={setOpen}
        scopes={scopes}
        defaultScope={selectedRows.length > 0 ? "selected" : "all"}
        getColumns={getColumns}
        onExport={handleExport}
        platforms={EXPORT_PLATFORMS}
      />
    </>
  );
}
