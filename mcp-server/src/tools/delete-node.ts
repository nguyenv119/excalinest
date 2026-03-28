import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { deleteNode } from '../canvas-api.js';

// ─── Handler (exported for testing) ─────────────────────────────────────────

export async function handleDeleteNode(input: { id: string }): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  try {
    await deleteNode(input.id);
    return {
      content: [{ type: 'text', text: `Node ${input.id} deleted successfully.` }],
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
    'delete_node',
    `Delete a node from the Knowledge Canvas by id.

The deletion cascades: all descendant nodes (children, grandchildren, etc.) and
all edges connected to those nodes are also deleted automatically by the server.

Returns a confirmation message string on success.
Returns isError: true if the node does not exist (404).

WARNING: This operation is destructive and irreversible. Deleting a parent node
will delete its entire subtree. Call get_canvas or search_nodes first to confirm
which node you intend to delete and that it has no children you want to keep.`,
    {
      id: z.string().describe('ID of the node to delete. All descendants and connected edges will also be deleted.'),
    },
    async ({ id }) => handleDeleteNode({ id }),
  );
}
