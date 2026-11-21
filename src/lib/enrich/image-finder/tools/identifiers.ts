/**
 * Code-like values from a row (SKUs, barcodes, model/version tokens such as
 * `ESP32-S3` or `631958`). Column names are never consulted, so this works for
 * any sheet.
 */

export interface RowIdentifier {
  /** As written in the sheet. */
  value: string;
  /** Uppercase, separators removed — the comparison key. */
  key: string;
  /** Strong identifiers are specific enough to prove identity on their own. */
  strong: boolean;
}

const MAX_IDENTIFIERS = 12;

function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[\s\-_./]+/g, "");
}

/**
 * Quantities, pack counts and measurements (4PCS, 1000ML, 2.4G, 433MHz, 16GB,
 * PDQ30, 12V) describe a variant; they appear on countless unrelated pages
 * and can never prove identity.
 */
const QUANTITY_OR_MEASURE =
  /^(\d+(?:[.,]\d+)?(?:pcs?|pieces?|pack|pk|sets?|pairs?|pr|ml|l|ltr|mm|cm|m|km|in|inch|ft|g|gr|kg|lb|lbs|oz|v|w|kw|a|mah|ah|kb|mb|gb|tb|hz|khz|mhz|ghz|k|mp|x|ch)|pdq\d+|x\d+)$/i;

function isCodeLike(token: string): boolean {
  if (token.length < 4 || token.length > 40) return false;
  if (!/\d/.test(token)) return false;
  // Prices and decimals (299.99, 1,299.00) are not identifiers.
  if (/^\d+([.,]\d+)+$/.test(token)) return false;
  if (QUANTITY_OR_MEASURE.test(token)) return false;
  if (/^\d+$/.test(token)) return token.length >= 5;
  return /[A-Za-z]/.test(token);
}

function isStrong(token: string): boolean {
  const key = normalizeCode(token);
  if (/^\d+$/.test(key)) return key.length >= 6;
  return key.length >= 6 && /[A-Z]/.test(key) && /\d/.test(key);
}

const TOKEN_SPLIT = /[\s,;:()[\]{}|"'<>]+/;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s,;|"'<>()]+/gi;
const IDENTITY_LABEL = /^\s*(sku|mpn|model|part|p\/n|pn|code|barcode|ean|upc|gtin|isbn|ref|reference|item)\b[^:]*:/i;

/**
 * Splits a cell into list segments when it is a list of items (keywords,
 * "similar", "bought with", specs): three or more `|` / `;` / newline
 * segments, or five or more comma segments. Returns null for ordinary text.
 */
function listSegments(text: string): string[] | null {
  const strong = text.split(/\s*[|;\n]\s*/).filter(Boolean);
  if (strong.length >= 3) return strong;
  const commas = text.split(/\s*,\s+/).filter(Boolean);
  return commas.length >= 5 ? commas : null;
}

function cleanToken(raw: string): string {
  return raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
}

/**
 * Code-like values that identify THIS row. Codes that only appear inside
 * list-like cells (related, similar or "bought with" products, keyword lists)
 * belong to other products and are left out, unless the list segment is
 * labelled as an identifier ("MPN: …", "Barcode: …").
 */
export function extractRowIdentifiers(rowData: Record<string, string>): RowIdentifier[] {
  const identity: string[] = [];
  for (const raw of Object.values(rowData)) {
    // Links (found pages, image URLs) carry paths, hashes and tracking codes,
    // not the item's own codes.
    const text = String(raw ?? "").replace(URL_RE, " ").trim();
    if (!text) continue;
    const segments = listSegments(text);
    if (!segments) {
      if (!/\s/.test(text)) identity.push(text);
      identity.push(...text.split(TOKEN_SPLIT));
      continue;
    }
    for (const segment of segments) {
      if (IDENTITY_LABEL.test(segment)) identity.push(...segment.replace(IDENTITY_LABEL, "").split(TOKEN_SPLIT));
    }
  }

  const out: RowIdentifier[] = [];
  const seen = new Set<string>();
  for (const raw of identity) {
    const value = cleanToken(raw);
    if (!isCodeLike(value)) continue;
    const key = normalizeCode(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value, key, strong: isStrong(value) });
  }
  return out
    .sort((a, b) => Number(b.strong) - Number(a.strong) || b.key.length - a.key.length)
    .slice(0, MAX_IDENTIFIERS);
}
