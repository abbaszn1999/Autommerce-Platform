"use client";

import { exportFileName, exportHtml, exportWorkbook, type ExportDoc, type ExportOptions } from "@/lib/google-ads/report-export";

/**
 * The report alone, in a new tab, with the print dialog open: print it, or pick
 * "Save as PDF" (the browser draws Arabic and every font correctly that way).
 */
export function openPrintable(doc: ExportDoc, opts: ExportOptions): void {
  const html = exportHtml(doc, opts);
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  window.open(`${url}#print`, "_blank", "noopener");
  // The tab keeps its own copy; the address is only needed until it has loaded.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** An Excel file: every table and chart of the report on its own sheet, numbers as numbers. */
export async function downloadExcel(doc: ExportDoc, opts: ExportOptions): Promise<void> {
  const ExcelJS = await import("exceljs");
  const wb = exportWorkbook((ExcelJS as unknown as { default?: typeof ExcelJS }).default ?? ExcelJS, doc, opts);
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFileName(doc, "xlsx");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
