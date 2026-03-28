import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getNodes } from '../canvas-api.js';

// ─── Handler (exported for testing) ─────────────────────────────────────────

export async function handleSearchNodes(input: { query: string }): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  try {
    const nodes = await getNodes();
    const q = input.query.toLowerCase();
    const matches = nodes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        (n.notes ?? '').toLowerCase().includes(q),
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }],
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
    'search_nodes',
    `Search for canvas nodes whose title or notes contain the given query string (case-insensitive).

Returns an array of matching CanvasNode objects as JSON. Returns an empty array
if no nodes match — never throws on an empty result.

Use this tool to locate a specific node before updating or deleting it, or to
explore what nodes exist on a topic. The search checks both the node title and
its full notes content.`,
    { query: z.string().describe('Search query. Matched case-insensitively against node title and notes.') },
    async ({ query }) => handleSearchNodes({ query }),
  );
}
