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
 * Daily worklog (ADR-0061):
 *   - create({ userId, actionId, startedAt, endedAt, status, … }) → a completed
 *     entry with explicit bounds; never touches the running Timer. `PROPOSED`
 *     entries stay out of `Action.timeSpentMins` until confirmed.
 *   - upsertBySourceRef(…)                          → idempotent create keyed
 *     on (userId, sourceRef); a CONFIRMED match is never re-touched.
 */

import { TRPCError } from "@trpc/server";
import type {
  Prisma,
  PrismaClient,
  TimeEntry,
  TimeEntryStatus,
} from "@prisma/client";
import { recordActivity } from "~/server/services/activity/recordActivity";
import {
  appendReference,
  reconcileProposed,
  type ProposedPiece,
} from "./reconcile";

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

export interface CreateInput {
  /** Whose time it is — under an External agent, the agent's OWNER (ADR-0061). */
  userId: string;
  actionId: string;
  startedAt: Date;
  endedAt: Date;
  /** "manual" | "claude-desktop" | "agent-run" (see CONTEXT.md "Time"). */
  source: string;
  status: TimeEntryStatus;
  /** Idempotency key; unique per owner. */
  sourceRef?: string | null;
  note?: string | null;
  /** The ExternalAgent that wrote the row; null for human-made entries. */
  createdByAgentId?: string | null;
}

interface GetActiveInput {
  userId: string;
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * `created` / `updated`: proposed pieces were written; `left`: a CONFIRMED
 * row already carries this ref and was not touched; `merged`: manual time on
 * the same Action covers it, so the manual entries were annotated instead;
 * `dropped`: manual time on other Actions covered every minute.
 */
export type UpsertOutcome = "created" | "updated" | "left" | "merged" | "dropped";

export interface UpsertResult {
  /** The first written piece, or the untouched CONFIRMED row; null for merged/dropped. */
  entry: TimeEntryWithAction | null;
  outcome: UpsertOutcome;
  /** Every piece written (one, or several when manual time split the proposal). */
  pieces: TimeEntryWithAction[];
  /** Manual entry ids that now carry the conversation reference in their note. */
  mergedInto: string[];
}

/** Manual time for reconciliation: the Timer's legacy stamp and hand-made entries. */
const MANUAL_SOURCES = ["plugin", "manual"];

const ACTION_INCLUDE = {
  action: {
    select: { id: true, name: true, projectId: true, workspaceId: true },
  },
} as const;

/**
 * The data a just-completed TimeEntry needs to surface as a `time_entry`
 * activity event. Collected inside the stop transaction so the activity write
 * (which runs after commit, on the non-transactional client) has everything it
 * needs without a follow-up read.
 */
interface CompletedEntry {
  userId: string;
  workspaceId: string | null;
  actionId: string;
  actionName: string | null;
  startedAt: Date;
  endedAt: Date;
}

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
    const { created, autoStopped } = await this.db.$transaction(async (tx) => {
      const stopped = await this.autoStopRunning(tx, input.userId);

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

      const entry = await tx.timeEntry.create({
        data: {
          userId: input.userId,
          actionId,
          workspaceId,
          source: "plugin",
          startedAt: new Date(),
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

      return { created: entry, autoStopped: stopped };
    });

    // Starting a new timer silently completes any prior running one — surface
    // that auto-stopped entry in the activity feed too, so no recorded time is
    // lost from the feed. Emitted post-commit on the non-transactional client.
    if (autoStopped) await this.recordTracked(autoStopped);

    return created;
  }

  /**
   * Create a completed entry with explicit bounds. Unlike `start` this never
   * calls `autoStopRunning`: a worklog written the next morning must not stop
   * a Timer the owner is running right now.
   *
   * `workspaceId` is inherited from the Action. `Action.timeSpentMins` is
   * incremented — and the `time_entry` activity event emitted — only for
   * `CONFIRMED` entries; Proposed time is not a happening yet (ADR-0061).
   *
   * Throws BAD_REQUEST when `endedAt <= startedAt`, NOT_FOUND for a missing
   * Action. Access is the router's job (owner-scoped, see timeEntryRouter).
   */
  async create(input: CreateInput): Promise<TimeEntryWithAction> {
    if (input.endedAt.getTime() <= input.startedAt.getTime()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "endedAt must be after startedAt",
      });
    }
    if (input.sourceRef) {
      await this.assertSourceRefFree(input.userId, input.sourceRef);
    }

    const created = await this.db.$transaction(async (tx) => {
      const action = await tx.action.findUnique({
        where: { id: input.actionId },
        select: { id: true, workspaceId: true },
      });
      if (!action) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Action not found" });
      }

      const entry = await tx.timeEntry.create({
        data: {
          userId: input.userId,
          actionId: action.id,
          workspaceId: action.workspaceId,
          startedAt: input.startedAt,
          endedAt: input.endedAt,
          source: input.source,
          status: input.status,
          sourceRef: input.sourceRef ?? null,
          note: input.note ?? null,
          createdByAgentId: input.createdByAgentId ?? null,
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

      if (input.status === "CONFIRMED") {
        const mins = durationMinutes(input.startedAt, input.endedAt);
        if (mins > 0) {
          await tx.action.update({
            where: { id: action.id },
            data: { timeSpentMins: { increment: mins } },
          });
        }
      }

      return entry;
    });

    if (created.status === "CONFIRMED") {
      await this.recordTracked({
        userId: created.userId,
        workspaceId: created.workspaceId,
        actionId: created.actionId,
        actionName: created.action.name,
        startedAt: created.startedAt,
        endedAt: created.endedAt!,
      });
    }

    return created;
  }

  /**
   * Idempotent write keyed on `(userId, sourceRef)` — the Daily worklog's
   * re-run path — with manual time applied first (`reconcile.ts`):
   *
   *  - a CONFIRMED row already carries this ref (or a piece of it) → "left";
   *    confirmed entries are never re-touched (decision 2026-09-12)
   *  - manual time on the SAME Action overlaps → "merged": nothing is
   *    written, the manual entries' notes gain the conversation reference,
   *    and any earlier proposed rows for this ref are removed
   *  - otherwise the proposal (clipped by manual time on other Actions, see
   *    `reconcileProposed`) is written as one or more pieces, each keyed by
   *    the ref (`<ref>#a`, `<ref>#b` when split); existing PROPOSED pieces
   *    are updated in place and stale ones removed → "created"/"updated",
   *    or "dropped" when nothing remains
   *
   * Reconciliation applies to Proposed time only: a human logging a
   * CONFIRMED entry with a ref is writing manual time, not a proposal.
   * Manual entries never have their start, end, Action or owner changed.
   */
  async upsertBySourceRef(
    input: CreateInput & { sourceRef: string },
  ): Promise<UpsertResult> {
    if (input.endedAt.getTime() <= input.startedAt.getTime()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "endedAt must be after startedAt",
      });
    }
    const { userId, sourceRef } = input;

    const foreign = await this.db.timeEntry.findFirst({
      where: { sourceRef, userId: { not: userId } },
      select: { id: true },
    });
    if (foreign) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This sourceRef is already claimed by another user",
      });
    }

    // Every row this ref has produced before: the ref itself and its pieces.
    const family = await this.db.timeEntry.findMany({
      where: {
        userId,
        OR: [{ sourceRef }, { sourceRef: { startsWith: `${sourceRef}#` } }],
      },
      include: ACTION_INCLUDE,
    });
    const confirmed = family.find((row) => row.status === "CONFIRMED");
    if (confirmed) {
      return { entry: confirmed, outcome: "left", pieces: [], mergedInto: [] };
    }

    let pieces: ProposedPiece[] = [
      {
        actionId: input.actionId,
        startMs: input.startedAt.getTime(),
        endMs: input.endedAt.getTime(),
        sourceRef,
      },
    ];

    if (input.status === "PROPOSED") {
      const manual = await this.db.timeEntry.findMany({
        where: {
          userId,
          source: { in: MANUAL_SOURCES },
          startedAt: { lt: input.endedAt },
          OR: [{ endedAt: null }, { endedAt: { gt: input.startedAt } }],
        },
        select: { id: true, actionId: true, startedAt: true, endedAt: true, note: true },
      });
      const now = Date.now();
      const verdict = reconcileProposed(
        manual.map((m) => ({
          id: m.id,
          actionId: m.actionId,
          startMs: m.startedAt.getTime(),
          endMs: m.endedAt?.getTime() ?? now,
        })),
        pieces[0]!,
      );

      if (verdict.kind === "merge") {
        // The only write the routine may make to manual time: provenance.
        for (const id of verdict.mergeInto) {
          const target = manual.find((m) => m.id === id)!;
          await this.db.timeEntry.update({
            where: { id },
            data: { note: appendReference(target.note, sourceRef) },
          });
        }
        if (family.length > 0) {
          await this.db.timeEntry.deleteMany({
            where: { id: { in: family.map((row) => row.id) } },
          });
        }
        return { entry: null, outcome: "merged", pieces: [], mergedInto: verdict.mergeInto };
      }
      pieces = verdict.pieces;
    }

    const keep = new Set(pieces.map((piece) => piece.sourceRef));
    const stale = family.filter((row) => !keep.has(row.sourceRef ?? ""));
    if (stale.length > 0) {
      await this.db.timeEntry.deleteMany({
        where: { id: { in: stale.map((row) => row.id) } },
      });
    }
    if (pieces.length === 0) {
      return { entry: null, outcome: "dropped", pieces: [], mergedInto: [] };
    }

    const action = await this.db.action.findUnique({
      where: { id: input.actionId },
      select: { id: true, workspaceId: true },
    });
    if (!action) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Action not found" });
    }

    const written: TimeEntryWithAction[] = [];
    let updatedAny = false;
    for (const piece of pieces) {
      const existing = family.find((row) => row.sourceRef === piece.sourceRef);
      if (existing) {
        updatedAny = true;
        written.push(
          await this.db.timeEntry.update({
            where: { id: existing.id },
            data: {
              actionId: action.id,
              workspaceId: action.workspaceId,
              startedAt: new Date(piece.startMs),
              endedAt: new Date(piece.endMs),
              source: input.source,
              note: input.note ?? null,
              createdByAgentId: input.createdByAgentId ?? null,
            },
            include: ACTION_INCLUDE,
          }),
        );
      } else {
        written.push(
          await this.create({
            ...input,
            startedAt: new Date(piece.startMs),
            endedAt: new Date(piece.endMs),
            sourceRef: piece.sourceRef,
          }),
        );
      }
    }
    return {
      entry: written[0] ?? null,
      outcome: updatedAny ? "updated" : "created",
      pieces: written,
      mergedInto: [],
    };
  }

  /**
   * Confirm a day: every PROPOSED entry of the owner's whose start falls in
   * `[dayStart, dayEnd)` becomes CONFIRMED and each affected Action's
   * `timeSpentMins` is incremented ONCE by the sum of its newly-confirmed
   * durations, all in one transaction; one `time_entry` activity event per
   * entry is emitted after commit. Confirmation is the only path that moves
   * spent time for Proposed time (ADR-0061). A day with nothing proposed
   * returns `{ confirmed: 0 }`, not an error. Human-only at the router.
   */
  async confirmDay(input: {
    userId: string;
    dayStart: Date;
    dayEnd: Date;
    workspaceId?: string | null;
  }): Promise<{ confirmed: number }> {
    const confirmedRows = await this.db.$transaction(async (tx) => {
      const rows = await tx.timeEntry.findMany({
        where: {
          userId: input.userId,
          status: "PROPOSED",
          startedAt: { gte: input.dayStart, lt: input.dayEnd },
          endedAt: { not: null },
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        },
        include: { action: { select: { name: true } } },
      });
      if (rows.length === 0) return rows;

      await tx.timeEntry.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { status: "CONFIRMED" },
      });

      const minutesByAction = new Map<string, number>();
      for (const row of rows) {
        const mins = durationMinutes(row.startedAt, row.endedAt!);
        minutesByAction.set(row.actionId, (minutesByAction.get(row.actionId) ?? 0) + mins);
      }
      for (const [actionId, mins] of minutesByAction) {
        if (mins > 0) {
          await tx.action.update({
            where: { id: actionId },
            data: { timeSpentMins: { increment: mins } },
          });
        }
      }
      return rows;
    });

    for (const row of confirmedRows) {
      await this.recordTracked({
        userId: row.userId,
        workspaceId: row.workspaceId,
        actionId: row.actionId,
        actionName: row.action.name,
        startedAt: row.startedAt,
        endedAt: row.endedAt!,
      });
    }
    return { confirmed: confirmedRows.length };
  }

  /**
   * Stop the currently running entry (or the entry identified by `entryId`).
   * Stamps `endedAt = now()` (clamped to never precede `startedAt`) and
   * increments the parent Action's denormalized `timeSpentMins`.
   *
   * Throws NOT_FOUND if nothing is running and no entryId was provided.
   * Throws FORBIDDEN if entryId belongs to a different user.
   * Throws BAD_REQUEST if the entry is already stopped.
   */
  async stop(input: StopInput): Promise<TimeEntryWithAction> {
    const updated = await this.db.$transaction(async (tx) => {
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

      const endedAt = safeEndedAt(entry.startedAt);
      const mins = durationMinutes(entry.startedAt, endedAt);

      const result = await tx.timeEntry.update({
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

      return result;
    });

    // Surface the completed recording in the activity feed. Post-commit and
    // fire-and-forget: a feed-write failure must never fail the user's stop.
    await this.recordTracked({
      userId: updated.userId,
      workspaceId: updated.workspaceId,
      actionId: updated.actionId,
      actionName: updated.action.name,
      startedAt: updated.startedAt,
      endedAt: updated.endedAt!,
    });

    return updated;
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
   * Edit is confirmation (ADR-0061): a PROPOSED entry becomes CONFIRMED by
   * being edited, and since Proposed time never contributed to
   * `timeSpentMins`, its old duration counts as zero here — the arithmetic
   * below then simply adds the new duration. The Daily worklog will not touch
   * the entry again (`upsertBySourceRef` reports "left").
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

      // Compute old & new contributions to timeSpentMins. A PROPOSED entry
      // never contributed, so its baseline is zero.
      const wasProposed = existing.status === "PROPOSED";
      const oldDurMins =
        existing.endedAt && !wasProposed
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
          ...(wasProposed ? { status: "CONFIRMED" as const } : {}),
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
   * with no endedAt — contribute 0, and so does a PROPOSED entry, which never
   * counted; deleting one is its confirmation-and-removal in one step).
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

      const dur =
        existing.endedAt && existing.status !== "PROPOSED"
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
   * Internal: a `sourceRef` names one conversation segment, which belongs to
   * exactly one person. A ref already held by ANOTHER user is a CONFLICT (two
   * owners cannot both claim the same segment), and so is a ref this user
   * already holds when the caller asked to *create* rather than upsert — the
   * `(userId, sourceRef)` unique index would reject it anyway; this turns the
   * P2002 into a readable error before the write.
   */
  private async assertSourceRefFree(userId: string, sourceRef: string): Promise<void> {
    const holder = await this.db.timeEntry.findFirst({
      where: { sourceRef },
      select: { userId: true },
    });
    if (!holder) return;
    throw new TRPCError({
      code: "CONFLICT",
      message:
        holder.userId === userId
          ? "A time entry with this sourceRef already exists; use upsertBySourceRef to update it"
          : "This sourceRef is already claimed by another user",
    });
  }

  /**
   * Internal: stamp endedAt on any currently-running entry for this user and
   * resync the parent Action's timeSpentMins. Used by `start` to enforce the
   * single-timer-per-user invariant. Returns the completed entry's data (so the
   * caller can emit a `time_entry` activity event after commit), or null when
   * nothing was running.
   */
  private async autoStopRunning(
    tx: Db,
    userId: string,
  ): Promise<CompletedEntry | null> {
    const running = await tx.timeEntry.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: "desc" },
      include: { action: { select: { name: true } } },
    });
    if (!running) return null;

    // Must always stamp endedAt: leaving the entry running would let the
    // subsequent create() violate the one-running-timer-per-user unique index.
    const endedAt = safeEndedAt(running.startedAt);
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

    return {
      userId: running.userId,
      workspaceId: running.workspaceId,
      actionId: running.actionId,
      actionName: running.action.name,
      startedAt: running.startedAt,
      endedAt,
    };
  }

  /**
   * Emit a `time_entry` activity event for a just-completed recording so it
   * shows up in the workspace + aggregated activity feeds. The Action name
   * rides in metadata as the entity reference; the recorded duration rides in
   * `durationMins` for future enrichment. The Action id is the entityId so the
   * row can link to the task it tracked.
   *
   * Skipped for entries with no workspace (recordActivity requires a
   * workspaceId — personal/no-workspace timers can't appear in a workspace
   * feed). Fire-and-forget: instrumentation must never break a stop/start.
   */
  private async recordTracked(entry: CompletedEntry): Promise<void> {
    if (!entry.workspaceId) return;
    const durationMins = durationMinutes(entry.startedAt, entry.endedAt);
    await recordActivity(this.db, {
      workspaceId: entry.workspaceId,
      userId: entry.userId,
      entityType: "time_entry",
      entityId: entry.actionId,
      action: "created",
      metadata: { title: entry.actionName ?? "Untitled", durationMins },
    }).catch(() => {
      /* instrumentation failure is non-fatal */
    });
  }
}

/**
 * Safe `endedAt` for stopping a timer: always strictly after `startedAt`.
 * The DB enforces `endedAt > startedAt` (CHECK constraint), so a near-instant
 * stop or residual app/DB clock skew clamps up to startedAt + 1ms rather than
 * landing at-or-before startedAt and failing.
 */
export function safeEndedAt(startedAt: Date): Date {
  const now = new Date();
  return now.getTime() > startedAt.getTime()
    ? now
    : new Date(startedAt.getTime() + 1);
}

export function durationMinutes(startedAt: Date, endedAt: Date): number {
  const ms = endedAt.getTime() - startedAt.getTime();
  if (ms <= 0) return 0;
  return Math.round(ms / 60000);
}

export type { TimeEntry };
