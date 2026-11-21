/**
 * Extraction volume limits for Market Research.
 *
 * Provider: amassuo/semrush-keyword-expander, `sources: ["broad"]` only.
 * Server-side `minVolume`/`maxDifficulty` filters are applied by Semrush
 * before rows are returned, so narrowing the filters genuinely shrinks the
 * extract. See the `extract/start` route.
 */

/**
 * Hard per-seed ceiling on extracted rows, enforced both in the display
 * (Tab 3 shows "10,000+" past this) and via the actor's own `limitPerSeed`
 * input. This matches `amassuo/semrush-keyword-expander`'s own schema
 * ceiling (`maximum: 10000`), so Semrush never returns more than this many
 * rows for a single seed.
 */
export const EXTRACT_CAP_PER_SEED = 10_000;

/**
 * Hard ceiling on how many raw keywords a Tab 3 selection may commit to
 * extracting. Each seed counts as `min(raw keywords, EXTRACT_CAP_PER_SEED)`
 * — a term shown as "10,000+" counts as 10,000 — so ten maxed-out seeds
 * fill the ceiling exactly.
 */
export const RAW_KEYWORD_SELECTION_CAP = 100_000;

/** Estimate extracted rows for one seed: min(ideas, EXTRACT_CAP_PER_SEED). */
export function cappedKeywordEstimate(rawKeywordEstimate: number): number {
  if (!Number.isFinite(rawKeywordEstimate) || rawKeywordEstimate <= 0) return 0;
  return Math.min(EXTRACT_CAP_PER_SEED, Math.floor(rawKeywordEstimate));
}

export function formatUsd(amount: number): string {
  const abs = Math.abs(amount);
  if (abs > 0 && abs < 0.01) {
    return `$${amount.toLocaleString("en-US", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 4,
    })}`;
  }
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
