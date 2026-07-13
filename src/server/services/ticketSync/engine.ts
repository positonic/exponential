import { Prisma } from "@prisma/client";
import type { PrismaClient, TicketStatus, TicketType } from "@prisma/client";
import { createTicketWithNumber } from "~/plugins/product/server/services/createTicket";
import {
  attachTicketTags,
  resolveOrCreateWorkspaceTags,
} from "../notionTicketImport";
import { mapPoints, mapPriority, mapStatus, mapType } from "./mapping";
import {
  mergeSyncedFields,
  SYNCED_FIELD_KEYS,
  type SyncedFieldKey,
  type SyncedFields,
} from "./merge";

/**
 * ticketSync/engine — one inbound sync run for a product's Notion link.
 *
 * Read-only against Notion: the engine NEVER writes to the remote side.
 * Local-side changes detected by the merge are deliberately left pending
 * (the snapshot is not advanced past them) so the outbound phase can pick
 * them up once push ships.
 *
 * Notion I/O goes through {@link TicketSyncRemoteAdapter} so tests drive the
 * engine with a plain fake; the real adapter lives in notionAdapter.ts.
 */

export interface RemoteTicketRow {
  /** Notion page id. */
  externalId: string;
  url: string | null;
  title: string;
  rawStatus: string | null;
  rawPriority: string | null;
  rawType: string | null;
  rawEffort: string | null;
  labels: string[];
  lastEditedAt: Date;
  /** True when the last edit was made by our own integration bot (echo). */
  lastEditedByBot: boolean;
  /** True when the page is in Notion's trash. */
  archived: boolean;
}

export interface TicketSyncRemoteAdapter {
  queryRows(params: {
    databaseId: string;
    editedAfter?: Date;
  }): Promise<RemoteTicketRow[]>;
  /** Page content as Markdown-ish text; fetched only when creating a ticket. */
  getPageBody?(externalId: string): Promise<string | null>;
}

export interface SyncRunItem {
  externalId: string | null;
  ticketId: string | null;
  title: string;
  action:
    | "created"
    | "updated"
    | "adopted"
    | "skipped"
    | "conflict"
    | "failed";
  reason?: string;
}

export interface InboundSyncResult {
  runId: string | null; // null only when the config itself failed to load
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  conflicts: number;
  failed: number;
  items: SyncRunItem[];
}

/**
 * Fields the inbound slice actively syncs. Cycle, assignee, and label
 * updates arrive in later slices — the engine neutralizes them (feeds the
 * merge identical values on both sides) so they can never produce writes.
 */
const ACTIVE_FIELDS: SyncedFieldKey[] = [
  "title",
  "status",
  "priority",
  "type",
  "points",
];

type StatusMap = Record<string, TicketStatus>;

interface LoadedTicket {
  id: string;
  title: string;
  status: TicketStatus;
  type: TicketType;
  priority: number | null;
  points: number | null;
  updatedAt: Date;
}

function ticketToSyncedFields(ticket: LoadedTicket): SyncedFields {
  return {
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    type: ticket.type,
    points: ticket.points,
    labels: [],
    cycleName: null,
    assigneeEmail: null,
  };
}

function rowToSyncedFields(
  row: RemoteTicketRow,
  statusMap: StatusMap | null,
  neutral: Pick<SyncedFields, "labels" | "cycleName" | "assigneeEmail">,
): { fields: SyncedFields; warnings: string[] } {
  const warnings: string[] = [];
  const { status, warning } = mapStatus(row.rawStatus, statusMap);
  if (warning) warnings.push(warning);
  return {
    fields: {
      title: row.title,
      status,
      priority: mapPriority(row.rawPriority) ?? null,
      type: mapType(row.rawType),
      points: mapPoints(row.rawEffort) ?? null,
      ...neutral,
    },
    warnings,
  };
}

/**
 * The snapshot to persist after an inbound-only run. Fields we wrote locally
 * are converged; fields the merge wanted to write REMOTELY were not written,
 * so their base must stay at the remote's current value — that keeps the
 * local edit detectable as a pending local change for the push phase, instead
 * of being reverted (remote would look changed) or forgotten (local would
 * look clean) on the next run.
 */
function buildInboundSnapshot(
  merged: ReturnType<typeof mergeSyncedFields>,
  remote: SyncedFields,
): SyncedFields {
  const snapshot = { ...merged.snapshot };
  for (const field of SYNCED_FIELD_KEYS) {
    if (field in merged.applyToRemote) {
      (snapshot as Record<string, unknown>)[field] = remote[field];
    }
  }
  return snapshot;
}

function extractNotionPageId(links: Prisma.JsonValue | null): string | null {
  if (!links || typeof links !== "object" || Array.isArray(links)) return null;
  const value = (links as Record<string, unknown>).notionPageId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function runInboundTicketSync(
  db: PrismaClient,
  adapter: TicketSyncRemoteAdapter,
  params: {
    configId: string;
    trigger: "manual" | "cron" | "agent";
    dryRun?: boolean;
  },
): Promise<InboundSyncResult> {
  const dryRun = params.dryRun ?? false;
  const startedAt = new Date();

  const config = await db.ticketSyncConfig.findUniqueOrThrow({
    where: { id: params.configId },
    include: { product: { select: { id: true, workspaceId: true } } },
  });

  const run = await db.ticketSyncRun.create({
    data: {
      configId: config.id,
      trigger: params.trigger,
      direction: "pull",
      dryRun,
      status: "running",
      startedAt,
    },
  });

  const items: SyncRunItem[] = [];
  const counts = { created: 0, updated: 0, skipped: 0, conflicts: 0, failed: 0 };
  const statusMap = (config.statusMap ?? null) as StatusMap | null;

  try {
    // ------------------------------------------------------------------
    // 0. Adopt pre-existing tickets that carry Notion provenance in their
    //    links JSON (the FROM-NOTION import cohort) into sync records.
    // ------------------------------------------------------------------
    const unlinked = await db.ticket.findMany({
      where: {
        productId: config.productId,
        links: { not: Prisma.DbNull },
        syncs: { none: { configId: config.id } },
      },
      select: { id: true, title: true, links: true },
    });

    const adoptable = unlinked
      .map((t) => ({ ...t, notionPageId: extractNotionPageId(t.links) }))
      .filter((t): t is typeof t & { notionPageId: string } => !!t.notionPageId);

    if (!dryRun) {
      for (const ticket of adoptable) {
        try {
          await db.ticketSync.create({
            data: {
              configId: config.id,
              ticketId: ticket.id,
              provider: config.provider,
              externalId: ticket.notionPageId,
              // No snapshot: the first merge treats differences as two-sided
              // changes and resolves by last-write-wins.
              snapshot: Prisma.DbNull,
            },
          });
          items.push({
            externalId: ticket.notionPageId,
            ticketId: ticket.id,
            title: ticket.title,
            action: "adopted",
            reason: "linked via stored notionPageId",
          });
        } catch {
          // Unique collision (row raced in or another ticket claims the same
          // page) — leave it; the row pass will report the state.
        }
      }
    } else {
      for (const ticket of adoptable) {
        items.push({
          externalId: ticket.notionPageId,
          ticketId: ticket.id,
          title: ticket.title,
          action: "adopted",
          reason: "would link via stored notionPageId",
        });
      }
    }

    // ------------------------------------------------------------------
    // 1. Pull the remote window (full scan on first run, incremental after).
    // ------------------------------------------------------------------
    const rows = await adapter.queryRows({
      databaseId: config.databaseId,
      editedAfter: config.lastPulledAt ?? undefined,
    });

    const records = await db.ticketSync.findMany({
      where: { configId: config.id },
      select: {
        id: true,
        ticketId: true,
        externalId: true,
        snapshot: true,
        tombstonedAt: true,
      },
    });
    const recordByExternalId = new Map(records.map((r) => [r.externalId, r]));

    for (const row of rows) {
      try {
        if (row.archived) {
          counts.skipped++;
          items.push({
            externalId: row.externalId,
            ticketId: recordByExternalId.get(row.externalId)?.ticketId ?? null,
            title: row.title,
            action: "skipped",
            reason: "page is in Notion trash (archive propagation ships in a later slice)",
          });
          continue;
        }

        if (row.lastEditedByBot) {
          counts.skipped++;
          items.push({
            externalId: row.externalId,
            ticketId: recordByExternalId.get(row.externalId)?.ticketId ?? null,
            title: row.title,
            action: "skipped",
            reason: "last edit was ours (echo suppression)",
          });
          continue;
        }

        const record = recordByExternalId.get(row.externalId);

        if (!record) {
          // ----------------------------------------------------------
          // Create: unseen Notion row → new ticket.
          // ----------------------------------------------------------
          const { fields, warnings } = rowToSyncedFields(row, statusMap, {
            labels: row.labels,
            cycleName: null,
            assigneeEmail: null,
          });

          if (dryRun) {
            counts.created++;
            items.push({
              externalId: row.externalId,
              ticketId: null,
              title: row.title,
              action: "created",
              reason:
                ["would create ticket", ...warnings].join("; "),
            });
            continue;
          }

          const body = adapter.getPageBody
            ? await adapter.getPageBody(row.externalId)
            : null;

          const ticket = await createTicketWithNumber(db, {
            productId: config.productId,
            workspaceId: config.product.workspaceId,
            createdById: config.createdById,
            title: fields.title,
            body,
            type: fields.type,
            status: fields.status,
            priority: fields.priority,
            points: fields.points,
            links: {
              ...(row.url ? { notion: row.url } : {}),
              notionPageId: row.externalId,
            },
          });

          if (row.labels.length > 0) {
            const tagIds = await resolveOrCreateWorkspaceTags(db, {
              workspaceId: config.product.workspaceId,
              userId: config.createdById,
              names: row.labels,
            });
            await attachTicketTags(db, ticket.id, tagIds);
          }

          await db.ticketSync.create({
            data: {
              configId: config.id,
              ticketId: ticket.id,
              provider: config.provider,
              externalId: row.externalId,
              externalUrl: row.url,
              snapshot: fields as unknown as Prisma.InputJsonValue,
              lastSyncedAt: new Date(),
            },
          });

          counts.created++;
          items.push({
            externalId: row.externalId,
            ticketId: ticket.id,
            title: fields.title,
            action: "created",
            reason: warnings.length > 0 ? warnings.join("; ") : undefined,
          });
          continue;
        }

        // ----------------------------------------------------------
        // Update: linked row changed within the window → merge.
        // ----------------------------------------------------------
        const ticket = await db.ticket.findUnique({
          where: { id: record.ticketId },
          select: {
            id: true,
            title: true,
            status: true,
            type: true,
            priority: true,
            points: true,
            updatedAt: true,
          },
        });
        if (!ticket) {
          counts.failed++;
          items.push({
            externalId: row.externalId,
            ticketId: record.ticketId,
            title: row.title,
            action: "failed",
            reason: "sync record points at a missing ticket",
          });
          continue;
        }

        const local = ticketToSyncedFields(ticket);
        const { fields: remote, warnings } = rowToSyncedFields(row, statusMap, {
          labels: local.labels,
          cycleName: local.cycleName,
          assigneeEmail: local.assigneeEmail,
        });

        const merged = mergeSyncedFields({
          base: (record.snapshot ?? null) as Partial<SyncedFields> | null,
          local,
          remote,
          localEditedAt: ticket.updatedAt,
          remoteEditedAt: row.lastEditedAt,
        });

        const localWrites = Object.fromEntries(
          Object.entries(merged.applyToLocal).filter(([key]) =>
            (ACTIVE_FIELDS as string[]).includes(key),
          ),
        ) as Partial<Pick<SyncedFields, "title" | "status" | "priority" | "type" | "points">>;

        const hasLocalWrites = Object.keys(localWrites).length > 0;
        const hasConflicts = merged.conflicts.length > 0;

        if (dryRun) {
          if (hasLocalWrites || hasConflicts) {
            counts.updated++;
            if (hasConflicts) counts.conflicts += merged.conflicts.length;
            items.push({
              externalId: row.externalId,
              ticketId: ticket.id,
              title: row.title,
              action: hasConflicts ? "conflict" : "updated",
              reason: [
                `would set ${Object.keys(localWrites).join(", ") || "nothing"}`,
                ...merged.conflicts.map(
                  (c) => `conflict on ${c.field}: ${c.winner} wins`,
                ),
                ...warnings,
              ].join("; "),
            });
          } else {
            counts.skipped++;
            items.push({
              externalId: row.externalId,
              ticketId: ticket.id,
              title: row.title,
              action: "skipped",
              reason: "in sync",
            });
          }
          continue;
        }

        if (hasLocalWrites) {
          await db.ticket.update({
            where: { id: ticket.id },
            data: localWrites,
          });
        }

        await db.ticketSync.update({
          where: { id: record.id },
          data: {
            snapshot: buildInboundSnapshot(merged, remote) as unknown as Prisma.InputJsonValue,
            externalUrl: row.url ?? undefined,
            lastSyncedAt: new Date(),
          },
        });

        if (hasLocalWrites || hasConflicts) {
          counts.updated++;
          if (hasConflicts) counts.conflicts += merged.conflicts.length;
          items.push({
            externalId: row.externalId,
            ticketId: ticket.id,
            title: row.title,
            action: hasConflicts ? "conflict" : "updated",
            reason: [
              Object.keys(localWrites).length > 0
                ? `set ${Object.keys(localWrites).join(", ")}`
                : "no local writes",
              ...merged.conflicts.map(
                (c) => `conflict on ${c.field}: ${c.winner} wins`,
              ),
              ...warnings,
            ].join("; "),
          });
        } else {
          counts.skipped++;
          items.push({
            externalId: row.externalId,
            ticketId: ticket.id,
            title: row.title,
            action: "skipped",
            reason: "in sync",
          });
        }
      } catch (error) {
        counts.failed++;
        items.push({
          externalId: row.externalId,
          ticketId: null,
          title: row.title,
          action: "failed",
          reason: error instanceof Error ? error.message : "unknown error",
        });
      }
    }

    await db.ticketSyncRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        created: counts.created,
        updated: counts.updated,
        skipped: counts.skipped,
        conflicts: counts.conflicts,
        items: items as unknown as Prisma.InputJsonValue,
      },
    });

    if (!dryRun) {
      await db.ticketSyncConfig.update({
        where: { id: config.id },
        data: { lastPulledAt: startedAt },
      });
    }

    return { runId: run.id, dryRun, ...counts, items };
  } catch (error) {
    await db.ticketSyncRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : "unknown error",
        items: items as unknown as Prisma.InputJsonValue,
      },
    });
    throw error;
  }
}
