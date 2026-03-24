import { describe, it, expect } from 'vitest';
import { buildChildMap, getDescendants, getVisibleDescendants } from './collapse';

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

// ─── getVisibleDescendants ─────────────────────────────────────────────────────

describe('getVisibleDescendants', () => {
  it('returns all descendants when no intermediate node is collapsed', () => {
    /**
     * Verifies that getVisibleDescendants returns the same set as
     * getDescendants when no intermediate node in the subtree is collapsed.
     *
     * Why: When expanding a top-level parent whose subtree has no collapsed
     * intermediates, every descendant should become visible. If the function
     * incorrectly stops BFS early, nodes deeper in the tree stay hidden even
     * though the path to them is fully open.
     *
     * What breaks: Expanding a root node would not unhide grandchildren even
     * when the intermediate parents are also expanded.
     */
    // GIVEN a three-level tree where no node is collapsed
    const childMap = new Map<string, string[]>([
      ['root', ['child1', 'child2']],
      ['child1', ['grandchild1']],
    ]);
    const collapsedIds = new Set<string>();

    // WHEN we get visible descendants of root
    const visible = getVisibleDescendants('root', childMap, collapsedIds);

    // THEN all descendants are returned
    expect(visible).toContain('child1');
    expect(visible).toContain('child2');
    expect(visible).toContain('grandchild1');
    expect(visible).toHaveLength(3);
  });

  it('stops at collapsed intermediate node — grandchildren of collapsed child are excluded', () => {
    /**
     * Verifies that getVisibleDescendants stops BFS traversal at a collapsed
     * intermediate node so its descendants remain hidden.
     *
     * This is the core regression test for the grandchild visibility bug:
     * Enrichment > Scraping (collapsed) > Manual (MO). When Enrichment is
     * expanded, Manual (MO) should stay hidden because its direct parent
     * Scraping is still collapsed.
     *
     * Why: The naive fix unhides ALL descendants on expand. But when an
     * intermediate parent is collapsed, its children are hidden by THAT
     * parent's collapsed state — expanding the grandparent must not override
     * the intermediate parent's collapsed state.
     *
     * What breaks: After collapsing Scraping, then collapsing and expanding
     * Enrichment, Manual (MO) becomes visible even though Scraping is still
     * collapsed — the grandchild appears floating without its parent.
     */
    // GIVEN a three-level tree: enrichment > scraping (collapsed) > manual
    const childMap = new Map<string, string[]>([
      ['enrichment', ['scraping', 'other-child']],
      ['scraping', ['manual']],
    ]);
    // Scraping is still collapsed
    const collapsedIds = new Set<string>(['scraping']);

    // WHEN we get visible descendants of enrichment (which is being expanded)
    const visible = getVisibleDescendants('enrichment', childMap, collapsedIds);

    // THEN scraping is included (it becomes visible as a direct child)
    // but manual is NOT included (hidden behind collapsed scraping)
    expect(visible).toContain('scraping');
    expect(visible).toContain('other-child');
    expect(visible).not.toContain('manual');
    expect(visible).toHaveLength(2);
  });

  it('excludes the entire subtree of a collapsed intermediate node', () => {
    /**
     * Verifies that all descendants beyond a collapsed intermediate — not
     * just the immediate children — are excluded from the visible set.
     *
     * Why: A collapsed node may have multiple levels of descendants beneath
     * it. All of them must remain hidden when expanding the grandparent,
     * not just the direct children of the collapsed node.
     *
     * What breaks: After expanding a grandparent, grandchildren of a
     * collapsed intermediate become visible but great-grandchildren remain
     * hidden — an inconsistent partial-reveal state.
     */
    // GIVEN a four-level tree: root > mid (collapsed) > child > grandchild
    const childMap = new Map<string, string[]>([
      ['root', ['mid']],
      ['mid', ['child']],
      ['child', ['grandchild']],
    ]);
    const collapsedIds = new Set<string>(['mid']);

    // WHEN we get visible descendants of root
    const visible = getVisibleDescendants('root', childMap, collapsedIds);

    // THEN only mid is visible; child and grandchild stay hidden
    expect(visible).toContain('mid');
    expect(visible).not.toContain('child');
    expect(visible).not.toContain('grandchild');
    expect(visible).toHaveLength(1);
  });

  it('returns empty array for a leaf node', () => {
    /**
     * Verifies getVisibleDescendants returns [] for a node with no children.
     *
     * Why: Calling this on a leaf (e.g., if toggle fires on a leaf due to
     * a race condition) must be safe and return nothing to unhide.
     *
     * What breaks: A crash or undefined return would break the expand path
     * entirely for canvases where a leaf is somehow toggled.
     */
    // GIVEN a childMap where the target node is a leaf
    const childMap = new Map<string, string[]>([['root', ['leaf']]]);
    const collapsedIds = new Set<string>();

    // WHEN we get visible descendants of the leaf
    const visible = getVisibleDescendants('leaf', childMap, collapsedIds);

    // THEN result is empty
    expect(visible).toHaveLength(0);
  });

  it('handles multiple collapsed intermediates at different levels', () => {
    /**
     * Verifies that BFS stops independently at each collapsed intermediate,
     * even when multiple collapsed nodes exist at different depths.
     *
     * Why: A canvas can have multiple partially-expanded subtrees. Each
     * collapsed node must independently gate its subtree, regardless of
     * depth or sibling relationship.
     *
     * What breaks: One collapsed node's subtree bleeds through while another
     * correctly gates, resulting in asymmetric visible states.
     */
    // GIVEN a tree: root > [a (collapsed), b] > a > [a1], b > [b1 (collapsed)] > [b2]
    const childMap = new Map<string, string[]>([
      ['root', ['a', 'b']],
      ['a', ['a1']],
      ['b', ['b1']],
      ['b1', ['b2']],
    ]);
    const collapsedIds = new Set<string>(['a', 'b1']);

    // WHEN we get visible descendants of root
    const visible = getVisibleDescendants('root', childMap, collapsedIds);

    // THEN a and b are visible, but a1 (behind collapsed a) and b2 (behind collapsed b1) are not
    expect(visible).toContain('a');
    expect(visible).toContain('b');
    expect(visible).toContain('b1'); // b1 itself is visible (direct child of b, which is open)
    expect(visible).not.toContain('a1');
    expect(visible).not.toContain('b2');
    expect(visible).toHaveLength(3);
  });
});
