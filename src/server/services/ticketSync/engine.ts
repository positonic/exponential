import { Prisma } from "@prisma/client";
import type { PrismaClient, TicketStatus, TicketType } from "@prisma/client";
import { createTicketWithNumber } from "~/plugins/product/server/services/createTicket";
import { recordActivity } from "~/server/services/activity/recordActivity";
import {
  attachTicketTags,
  resolveOrCreateWorkspaceTags,
} from "../notionTicketImport";
import { mapPoints, mapPriority, mapStatus, mapType } from "./mapping";
import { REVERT_TOMBSTONE_KEY } from "./revert";
import {
  findCycleIdByName,
  resolveAssigneeIdByEmail,
  resolveCycleIdByName,
} from "./resolvers";
import {
  fieldEquals,
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
  /** Resolved title of the first page in the cycle relation, if any. */
  cycleName: string | null;
  /** Email of the first person in the assignee property, if visible. */
  assigneeEmail: string | null;
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
    /** Restrict to rows whose relation property contains a page (scoped runs). */
    relationScope?: { property: string; contains: string };
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
    | "archived"
    | "failed";
  reason?: string;
  /** Mapped-field preview, present on dry-run creation items only. */
  preview?: {
    status: TicketStatus;
    type: TicketType;
    priority: number | null;
    points: number | null;
    labels: string[];
    url: string | null;
  };
}

export interface InboundSyncResult {
  runId: string | null; // null only when the config itself failed to load
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  conflicts: number;
  archived: number;
  failed: number;
  items: SyncRunItem[];
}

/**
 * Fields that copy straight onto Ticket columns. Cycle and assignee are
 * relational (name/email → id, via resolvers.ts); labels are still
 * neutralized (label sync arrives with the push phase).
 */
const SCALAR_FIELDS: SyncedFieldKey[] = [
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
  cycle: { name: string } | null;
  assignee: { email: string | null } | null;
}

function ticketToSyncedFields(ticket: LoadedTicket): SyncedFields {
  return {
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    type: ticket.type,
    points: ticket.points,
    labels: [],
    cycleName: ticket.cycle?.name ?? null,
    assigneeEmail: ticket.assignee?.email ?? null,
  };
}

function rowToSyncedFields(
  row: RemoteTicketRow,
  statusMap: StatusMap | null,
  neutral: Pick<SyncedFields, "labels">,
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
      cycleName: row.cycleName,
      assigneeEmail: row.assigneeEmail,
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

/**
 * Read-only preview of the relational resolutions the write path would
 * perform, so a dry-run manifest names the real outcome ("would create cycle
 * X", "no member for email Y") instead of a bare "would set cycleName".
 */
async function relationalPreviewWarnings(
  db: PrismaClient,
  workspaceId: string,
  fields: Partial<Pick<SyncedFields, "cycleName" | "assigneeEmail">>,
): Promise<string[]> {
  const warnings: string[] = [];
  if (fields.cycleName) {
    const existing = await findCycleIdByName(db, {
      workspaceId,
      name: fields.cycleName,
    });
    warnings.push(
      existing
        ? `would assign existing cycle "${fields.cycleName}"`
        : `would create cycle "${fields.cycleName}"`,
    );
  }
  if (fields.assigneeEmail) {
    const assigneeId = await resolveAssigneeIdByEmail(db, {
      workspaceId,
      email: fields.assigneeEmail,
    });
    if (!assigneeId) {
      warnings.push(
        `no workspace member with email ${fields.assigneeEmail} — assignee would be left unchanged`,
      );
    }
  }
  return warnings;
}

function hasRevertTombstone(snapshot: Prisma.JsonValue | null): boolean {
  return (
    !!snapshot &&
    typeof snapshot === "object" &&
    !Array.isArray(snapshot) &&
    (snapshot as Record<string, unknown>)[REVERT_TOMBSTONE_KEY] === true
  );
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
    /** Acting user for the run ledger; null for cron/agent triggers. */
    triggeredById?: string | null;
    /**
     * Restrict the run to rows whose relation property contains a page
     * (e.g. one Notion cycle). Scoped runs always full-scan their subset and
     * never advance the incremental window.
     */
    scope?: { relationProperty: string; relationContains: string };
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
      triggeredById: params.triggeredById ?? null,
    },
  });

  const items: SyncRunItem[] = [];
  const counts = { created: 0, updated: 0, skipped: 0, conflicts: 0, archived: 0, failed: 0 };
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
      editedAfter: params.scope
        ? undefined
        : (config.lastPulledAt ?? undefined),
      relationScope: params.scope
        ? {
            property: params.scope.relationProperty,
            contains: params.scope.relationContains,
          }
        : undefined,
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
          // Archive ↔ archive, never hard-delete: a trashed linked page
          // archives its ticket and tombstones the sync record. The snapshot
          // status is advanced to ARCHIVED so that a later restore reads the
          // ticket's ARCHIVED as "unchanged" and lets the remote status win.
          const record = recordByExternalId.get(row.externalId);

          if (!record) {
            counts.skipped++;
            items.push({
              externalId: row.externalId,
              ticketId: null,
              title: row.title,
              action: "skipped",
              reason: "trashed page was never linked to a ticket",
            });
            continue;
          }

          if (record.tombstonedAt) {
            counts.skipped++;
            items.push({
              externalId: row.externalId,
              ticketId: record.ticketId,
              title: row.title,
              action: "skipped",
              reason: "already archived",
            });
            continue;
          }

          if (dryRun) {
            counts.archived++;
            items.push({
              externalId: row.externalId,
              ticketId: record.ticketId,
              title: row.title,
              action: "archived",
              reason: "would archive ticket (page is in Notion trash)",
            });
            continue;
          }

          const priorSnapshot =
            (record.snapshot as Partial<SyncedFields> | null) ?? {};
          await db.$transaction([
            db.ticket.update({
              where: { id: record.ticketId },
              data: { status: "ARCHIVED" },
            }),
            db.ticketSync.update({
              where: { id: record.id },
              data: {
                tombstonedAt: new Date(),
                snapshot: {
                  ...priorSnapshot,
                  status: "ARCHIVED",
                } as unknown as Prisma.InputJsonValue,
                lastSyncedAt: new Date(),
              },
            }),
          ]);

          counts.archived++;
          items.push({
            externalId: row.externalId,
            ticketId: record.ticketId,
            title: row.title,
            action: "archived",
            reason: "page is in Notion trash",
          });
          continue;
        }

        const record = recordByExternalId.get(row.externalId);

        // Echo suppression for rows we never linked stays row-level: an unseen
        // bot-edited row can only be our own residue, never a pending human
        // change. Linked rows are handled snapshot-aware below (smoky.wolf).
        if (row.lastEditedByBot && !record) {
          counts.skipped++;
          items.push({
            externalId: row.externalId,
            ticketId: null,
            title: row.title,
            action: "skipped",
            reason: "last edit was ours (echo suppression)",
          });
          continue;
        }

        if (!record) {
          // ----------------------------------------------------------
          // Create: unseen Notion row → new ticket.
          // ----------------------------------------------------------
          const { fields, warnings } = rowToSyncedFields(row, statusMap, {
            labels: row.labels,
          });

          if (dryRun) {
            warnings.push(
              ...(await relationalPreviewWarnings(
                db,
                config.product.workspaceId,
                fields,
              )),
            );
            counts.created++;
            items.push({
              externalId: row.externalId,
              ticketId: null,
              title: row.title,
              action: "created",
              reason:
                ["would create ticket", ...warnings].join("; "),
              preview: {
                status: fields.status,
                type: fields.type,
                priority: fields.priority,
                points: fields.points,
                labels: fields.labels,
                url: row.url,
              },
            });
            continue;
          }

          const body = adapter.getPageBody
            ? await adapter.getPageBody(row.externalId)
            : null;

          let cycleId: string | null = null;
          if (fields.cycleName) {
            const resolved = await resolveCycleIdByName(db, {
              workspaceId: config.product.workspaceId,
              name: fields.cycleName,
              createdById: config.createdById,
            });
            cycleId = resolved.cycleId;
            if (resolved.created) {
              warnings.push(`created cycle "${fields.cycleName}"`);
            }
          }

          let assigneeId: string | null = null;
          if (fields.assigneeEmail) {
            assigneeId = await resolveAssigneeIdByEmail(db, {
              workspaceId: config.product.workspaceId,
              email: fields.assigneeEmail,
            });
            if (!assigneeId) {
              warnings.push(
                `no workspace member with email ${fields.assigneeEmail} — left unassigned`,
              );
              // Snapshot must reflect the actual local state so the remote
              // assignee stays visible as a pending inbound change.
              fields.assigneeEmail = null;
            }
          }

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
            cycleId,
            assigneeId,
            links: {
              ...(row.url ? { notion: row.url } : {}),
              notionPageId: row.externalId,
            },
            // Feed altitude: the run posts ONE `synced` event; per-ticket
            // `created` events would flood the feed (99-row incident).
            suppressActivity: true,
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

        // A revert-tombstoned link is permanent: the survivor kept local
        // work, so a revived connection must never overwrite it again
        // (ADR-0042). Distinct from the archive-mirror tombstone below,
        // which restores when the page leaves the Notion trash.
        if (record.tombstonedAt && hasRevertTombstone(record.snapshot)) {
          counts.skipped++;
          items.push({
            externalId: row.externalId,
            ticketId: record.ticketId,
            title: row.title,
            action: "skipped",
            reason: "link tombstoned by revert — no longer syncing",
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
            cycle: { select: { name: true } },
            assignee: { select: { email: true } },
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
        });

        // A tombstoned record whose page is out of the trash re-links here:
        // the archive-time snapshot (status ARCHIVED) makes the ticket's
        // ARCHIVED read as unchanged, so the remote status wins the merge.
        const restoring = record.tombstonedAt !== null;
        if (restoring) warnings.unshift("restored from Notion trash");

        // Snapshot-aware echo suppression (smoky.wolf): our own last write is a
        // pure echo only while every remote field still matches the last-synced
        // base. A bot last-edit can mask a human change that was still unpulled
        // when the push wrote (the push flips the page's editor); skipping the
        // whole row would strand that change forever once the incremental
        // window advances past it. A dirty or baseless row falls through to the
        // merge, which reconciles it normally.
        if (row.lastEditedByBot && !restoring) {
          const base = (record.snapshot ?? null) as Partial<SyncedFields> | null;
          const pureEcho =
            base !== null &&
            SYNCED_FIELD_KEYS.every((field) =>
              fieldEquals(base[field], remote[field]),
            );
          if (pureEcho) {
            counts.skipped++;
            items.push({
              externalId: row.externalId,
              ticketId: ticket.id,
              title: row.title,
              action: "skipped",
              reason: "last edit was ours (echo suppression)",
            });
            continue;
          }
        }

        const merged = mergeSyncedFields({
          base: (record.snapshot ?? null) as Partial<SyncedFields> | null,
          local,
          remote,
          localEditedAt: ticket.updatedAt,
          remoteEditedAt: row.lastEditedAt,
        });

        // Scalar fields copy straight onto ticket columns …
        const localWrites = Object.fromEntries(
          Object.entries(merged.applyToLocal).filter(([key]) =>
            (SCALAR_FIELDS as string[]).includes(key),
          ),
        ) as Partial<Pick<SyncedFields, "title" | "status" | "priority" | "type" | "points">> &
          { cycleId?: string | null; assigneeId?: string | null };

        // … relational fields resolve to ids first. When a value can't be
        // applied (unmatched assignee email), the write is dropped and the
        // snapshot pinned to the LOCAL value: the remote change stays visible
        // as pending inbound, and no phantom local change is invented that
        // the push phase would echo back at Notion.
        const snapshotOverrides: Partial<SyncedFields> = {};

        if (!dryRun && "cycleName" in merged.applyToLocal) {
          const name = merged.applyToLocal.cycleName ?? null;
          if (name === null) {
            localWrites.cycleId = null;
          } else {
            const resolved = await resolveCycleIdByName(db, {
              workspaceId: config.product.workspaceId,
              name,
              createdById: config.createdById,
            });
            localWrites.cycleId = resolved.cycleId;
            if (resolved.created) warnings.push(`created cycle "${name}"`);
          }
        }

        if (!dryRun && "assigneeEmail" in merged.applyToLocal) {
          const email = merged.applyToLocal.assigneeEmail ?? null;
          if (email === null) {
            localWrites.assigneeId = null;
          } else {
            const assigneeId = await resolveAssigneeIdByEmail(db, {
              workspaceId: config.product.workspaceId,
              email,
            });
            if (assigneeId) {
              localWrites.assigneeId = assigneeId;
            } else {
              warnings.push(
                `no workspace member with email ${email} — assignee left unchanged`,
              );
              snapshotOverrides.assigneeEmail = local.assigneeEmail;
            }
          }
        }

        // Dry run skips the resolving writes above — preview them read-only
        // so the manifest still names the real relational outcome.
        if (dryRun) {
          warnings.push(
            ...(await relationalPreviewWarnings(db, config.product.workspaceId, {
              cycleName: merged.applyToLocal.cycleName,
              assigneeEmail: merged.applyToLocal.assigneeEmail,
            })),
          );
        }

        const hasLocalWrites =
          Object.keys(localWrites).length > 0 ||
          (dryRun &&
            Object.keys(merged.applyToLocal).some(
              (k) => k === "cycleName" || k === "assigneeEmail",
            ));
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
                `would set ${Object.keys(merged.applyToLocal).join(", ") || "nothing"}`,
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

        // Ticket mutation and snapshot advance must land together: if the
        // snapshot lagged the write, the next run would re-detect the same
        // remote value as a fresh change and re-apply it.
        const writes: Prisma.PrismaPromise<unknown>[] = [];
        if (hasLocalWrites) {
          writes.push(
            db.ticket.update({
              where: { id: ticket.id },
              data: localWrites,
            }),
          );
        }
        writes.push(
          db.ticketSync.update({
            where: { id: record.id },
            data: {
              snapshot: {
                ...buildInboundSnapshot(merged, remote),
                ...snapshotOverrides,
              } as unknown as Prisma.InputJsonValue,
              externalUrl: row.url ?? undefined,
              lastSyncedAt: new Date(),
              ...(restoring ? { tombstonedAt: null } : {}),
            },
          }),
        );
        await db.$transaction(writes);

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
            reason: warnings.length > 0 ? warnings.join("; ") : "in sync",
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
        archived: counts.archived,
        failed: counts.failed,
        items: items as unknown as Prisma.InputJsonValue,
      },
    });

    // Scoped runs saw only a subset — advancing the window would make the
    // next full run silently skip everything else edited meanwhile.
    if (!dryRun && !params.scope) {
      await db.ticketSyncConfig.update({
        where: { id: config.id },
        data: { lastPulledAt: startedAt },
      });
    }
    // Every real run posts its one feed event, scoped or not.
    if (!dryRun) await postRunEvent("success");

    return { runId: run.id, dryRun, ...counts, items };
  } catch (error) {
    await db.ticketSyncRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : "unknown error",
        created: counts.created,
        updated: counts.updated,
        skipped: counts.skipped,
        conflicts: counts.conflicts,
        archived: counts.archived,
        failed: counts.failed,
        items: items as unknown as Prisma.InputJsonValue,
      },
    });
    // A failed real run may still have created tickets before dying — the
    // feed event is how that partial work stays visible.
    if (!dryRun) await postRunEvent("error");
    throw error;
  }

  /**
   * One `synced` activity event per real run (feed altitude, ADR-0042): the
   * per-ticket `created` events are suppressed on this path, so the run-level
   * event with its counts is the feed's whole story. Dry runs post nothing.
   * `recordActivity` never throws — instrumentation can't fail the sync.
   */
  async function postRunEvent(status: "success" | "error") {
    await recordActivity(db, {
      workspaceId: config.product.workspaceId,
      userId: params.triggeredById ?? null,
      entityType: "ticket_sync_run",
      entityId: run.id,
      action: "synced",
      metadata: {
        // `title` is what the feed shows as the entity reference.
        title:
          `${counts.created} created · ${counts.updated} updated · ${counts.skipped} skipped` +
          (counts.failed > 0 || status === "error" ? ` · ${counts.failed} failed` : ""),
        productId: config.productId,
        status,
        created: counts.created,
        updated: counts.updated,
        adopted: items.filter((i) => i.action === "adopted").length,
        skipped: counts.skipped,
        conflicts: counts.conflicts,
        failed: counts.failed,
      },
    });
  }
}
