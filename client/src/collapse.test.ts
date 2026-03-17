import { describe, it, expect } from 'vitest';
import { buildChildMap, getDescendants } from './collapse';

// ─── buildChildMap ────────────────────────────────────────────────────────────

describe('buildChildMap', () => {
  it('maps each parent_id to its direct child ids', () => {
    /**
     * Verifies that buildChildMap correctly groups nodes by their parent_id,
     * returning a Map where each key is a parent id and each value is the list
     * of direct children's ids.
     *
     * Why: The childMap is the foundation of collapse/expand — every BFS
     * traversal relies on it to find which nodes to hide. If it's wrong,
     * collapse hides the wrong nodes or misses nodes entirely.
     *
     * What breaks: Collapsing a parent would not hide its children, or would
     * hide unrelated nodes.
     */
    // GIVEN a flat list of db nodes with parent-child relationships
    const nodes = [
      { id: 'root', parent_id: null },
      { id: 'child1', parent_id: 'root' },
      { id: 'child2', parent_id: 'root' },
      { id: 'grandchild1', parent_id: 'child1' },
    ];

    // WHEN we build the child map
    const map = buildChildMap(nodes);

    // THEN each parent maps to its direct children
    expect(map.get('root')).toEqual(['child1', 'child2']);
    expect(map.get('child1')).toEqual(['grandchild1']);
    expect(map.get('child2')).toBeUndefined();
    // null parent_id nodes should NOT appear as keys in the map
    expect(map.has('root')).toBe(true); // root is a parent, not a child
    expect(map.size).toBe(2); // only 'root' and 'child1' have children
  });

  it('returns empty map for a list with no parent-child relationships', () => {
    /**
     * Verifies buildChildMap returns an empty map when no node has a parent.
     *
     * Why: The collapse system must not crash or produce phantom entries when
     * the canvas has only root-level nodes (the common initial state).
     *
     * What breaks: Attempting to iterate the map would throw or yield stale
     * entries, corrupting hidden state on an otherwise flat canvas.
     */
    // GIVEN nodes with no parent_id
    const nodes = [
      { id: 'a', parent_id: null },
      { id: 'b', parent_id: null },
    ];

    // WHEN we build the child map
    const map = buildChildMap(nodes);

    // THEN the map is empty
    expect(map.size).toBe(0);
  });
});

// ─── getDescendants ───────────────────────────────────────────────────────────

describe('getDescendants', () => {
  it('returns all descendants via BFS including deeply nested nodes', () => {
    /**
     * Verifies that getDescendants performs a correct BFS to collect all
     * descendant ids (direct children, grandchildren, etc.) of a given node.
     *
     * Why: When collapsing a node, ALL descendants (not just direct children)
     * must be hidden. Missing a level of nesting means grandchildren remain
     * visible while their parent is hidden — a broken visual state.
     *
     * What breaks: Grandchild nodes stay visible on canvas after their
     * grandparent is collapsed, creating orphaned floating nodes.
     */
    // GIVEN a childMap with three levels of nesting
    const childMap = new Map<string, string[]>([
      ['root', ['child1', 'child2']],
      ['child1', ['grandchild1', 'grandchild2']],
      ['grandchild1', ['great-grandchild']],
    ]);

    // WHEN we get descendants of root
    const descendants = getDescendants('root', childMap);

    // THEN all nodes below root are included
    expect(descendants).toContain('child1');
    expect(descendants).toContain('child2');
    expect(descendants).toContain('grandchild1');
    expect(descendants).toContain('grandchild2');
    expect(descendants).toContain('great-grandchild');
    expect(descendants).not.toContain('root');
    expect(descendants).toHaveLength(5);
  });

  it('returns empty array for a leaf node with no children', () => {
    /**
     * Verifies getDescendants returns [] for a leaf node.
     *
     * Why: The collapse button is only shown when hasChildren is true, but
     * defensive handling here prevents accidental hiding of unrelated nodes
     * if the toggle is somehow invoked on a leaf.
     *
     * What breaks: Calling collapse on a leaf would attempt to hide an
     * undefined list, throwing a runtime error.
     */
    // GIVEN a childMap where leaf has no entry
    const childMap = new Map<string, string[]>([
      ['root', ['leaf']],
    ]);

    // WHEN we get descendants of the leaf
    const descendants = getDescendants('leaf', childMap);

    // THEN result is empty
    expect(descendants).toHaveLength(0);
  });

  it('returns only direct children for a node with depth-1 children only', () => {
    /**
     * Verifies getDescendants correctly returns exactly the direct children
     * when a node has no grandchildren.
     *
     * Why: Ensures BFS terminates correctly at the leaf level without
     * over-collecting or double-counting nodes.
     *
     * What breaks: Nodes that should remain visible after partial collapse
     * get incorrectly hidden.
     */
    // GIVEN a childMap with only one level of nesting
    const childMap = new Map<string, string[]>([
      ['parent', ['c1', 'c2', 'c3']],
    ]);

    // WHEN we get descendants
    const descendants = getDescendants('parent', childMap);

    // THEN exactly the three children are returned
    expect(descendants).toEqual(['c1', 'c2', 'c3']);
  });
});
