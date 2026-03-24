// ─── Collapse/expand pure helpers ─────────────────────────────────────────────
//
// These are pure functions with no React dependencies so they are easy to test.
// App.tsx wires them into state management.

/**
 * Build a Map<parentId, childIds[]> from a flat array of nodes.
 * Only nodes with a non-null parent_id appear in the map.
 */
export function buildChildMap(
  nodes: ReadonlyArray<{ id: string; parent_id: string | null }>
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parent_id !== null) {
      const siblings = map.get(node.parent_id);
      if (siblings) {
        siblings.push(node.id);
      } else {
        map.set(node.parent_id, [node.id]);
      }
    }
  }
  return map;
}

/**
 * BFS from `rootId` using `childMap` to collect ALL descendant ids.
 * The root itself is NOT included in the result.
 */
export function getDescendants(
  rootId: string,
  childMap: Map<string, string[]>
): string[] {
  const result: string[] = [];
  const queue: string[] = [rootId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = childMap.get(current) ?? [];
    for (const child of children) {
      result.push(child);
      queue.push(child);
    }
  }

  return result;
}

/**
 * BFS from `rootId` that stops traversal at collapsed intermediate nodes.
 *
 * Used during expand: only descendants whose path back to `rootId` passes
 * through no collapsed intermediate should be unhidden. Collapsed
 * intermediates themselves ARE included (they become visible as direct or
 * indirect children of the expanding node), but their own descendants are
 * not enqueued — those descendants remain hidden under the intermediate's
 * own collapsed state.
 *
 * `collapsedIds` is the set of node ids that are currently collapsed
 * (excluding `rootId` itself, which is transitioning to expanded).
 *
 * The root itself is NOT included in the result.
 */
export function getVisibleDescendants(
  rootId: string,
  childMap: Map<string, string[]>,
  collapsedIds: ReadonlySet<string>
): string[] {
  const result: string[] = [];
  const queue: string[] = [rootId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = childMap.get(current) ?? [];
    for (const child of children) {
      result.push(child);
      // Do not enqueue descendants of a collapsed intermediate — they
      // remain hidden behind that intermediate's own collapsed state.
      if (!collapsedIds.has(child)) {
        queue.push(child);
      }
    }
  }

  return result;
}
