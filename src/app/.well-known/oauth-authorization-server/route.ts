/**
 * RFC 8414 authorization-server metadata: the app is its own authorization
 * server for MCP clients (hosted MCP Agent PRD, D9). 404 while
 * `MCP_OAUTH_MODE` is off.
 */

import { publicJson, publicPreflight, whenOAuthEnabled } from "~/server/mcp/oauth/http";
import { authorizationServerMetadata } from "~/server/mcp/oauth/metadata";

// Built from runtime env (the mode and the install's address), so never prerendered.
export const dynamic = "force-dynamic";

export const GET = whenOAuthEnabled(() => publicJson(authorizationServerMetadata()));
export const OPTIONS = whenOAuthEnabled(() => publicPreflight("GET"));
