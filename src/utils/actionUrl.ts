/**
 * Generate a deep link URL for an action.
 *
 * If the action belongs to a project in a workspace, returns:
 *   /w/[workspaceSlug]/actions?actionId=[actionId]
 *
 * Otherwise falls back to the legacy route:
 *   /actions?actionId=[actionId]
 */
export function getActionUrl(
  actionId: string,
  workspace?: { slug: string } | null,
): string {
  if (workspace?.slug) {
    return `/w/${workspace.slug}/actions?actionId=${actionId}`;
  }
  return `/actions?actionId=${actionId}`;
}
