/**
 * Resolves whether bounties are enabled.
 *
 * Logic: project-level setting overrides workspace-level.
 * - Project `null` (or undefined) = inherit from workspace
 * - Project `true` = force ON regardless of workspace
 * - Project `false` = force OFF regardless of workspace
 */
export function resolveBounties(
  workspace: { enableBounties: boolean } | null | undefined,
  project: { enableBounties: boolean | null } | null | undefined,
): boolean {
  if (project?.enableBounties != null) {
    return project.enableBounties;
  }
  return workspace?.enableBounties ?? false;
}
