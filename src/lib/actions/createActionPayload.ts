import type { RouterInputs } from "~/trpc/react";
import type { Priority } from "~/types/priority";

/** The one request every create-action surface sends. */
export type CreateActionPayload = RouterInputs["action"]["create"];

/**
 * What a create-action form holds when the user submits. Nullable where the
 * form state is nullable; the payload builder turns "not set" into "absent"
 * so the server's defaults apply and nothing is sent as `null`.
 */
export interface CreateActionFormValues {
  name: string;
  description?: string;
  projectId?: string | null;
  workspaceId?: string | null;
  priority?: Priority;
  status?: CreateActionPayload["status"];
  dueDate?: Date | null;
  scheduledStart?: Date | null;
  duration?: number | null;
  epicId?: string | null;
  effortEstimate?: number | null;
  blockedByIds?: string[];
  /** Attachments, written by the server in the same transaction as the Action. */
  sprintListId?: string | null;
  assigneeIds?: string[];
  tagIds?: string[];
  /** Present only when the form's bounty toggle is on. */
  bounty?: {
    amount?: number | null;
    token?: string | null;
    difficulty?: CreateActionPayload["bountyDifficulty"];
    skills?: string[];
    deadline?: Date | null;
    maxClaimants?: number;
    externalUrl?: string | null;
  } | null;
}

/**
 * Build the `action.create` payload from a form's values: the write fields
 * plus tags, assignees and sprint, so a create with attachments is one
 * request and the server writes all of it atomically. Empty attachment
 * lists and a cleared sprint are omitted rather than sent as empty.
 *
 * Shared by `CreateActionModal`, `GlobalAddTaskButton` and
 * `NextActionCapture`, which used to build the payload separately (and had
 * drifted: only one of them ever sent tags).
 */
export function buildCreateActionPayload(
  values: CreateActionFormValues,
): CreateActionPayload {
  const {
    name,
    description,
    projectId,
    workspaceId,
    priority,
    status,
    dueDate,
    scheduledStart,
    duration,
    epicId,
    effortEstimate,
    blockedByIds,
    sprintListId,
    assigneeIds,
    tagIds,
    bounty,
  } = values;

  return {
    name: name.trim(),
    description: description ? description : undefined,
    projectId: projectId ? projectId : undefined,
    workspaceId: workspaceId ?? undefined,
    priority: priority ?? "Quick",
    ...(status !== undefined ? { status } : {}),
    dueDate: dueDate ?? undefined,
    scheduledStart: scheduledStart ?? undefined,
    duration: duration ? duration : undefined,
    epicId: epicId ? epicId : undefined,
    effortEstimate: effortEstimate ? effortEstimate : undefined,
    blockedByIds: blockedByIds && blockedByIds.length > 0 ? blockedByIds : undefined,
    ...(tagIds && tagIds.length > 0 ? { tagIds: [...tagIds] } : {}),
    ...(assigneeIds && assigneeIds.length > 0 ? { assigneeIds: [...assigneeIds] } : {}),
    ...(sprintListId ? { sprintListId } : {}),
    ...(bounty
      ? {
          isBounty: true,
          bountyAmount: bounty.amount ?? undefined,
          bountyToken: bounty.token ?? undefined,
          bountyDifficulty: bounty.difficulty,
          bountySkills: bounty.skills && bounty.skills.length > 0 ? bounty.skills : undefined,
          bountyDeadline: bounty.deadline ?? undefined,
          bountyMaxClaimants: bounty.maxClaimants,
          bountyExternalUrl: bounty.externalUrl ?? undefined,
        }
      : {}),
  };
}
