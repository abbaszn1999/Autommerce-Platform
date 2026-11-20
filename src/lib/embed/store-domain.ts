export function normalizeStoreDomain(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
}

export function collectStoreDomains(
  sources: Array<string | null | undefined>
): string[] {
  const unique = new Set<string>();
  for (const source of sources) {
    const normalized = normalizeStoreDomain(source);
    if (normalized) unique.add(normalized);
  }
  return [...unique];
}
