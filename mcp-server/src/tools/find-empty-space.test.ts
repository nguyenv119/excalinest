/**
 * Unit tests for the suggestEmptySpace function in find-empty-space.ts.
 *
 * The function accepts a fetchNodes override for dependency injection, so
 * these tests pass a plain async function that returns controlled node lists.
 * This avoids the overhead of a real HTTP server while still testing the
 * real production logic — the fetchNodes parameter is the boundary, and its
 * default value (the real getNodes) is covered by canvas-api.test.ts.
 *
 * Why not a real server: suggestEmptySpace is a pure computation over a list
 * of nodes. Using a real server would add networking/DB setup overhead without
 * testing any additional code paths. The injection boundary is well-defined
 * and the default is already integration-tested.
 */

import { describe, it, expect } from 'vitest';
import { suggestEmptySpace } from './find-empty-space.js';
import type { CanvasNode } from '../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<CanvasNode> & { id: string; title: string }): CanvasNode {
  return {
    parent_id: null,
    notes: '',
    x: 0,
    y: 0,
    width: null,
    height: null,
    collapsed: 0,
    border_color: null,
    bg_color: null,
    border_width: null,
    border_style: null,
    font_size: null,
    font_color: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function fetchReturning(nodes: CanvasNode[]) {
  return async () => nodes;
}

// ─── suggestEmptySpace ───────────────────────────────────────────────────────

describe('suggestEmptySpace', () => {
  it('returns { x: 100, y: 100 } when canvas has no nodes', async () => {
    /**
     * Verifies that when the canvas is empty, find_empty_space returns the
     * default starting position of (100, 100).
     *
     * This matters because the organize-canvas skill calls find_empty_space
     * before placing any new cluster. On an empty canvas it must return a
     * valid non-zero starting point, not undefined or (0, 0).
     *
     * If this contract breaks, new clusters are placed at the origin and may
     * overlap with the React Flow controls or render off-screen.
     */
    // GIVEN an empty canvas
    const fetch = fetchReturning([]);

    // WHEN computing empty space for a 400x300 region
    const result = await suggestEmptySpace(400, 300, fetch);

    // THEN the default starting position is returned
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
  });

  it('places the new region to the right of existing root nodes with 80px gap', async () => {
    /**
     * Verifies that when root nodes exist, find_empty_space places the new
     * cluster 80px to the right of the rightmost node's right edge.
     *
     * This matters because the organize-canvas skill must not overlap existing
     * clusters. The 80px gap provides visual breathing room.
     *
     * If this contract breaks, new clusters are placed on top of existing
     * content, making the canvas unusable without manual repositioning.
     */
    // GIVEN a root node at x=0 with default width (205)
    const nodes = [makeNode({ id: 'root-1', title: 'Root Node', x: 0, y: 0 })];
    const fetch = fetchReturning(nodes);

    // WHEN computing empty space for a 400x300 region
    const result = await suggestEmptySpace(400, 300, fetch);

    // THEN x is placed after rightmost edge + 80px gap: 0 + 205 + 80 = 285
    expect(result.x).toBe(285);
    expect(typeof result.y).toBe('number');
    expect(result.explanation).toContain('right');
  });

  it('uses the node width field when available instead of the default', async () => {
    /**
     * Verifies that find_empty_space uses node.width when present rather than
     * the 205px default, so explicitly-sized nodes are measured correctly.
     *
     * This matters because parent nodes that contain children have their width
     * stored in the DB. Using the default would underestimate the bounding box
     * and cause overlap with wide parent clusters.
     *
     * If this contract breaks, wide clusters are placed inside other clusters
     * rather than to the right of them.
     */
    // GIVEN a root node at x=100 with explicit width=500
    const nodes = [makeNode({ id: 'root-wide', title: 'Wide Node', x: 100, y: 0, width: 500 })];
    const fetch = fetchReturning(nodes);

    // WHEN computing empty space
    const result = await suggestEmptySpace(200, 200, fetch);

    // THEN x accounts for the explicit width: 100 + 500 + 80 = 680
    expect(result.x).toBe(680);
  });

  it('places below the bottom row when canvas would exceed 3000px wide', async () => {
    /**
     * Verifies that when placing to the right would push the canvas beyond
     * 3000px, find_empty_space falls back to placing below the bottom row.
     *
     * This matters because canvases with many root clusters would grow
     * infinitely wide, making navigation and readability impossible.
     *
     * If this contract breaks, the canvas grows without bound horizontally
     * and the user must scroll far to the right to see new content.
     */
    // GIVEN a root node far to the right (right edge at 3105, placing 400px would exceed 3000)
    const nodes = [makeNode({ id: 'root-far', title: 'Far Right', x: 2900, y: 0, width: 205 })];
    const fetch = fetchReturning(nodes);

    // WHEN computing empty space for a 400x300 region
    const result = await suggestEmptySpace(400, 300, fetch);

    // THEN y is placed below the bottom row and x resets to 100
    expect(result.explanation).toContain('below');
    expect(result.x).toBe(100);
  });

  it('ignores child nodes when computing the bounding box', async () => {
    /**
     * Verifies that find_empty_space only considers root nodes (parent_id IS NULL)
     * when computing the bounding box, not child nodes.
     *
     * This matters because child nodes use coordinates relative to their parent
     * in React Flow's subflow system. Including them in the absolute bounding
     * box calculation would produce incorrect (too large) bounding boxes.
     *
     * If this contract breaks, the empty space suggestion overshoots to the
     * right because child node relative positions inflate the bounding box.
     */
    // GIVEN a root node at x=0 and a child node with a large relative x
    const nodes = [
      makeNode({ id: 'root-2', title: 'Root', x: 0, y: 0 }),
      makeNode({ id: 'child-1', title: 'Child', x: 5000, y: 0, parent_id: 'root-2' }),
    ];
    const fetch = fetchReturning(nodes);

    // WHEN computing empty space
    const result = await suggestEmptySpace(200, 200, fetch);

    // THEN the child's large x is NOT included in the bounding box
    // root bounding box: x=0, width=205 → rightmost=205 → placement at 285
    expect(result.x).toBe(285);
  });

  it('aligns y to the topmost root node when placing to the right', async () => {
    /**
     * Verifies that when placing to the right, the y coordinate aligns with
     * the topmost root node rather than being 0 or arbitrary.
     *
     * This matters because root clusters may all be at y=200 to leave room
     * for a header or toolbar. A new cluster should align with them visually,
     * not drop to y=0.
     *
     * If this contract breaks, new clusters appear above or below the existing
     * row, making the canvas look disorganized.
     */
    // GIVEN two root nodes both positioned at y=200
    const nodes = [
      makeNode({ id: 'root-a', title: 'A', x: 0, y: 200 }),
      makeNode({ id: 'root-b', title: 'B', x: 300, y: 200 }),
    ];
    const fetch = fetchReturning(nodes);

    // WHEN computing empty space
    const result = await suggestEmptySpace(200, 200, fetch);

    // THEN y aligns to 200 (topmost y of existing roots)
    expect(result.y).toBe(200);
  });
});
