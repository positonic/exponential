/**
 * RFC 9728 protected-resource metadata for the hosted MCP endpoint (hosted MCP
 * Agent PRD, D9). Served here and at `…/oauth-protected-resource/api/mcp`, the
 * path-suffixed location the 401 challenge points at. 404 while
 * `MCP_OAUTH_MODE` is off.
 */

import { publicJson, publicPreflight, whenOAuthEnabled } from "~/server/mcp/oauth/http";
import { protectedResourceMetadata } from "~/server/mcp/oauth/metadata";

// Built from runtime env (the mode and the install's address), so never prerendered.
export const dynamic = "force-dynamic";

export const GET = whenOAuthEnabled(() => publicJson(protectedResourceMetadata()));
export const OPTIONS = whenOAuthEnabled(() => publicPreflight("GET"));
