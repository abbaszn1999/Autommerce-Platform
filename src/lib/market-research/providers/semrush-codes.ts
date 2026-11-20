export type SearchIntent =
  | "informational"
  | "navigational"
  | "commercial"
  | "transactional";

/** Semrush Keyword Magic / Overview numeric intent flags. */
const INTENT_BY_CODE: Record<number, SearchIntent> = {
  1: "informational",
  2: "navigational",
  3: "commercial",
  4: "transactional",
};

const INTENT_BY_NAME: Record<string, SearchIntent> = {
  informational: "informational",
  information: "informational",
  info: "informational",
  navigational: "navigational",
  navigation: "navigational",
  commercial: "commercial",
  transactional: "transactional",
  transaction: "transactional",
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function decodeIntent(value: unknown): SearchIntent | null {
  if (typeof value === "string") {
    const named = INTENT_BY_NAME[value.trim().toLowerCase()];
    if (named) return named;
    const n = asNumber(value);
    if (n !== null) return INTENT_BY_CODE[n] ?? null;
    return null;
  }
  const n = asNumber(value);
  if (n === null) return null;
  return INTENT_BY_CODE[n] ?? null;
}

export function decodeIntents(value: unknown): SearchIntent[] {
  const seen = new Set<SearchIntent>();
  const push = (item: unknown) => {
    const decoded = decodeIntent(item);
    if (decoded) seen.add(decoded);
  };
  if (Array.isArray(value)) {
    value.forEach(push);
  } else if (typeof value === "string" && value.includes(",")) {
    value.split(",").forEach((part) => push(part.trim()));
  } else if (value != null && value !== "") {
    push(value);
  }
  return [...seen];
}

export function sheetForIntents(
  intents: SearchIntent[]
): "category" | "informational" {
  if (
    intents.includes("commercial") ||
    intents.includes("transactional")
  ) {
    return "category";
  }
  return "informational";
}

export function isQuestionKeyword(
  phrase: string,
  intents: SearchIntent[] = []
): boolean {
  if (/^(how|what|why|when|where|who|are|is|can|do|does|should)\b/i.test(phrase.trim())) {
    return true;
  }
  if (phrase.includes("?")) return true;
  return intents.length === 1 && intents[0] === "informational" && /\b(vs|guide)\b/i.test(phrase);
}
