import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Per-entity counts produced by a backfill run. Sources that produced zero
 * rows still appear in the summary so callers can tell "no actions in this
 * workspace yet" from "we forgot to walk the table."
 */
export interface BackfillCounts {
  action: number;
  actionCreated: number;
  ticket: number;
  actionComment: number;
  ticketComment: number;
}

export interface BackfillResult {
  /** Total rows inserted into WorkspaceActivityEvent across all sources. */
  total: number;
  counts: BackfillCounts;
  /** True when the workspace already had events and `force` wasn't set. */
  skipped: boolean;
}

/** Batch size when calling `createMany` — keeps any single round-trip bounded. */
const BATCH_SIZE = 500;

interface BackfillRow {
  workspaceId: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  metadata: Prisma.InputJsonValue;
  createdAt: Date;
}

/**
 * Insert rows in fixed-size batches via `createMany` so we don't hammer
 * Postgres with a single 50k-row write on large workspaces.
 */
async function insertBatched(
  db: PrismaClient,
  rows: BackfillRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const res = await db.workspaceActivityEvent.createMany({ data: slice });
    inserted += res.count;
  }
  return inserted;
}

/**
 * One-time, idempotent backfill that seeds `WorkspaceActivityEvent` from the
 * `completedAt` / `updatedAt` / `createdAt` of existing entities so the
 * heatmap and activity feed look alive on day one rather than empty for the
 * preceding twelve months.
 *
 * Idempotency:
 * - If the workspace already has any `WorkspaceActivityEvent` rows, this is a
 *   no-op and returns `{ skipped: true, ... }` with zero counts.
 * - Pass `force: true` to re-emit even when rows exist. This MAY produce
 *   duplicate rows; the table has no natural unique key for backfill
 *   deduplication, so callers asking for `force` accept that.
 *
 * Metadata is sparse on purpose — backfilled rows are best-effort and don't
 * try to reconstruct full provenance. Every row carries `{ backfilled: true }`
 * plus the entity's name / title / parent id if cheaply derivable.
 */
export async function backfillWorkspaceActivity(
  db: PrismaClient,
  args: { workspaceId: string; force?: boolean },
): Promise<BackfillResult> {
  const { workspaceId } = args;
  const force = args.force === true;

  const empty: BackfillCounts = {
    action: 0,
    actionCreated: 0,
    ticket: 0,
    actionComment: 0,
    ticketComment: 0,
  };

  if (!force) {
    const existing = await db.workspaceActivityEvent.findFirst({
      where: { workspaceId },
      select: { id: true },
    });
    if (existing) {
      return { total: 0, counts: empty, skipped: true };
    }
  }

  // ── Walk Action rows ───────────────────────────────────────────────
  // Actions can be scoped to the workspace directly OR inherit via project.
  // The Action model has no `updatedAt`, so we can't honestly emit an
  // `updated` event during backfill. We emit:
  //   * `created` for every action (at its `createdAt`)
  //   * `completed` for actions with `completedAt` set
  // …which gives the heatmap real, verifiable signal without fabricating
  // update events we can't actually time.
  const actionRows = await db.action.findMany({
    where: {
      OR: [
        { workspaceId },
        { project: { workspaceId } },
      ],
    },
    select: {
      id: true,
      name: true,
      createdById: true,
      createdAt: true,
      completedAt: true,
    },
  });

  const completedRows: BackfillRow[] = [];
  const createdRows: BackfillRow[] = [];
  for (const action of actionRows) {
    createdRows.push({
      workspaceId,
      userId: action.createdById,
      entityType: "action",
      entityId: action.id,
      action: "created",
      metadata: { backfilled: true, name: action.name },
      createdAt: action.createdAt,
    });
    if (action.completedAt) {
      completedRows.push({
        workspaceId,
        userId: action.createdById,
        entityType: "action",
        entityId: action.id,
        action: "completed",
        metadata: { backfilled: true, name: action.name },
        createdAt: action.completedAt,
      });
    }
  }

  // ── Walk Ticket rows ───────────────────────────────────────────────
  const ticketRows = await db.ticket.findMany({
    where: { product: { workspaceId } },
    select: {
      id: true,
      title: true,
      createdById: true,
      assigneeId: true,
      updatedAt: true,
    },
  });
  const ticketEvents: BackfillRow[] = ticketRows.map((ticket) => ({
    workspaceId,
    // Prefer the assignee for "who touched it most recently"; fall back to
    // the creator so userId is rarely null even pre-T7.
    userId: ticket.assigneeId ?? ticket.createdById,
    entityType: "ticket",
    entityId: ticket.id,
    action: "updated",
    metadata: { backfilled: true, title: ticket.title },
    createdAt: ticket.updatedAt,
  }));

  // ── Walk ActionComment rows ────────────────────────────────────────
  const actionCommentRows = await db.actionComment.findMany({
    where: {
      action: {
        OR: [{ workspaceId }, { project: { workspaceId } }],
      },
    },
    select: {
      id: true,
      actionId: true,
      authorId: true,
      createdAt: true,
    },
  });
  const actionCommentEvents: BackfillRow[] = actionCommentRows.map((comment) => ({
    workspaceId,
    userId: comment.authorId,
    entityType: "action_comment",
    entityId: comment.id,
    action: "created",
    metadata: { backfilled: true, actionId: comment.actionId },
    createdAt: comment.createdAt,
  }));

  // ── Walk TicketComment rows ────────────────────────────────────────
  const ticketCommentRows = await db.ticketComment.findMany({
    where: { ticket: { product: { workspaceId } } },
    select: {
      id: true,
      ticketId: true,
      authorId: true,
      createdAt: true,
    },
  });
  const ticketCommentEvents: BackfillRow[] = ticketCommentRows.map((comment) => ({
    workspaceId,
    userId: comment.authorId,
    entityType: "ticket_comment",
    entityId: comment.id,
    action: "created",
    metadata: { backfilled: true, ticketId: comment.ticketId },
    createdAt: comment.createdAt,
  }));

  const counts: BackfillCounts = {
    action: await insertBatched(db, completedRows),
    actionCreated: await insertBatched(db, createdRows),
    ticket: await insertBatched(db, ticketEvents),
    actionComment: await insertBatched(db, actionCommentEvents),
    ticketComment: await insertBatched(db, ticketCommentEvents),
  };

  const total =
    counts.action +
    counts.actionCreated +
    counts.ticket +
    counts.actionComment +
    counts.ticketComment;

  return { total, counts, skipped: false };
}
