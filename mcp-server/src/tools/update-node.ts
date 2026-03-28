import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CanvasNode } from '../types.js';
import { updateNode } from '../canvas-api.js';

// ─── Handler (exported for testing) ─────────────────────────────────────────

type UpdateNodeInput = {
  id: string;
  title?: string;
  notes?: string;
  parent_id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  collapsed?: number;
  bg_color?: string;
  border_color?: string;
  font_color?: string;
  border_width?: number;
  border_style?: string;
  font_size?: number;
};

/**
 * Converts tool input to the shape expected by CanvasNode.
 * border_width and font_size are stored as strings in the DB but accepted
 * as numbers from the MCP tool for ergonomic AI usage.
 */
function toApiPatch(input: Omit<UpdateNodeInput, 'id'>): Partial<CanvasNode> {
  const { collapsed, border_width, font_size, ...rest } = input;
  return {
    ...rest,
    ...(collapsed !== undefined && { collapsed: collapsed as 0 | 1 }),
    ...(border_width !== undefined && { border_width: String(border_width) }),
    ...(font_size !== undefined && { font_size: String(font_size) }),
  };
}

export async function handleUpdateNode(input: UpdateNodeInput): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  const { id, ...rest } = input;
  try {
    const updated = await updateNode(id, toApiPatch(rest));
    return {
      content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return {
      content: [{ type: 'text', text: error.message }],
      isError: true,
    };
  }
}

// ─── Register ────────────────────────────────────────────────────────────────

export function register(server: McpServer): void {
  server.tool(
    'update_node',
    `Partially update an existing canvas node by id.

Only the fields you provide are changed — all other fields retain their current
values. Returns the complete updated CanvasNode as JSON.

Use this tool to rename a node (title), edit its notes, reposition it (x, y),
resize it (width, height), collapse/expand it (collapsed: 0|1), or restyle it
(bg_color, border_color, font_color, border_width, border_style, font_size).

Returns isError: true with a message containing "404" if the node id does not
exist. Always call get_canvas or search_nodes first to confirm the node id.

NOTE: child node positions (x, y) are relative to their parent's top-left corner.`,
    {
      id: z.string().describe('ID of the node to update.'),
      title: z.string().optional().describe('New title.'),
      notes: z.string().optional().describe('New notes / body text.'),
      parent_id: z.string().optional().describe('Reparent this node under a different parent. Child position becomes relative to the new parent.'),
      x: z.number().optional().describe('New horizontal position.'),
      y: z.number().optional().describe('New vertical position.'),
      width: z.number().optional().describe('New width in pixels.'),
      height: z.number().optional().describe('New height in pixels.'),
      collapsed: z.number().min(0).max(1).optional().describe('0 = expand, 1 = collapse.'),
      bg_color: z.string().optional().describe('Background color (CSS color string).'),
      border_color: z.string().optional().describe('Border color (CSS color string).'),
      font_color: z.string().optional().describe('Text color (CSS color string).'),
      border_width: z.number().optional().describe('Border width in pixels.'),
      border_style: z.string().optional().describe('Border style (e.g. "solid", "dashed").'),
      font_size: z.number().optional().describe('Font size in pixels.'),
    },
    async (input) => handleUpdateNode(input),
  );
}
