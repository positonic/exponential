/**
 * TimeEntryService
 *
 * Owns the lifecycle of TimeEntry records. Every TimeEntry is anchored to an
 * Action; only one entry per user can be running at a time (single global timer
 * with silent auto-stop).
 *
 * Public API (v1):
 *   - start({ userId, typedTitle?, workspaceId? }) → creates Action + TimeEntry
 *   - stop({ userId, entryId? })                   → stamps endedAt, resyncs Action.timeSpentMins
 *   - getActive({ userId })                        → currently running TimeEntry, if any
 *
 * Future slices (autocomplete pick, reassign, update, delete) layer on top.
 */

import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient, TimeEntry } from "@prisma/client";

export type TimeEntryWithAction = Prisma.TimeEntryGetPayload<{
  include: {
    action: {
      select: {
        id: true;
        name: true;
        projectId: true;
        workspaceId: true;
      };
    };
  };
}>;

interface StartInput {
  userId: string;
  /**
   * Attach the new TimeEntry to an existing Action. When provided, no new
   * Action is created. The caller is responsible for resolving the actionId
   * (e.g. via `action.searchByTitle`).
   */
  actionId?: string;
  /** Used only when actionId is omitted. */
  typedTitle?: string;
  /** Used only when actionId is omitted (otherwise inherited from the action). */
  projectId?: string | null;
  /** Used only when actionId is omitted (otherwise inherited from the action). */
  workspaceId?: string | null;
}

interface StopInput {
  userId: string;
  entryId?: string;
}

interface GetActiveInput {
  userId: string;
}

type Db = PrismaClient | Prisma.TransactionClient;

export class TimeEntryService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Start a new TimeEntry. If a running entry already exists for the user,
   * silently auto-stop it inside the same transaction before attaching/creating.
   *
   * Two modes:
   *  - `actionId` provided → attach a TimeEntry to that existing Action (inherits
   *     its projectId/workspaceId). Throws NOT_FOUND if it doesn't exist.
   *  - `actionId` omitted → create a new Action with the typed title (or
   *    "Untitled") and the explicit projectId/workspaceId, then attach.
   *
   * Access enforcement is performed at the router layer where the user identity
   * and tRPC error idioms live; the service trusts its caller for v1.
   */
  async start(input: StartInput): Promise<TimeEntryWithAction> {
    return this.db.$transaction(async (tx) => {
      await this.autoStopRunning(tx, input.userId);

      let actionId: string;
      let workspaceId: string | null;

      if (input.actionId) {
        const existing = await tx.action.findUnique({
          where: { id: input.actionId },
          select: { id: true, workspaceId: true },
        });
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Action not found",
          });
        }
        actionId = existing.id;
        workspaceId = existing.workspaceId;
      } else {
        const title = (input.typedTitle ?? "").trim() || "Untitled";
        const created = await tx.action.create({
          data: {
            name: title,
            createdById: input.userId,
            projectId: input.projectId ?? null,
            workspaceId: input.workspaceId ?? null,
            status: "ACTIVE",
            priority: "Quick",
            source: "plugin",
          },
          select: { id: true, workspaceId: true },
        });
        actionId = created.id;
        workspaceId = created.workspaceId;
      }

      return tx.timeEntry.create({
        data: {
          userId: input.userId,
          actionId,
          workspaceId,
          source: "plugin",
        },
        include: {
          action: {
            select: {
              id: true,
              name: true,
              projectId: true,
              workspaceId: true,
            },
          },
        },
      });
    });
  }

  /**
   * Stop the currently running entry (or the entry identified by `entryId`).
   * Stamps `endedAt = now()`, validates `endedAt > startedAt`, and increments
   * the parent Action's denormalized `timeSpentMins`.
   *
   * Throws NOT_FOUND if nothing is running and no entryId was provided.
   * Throws FORBIDDEN if entryId belongs to a different user.
   * Throws BAD_REQUEST if the entry is already stopped.
   */
  async stop(input: StopInput): Promise<TimeEntryWithAction> {
    return this.db.$transaction(async (tx) => {
      const entry = input.entryId
        ? await tx.timeEntry.findUnique({ where: { id: input.entryId } })
        : await tx.timeEntry.findFirst({
            where: { userId: input.userId, endedAt: null },
            orderBy: { startedAt: "desc" },
          });

      if (!entry) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No running timer to stop",
        });
      }

      if (entry.userId !== input.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot stop another user's timer",
        });
      }

      if (entry.endedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Timer is already stopped",
        });
      }

      const endedAt = new Date();
      if (endedAt.getTime() <= entry.startedAt.getTime()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "endedAt must be after startedAt",
        });
      }

      const mins = durationMinutes(entry.startedAt, endedAt);

      const updated = await tx.timeEntry.update({
        where: { id: entry.id },
        data: { endedAt },
        include: {
          action: {
            select: {
              id: true,
              name: true,
              projectId: true,
              workspaceId: true,
            },
          },
        },
      });

      if (mins > 0) {
        await tx.action.update({
          where: { id: entry.actionId },
          data: { timeSpentMins: { increment: mins } },
        });
      }

      return updated;
    });
  }

  /**
   * Update a completed (or running) entry's start/end times and/or reassign
   * to a different Action. Keeps `Action.timeSpentMins` consistent:
   *
   *  - Running entries (endedAt is null pre-update AND post-update): no
   *    timeSpentMins delta — they haven't contributed yet.
   *  - Newly stopped (running → ended): increment by new duration on the
   *    (possibly new) action.
   *  - Newly resumed (ended → running): decrement by old duration on the old
   *    action; do not increment new action (running entries don't contribute).
   *  - Reassigned + completed: decrement old action by old duration,
   *    increment new action by new duration.
   *  - Range-edited + same action + completed: increment new action by
   *    (new − old) (signed; may be negative).
   *
   * Throws NOT_FOUND for missing entries, FORBIDDEN for other users' entries,
   * BAD_REQUEST when `endedAt <= startedAt`.
   */
  async update(input: {
    userId: string;
    entryId: string;
    startedAt?: Date;
    endedAt?: Date | null;
    actionId?: string;
  }): Promise<TimeEntryWithAction> {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.timeEntry.findUnique({
        where: { id: input.entryId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Time entry not found" });
      }
      if (existing.userId !== input.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot edit another user's time entry",
        });
      }

      const newStartedAt = input.startedAt ?? existing.startedAt;
      const newEndedAt =
        input.endedAt === undefined ? existing.endedAt : input.endedAt;
      const newActionId = input.actionId ?? existing.actionId;

      if (newEndedAt && newEndedAt.getTime() <= newStartedAt.getTime()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "endedAt must be after startedAt",
        });
      }

      // Compute old & new contributions to timeSpentMins.
      const oldDurMins = existing.endedAt
        ? durationMinutes(existing.startedAt, existing.endedAt)
        : 0;
      const newDurMins = newEndedAt
        ? durationMinutes(newStartedAt, newEndedAt)
        : 0;

      // If reassigned, validate target action exists and inherit its workspaceId.
      let newWorkspaceId: string | null = existing.workspaceId;
      if (newActionId !== existing.actionId) {
        const target = await tx.action.findUnique({
          where: { id: newActionId },
          select: { id: true, workspaceId: true },
        });
        if (!target) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Target action not found",
          });
        }
        newWorkspaceId = target.workspaceId;
      }

      const updated = await tx.timeEntry.update({
        where: { id: input.entryId },
        data: {
          startedAt: newStartedAt,
          endedAt: newEndedAt,
          actionId: newActionId,
          workspaceId: newWorkspaceId,
        },
        include: {
          action: {
            select: {
              id: true,
              name: true,
              projectId: true,
              workspaceId: true,
            },
          },
        },
      });

      // Resync timeSpentMins. Two-action case (reassignment) and one-action
      // case (range edit) collapse cleanly when old & new actions are equal.
      if (newActionId === existing.actionId) {
        const delta = newDurMins - oldDurMins;
        if (delta !== 0) {
          await tx.action.update({
            where: { id: existing.actionId },
            data: { timeSpentMins: { increment: delta } },
          });
        }
      } else {
        if (oldDurMins > 0) {
          await tx.action.update({
            where: { id: existing.actionId },
            data: { timeSpentMins: { decrement: oldDurMins } },
          });
        }
        if (newDurMins > 0) {
          await tx.action.update({
            where: { id: newActionId },
            data: { timeSpentMins: { increment: newDurMins } },
          });
        }
      }

      return updated;
    });
  }

  /**
   * Permanently delete a time entry. Decrements its action's
   * `timeSpentMins` by the entry's recorded duration (running entries — those
   * with no endedAt — contribute 0).
   */
  async delete(input: { userId: string; entryId: string }): Promise<{ id: string }> {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.timeEntry.findUnique({
        where: { id: input.entryId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Time entry not found" });
      }
      if (existing.userId !== input.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete another user's time entry",
        });
      }

      const dur = existing.endedAt
        ? durationMinutes(existing.startedAt, existing.endedAt)
        : 0;

      await tx.timeEntry.delete({ where: { id: input.entryId } });

      if (dur > 0) {
        await tx.action.update({
          where: { id: existing.actionId },
          data: { timeSpentMins: { decrement: dur } },
        });
      }

      return { id: input.entryId };
    });
  }

  async getActive(input: GetActiveInput): Promise<TimeEntryWithAction | null> {
    return this.db.timeEntry.findFirst({
      where: { userId: input.userId, endedAt: null },
      orderBy: { startedAt: "desc" },
      include: {
        action: {
          select: {
            id: true,
            name: true,
            projectId: true,
            workspaceId: true,
          },
        },
      },
    });
  }

  /**
   * Entries for the user that intersect the given date range. Used by the
   * calendar to render TimeEntry blocks alongside scheduled-action blocks.
   *
   * An entry is included when `startedAt < endDate` AND `(endedAt > startDate
   * OR endedAt IS NULL)` — the standard overlap test treating a running entry
   * as open-ended. Workspace filter optional.
   */
  async listByDateRange(input: {
    userId: string;
    startDate: Date;
    endDate: Date;
    workspaceId?: string | null;
  }): Promise<TimeEntryWithAction[]> {
    return this.db.timeEntry.findMany({
      where: {
        userId: input.userId,
        startedAt: { lt: input.endDate },
        OR: [
          { endedAt: null },
          { endedAt: { gt: input.startDate } },
        ],
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      },
      orderBy: { startedAt: "asc" },
      include: {
        action: {
          select: {
            id: true,
            name: true,
            projectId: true,
            workspaceId: true,
          },
        },
      },
    });
  }

  /**
   * Most-recent COMPLETED entries for the user, newest first. Used by the
   * plugin's history tab; never includes a running entry (those live on the
   * Track Time tab via `getActive`).
   */
  async listRecent(input: {
    userId: string;
    limit?: number;
  }): Promise<TimeEntryWithAction[]> {
    const take = Math.min(Math.max(input.limit ?? 20, 1), 100);
    return this.db.timeEntry.findMany({
      where: { userId: input.userId, endedAt: { not: null } },
      // "Most recent completed" = sorted by when it ended, not when it started:
      // a long-running timer started earlier may still have ended last.
      orderBy: { endedAt: "desc" },
      take,
      include: {
        action: {
          select: {
            id: true,
            name: true,
            projectId: true,
            workspaceId: true,
          },
        },
      },
    });
  }

  /**
   * Internal: stamp endedAt on any currently-running entry for this user and
   * resync the parent Action's timeSpentMins. Used by `start` to enforce the
   * single-timer-per-user invariant.
   */
  private async autoStopRunning(tx: Db, userId: string): Promise<void> {
    const running = await tx.timeEntry.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!running) return;

    const endedAt = new Date();
    if (endedAt.getTime() <= running.startedAt.getTime()) {
      return;
    }
    const mins = durationMinutes(running.startedAt, endedAt);

    await tx.timeEntry.update({
      where: { id: running.id },
      data: { endedAt },
    });

    if (mins > 0) {
      await tx.action.update({
        where: { id: running.actionId },
        data: { timeSpentMins: { increment: mins } },
      });
    }
  }
}

export function durationMinutes(startedAt: Date, endedAt: Date): number {
  const ms = endedAt.getTime() - startedAt.getTime();
  if (ms <= 0) return 0;
  return Math.round(ms / 60000);
}

export type { TimeEntry };
