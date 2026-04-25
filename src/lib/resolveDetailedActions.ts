/**
 * Resolves whether detailed action pages are enabled.
 *
 * Logic: project-level setting overrides workspace-level.
 * - Project `null` (or undefined) = inherit from workspace
 * - Project `true` = force ON regardless of workspace
 * - Project `false` = force OFF regardless of workspace
 */
export function resolveDetailedActions(
  workspace: { enableDetailedActions: boolean } | null | undefined,
  project: { enableDetailedActions: boolean | null } | null | undefined,
): boolean {
  if (project?.enableDetailedActions != null) {
    return project.enableDetailedActions;
  }
  return workspace?.enableDetailedActions ?? false;
}
