import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CanvasNode } from '../types.js';
import { createNodesBulk } from '../canvas-api.js';

// ─── Handler (exported for testing) ─────────────────────────────────────────

type BulkNode = {
  id: string;
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
 * Converts a BulkNode tool input to the shape expected by createNodesBulk.
 * border_width and font_size are stored as strings in the DB but accepted
 * as numbers from the MCP tool for ergonomic AI usage.
 */
function toApiNode(node: BulkNode): Partial<CanvasNode> & { id: string; title: string } {
  const { collapsed, border_width, font_size, ...rest } = node;
  return {
    ...rest,
    ...(collapsed !== undefined && { collapsed: collapsed as 0 | 1 }),
    ...(border_width !== undefined && { border_width: String(border_width) }),
    ...(font_size !== undefined && { font_size: String(font_size) }),
  };
}

export async function handleCreateNodes(input: { nodes: BulkNode[] }): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  try {
    const created = await createNodesBulk(input.nodes.map(toApiNode));
    return {
      content: [{ type: 'text', text: JSON.stringify(created, null, 2) }],
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

const nodeItemSchema = z.object({
  id: z.string().describe('Client-supplied UUID for this node. Use uuidv7() or any unique string. Must be unique across all nodes.'),
  title: z.string().describe('Node title.'),
  notes: z.string().optional().describe('Node body text / notes.'),
  parent_id: z.string().optional().describe(
    'ID of the parent node. IMPORTANT: The parent node must appear earlier in the array than its children.',
  ),
  x: z.number().optional().describe('Horizontal position. Relative to parent if parent_id is set.'),
  y: z.number().optional().describe('Vertical position. Relative to parent if parent_id is set.'),
  width: z.number().optional().describe('Node width in pixels.'),
  height: z.number().optional().describe('Node height in pixels.'),
  collapsed: z.number().min(0).max(1).optional().describe('0 = expanded (default), 1 = collapsed.'),
  bg_color: z.string().optional(),
  border_color: z.string().optional(),
  font_color: z.string().optional(),
  border_width: z.number().optional(),
  border_style: z.string().optional(),
  font_size: z.number().optional(),
});

export function register(server: McpServer): void {
  server.tool(
    'create_nodes',
    `Atomically create multiple nodes on the Knowledge Canvas in a single request.

Returns an array of all created CanvasNode objects as JSON, each including its id.

Use this tool when building a subtree or populating multiple nodes at once — it
is more efficient than calling create_node repeatedly and guarantees atomicity
(all nodes are created or none are).

IMPORTANT ORDERING: Parent nodes must appear before their children in the array,
because the server processes nodes in order and a child's parent_id must already
exist when the child is inserted.

Each node requires a client-supplied "id" — generate a UUID (e.g. uuidv7) for
each node before calling this tool. Child positions (x, y) are relative to the
parent node's top-left corner when parent_id is set.`,
    { nodes: z.array(nodeItemSchema).describe('Array of nodes to create. Parents must precede children.') },
    async ({ nodes }) => handleCreateNodes({ nodes }),
  );
}
