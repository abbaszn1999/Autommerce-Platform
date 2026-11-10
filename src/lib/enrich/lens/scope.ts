/**
 * Lens settings that both the sidebar and the server read. Pure (no runtime
 * imports beyond the market list) so the browser can share it.
 */
import type { LensMatchScope } from "@/types";
import { resolveSearchMarket } from "../source-urls/markets";

/**
 * The match scope a saved setting means. Only "exact_and_visual" widens the
 * search; anything else is the default, exact matches only. A sheet saved while
 * the "products" scope existed (Google removed Lens's Products tab) keeps the
 * nearest behaviour, exact then similar, instead of breaking.
 */
export function resolveLensScope(setting: string | undefined): LensMatchScope {
  return setting === "exact_and_visual" || setting === "products" ? "exact_and_visual" : "exact";
}

/**
 * The two-letter country the Lens search runs from, or undefined to send none
 * (the provider then uses its own default, US). Empty, "none", "auto" and an
 * unknown code (a hand-edited sheet) all send nothing.
 */
export function resolveLensCountry(setting: string | undefined): string | undefined {
  return resolveSearchMarket(setting)?.code;
}
