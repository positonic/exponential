/**
 * Serve one MCP request over stateless Streamable HTTP (MCP 2025-11-25): a
 * fresh `Server` and transport per request, no session ID, and a JSON
 * response rather than an SSE stream. Any instance can serve any request.
 *
 * The tools are the registry the stdio `exponential-mcp` package serves,
 * imported from `exponential-mcp/tools`, so the two can't drift. No run
 * context is passed: the hosted endpoint never serves an Agent run, so the run
 * tools are neither listed nor callable.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ExponentialClient } from "exponential-sdk";
import { callTool, listTools } from "exponential-mcp/tools";
import mcpPackage from "exponential-mcp/package.json";

export const MCP_SERVER_INFO = { name: "exponential", version: mcpPackage.version };

export async function serveMcpRequest(req: Request, client: ExponentialClient): Promise<Response> {
  const server = new Server(MCP_SERVER_INFO, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: listTools() }));
  server.setRequestHandler(CallToolRequestSchema, (request) =>
    callTool(client, request.params.name, request.params.arguments),
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    // In JSON-response mode this resolves once every response is written.
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}
