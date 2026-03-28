import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as findEmptySpace from "./tools/find-empty-space.js";
import * as getColorPalette from "./tools/get-color-palette.js";
import { register as registerGetCanvas } from "./tools/get-canvas.js";
import { register as registerSearchNodes } from "./tools/search-nodes.js";
import { register as registerCreateNode } from "./tools/create-node.js";
import { register as registerCreateNodes } from "./tools/create-nodes.js";
import { register as registerUpdateNode } from "./tools/update-node.js";
import { register as registerDeleteNode } from "./tools/delete-node.js";
import { register as registerCreateEdge } from "./tools/create-edge.js";
import { register as registerDeleteEdge } from "./tools/delete-edge.js";

const server = new McpServer({
  name: "knowledge-canvas",
  version: "1.0.0",
});

findEmptySpace.register(server);
getColorPalette.register(server);
registerGetCanvas(server);
registerSearchNodes(server);
registerCreateNode(server);
registerCreateNodes(server);
registerUpdateNode(server);
registerDeleteNode(server);
registerCreateEdge(server);
registerDeleteEdge(server);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("Knowledge Canvas MCP server running on stdio");
