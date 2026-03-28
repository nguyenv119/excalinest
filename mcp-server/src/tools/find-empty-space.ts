import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getNodes } from '../canvas-api.js';
import { LEAF_W, LEAF_H } from '../layout.js';
import type { CanvasNode } from '../types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Return value of suggestEmptySpace — coordinates plus a human explanation. */
export interface EmptySpaceSuggestion {
  x: number;
  y: number;
  explanation: string;
}

/** The maximum canvas width before switching to vertical placement. */
const MAX_CANVAS_WIDTH = 3000;

/** Gap in pixels to leave between the rightmost existing cluster and the new one. */
const PLACEMENT_GAP = 80;

// ─── Core logic (exported for testing) ──────────────────────────────────────

/**
 * Computes a suggested (x, y) position for placing a new region of the given
 * width and height on the canvas, avoiding overlap with existing root nodes.
 *
 * @param width  The width of the region to be placed.
 * @param height The height of the region to be placed.
 * @param fetchNodes  Optional override for fetching nodes (for testing).
 */
export async function suggestEmptySpace(
  width: number,
  height: number,
  fetchNodes: () => Promise<CanvasNode[]> = getNodes,
): Promise<EmptySpaceSuggestion> {
  const allNodes = await fetchNodes();
  const roots = allNodes.filter((n) => n.parent_id === null);

  if (roots.length === 0) {
    return {
      x: 100,
      y: 100,
      explanation: 'Canvas is empty — placing at default starting position (100, 100).',
    };
  }

  // Compute bounding box of all root nodes
  let rightmost = -Infinity;
  let bottom = -Infinity;

  for (const node of roots) {
    const nodeWidth = node.width ?? LEAF_W;
    const nodeHeight = node.height ?? LEAF_H;
    const rightEdge = node.x + nodeWidth;
    const bottomEdge = node.y + nodeHeight;
    if (rightEdge > rightmost) rightmost = rightEdge;
    if (bottomEdge > bottom) bottom = bottomEdge;
  }

  // Candidate: place to the right
  const candidateX = rightmost + PLACEMENT_GAP;

  if (candidateX + width <= MAX_CANVAS_WIDTH) {
    // Find the minimum y among roots to align vertically
    const topmost = Math.min(...roots.map((n) => n.y));
    return {
      x: Math.round(candidateX),
      y: Math.round(topmost),
      explanation: `Placing to the right of existing clusters at x=${Math.round(candidateX)}, y=${Math.round(topmost)} (${PLACEMENT_GAP}px gap from rightmost node edge at x=${Math.round(rightmost)}).`,
    };
  }

  // Fallback: place below the bottom row
  const belowY = bottom + PLACEMENT_GAP;
  return {
    x: 100,
    y: Math.round(belowY),
    explanation: `Canvas would exceed ${MAX_CANVAS_WIDTH}px wide — placing below existing clusters at x=100, y=${Math.round(belowY)} (${PLACEMENT_GAP}px gap from bottom edge at y=${Math.round(bottom)}).`,
  };
}

// ─── MCP tool registration ───────────────────────────────────────────────────

export function register(server: McpServer): void {
  server.tool(
    'find_empty_space',
    'Find an empty area on the canvas to place a new cluster without overlapping existing content. Returns (x, y) coordinates and a human-readable explanation.',
    {
      width: z.number().describe('Width of the region to place (in pixels)'),
      height: z.number().describe('Height of the region to place (in pixels)'),
    },
    async ({ width, height }: { width: number; height: number }) => {
      try {
        const suggestion = await suggestEmptySpace(width, height);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ x: suggestion.x, y: suggestion.y }) + '\n\n' + suggestion.explanation,
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
