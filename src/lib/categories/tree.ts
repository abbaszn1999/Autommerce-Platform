export type CategoryRef = {
  id: string;
  name: string;
  parentId: string | null;
};

/** Ancestors of each id (not including self). Lookup is O(1) after build. */
export function buildAncestorSets(
  categories: CategoryRef[]
): Map<string, Set<string>> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const cache = new Map<string, Set<string>>();

  const ancestorsOf = (id: string): Set<string> => {
    const hit = cache.get(id);
    if (hit) return hit;
    const set = new Set<string>();
    const cat = byId.get(id);
    if (cat?.parentId) {
      set.add(cat.parentId);
      for (const ancestor of ancestorsOf(cat.parentId)) set.add(ancestor);
    }
    cache.set(id, set);
    return set;
  };

  for (const cat of categories) ancestorsOf(cat.id);
  return cache;
}

/** True when `targetId` sits under `parentId` (would create a cycle if reparented). */
export function isDescendantOf(
  parentId: string,
  targetId: string,
  ancestorSets: Map<string, Set<string>>
): boolean {
  return ancestorSets.get(targetId)?.has(parentId) ?? false;
}

type TreeOf<T> = T & { children: TreeOf<T>[] };

export function buildTree<T extends CategoryRef>(categories: T[]): TreeOf<T>[] {
  const map = new Map<string, TreeOf<T>>();
  const roots: TreeOf<T>[] = [];

  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] });
  }

  for (const cat of categories) {
    const node = map.get(cat.id)!;
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export type FlatTreeRow<T> = { node: T; depth: number };

export function flattenExpanded<T extends { id: string; children: T[] }>(
  roots: T[],
  expanded: Set<string>
): FlatTreeRow<T>[] {
  const out: FlatTreeRow<T>[] = [];
  const walk = (nodes: T[], depth: number) => {
    for (const node of nodes) {
      out.push({ node, depth });
      if (node.children.length > 0 && expanded.has(node.id)) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(roots, 0);
  return out;
}

export function collectExpandableIds<T extends { id: string; children: T[] }>(
  roots: T[]
): Set<string> {
  const ids = new Set<string>();
  const walk = (nodes: T[]) => {
    for (const node of nodes) {
      if (node.children.length > 0) {
        ids.add(node.id);
        walk(node.children);
      }
    }
  };
  walk(roots);
  return ids;
}
