import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createEdge } from '../canvas-api.js';

// ─── Handler (exported for testing) ─────────────────────────────────────────

type CreateEdgeInput = {
  source_id: string;
  target_id: string;
  label?: string;
};

export async function handleCreateEdge(input: CreateEdgeInput): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  try {
    const edge = await createEdge(input);
    return {
      content: [{ type: 'text', text: JSON.stringify(edge, null, 2) }],
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
    'create_edge',
    `Create a directed edge (connection) between two existing canvas nodes.

Returns the created CanvasEdge as JSON, including its server-assigned "id".
Save the returned id if you need to delete this edge later with delete_edge.

Both source_id and target_id must refer to existing nodes — the server returns
an error (422) if either node does not exist.

Use this tool to visually link nodes that have a relationship (e.g., "depends on",
"leads to", "is a type of"). Edges are distinct from parent-child hierarchy —
parent-child relationships are set via the parent_id field on a node, while edges
represent arbitrary connections drawn between any two nodes.`,
    {
      source_id: z.string().describe('ID of the source node (edge starts here).'),
      target_id: z.string().describe('ID of the target node (edge ends here).'),
      label: z.string().optional().describe('Optional text label displayed on the edge.'),
    },
    async (input) => handleCreateEdge(input),
  );
}
