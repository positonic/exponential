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
import { recordActivity } from "~/server/services/activity/recordActivity";
import {
  logProjectActivity,
  PROJECT_ACTIVITY_TYPES,
} from "~/server/services/projectActivity";
import { createActionInputSchema, type CreateActionInput } from "./schema";
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
 * workspace wins over a caller-supplied one), scoped-reference guard, kanban
 * seed, the row write, then the activity event.
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
  const { source, workspaceId: requestedWorkspaceId, ...columns } = parsed.data;

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

  // 3. The row.
  const created = await db.action.create({
    data: {
      ...columns,
      workspaceId: targetWorkspaceId ?? undefined,
      createdById: actor.userId,
      ...(columns.isBounty ? { bountyStatus: "OPEN" } : {}),
      ...(source ? { source } : {}),
      ...(kanbanSeed ?? {}),
    },
    include: createdActionInclude,
  });

  // 4. Side effects, after the write. `recordActivity` never throws by
  //    contract, but the `.catch` keeps instrumentation from ever breaking the
  //    caller's mutation even if the helper is later refactored.
  const activityWorkspaceId =
    created.workspaceId ?? created.project?.workspaceId ?? null;
  if (activityWorkspaceId) {
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

  return created;
}
