import { TRPCError } from "@trpc/server";
import type { Action, Prisma } from "@prisma/client";
import {
  getActionAccess,
  canEditAction,
} from "~/server/services/access/resolvers/actionResolver";
import { validateScheduledTimes } from "~/lib/dateUtils";
import { recordActivity } from "~/server/services/activity/recordActivity";
import {
  logProjectActivity,
  PROJECT_ACTIVITY_TYPES,
} from "~/server/services/projectActivity";
import { actionUpdatePatchSchema, type ActionUpdatePatch } from "./schema";
import { deriveActionPatch, type ActionPatchTransitions } from "./deriveActionPatch";
import type { ActionWriteDeps } from "./types";

/** The stored row as it was before the write: what the lockstep, the diff and callers' side effects read. */
const snapshotSelect = {
  id: true,
  status: true,
  kanbanStatus: true,
  kanbanOrder: true,
  completedAt: true,
  scheduledStart: true,
  scheduledEnd: true,
  projectId: true,
  dueDate: true,
  workspaceId: true,
  name: true,
  description: true,
  priority: true,
  epicId: true,
  effortEstimate: true,
  project: { select: { workspaceId: true } },
} satisfies Prisma.ActionSelect;

export type ActionUpdateSnapshot = Prisma.ActionGetPayload<{ select: typeof snapshotSelect }>;

type ActionWithInclude<I> = I extends Prisma.ActionInclude
  ? Prisma.ActionGetPayload<{ include: I }>
  : Action;

export interface ApplyActionUpdateResult<TAction> {
  /** The row after the write, with the caller's `include` if it gave one. */
  action: TAction;
  /** The row before the write. */
  previous: ActionUpdateSnapshot;
  transitions: ActionPatchTransitions;
}

/** Keys the `updated` activity event never lists: identifiers and write attribution. */
const FIELDS_CHANGED_SKIP: ReadonlySet<string> = new Set([
  "lastUpdatedBy",
  "lastUpdatedSource",
  "blockedByIds",
]);

function fieldsChangedBetween(
  previous: ActionUpdateSnapshot,
  patch: Record<string, unknown>,
): string[] {
  const current = previous as unknown as Record<string, unknown>;
  return Object.keys(patch).filter((key) => {
    if (FIELDS_CHANGED_SKIP.has(key)) return false;
    const incoming = patch[key];
    if (incoming === undefined) return false;
    // Anything outside the snapshot is treated as changed.
    if (!(key in current)) return true;
    const existing = current[key];
    if (existing instanceof Date && incoming instanceof Date) {
      return existing.getTime() !== incoming.getTime();
    }
    return existing !== incoming;
  });
}

/**
 * Update an Action. The single implementation behind every update path.
 *
 * Gates on the central Action edit resolver, applies `deriveActionPatch`
 * (the kanban ⇄ status lockstep, completed-at stamping, the DRAFT / DELETED
 * guards), writes once, then records the activity event: `status_changed`
 * when the coarse status moved, else `updated` with the fields that
 * actually changed. A real kanban column change also records the
 * `ActionStatusChange` analytics row and the project activity, whichever
 * procedure moved the card.
 *
 * `kanbanOrder` passes through untouched; a `priority` change without an
 * explicit order clears it so the board falls back to automatic sorting.
 *
 * Throws `TRPCError` (`NOT_FOUND`, `FORBIDDEN`, `BAD_REQUEST`) as the router
 * procedures did.
 */
export async function applyActionUpdate<
  I extends Prisma.ActionInclude | undefined = undefined,
>(
  deps: ActionWriteDeps,
  actionId: string,
  patch: ActionUpdatePatch,
  options?: { include?: I },
): Promise<ApplyActionUpdateResult<ActionWithInclude<I>>> {
  const { db, actor } = deps;

  // 1. Gate on the central resolver. The row is loaded separately below so
  //    the snapshot has exactly what the lockstep and the diff need.
  const access = await getActionAccess(db, actor.userId, actionId);
  if (!access) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Action not found" });
  }
  if (!canEditAction(access)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to edit this action",
    });
  }

  const previous = await db.action.findUnique({
    where: { id: actionId },
    select: snapshotSelect,
  });
  if (!previous) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Action not found" });
  }

  const parsed = actionUpdatePatchSchema.safeParse(patch);
  if (!parsed.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "patch"}: ${issue.message}`)
        .join("; "),
    });
  }
  const { kanbanOrder, ...columns } = parsed.data;

  // 2. Dates: resolve against the stored values for a partial patch. Moving
  //    the start past the end clears the end rather than refusing.
  const resolvedStart =
    columns.scheduledStart !== undefined ? columns.scheduledStart : previous.scheduledStart;
  const resolvedEnd =
    columns.scheduledEnd !== undefined ? columns.scheduledEnd : previous.scheduledEnd;
  if (resolvedStart && resolvedEnd && resolvedEnd < resolvedStart && columns.scheduledEnd === undefined) {
    columns.scheduledEnd = null;
  } else {
    validateScheduledTimes(resolvedStart, resolvedEnd);
  }

  // 3. The lockstep.
  const derived = deriveActionPatch(previous, {
    status: columns.status,
    kanbanStatus: columns.kanbanStatus,
  });

  const data: Prisma.ActionUncheckedUpdateInput = {
    ...columns,
    ...(kanbanOrder !== undefined ? { kanbanOrder } : {}),
    ...derived.data,
    ...(columns.priority !== undefined && kanbanOrder === undefined ? { kanbanOrder: null } : {}),
  };

  // 4. One write.
  const updated = await db.action.update({
    where: { id: actionId },
    data,
    include: options?.include,
  });
  const action = updated as unknown as ActionWithInclude<I>;

  // 5. Side effects, after the write. `recordActivity` never throws by
  //    contract; the `.catch` keeps instrumentation from breaking the
  //    caller's mutation if the helper is later refactored.
  const activityWorkspaceId =
    updated.workspaceId ?? previous.workspaceId ?? previous.project?.workspaceId ?? null;
  if (activityWorkspaceId) {
    if (derived.transitions.statusChanged) {
      await recordActivity(db, {
        workspaceId: activityWorkspaceId,
        userId: actor.userId,
        entityType: "action",
        entityId: actionId,
        action: "status_changed",
        metadata: { from: previous.status, to: derived.transitions.nextStatus },
      }).catch(() => {
        /* instrumentation failure is non-fatal */
      });
    } else {
      const fieldsChanged = fieldsChangedBetween(previous, columns);
      if (fieldsChanged.length > 0) {
        await recordActivity(db, {
          workspaceId: activityWorkspaceId,
          userId: actor.userId,
          entityType: "action",
          entityId: actionId,
          action: "updated",
          metadata: { fieldsChanged },
        }).catch(() => {
          /* instrumentation failure is non-fatal */
        });
      }
    }
  }

  // A real column move is what the PM analytics (cycle time, lead time) and
  // the project feed track, whichever procedure moved the card.
  if (derived.transitions.kanbanChanged && columns.kanbanStatus) {
    await db.actionStatusChange
      .create({
        data: {
          actionId,
          fromStatus: previous.kanbanStatus,
          toStatus: columns.kanbanStatus,
          changedById: actor.userId,
        },
      })
      .catch((err: unknown) => {
        console.error("Failed to record status change:", err);
      });

    const projectId = updated.projectId ?? previous.projectId;
    if (projectId) {
      void logProjectActivity(db, {
        projectId,
        actionId,
        type: PROJECT_ACTIVITY_TYPES.STATUS_CHANGED,
        fromValue: previous.kanbanStatus,
        toValue: columns.kanbanStatus,
        changedById: actor.userId,
      }).catch((err: unknown) => {
        console.error("[projectActivity] applyActionUpdate:", err);
      });
    }
  }

  return { action, previous, transitions: derived.transitions };
}

/** Exposed for the module's own tests. */
export const _internal = { snapshotSelect, fieldsChangedBetween };
