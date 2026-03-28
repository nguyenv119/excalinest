import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CanvasNode } from '../types.js';
import { createNode } from '../canvas-api.js';

// ─── Input schema (shared between handler and register) ──────────────────────

export const createNodeSchema = {
  title: z.string().describe('Node title (required). Keep it concise — this is the visible label.'),
  notes: z.string().optional().describe('Node body text / notes. Supports plain text.'),
  parent_id: z.string().optional().describe(
    'ID of the parent node. If provided, this node becomes a child of that parent. ' +
    "Child positions (x, y) are relative to the parent node's top-left corner.",
  ),
  x: z.number().optional().describe('Horizontal position. Relative to parent if parent_id is set, otherwise absolute canvas coordinates.'),
  y: z.number().optional().describe('Vertical position. Relative to parent if parent_id is set, otherwise absolute canvas coordinates.'),
  width: z.number().optional().describe('Node width in pixels.'),
  height: z.number().optional().describe('Node height in pixels.'),
  collapsed: z.number().min(0).max(1).optional().describe('0 = expanded (default), 1 = collapsed (hides children).'),
  bg_color: z.string().optional().describe('Background color as a CSS color string (e.g. "#ffffff", "hsl(210,100%,95%)").'),
  border_color: z.string().optional().describe('Border color as a CSS color string.'),
  font_color: z.string().optional().describe('Text color as a CSS color string.'),
  border_width: z.number().optional().describe('Border width in pixels.'),
  border_style: z.string().optional().describe('Border style (e.g. "solid", "dashed", "dotted").'),
  font_size: z.number().optional().describe('Font size in pixels.'),
};

// ─── Handler (exported for testing) ─────────────────────────────────────────

type CreateNodeInput = {
  title: string;
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
function toApiPayload(input: CreateNodeInput): Partial<CanvasNode> {
  const { collapsed, border_width, font_size, ...rest } = input;
  return {
    ...rest,
    ...(collapsed !== undefined && { collapsed: collapsed as 0 | 1 }),
    ...(border_width !== undefined && { border_width: String(border_width) }),
    ...(font_size !== undefined && { font_size: String(font_size) }),
  };
}

export async function handleCreateNode(input: CreateNodeInput): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  try {
    const node = await createNode(toApiPayload(input));
    return {
      content: [{ type: 'text', text: JSON.stringify(node, null, 2) }],
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
    'create_node',
    `Create a single node on the Knowledge Canvas.

Returns the created CanvasNode as JSON, including its server-assigned "id".
Save the returned id — you will need it for create_edge, update_node, and
delete_node calls that reference this node.

IMPORTANT: If you provide a parent_id, the x and y coordinates are relative to
the parent node's top-left corner, not the absolute canvas position.

Styling fields (bg_color, border_color, font_color, border_width, border_style,
font_size) are all optional. Omit them to use the canvas defaults.`,
    createNodeSchema,
    async (input) => handleCreateNode(input),
  );
}
