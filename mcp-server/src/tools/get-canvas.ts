import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CanvasNode } from '../types.js';
import { getNodes, getEdges } from '../canvas-api.js';

// ─── Handler (exported for testing) ─────────────────────────────────────────

interface NodeWithChildren extends CanvasNode {
  children: NodeWithChildren[];
}

/** Build a hierarchical view from a flat nodes array + edges. */
export async function handleGetCanvas(): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  try {
    const [nodes, edges] = await Promise.all([getNodes(), getEdges()]);

    // Build childMap: parent_id → child nodes
    const childMap = new Map<string, CanvasNode[]>();
    for (const node of nodes) {
      if (node.parent_id !== null) {
        const siblings = childMap.get(node.parent_id) ?? [];
        siblings.push(node);
        childMap.set(node.parent_id, siblings);
      }
    }

    // Recursively nest children under their parent
    function nestChildren(node: CanvasNode): NodeWithChildren {
      const children = (childMap.get(node.id) ?? []).map(nestChildren);
      return { ...node, children };
    }

    // Roots are nodes with no parent_id
    const roots = nodes
      .filter((n) => n.parent_id === null)
      .map(nestChildren);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ roots, edges }, null, 2),
        },
      ],
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
    'get_canvas',
    `Return a hierarchical view of the entire Knowledge Canvas.

Fetches all nodes and edges from the canvas API and returns a JSON object with:
- "roots": array of top-level nodes (parent_id === null), each with a nested
  "children" array containing their direct children (also with nested children).
  Child node positions (x, y) are relative to their parent node.
- "edges": array of all edges (connections between nodes), each with source_id
  and target_id.

Use this tool to understand the current state of the canvas before making changes.
The hierarchy mirrors the visual layout: root nodes are top-level concepts,
children are sub-topics nested within their parent.`,
    {},
    async () => handleGetCanvas(),
  );
}
