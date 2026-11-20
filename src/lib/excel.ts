import type { ProductRow } from "@/types";

// --- Image extraction from xlsx ---

function cellToString(cell: unknown): string {
  if (cell == null || cell === "") return "";
  if (typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") {
    return String(cell).trim();
  }
  if (typeof cell === "object") {
    const value = cell as {
      text?: string;
      result?: unknown;
      hyperlink?: string;
      richText?: Array<{ text?: string }>;
    };
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? "").join("").trim();
    }
    if (value.text) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
    if (value.hyperlink) return String(value.hyperlink).trim();
    // A formula that failed (e.g. WPS in-cell pictures) is not a value.
    if ("error" in value || "formula" in value || "sharedFormula" in value) return "";
  }
  return String(cell).trim();
}

function parseCsvBuffer(buffer: ArrayBuffer): string[][] {
  const text = new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch !== "\r") cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => value !== ""));
}

function isZipXlsx(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

async function sheetToRawRows(buffer: ArrayBuffer): Promise<string[][]> {
  if (!isZipXlsx(buffer)) {
    return parseCsvBuffer(buffer);
  }
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  if (zip.file("xl/vbaProject.bin")) {
    throw new Error("Macro-enabled workbooks (.xlsm) are not allowed.");
  }
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("The Excel file is empty.");
  }
  const rawData: string[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rawData.push(values.map((cell) => cellToString(cell)));
  });
  return rawData;
}

// --- Main parse function ---

export async function parseExcelFile(buffer: ArrayBuffer): Promise<{
  columns: string[];
  rows: ProductRow[];
  headerRowIndex: number;
  /** Header text per 0-based sheet column (`__EMPTY_n` when blank). */
  headers: string[];
  /** 0-based sheet row of each returned row. */
  rowSheetIndexes: number[];
}> {
  const rawData = await sheetToRawRows(buffer);

  if (rawData.length === 0) {
    throw new Error("The Excel file is empty.");
  }

  // Find the header row (the first row with the most string columns)
  let headerRowIndex = 0;
  let maxCols = 0;

  for (let i = 0; i < Math.min(20, rawData.length); i++) {
    const row = rawData[i];
    if (!row) continue;

    const validCells = row.filter((cell) => cell !== "").length;
    if (validCells > maxCols) {
      maxCols = validCells;
      headerRowIndex = i;
    }
  }

  const headers = (rawData[headerRowIndex] || []).map((cell, index) =>
    cell ? cell : `__EMPTY_${index}`
  );
  const jsonData: Record<string, string>[] = [];
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i] || [];
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = String(row[index] ?? "").trim();
    });
    jsonData.push(record);
  }

  if (jsonData.length === 0) {
    throw new Error("No data rows found after the header.");
  }

  // Clean up columns (remove __EMPTY columns that have no data)
  let columns = Object.keys(jsonData[0] || {});
  columns = columns.filter(col => {
    if (!col.includes("__EMPTY")) return true;
    return jsonData.some(row => row[col] && String(row[col]).trim() !== "");
  });

  // Embedded pictures are extracted as binary and uploaded to Storage by the
  // products import path. Inlining them as data: URLs here would bloat the
  // catalog blob and the browser heap.
  const rowSheetIndexes: number[] = [];
  const rows: ProductRow[] = jsonData
    .map((row, position) => ({ row, sheetIndex: headerRowIndex + 1 + position }))
    .filter(({ row, sheetIndex }) => {
      // Skip completely empty rows
      const keep = columns.some(col => row[col] && String(row[col]).trim() !== "");
      if (keep) rowSheetIndexes.push(sheetIndex);
      return keep;
    })
    .map(({ row }, index) => {
      const cleanData: Record<string, string> = {};
      columns.forEach(col => {
        const value = String(row[col] || "").trim();
        cleanData[col] = value.startsWith("data:image") ? "" : value;
      });

      return {
        id: `row-${index}`,
        rowIndex: index,
        selected: true,
        status: "pending" as const,
        originalData: cleanData,
        enrichedData: {},
      };
    });

  return { columns, rows, headerRowIndex, headers, rowSheetIndexes };
}
