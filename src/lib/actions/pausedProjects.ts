import type { ProjectStatus } from "~/types/project";

/**
 * Project statuses that take a project's actions off the person's plate.
 * Putting a project On hold says "not now"; Completed and Cancelled say "not
 * ever". Either way its still-ACTIVE actions leave Today's actions (overdue,
 * today and upcoming), every count of them, and the digests built on them,
 * until the project is set back to Active. The project's own page and kanban
 * still list them: that is where you go to resume the work.
 *
 * A deny-list rather than "status is ACTIVE", so a project carrying some
 * status this list doesn't name keeps its actions visible, as before.
 */
export const PAUSED_PROJECT_STATUSES: readonly ProjectStatus[] = [
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
];

/** An action row with its project's status loaded, when it has a project. */
export interface ActionWithProjectStatus {
  project?: { status?: string | null } | null;
}

/**
 * True when the action's project is paused. Project-less actions never are.
 * Client-side twin of `notInPausedProjectWhere`
 * (`~/server/services/actions/myActionsWhere`), for an already-loaded list
 * such as `action.getAll`'s.
 */
export function isInPausedProject(action: ActionWithProjectStatus): boolean {
  const status = action.project?.status;
  if (!status) return false;
  return (PAUSED_PROJECT_STATUSES as readonly string[]).includes(status);
}

/** The actions that are still on the person's plate: none in a paused project. */
export function withoutPausedProjects<T extends ActionWithProjectStatus>(
  actions: readonly T[],
): T[] {
  return actions.filter((a) => !isInPausedProject(a));
}
