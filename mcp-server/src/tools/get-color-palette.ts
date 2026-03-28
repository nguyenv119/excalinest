import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getNodes } from '../canvas-api.js';
import { COLOR_FAMILIES } from '../colors.js';
import type { CanvasNode } from '../types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single color family entry in the palette response. */
export interface PaletteEntry {
  name: string;
  parent_bg: string;
  child_bg: string;
  border: string;
  font: string;
  in_use: boolean;
  used_by: string[];
}

// ─── Core logic (exported for testing) ──────────────────────────────────────

/**
 * Computes the full color palette with usage information derived from the
 * current canvas nodes.
 *
 * For each COLOR_FAMILY, checks whether its border color appears in any root
 * node's border_color field (case-insensitive). If so, marks it as in_use
 * and lists the root node titles that use it.
 *
 * Only root nodes (parent_id === null) are considered domain owners of a
 * color family — child nodes inherit their parent's color and are not listed.
 *
 * @param fetchNodes  Optional override for fetching nodes (for testing).
 */
export async function computeColorPalette(
  fetchNodes: () => Promise<CanvasNode[]> = getNodes,
): Promise<PaletteEntry[]> {
  const allNodes = await fetchNodes();
  const roots = allNodes.filter((n) => n.parent_id === null);

  // Build a map from lowercase border_color → array of root node titles
  const colorToTitles = new Map<string, string[]>();
  for (const node of roots) {
    if (node.border_color) {
      const key = node.border_color.toLowerCase();
      const existing = colorToTitles.get(key) ?? [];
      existing.push(node.title);
      colorToTitles.set(key, existing);
    }
  }

  return COLOR_FAMILIES.map((family) => {
    const key = family.border.toLowerCase();
    const titles = colorToTitles.get(key) ?? [];
    return {
      name: family.name,
      parent_bg: family.parent_bg,
      child_bg: family.child_bg,
      border: family.border,
      font: family.font,
      in_use: titles.length > 0,
      used_by: titles,
    };
  });
}

// ─── MCP tool registration ───────────────────────────────────────────────────

export function register(server: McpServer): void {
  server.tool(
    'get_color_palette',
    'Get the full color palette for the canvas, showing which color families are already in use and which root node clusters own them. Use this before assigning colors to new clusters.',
    {},
    async () => {
      try {
        const palette = await computeColorPalette();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(palette, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: message }],
          isError: true,
        };
      }
    },
  );
}
