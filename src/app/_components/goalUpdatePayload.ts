/**
 * Builds the `goal.updateGoal` payload for the edit form.
 *
 * `updateGoal` is a partial update: a key it receives is written, a key it
 * doesn't is left alone, and an explicit `null` clears. That makes "which keys
 * do we send?" the whole safety question, so it lives here rather than inline in
 * the modal — it is the logic behind an incident, and it deserves a test.
 *
 * The rule: a field is only claimed when the caller's `goal` object actually
 * carried it. Callers hand-build that object and most omit something, so an
 * absent field means the form never learned its value — its state seeded to
 * `null`/`[]`, and sending that would read as "clear it". That is precisely how
 * a goal gets pushed out of its workspace by someone who only renamed it.
 * A `null` that IS present in the prop is a real value and still sends.
 */

/** The subset of the goal the edit form is given. Optional keys may be absent. */
export interface EditableGoal {
  id: number;
  status?: string;
  parentGoalId?: number | null;
  outcomes?: { id: string }[];
  workspaceId?: string | null;
  driUserId?: string | null;
}

/** Current form state, already normalised by the modal's inputs. */
export interface GoalEditFormState {
  title: string;
  description: string;
  whyThisGoal: string;
  notes: string;
  dueDate: Date | null;
  period: string | null;
  status: string | null;
  lifeDomainId: number | null;
  selectedProjectId: string | undefined;
  driUserId: string | null;
  selectedOutcomeIds: string[];
  selectedWorkspaceId: string | null;
  /** The parent picker holds a string; the API wants a number. */
  parentGoalId: string | null;
}

export interface GoalUpdatePayload {
  id: number;
  title: string;
  description: string | null;
  whyThisGoal: string | null;
  notes: string | null;
  dueDate: Date | null;
  period: string | null;
  status?: "planned" | "active" | "completed" | "archived";
  lifeDomainId: number | null;
  projectId?: string;
  driUserId?: string;
  outcomeIds?: string[];
  workspaceId?: string | null;
  parentGoalId?: number | null;
}

export function buildGoalUpdatePayload(
  goal: EditableGoal,
  form: GoalEditFormState,
): GoalUpdatePayload {
  return {
    id: goal.id,
    title: form.title,
    description: form.description || null,
    whyThisGoal: form.whyThisGoal || null,
    notes: form.notes || null,
    dueDate: form.dueDate ?? null,
    period: form.period ?? null,
    status:
      (form.status as "planned" | "active" | "completed" | "archived") ??
      undefined,
    lifeDomainId: form.lifeDomainId ?? null,
    // Seeded from the caller's project prop, never from the goal, so an unset
    // value means "leave the links alone" rather than "unlink everything".
    projectId: form.selectedProjectId,
    driUserId: form.driUserId ?? undefined,
    ...(goal.outcomes !== undefined
      ? { outcomeIds: form.selectedOutcomeIds }
      : {}),
    ...(goal.workspaceId !== undefined
      ? { workspaceId: form.selectedWorkspaceId ?? null }
      : {}),
    ...(goal.parentGoalId !== undefined
      ? { parentGoalId: form.parentGoalId ? Number(form.parentGoalId) : null }
      : {}),
  };
}
