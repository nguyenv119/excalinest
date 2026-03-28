/**
 * Unit tests for the computeColorPalette function in get-color-palette.ts.
 *
 * The function accepts a fetchNodes override for dependency injection, so
 * these tests pass a plain async function that returns controlled node lists.
 * This avoids the overhead of a real HTTP server while still testing the
 * real production logic.
 *
 * Why not a real server: computeColorPalette is a pure computation over a
 * list of nodes — it maps COLOR_FAMILIES against node border_color values.
 * Using a real server would add networking/DB overhead without testing any
 * additional code paths. The default getNodes() is already integration-tested
 * in canvas-api.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { computeColorPalette } from './get-color-palette.js';
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

// ─── computeColorPalette ─────────────────────────────────────────────────────

describe('computeColorPalette', () => {
  it('returns all 15 color families with in_use=false when canvas is empty', async () => {
    /**
     * Verifies that computeColorPalette returns all 15 COLOR_FAMILIES even on
     * an empty canvas, with each family marked as not in use.
     *
     * This matters because the organize-canvas skill calls get_color_palette
     * to pick an unused family for a new cluster. If families are missing from
     * the response, the skill cannot make an informed color choice.
     *
     * If this contract breaks, the LLM sees a partial palette and may pick a
     * color that is already in use on the canvas.
     */
    // GIVEN an empty canvas
    const fetch = fetchReturning([]);

    // WHEN computing the color palette
    const palette = await computeColorPalette(fetch);

    // THEN all 15 families are present and none are in use
    expect(palette).toHaveLength(15);
    expect(palette.every((f) => f.in_use === false)).toBe(true);
    expect(palette.every((f) => f.used_by.length === 0)).toBe(true);
  });

  it('returns the correct family names for all 15 entries', async () => {
    /**
     * Verifies that the palette entries have the exact family names defined
     * in COLOR_FAMILIES, in the correct order.
     *
     * This matters because the organize-canvas skill matches by family name
     * when looking up a color family to apply. Wrong names or missing entries
     * would cause the skill to fail to find the right color data.
     *
     * If this contract breaks, the skill picks incorrect hex values for colors,
     * resulting in off-brand or clashing node styles on the canvas.
     */
    // GIVEN an empty canvas
    const fetch = fetchReturning([]);

    // WHEN computing the color palette
    const palette = await computeColorPalette(fetch);

    // THEN the 15 family names match COLOR_FAMILIES exactly
    const names = palette.map((f) => f.name);
    expect(names).toEqual([
      'Indigo', 'Purple', 'Teal', 'Amber', 'Rose',
      'Green', 'Cyan', 'Slate', 'Orange', 'Blue',
      'Gold', 'Emerald', 'Fuchsia', 'Sky', 'Warm',
    ]);
  });

  it('marks a color family as in_use and lists the root node title', async () => {
    /**
     * Verifies that when a root node uses a known family's border_color, the
     * corresponding palette entry has in_use=true and used_by contains that
     * root node's title.
     *
     * This matters because the organize-canvas skill must avoid reusing a color
     * family already assigned to a different domain cluster. Without accurate
     * in_use tracking, the skill would assign the same color to two clusters,
     * making the canvas visually ambiguous.
     *
     * If this contract breaks, two domain clusters share a color family and the
     * user cannot visually distinguish them.
     */
    // GIVEN a root node with Indigo border_color (#6366F1)
    const nodes = [makeNode({ id: 'root-1', title: 'Cloud Services', border_color: '#6366F1' })];
    const fetch = fetchReturning(nodes);

    // WHEN computing the color palette
    const palette = await computeColorPalette(fetch);

    // THEN Indigo is marked in_use with the root node's title
    const indigo = palette.find((f) => f.name === 'Indigo');
    expect(indigo).toBeDefined();
    expect(indigo!.in_use).toBe(true);
    expect(indigo!.used_by).toContain('Cloud Services');
  });

  it('is case-insensitive when matching border_color values', async () => {
    /**
     * Verifies that border_color matching ignores case, so '#6366f1' and
     * '#6366F1' both match the Indigo family.
     *
     * This matters because users or the LLM may store colors in lowercase even
     * if COLOR_FAMILIES defines them in uppercase. A case-sensitive comparison
     * would incorrectly show the family as unused even when it's taken.
     *
     * If this contract breaks, the organize-canvas skill picks a "free" family
     * that is actually in use, causing color conflicts.
     */
    // GIVEN a root node with lowercase Indigo border_color
    const nodes = [makeNode({ id: 'root-2', title: 'Storage', border_color: '#6366f1' })];
    const fetch = fetchReturning(nodes);

    // WHEN computing the color palette
    const palette = await computeColorPalette(fetch);

    // THEN Indigo is still detected as in_use
    const indigo = palette.find((f) => f.name === 'Indigo');
    expect(indigo!.in_use).toBe(true);
    expect(indigo!.used_by).toContain('Storage');
  });

  it('does not list child node titles in used_by — only root nodes', async () => {
    /**
     * Verifies that used_by only contains root node titles, not child node
     * titles, even if a child node uses a known family's border_color.
     *
     * This matters because the organize-canvas skill determines which domain
     * clusters (root nodes) use which color family. Child nodes inherit colors
     * from their parent cluster and are not domain owners.
     *
     * If this contract breaks, the used_by list includes child node titles,
     * polluting the color usage report and making it harder for the LLM to
     * identify which top-level domains own each color family.
     */
    // GIVEN a root node (no color) and a child with Teal border_color
    const nodes = [
      makeNode({ id: 'root-plain', title: 'Plain Root', border_color: null }),
      makeNode({ id: 'child-teal', title: 'Teal Child', border_color: '#0D9488', parent_id: 'root-plain' }),
    ];
    const fetch = fetchReturning(nodes);

    // WHEN computing the color palette
    const palette = await computeColorPalette(fetch);

    // THEN Teal is NOT in_use (only root nodes are checked)
    const teal = palette.find((f) => f.name === 'Teal');
    expect(teal!.in_use).toBe(false);
    expect(teal!.used_by).toHaveLength(0);
  });

  it('includes border_color and font hex values in each palette entry', async () => {
    /**
     * Verifies that each palette entry includes the border and font hex color
     * strings from COLOR_FAMILIES so callers can apply them without importing
     * colors.ts separately.
     *
     * This matters because the organize-canvas skill reads the palette response
     * to style nodes. If the hex values are missing, the skill must maintain a
     * duplicate copy of the color table.
     *
     * If this contract breaks, the MCP tool response is incomplete and the
     * organize-canvas skill cannot apply colors without a separate lookup.
     */
    // GIVEN an empty canvas
    const fetch = fetchReturning([]);

    // WHEN computing the color palette
    const palette = await computeColorPalette(fetch);

    // THEN each entry includes border and font hex values
    const indigo = palette.find((f) => f.name === 'Indigo');
    expect(indigo!.border).toBe('#6366F1');
    expect(indigo!.font).toBe('#312E81');
    expect(indigo!.parent_bg).toBe('#ECEFFE');
    expect(indigo!.child_bg).toBe('#F6F7FF');
  });

  it('lists multiple root node titles when several roots share the same color family', async () => {
    /**
     * Verifies that used_by contains all root node titles that share a color
     * family, not just the first one found.
     *
     * This matters because the organize-canvas skill may need to warn the user
     * that a color family is overloaded (used by multiple clusters), helping
     * them decide whether to reassign colors.
     *
     * If this contract breaks, only the first root node is reported, hiding
     * the full extent of color reuse from the LLM.
     */
    // GIVEN two root nodes both using the Blue border color
    const nodes = [
      makeNode({ id: 'root-x', title: 'Networking', border_color: '#2563EB' }),
      makeNode({ id: 'root-y', title: 'Security', border_color: '#2563EB' }),
    ];
    const fetch = fetchReturning(nodes);

    // WHEN computing the color palette
    const palette = await computeColorPalette(fetch);

    // THEN Blue lists both titles
    const blue = palette.find((f) => f.name === 'Blue');
    expect(blue!.in_use).toBe(true);
    expect(blue!.used_by).toContain('Networking');
    expect(blue!.used_by).toContain('Security');
    expect(blue!.used_by).toHaveLength(2);
  });
});
