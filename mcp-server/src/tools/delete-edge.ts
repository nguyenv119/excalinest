import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { deleteEdge } from '../canvas-api.js';

// ─── Handler (exported for testing) ─────────────────────────────────────────

export async function handleDeleteEdge(input: { id: string }): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  try {
    await deleteEdge(input.id);
    return {
      content: [{ type: 'text', text: `Edge ${input.id} deleted successfully.` }],
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
    'delete_edge',
    `Delete an edge (connection) from the Knowledge Canvas by id.

Returns a confirmation message string on success.
Returns isError: true if the edge does not exist (404).

Use get_canvas to find edge ids — they appear in the "edges" array of the
hierarchical view returned by get_canvas.`,
    {
      id: z.string().describe('ID of the edge to delete.'),
    },
    async ({ id }) => handleDeleteEdge({ id }),
  );
}
