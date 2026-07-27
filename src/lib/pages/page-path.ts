/**
 * In-app path to a Knowledge Page editor. The single source of truth for the
 * `pageLink` node's `href` (both the `/page` slash command and duplicate-with-
 * sub-pages build it here, ADR-0039) and any other link into the pages surface.
 */
export function buildPageEditorPath(
  workspaceSlug: string,
  pageId: string,
): string {
  return `/w/${workspaceSlug}/pages/${pageId}`;
}
