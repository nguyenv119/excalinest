import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as findEmptySpace from "./tools/find-empty-space.js";
import * as getColorPalette from "./tools/get-color-palette.js";

const server = new McpServer({
  name: "knowledge-canvas",
  version: "1.0.0",
});

findEmptySpace.register(server);
getColorPalette.register(server);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("Knowledge Canvas MCP server running on stdio");
