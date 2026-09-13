import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  getWorkspaceMembership,
  canEditWorkspaceContent,
} from "~/server/services/access/resolvers/workspaceResolver";
import {
  getProjectAccess,
  canEditProject,
} from "~/server/services/access/resolvers/projectResolver";
import { assertWorkspaceScopedRefs } from "~/server/services/access/workspaceRefs";
import { validateScheduledTimes } from "~/lib/dateUtils";
import { recordActivity } from "~/server/services/activity/recordActivity";
import {
  logProjectActivity,
  PROJECT_ACTIVITY_TYPES,
} from "~/server/services/projectActivity";
import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
import { NOTIFICATION_CATEGORIES } from "~/server/services/notifications/emit/constants";
import {
  createActionInputSchema,
  SYSTEM_ACTION_SOURCES,
  type CreateActionInput,
} from "./schema";
import {
  assertAssignableUsers,
  assertListMembership,
  assertTagsInWorkspace,
} from "./containment";
import type { ActionWriteDeps } from "./types";

/**
 * The row every create path returns. Callers that expose a narrower shape
 * (`quickCreate`, `ensureDailyPlanPromptAction`) project from this one, so
 * no procedure's return type moves.
 */
export const createdActionInclude = {
  assignees: {
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  },
  project: true,
  syncs: true,
  createdBy: { select: { id: true, name: true, email: true, image: true } },
  tags: { include: { tag: true } },
  epic: { select: { id: true, name: true, status: true } },
} satisfies Prisma.ActionInclude;

export type CreatedAction = Prisma.ActionGetPayload<{
  include: typeof createdActionInclude;
}>;

/**
 * Guard a caller-supplied `workspaceId` on a write.
 *
 * `workspaceId` arrives as free-form input, so membership is never implied by
 * having reached the mutation: without this check any authenticated user
 * could inject rows into an arbitrary workspace's task list by guessing its
 * CUID.
 *
 * Membership alone isn't sufficient either — `viewer` is a read-only role —
 * so this asserts `canEditWorkspaceContent` (member and above). Project-only
 * members ("guests") have no WorkspaceUser row and are refused here by
 * design; their writes are authorised through the project path instead,
 * which is why `createAction` skips this check for a workspace derived from
 * the project.
 */
export async function assertCanWriteToWorkspace(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const membership = await getWorkspaceMembership(db, userId, workspaceId);
  if (!canEditWorkspaceContent(membership?.role ?? null)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have permission to add actions to this workspace",
    });
  }
}

/**
 * Next `kanbanOrder` for a new TODO card in `projectId`: after the last TODO
 * card, else after the last card on the board, else 1.
 */
async function nextKanbanOrder(
  db: PrismaClient,
  projectId: string,
): Promise<number> {
  const [maxOrderAcrossBoard, maxOrderInTodo] = await Promise.all([
    db.action.findFirst({
      where: { projectId, kanbanOrder: { not: null } },
      orderBy: { kanbanOrder: "desc" },
      select: { kanbanOrder: true },
    }),
    db.action.findFirst({
      where: { projectId, kanbanStatus: "TODO", kanbanOrder: { not: null } },
      orderBy: { kanbanOrder: "desc" },
      select: { kanbanOrder: true },
    }),
  ]);
  if (maxOrderInTodo?.kanbanOrder) return maxOrderInTodo.kanbanOrder + 1;
  if (maxOrderAcrossBoard?.kanbanOrder) return maxOrderAcrossBoard.kanbanOrder + 1;
  return 1;
}

/**
 * Create an Action. The single implementation behind every create path.
 *
 * In order: gate (project edit access when a project is given, otherwise a
 * write role in the target workspace), workspace derivation (the project's
 * workspace wins over a caller-supplied one), scoped-reference and attachment
 * containment guards, kanban seed, one transaction writing the row plus its
 * tags, assignees and sprint membership, then the activity event and the
 * Assignment notification.
 *
 * `source` is required and must be one of `ACTION_SOURCES`; a caller that
 * cannot name its surface fails rather than defaulting.
 *
 * Throws `TRPCError` (`FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`) exactly as the
 * router procedures did, so tRPC callers pass errors through unchanged and
 * non-tRPC callers map them as they already map router errors.
 */
export async function createAction(
  deps: ActionWriteDeps,
  input: CreateActionInput,
): Promise<CreatedAction> {
  const parsed = createActionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("; "),
    });
  }
  const { db, actor } = deps;
  const {
    source,
    workspaceId: requestedWorkspaceId,
    tagIds,
    assigneeIds,
    sprintListId,
    ...columns
  } = parsed.data;
  const uniqueTagIds = [...new Set(tagIds ?? [])];
  const uniqueAssigneeIds = [...new Set(assigneeIds ?? [])];

  // Dates: a time block cannot end before it starts. BAD_REQUEST.
  validateScheduledTimes(columns.scheduledStart, columns.scheduledEnd);

  // 1. Gate + workspace derivation + kanban seed. The project-scoped reads are
  //    independent, so they run in parallel.
  let projectWorkspaceId: string | null = null;
  let kanbanSeed: { kanbanStatus: "TODO"; kanbanOrder: number } | null = null;

  if (columns.projectId) {
    const [access, project, kanbanOrder] = await Promise.all([
      getProjectAccess(db, actor.userId, columns.projectId),
      db.project.findUnique({
        where: { id: columns.projectId },
        select: { workspaceId: true },
      }),
      nextKanbanOrder(db, columns.projectId),
    ]);

    if (!canEditProject(access)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You don't have permission to create actions on this project",
      });
    }

    projectWorkspaceId = project?.workspaceId ?? null;
    kanbanSeed = { kanbanStatus: "TODO", kanbanOrder };
  }

  // A project dictates its own workspace, so it takes precedence over any
  // caller-supplied `workspaceId`; the other precedence let a caller attach a
  // project they can edit while naming a foreign workspace, laundering the
  // row (and its `created` activity event) into that workspace.
  // `requestedWorkspaceId` therefore only applies when there is no project,
  // or when the project is personal (no workspace of its own).
  const targetWorkspaceId = projectWorkspaceId ?? requestedWorkspaceId ?? null;

  // Authorise the destination workspace whenever it came from the caller
  // rather than from the project. Skipping the project-derived case keeps
  // project-only members ("guests") working — `canEditProject` above is their
  // authorisation, and a bare workspace check would refuse them, since a
  // guest has no WorkspaceUser row but every client sends workspaceId
  // alongside projectId.
  if (targetWorkspaceId && targetWorkspaceId !== projectWorkspaceId) {
    await assertCanWriteToWorkspace(db, actor.userId, targetWorkspaceId);
  }

  // 2. A linked epic must live in the action's own workspace, or its name and
  //    status leak back through the `epic` include (PR 481). Resolved against
  //    the workspace the action will actually land in.
  if (columns.epicId) {
    await assertWorkspaceScopedRefs(db, actor.userId, targetWorkspaceId, {
      epicId: columns.epicId,
    });
  }

  // 3. Attachment containment, resolved against the workspace the Action
  //    will land in. Reads only, so they run before the transaction: a
  //    refused attachment means no row is written at all.
  if (uniqueTagIds.length > 0) {
    await assertTagsInWorkspace(db, actor.userId, targetWorkspaceId, uniqueTagIds);
  }
  if (uniqueAssigneeIds.length > 0) {
    await assertAssignableUsers(
      db,
      actor.userId,
      { projectId: columns.projectId ?? null, teamId: null, workspaceId: targetWorkspaceId },
      uniqueAssigneeIds,
    );
  }
  if (sprintListId) {
    await assertListMembership(db, actor.userId, sprintListId, targetWorkspaceId);
  }

  // 4. One transaction: the row and every attachment, so an Action with
  //    partial attachments cannot exist. The re-read at the end returns the
  //    same include shape whether or not anything was attached.
  const hasAttachments =
    uniqueTagIds.length > 0 || uniqueAssigneeIds.length > 0 || !!sprintListId;

  const created = await db.$transaction(async (tx) => {
    const row = await tx.action.create({
      data: {
        ...columns,
        workspaceId: targetWorkspaceId ?? undefined,
        createdById: actor.userId,
        ...(columns.isBounty ? { bountyStatus: "OPEN" } : {}),
        source,
        ...(kanbanSeed ?? {}),
      },
      include: createdActionInclude,
    });
    if (!hasAttachments) return row;

    if (uniqueTagIds.length > 0) {
      await tx.actionTag.createMany({
        data: uniqueTagIds.map((tagId) => ({ actionId: row.id, tagId })),
      });
    }
    if (uniqueAssigneeIds.length > 0) {
      await tx.actionAssignee.createMany({
        data: uniqueAssigneeIds.map((userId) => ({ actionId: row.id, userId })),
      });
    }
    if (sprintListId) {
      await tx.actionList.create({
        data: { actionId: row.id, listId: sprintListId },
      });
    }
    return tx.action.findUniqueOrThrow({
      where: { id: row.id },
      include: createdActionInclude,
    });
  });

  // 5. Side effects, after the commit. `recordActivity` never throws by
  //    contract, but the `.catch` keeps instrumentation from ever breaking the
  //    caller's mutation even if the helper is later refactored.
  const activityWorkspaceId =
    created.workspaceId ?? created.project?.workspaceId ?? null;
  if (activityWorkspaceId && !SYSTEM_ACTION_SOURCES.has(source)) {
    await recordActivity(db, {
      workspaceId: activityWorkspaceId,
      userId: actor.userId,
      entityType: "action",
      entityId: created.id,
      action: "created",
      metadata: { name: created.name },
    }).catch(() => {
      /* instrumentation failure is non-fatal */
    });
  }

  if (created.projectId) {
    void logProjectActivity(db, {
      projectId: created.projectId,
      actionId: created.id,
      type: PROJECT_ACTIVITY_TYPES.ACTION_CREATED,
      toValue: created.name,
      changedById: actor.userId,
    }).catch((err: unknown) => {
      console.error("[projectActivity] ACTION_CREATED:", err);
    });
  }

  // Unified notification pipeline (ADR-0045): one Assignment emit for every
  // assignee who is not the actor. Best-effort and not awaited, matching
  // `action.assign`; the cron worker retries any channel that failed.
  const notifiedAssigneeIds = uniqueAssigneeIds.filter((id) => id !== actor.userId);
  if (notifiedAssigneeIds.length > 0) {
    void emitNotification({
      category: NOTIFICATION_CATEGORIES.ASSIGNMENT,
      actorUserId: actor.userId,
      subject: { actionId: created.id, assignedUserIds: notifiedAssigneeIds },
      db,
    });
  }

  return created;
}
