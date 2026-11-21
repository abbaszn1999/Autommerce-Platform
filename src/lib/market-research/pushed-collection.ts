import type { ProposedCollection } from "@/components/market-research/workspace-data";

/**
 * A collection counts as pushed once the push step saved a store id for it.
 * Only the push route writes store ids, so the browser cannot mark a
 * collection as pushed on its own.
 */
export function isPushedCollection(
  col: Pick<ProposedCollection, "storeHandle" | "storeCollectionId"> | null | undefined
): boolean {
  return Boolean(col?.storeHandle || col?.storeCollectionId);
}
