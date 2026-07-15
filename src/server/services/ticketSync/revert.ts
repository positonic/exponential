import { type Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { recordActivity } from "~/server/services/activity/recordActivity";
import type { SyncRunItem } from "./engine";

/**
 * ticketSync/revert — undo what one or more Sync runs *created* (ADR-0042).
 *
 * Strictly creation-undo: only `items[action === "created"]` tickets are
 * touched — never `adopted` (the sync didn't create those) and never
 * `updated` (pre-sync values aren't kept; revert is not a time machine).
 * Deletion is hard: an archived sync ticket would keep its Notion page id and
 * be re-adopted (and un-archived) by the next sync — zombie resurrection.
 *
 * The safety net is the local-work guardrail: any human-touch signal on a
 * ticket skips it, with no bulk override — over-skipping is cheap (the
 * single-ticket delete exists), under-skipping is irreversible. Skipped
 * survivors get their sync link tombstoned so a revived connection can't
 * keep overwriting them, while their provenance stays intact.
 *
 * A revert is itself a Sync run (`direction: "revert"`) with the same
 * per-item outcome shape, and stamps the reverted runs (`revertedAt`,
 * `revertedByRunId`) in the same transaction — a run is revertible at most
 * once, enforced under concurrency by the stamp's null-guard.
 */

/** Sentinel stored inside the link snapshot JSON by revert-tombstoning.
 * Distinguishes "stop syncing forever" (revert) from the archive-mirror
 * tombstone the engine restores when a page leaves the Notion trash. */
export const REVERT_TOMBSTONE_KEY = "revertTombstoned";

export interface RevertRunItem {
  externalId: string | null;
  ticketId: string | null;
  title: string;
  action: "deleted" | "skipped";
  reason?: string;
}

export interface RevertPlanEntry {
  runId: string;
  ticketId: string;
  externalId: string | null;
  title: string;
}

export interface RevertPlanSkip extends RevertPlanEntry {
  reasons: string[];
}

export interface TicketSyncRevertPlan {
  configId: string;
  runIds: string[];
  /** Tickets the revert will hard-delete. */
  deletable: RevertPlanEntry[];
  /** Tickets protected by the local-work guardrail (link gets tombstoned). */
  skipped: RevertPlanSkip[];
  /** Created-items whose ticket is already gone — nothing to do. */
  missing: RevertPlanEntry[];
}

export interface TicketSyncRevertResult {
  revertRunId: string;
  deleted: number;
  skipped: number;
  items: RevertRunItem[];
}

interface SyncedSnapshotScalars {
  title?: string;
  status?: string;
  priority?: number | null;
  type?: string;
  points?: number | null;
}

function asRunItems(items: Prisma.JsonValue | null): SyncRunItem[] {
  return Array.isArray(items) ? (items as unknown as SyncRunItem[]) : [];
}

/**
 * Build the revert plan for a set of run ids: which tickets would be deleted,
 * which are protected by the guardrail (and why), which are already gone.
 * Pure read — powers both the preview endpoint and the execute path (which
 * re-plans server-side; the client's preview is never trusted).
 *
 * Throws PRECONDITION_FAILED when any requested run is not revertible
 * (wrong config, dry run, wrong direction, already reverted, no created
 * items) — eligibility is the caller-visible contract, not a silent filter.
 */
export async function planTicketSyncRevert(
  db: PrismaClient,
  params: { configId: string; runIds: string[] },
): Promise<TicketSyncRevertPlan> {
  if (params.runIds.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No runs selected to revert",
    });
  }

  const runs = await db.ticketSyncRun.findMany({
    where: { id: { in: params.runIds }, configId: params.configId },
    select: {
      id: true,
      direction: true,
      dryRun: true,
      revertedAt: true,
      items: true,
    },
  });
  const byId = new Map(runs.map((r) => [r.id, r]));

  for (const runId of params.runIds) {
    const run = byId.get(runId);
    if (!run) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Run ${runId} not found on this connection`,
      });
    }
    if (run.direction !== "pull" || run.dryRun) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Run ${runId} is not a real pull run`,
      });
    }
    if (run.revertedAt) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Run ${runId} has already been reverted`,
      });
    }
  }

  // Created-items only — the whole point of the run ledger is that this set
  // is authoritative (Ticket.links.notionPageId alone is ambiguous: imports
  // stamp it too, and adopted tickets were never created by the sync).
  const createdEntries: RevertPlanEntry[] = [];
  for (const run of runs) {
    for (const item of asRunItems(run.items)) {
      if (item.action === "created" && item.ticketId) {
        createdEntries.push({
          runId: run.id,
          ticketId: item.ticketId,
          externalId: item.externalId,
          title: item.title,
        });
      }
    }
  }
  if (createdEntries.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "The selected runs created no tickets",
    });
  }

  const ticketIds = createdEntries.map((e) => e.ticketId);
  const tickets = await db.ticket.findMany({
    where: { id: { in: ticketIds } },
    select: {
      id: true,
      title: true,
      status: true,
      type: true,
      priority: true,
      points: true,
      prUrl: true,
      branchName: true,
      assigneeId: true,
      featureId: true,
      epicId: true,
      scopeId: true,
      cycleId: true,
      _count: {
        select: { comments: true, actions: true, depsOut: true, depsIn: true },
      },
    },
  });
  const ticketById = new Map(tickets.map((t) => [t.id, t]));

  const links = await db.ticketSync.findMany({
    where: { configId: params.configId, ticketId: { in: ticketIds } },
    select: { ticketId: true, snapshot: true },
  });
  const snapshotByTicketId = new Map(
    links.map((l) => [l.ticketId, l.snapshot]),
  );

  const deletable: RevertPlanEntry[] = [];
  const skipped: RevertPlanSkip[] = [];
  const missing: RevertPlanEntry[] = [];

  for (const entry of createdEntries) {
    const ticket = ticketById.get(entry.ticketId);
    if (!ticket) {
      missing.push(entry);
      continue;
    }

    const reasons: string[] = [];
    if (ticket._count.comments > 0) reasons.push("has comments");
    if (ticket._count.actions > 0) reasons.push("has linked actions");
    if (ticket._count.depsOut + ticket._count.depsIn > 0)
      reasons.push("has ticket dependencies");
    if (ticket.prUrl) reasons.push("has a PR linked");
    if (ticket.branchName) reasons.push("has a branch name");
    if (ticket.assigneeId) reasons.push("has an assignee");
    if (ticket.featureId) reasons.push("linked to a feature");
    if (ticket.epicId) reasons.push("linked to an epic");
    if (ticket.scopeId) reasons.push("linked to a scope");
    if (ticket.cycleId) reasons.push("linked to a cycle");

    // Synced-field drift vs the link snapshot = a local edit since the last
    // sync. Missing snapshot (never re-synced) means nothing to compare.
    const snapshot = snapshotByTicketId.get(entry.ticketId) as
      | SyncedSnapshotScalars
      | null
      | undefined;
    if (snapshot && typeof snapshot === "object") {
      const drifted: string[] = [];
      if (snapshot.title !== undefined && snapshot.title !== ticket.title)
        drifted.push("title");
      if (snapshot.status !== undefined && snapshot.status !== ticket.status)
        drifted.push("status");
      if (
        snapshot.priority !== undefined &&
        (snapshot.priority ?? null) !== ticket.priority
      )
        drifted.push("priority");
      if (snapshot.type !== undefined && snapshot.type !== ticket.type)
        drifted.push("type");
      if (
        snapshot.points !== undefined &&
        (snapshot.points ?? null) !== ticket.points
      )
        drifted.push("points");
      if (drifted.length > 0)
        reasons.push(`local edits since last sync (${drifted.join(", ")})`);
    }

    if (reasons.length > 0) {
      skipped.push({ ...entry, title: ticket.title, reasons });
    } else {
      deletable.push({ ...entry, title: ticket.title });
    }
  }

  return {
    configId: params.configId,
    runIds: params.runIds,
    deletable,
    skipped,
    missing,
  };
}

/**
 * Execute a revert: re-plan, then atomically stamp the reverted runs, delete
 * the deletable tickets, and tombstone the skipped survivors' links. Records
 * itself as a `direction: "revert"` run and posts ONE `reverted` activity
 * event (feed altitude — never one per ticket).
 */
export async function executeTicketSyncRevert(
  db: PrismaClient,
  params: {
    configId: string;
    runIds: string[];
    triggeredById?: string | null;
  },
): Promise<TicketSyncRevertResult> {
  const config = await db.ticketSyncConfig.findUniqueOrThrow({
    where: { id: params.configId },
    include: { product: { select: { id: true, workspaceId: true } } },
  });

  const plan = await planTicketSyncRevert(db, {
    configId: params.configId,
    runIds: params.runIds,
  });

  const revertRun = await db.ticketSyncRun.create({
    data: {
      configId: config.id,
      trigger: "manual",
      direction: "revert",
      dryRun: false,
      status: "running",
      triggeredById: params.triggeredById ?? null,
    },
  });

  const items: RevertRunItem[] = [
    ...plan.deletable.map((e) => ({
      externalId: e.externalId,
      ticketId: e.ticketId,
      title: e.title,
      action: "deleted" as const,
    })),
    ...plan.skipped.map((e) => ({
      externalId: e.externalId,
      ticketId: e.ticketId,
      title: e.title,
      action: "skipped" as const,
      reason: e.reasons.join("; "),
    })),
    ...plan.missing.map((e) => ({
      externalId: e.externalId,
      ticketId: e.ticketId,
      title: e.title,
      action: "skipped" as const,
      reason: "ticket already deleted",
    })),
  ];

  try {
    await db.$transaction(async (tx) => {
      // Stamp first, with a null-guard: if a concurrent revert got here
      // before us the count mismatches and the whole transaction rolls
      // back — a run is revertible at most once.
      const stamped = await tx.ticketSyncRun.updateMany({
        where: {
          id: { in: plan.runIds },
          configId: config.id,
          revertedAt: null,
        },
        data: { revertedAt: new Date(), revertedByRunId: revertRun.id },
      });
      if (stamped.count !== plan.runIds.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "A selected run was reverted concurrently",
        });
      }

      // Hard-delete the created tickets. Their TicketSync links cascade away
      // with them; the run ledger keeps the forensic record.
      if (plan.deletable.length > 0) {
        await tx.ticket.deleteMany({
          where: { id: { in: plan.deletable.map((e) => e.ticketId) } },
        });
      }

      // Tombstone the skipped survivors' links so a revived connection can't
      // keep overwriting them. The snapshot sentinel distinguishes this
      // permanent tombstone from the archive-mirror one the engine restores
      // when a page leaves the Notion trash.
      for (const skip of plan.skipped) {
        const link = await tx.ticketSync.findUnique({
          where: {
            ticketId_provider: {
              ticketId: skip.ticketId,
              provider: config.provider,
            },
          },
          select: { id: true, snapshot: true },
        });
        if (!link) continue;
        const priorSnapshot =
          link.snapshot && typeof link.snapshot === "object" && !Array.isArray(link.snapshot)
            ? (link.snapshot)
            : {};
        await tx.ticketSync.update({
          where: { id: link.id },
          data: {
            tombstonedAt: new Date(),
            snapshot: {
              ...priorSnapshot,
              [REVERT_TOMBSTONE_KEY]: true,
            } as Prisma.InputJsonValue,
          },
        });
      }
    });
  } catch (error) {
    await db.ticketSyncRun.update({
      where: { id: revertRun.id },
      data: {
        status: "error",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : "unknown error",
        items: items as unknown as Prisma.InputJsonValue,
      },
    });
    throw error;
  }

  await db.ticketSyncRun.update({
    where: { id: revertRun.id },
    data: {
      status: "success",
      finishedAt: new Date(),
      skipped: plan.skipped.length + plan.missing.length,
      items: items as unknown as Prisma.InputJsonValue,
    },
  });

  // ONE event per revert (feed altitude, ADR-0042) — the per-ticket story
  // lives in the revert run's items, not the feed. Never throws.
  await recordActivity(db, {
    workspaceId: config.product.workspaceId,
    userId: params.triggeredById ?? null,
    entityType: "ticket_sync_run",
    entityId: revertRun.id,
    action: "reverted",
    metadata: {
      title: `${plan.deletable.length} deleted · ${plan.skipped.length} skipped`,
      productId: config.productId,
      deleted: plan.deletable.length,
      skipped: plan.skipped.length,
      runIds: plan.runIds,
    },
  });

  return {
    revertRunId: revertRun.id,
    deleted: plan.deletable.length,
    skipped: plan.skipped.length + plan.missing.length,
    items,
  };
}
