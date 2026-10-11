/**
 * Agent guidance: the one place the method and scoped context are computed
 * for every agent surface (in-app agents, MCP, CLI, SDK), served through the
 * `agentGuidance` tRPC router (D-0010). Delivering guidance enforces nothing;
 * see ADR-0071.
 */
export {
  getMethod,
  METHOD_CANONICAL_PATH,
  METHOD_CANONICAL_REPO,
  type GetMethodOptions,
  type MethodDocument,
  type MethodPayload,
} from "./method";
export {
  canPreviewDraftMethod,
  DEFAULT_METHOD_PREVIEW_WORKSPACE_SLUGS,
  parseMethodPreviewSlugs,
} from "./preview";
