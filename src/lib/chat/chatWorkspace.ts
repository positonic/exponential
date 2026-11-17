/**
 * Which workspace a chat turn is scoped to.
 *
 * Three sources, in order:
 *  1. a workspace the person picked themselves (the drawer's switcher), or one
 *     the embedding surface passed deliberately;
 *  2. the workspace the page on screen says it belongs to (its page context);
 *  3. the WorkspaceProvider's value.
 *
 * (3) is the URL's workspace on `/w/<slug>/...` routes, where it always equals
 * (2). On a route with no slug, such as `/recording/<id>`, it is only the
 * person's DEFAULT workspace: a guess. Sent as the chat's scope, that guess
 * made the agent's meeting tools look in the wrong workspace for a meeting
 * that was open on screen. So the page outranks the provider, and only a
 * deliberate choice outranks the page. Every chat surface resolves through
 * here so they cannot disagree.
 */

/** The workspace id a page declared in its page context, if any. */
export function pageContextWorkspaceId(
  pageContext: { data?: Record<string, unknown> } | null | undefined,
): string | undefined {
  const value = pageContext?.data?.workspaceId;
  return typeof value === 'string' && value ? value : undefined;
}

export function resolveChatWorkspaceId(sources: {
  /** A deliberate choice: the person's pick, or an embedding surface's prop. */
  explicit?: string | null;
  pageContext?: { data?: Record<string, unknown> } | null;
  /** The WorkspaceProvider's workspace (URL slug, else the default). */
  provider?: string | null;
}): string | undefined {
  return (
    sources.explicit ??
    pageContextWorkspaceId(sources.pageContext) ??
    sources.provider ??
    undefined
  );
}
