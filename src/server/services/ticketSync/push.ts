import type { Prisma, PrismaClient, TicketStatus, TicketType } from "@prisma/client";
import { mapPoints, mapPriority, mapStatus, mapType } from "./mapping";
import {
  CYCLE_UNREADABLE_WARNING,
  mergeSyncedFields,
  SYNCED_FIELD_KEYS,
  type SyncedFieldKey,
  type SyncedFields,
} from "./merge";
import {
  findTitleProperty,
  mapFieldsToNotion,
  type NotionDbSchema,
  type OutboundPropertyNames,
} from "./outboundMapping";
import {
  buildBacklinkProperty,
  buildBodyBlocks,
  buildSourceProperty,
  DEFAULT_CREATE_MARKER_NAMES,
  type CreateMarkerNames,
} from "./outboundCreate";
import type { RemoteTicketRow } from "./engine";
import { REVERT_TOMBSTONE_KEY } from "./revert";
import { COMPLETED_STATUSES } from "~/lib/ticket-statuses";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

/**
 * Sentinel `TicketSync.externalId` for a ticket born in Exponential whose
 * Notion mirror has not been created yet. The drain turns it into a real page
 * id on first push (creation branch). `pending:<ticketId>` stays unique per
 * ticket, so the `[configId, externalId]` and `[ticketId, provider]` uniqueness
 * both hold, and it never matches a real Notion page id on the inbound side.
 */
export const PENDING_EXTERNAL_PREFIX = "pending:";

export function isPendingExternalId(externalId: string): boolean {
  return externalId.startsWith(PENDING_EXTERNAL_PREFIX);
}

/**
 * A push failure that must NOT be retried, because the irreversible remote
 * write already landed and another attempt would duplicate it.
 *
 * The case this exists for: `createPage` succeeds, then the bookkeeping that
 * turns the sentinel into the real page id fails. The page is live in the
 * customer's Notion, but the sync row still carries `pending:<ticketId>`, so a
 * retry re-enters the creation branch and makes a SECOND page — up to
 * MAX_ATTEMPTS of them, each one an orphan the inbound poll then re-imports as
 * a new ticket. One orphan an operator can reconcile beats five.
 */
export class NonRetryablePushError extends Error {
  /** The live Notion page left unlinked — name it so it can be reconciled. */
  readonly orphanedExternalId: string;

  constructor(message: string, orphanedExternalId: string) {
    super(message);
    this.name = "NonRetryablePushError";
    this.orphanedExternalId = orphanedExternalId;
  }
}

/**
 * ticketSync/push — the outbound (Exponential → Notion) engine seam (ADR-0046).
 *
 * The reverse of engine.ts: {@link runOutboundTicketPush} takes ONE synced
 * ticket whose local fields changed, runs the SAME three-way merge, and writes
 * the `applyToRemote` fields to the Notion page. It never invents a new merge
 * or conflict model — LWW-by-edit-timestamp (ADR-0042) is unchanged and now
 * applies symmetrically.
 *
 * Two safety properties this file is responsible for:
 * - **Toggle-off guard at the seam.** A push with `pushEnabled` false writes
 *   nothing and returns a skip. The enqueue path also gates, but the engine is
 *   the last line — a bad outbound write reaches the customer's live Notion.
 * - **Echo suppression end-to-end.** After a successful write the snapshot is
 *   advanced to the LOCAL value for the fields we wrote, so the next inbound
 *   poll (whose bot-edit filter already skips our own writes) sees nothing to
 *   do in either direction — the ping-pong invariant.
 *
 * Notion I/O goes through {@link TicketPushAdapter} so tests drive a plain fake.
 */

export interface TicketPushAdapter {
  /** Current remote state of one page; null when the page 404s (deleted). */
  getRow(externalId: string): Promise<RemoteTicketRow | null>;
  /** The target database's property schema (type + option names per property). */
  getWriteSchema(databaseId: string): Promise<NotionDbSchema>;
  /** Apply a `pages.update` properties payload to a page. */
  updatePage(externalId: string, properties: Record<string, unknown>): Promise<void>;
  /**
   * Resolve a cycle page id by title within the cycle relation's target
   * database, or null when no matching page exists (conservative: never
   * creates a Notion cycle page — ADR-0046 defers that).
   */
  findCyclePageIdByName(
    databaseId: string,
    cycleProperty: string,
    name: string,
  ): Promise<string | null>;
  /** Resolve a Notion workspace person id by email, or null when unmatched. */
  findPersonIdByEmail(email: string): Promise<string | null>;
  /** Create a new page (full-mirror creation); returns the new page id + url. */
  createPage(params: {
    databaseId: string;
    titleProperty: string | null;
    properties: Record<string, unknown>;
    children: unknown[];
  }): Promise<{ externalId: string; url: string | null }>;
  /** Trash (archive) a page — the outbound half of archive ↔ archive. */
  archivePage(externalId: string): Promise<void>;
}

export type PushAction =
  | "pushed"
  | "created"
  | "archived"
  | "skipped"
  | "conflict"
  | "failed";

export interface OutboundPushItem {
  syncId: string;
  externalId: string | null;
  ticketId: string;
  title: string;
  action: PushAction;
  reason?: string;
  /** Field keys actually written to Notion (present on `pushed`/`conflict`). */
  wrote?: SyncedFieldKey[];
}

interface PushConfig {
  id: string;
  databaseId: string;
  pushEnabled: boolean;
  integrationId: string | null;
  statusMap: Prisma.JsonValue | null;
  propertyNames: Prisma.JsonValue | null;
  product: {
    workspaceId: string;
    slug: string;
    workspace: { slug: string };
  };
}

interface LoadedSync {
  id: string;
  ticketId: string;
  externalId: string;
  snapshot: Prisma.JsonValue | null;
  tombstonedAt: Date | null;
  ticket: {
    id: string;
    title: string;
    body: string | null;
    number: number;
    status: TicketStatus;
    type: TicketType;
    priority: number | null;
    points: number | null;
    updatedAt: Date;
    cycle: { name: string } | null;
    assignee: { email: string | null } | null;
    tags: { tag: { name: string } }[];
  };
}

function resolveMarkerNames(raw: Prisma.JsonValue | null): CreateMarkerNames {
  const overrides =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Partial<CreateMarkerNames>)
      : {};
  return { ...DEFAULT_CREATE_MARKER_NAMES, ...overrides };
}

/** The Exponential ticket URL used as the Notion back-link. */
function ticketUrl(config: PushConfig, ticketNumber: number): string {
  return `${getPublicBaseUrlFromEnv()}/w/${config.product.workspace.slug}/products/${config.product.slug}/tickets/${ticketNumber}`;
}

const DEFAULT_PROPERTY_NAMES: OutboundPropertyNames = {
  status: "Status",
  priority: "Priority",
  type: "Type",
  effort: "Effort",
  label: "Label",
  cycle: "Cycles",
  assignee: "Assignee",
};

function resolvePropertyNames(raw: Prisma.JsonValue | null): OutboundPropertyNames {
  const overrides =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Partial<OutboundPropertyNames>)
      : {};
  return { ...DEFAULT_PROPERTY_NAMES, ...overrides };
}

function ticketToLocalFields(ticket: LoadedSync["ticket"]): SyncedFields {
  return {
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    type: ticket.type,
    points: ticket.points,
    labels: ticket.tags.map((t) => t.tag.name),
    cycleName: ticket.cycle?.name ?? null,
    assigneeEmail: ticket.assignee?.email ?? null,
  };
}

function rowToRemoteFields(
  row: RemoteTicketRow,
  statusMap: Record<string, TicketStatus> | null,
): SyncedFields {
  return {
    title: row.title,
    status: mapStatus(row.rawStatus, statusMap).status,
    priority: mapPriority(row.rawPriority) ?? null,
    type: mapType(row.rawType),
    points: mapPoints(row.rawEffort) ?? null,
    labels: row.labels,
    cycleName: row.cycleName,
    assigneeEmail: row.assigneeEmail,
  };
}

function hasRevertTombstone(snapshot: Prisma.JsonValue | null): boolean {
  return (
    !!snapshot &&
    typeof snapshot === "object" &&
    !Array.isArray(snapshot) &&
    (snapshot as Record<string, unknown>)[REVERT_TOMBSTONE_KEY] === true
  );
}

/**
 * The snapshot to persist after an outbound push — the mirror of
 * `buildInboundSnapshot`:
 * - fields we WROTE to Notion converge to the local value (merged.snapshot
 *   already carries it) — the next inbound poll sees them in sync;
 * - fields the merge wanted to write LOCALLY (a concurrent remote-only change,
 *   or a conflict the remote won) are pinned to the local value, so the field
 *   stays visible as a pending INBOUND change for the next poll to apply;
 * - `applyToRemote` fields we could NOT push (no Notion counterpart) are pinned
 *   to the REMOTE value, so they stay pending OUTBOUND and are retried next
 *   push — never reverted by the inbound poll, never silently defaulted.
 */
function buildOutboundSnapshot(
  merged: ReturnType<typeof mergeSyncedFields>,
  local: SyncedFields,
  remote: SyncedFields,
  skipped: SyncedFieldKey[],
): SyncedFields {
  const snapshot = { ...merged.snapshot };
  for (const field of SYNCED_FIELD_KEYS) {
    if (field in merged.applyToLocal) {
      (snapshot as Record<string, unknown>)[field] = local[field];
    } else if (skipped.includes(field)) {
      (snapshot as Record<string, unknown>)[field] = remote[field];
    }
  }
  return snapshot;
}

/**
 * Push one synced ticket's local changes to its Notion page.
 *
 * Loads the sync record + config itself (so the engine seam owns the
 * toggle-off guard), fetches the current remote row, runs the merge, writes
 * the pushable fields, and advances the snapshot. Returns a single run item;
 * `retryable` is set when a transient failure means the caller should re-queue.
 *
 * On `dryRun` nothing is written to Notion and the snapshot is not advanced —
 * the item names what WOULD be pushed (the continuous-push preview; see the
 * note in the drain about why it isn't wired to a UI toggle).
 */
export async function runOutboundTicketPush(
  db: PrismaClient,
  adapter: TicketPushAdapter,
  params: { syncId: string; dryRun?: boolean },
): Promise<OutboundPushItem> {
  const dryRun = params.dryRun ?? false;

  const sync = (await db.ticketSync.findUnique({
    where: { id: params.syncId },
    include: {
      config: {
        include: {
          product: {
            select: {
              workspaceId: true,
              slug: true,
              workspace: { select: { slug: true } },
            },
          },
        },
      },
      ticket: {
        select: {
          id: true,
          title: true,
          body: true,
          number: true,
          status: true,
          type: true,
          priority: true,
          points: true,
          updatedAt: true,
          cycle: { select: { name: true } },
          assignee: { select: { email: true } },
          tags: { select: { tag: { select: { name: true } } } },
        },
      },
    },
  })) as (LoadedSync & { config: PushConfig }) | null;

  if (!sync) {
    throw new Error(`push: sync record ${params.syncId} not found`);
  }

  const config = sync.config;
  const base = {
    syncId: sync.id,
    externalId: sync.externalId,
    ticketId: sync.ticketId,
    title: sync.ticket.title,
  };

  // ── Guards (the engine seam is the last line before a live Notion write) ──
  if (!config.pushEnabled) {
    return { ...base, action: "skipped", reason: "push disabled for this connection" };
  }
  if (!config.integrationId) {
    return { ...base, action: "skipped", reason: "connection is disconnected" };
  }
  if (sync.tombstonedAt && hasRevertTombstone(sync.snapshot)) {
    return { ...base, action: "skipped", reason: "link tombstoned by revert" };
  }
  if (sync.tombstonedAt) {
    // Archive-mirror tombstone: the ticket is archived and the page trashed;
    // there is nothing to push.
    return { ...base, action: "skipped", reason: "link archived — nothing to push" };
  }

  const statusMap = (config.statusMap ?? null) as Record<string, TicketStatus> | null;
  const propertyNames = resolvePropertyNames(config.propertyNames);
  const local = ticketToLocalFields(sync.ticket);

  // ── Full-mirror creation: a sentinel externalId means the Notion row does
  //    not exist yet. Create it (unless the ticket is terminal — mirror only
  //    non-terminal work, matching the backfill exclusion) and turn the
  //    sentinel into the real page id + snapshot.
  if (isPendingExternalId(sync.externalId)) {
    return runOutboundCreate(db, adapter, {
      sync,
      config,
      statusMap,
      propertyNames,
      local,
      dryRun,
    });
  }

  // ── Outbound archive: a synced ticket set to ARCHIVED trashes its Notion
  //    page and tombstones the link (never a hard-delete). Mirror of inbound.
  if (sync.ticket.status === "ARCHIVED") {
    return runOutboundArchive(db, adapter, { sync, dryRun });
  }

  const row = await adapter.getRow(sync.externalId);
  if (!row) {
    // The page is gone from Notion. Don't guess (recreate would duplicate);
    // surface it. A genuine deletion is reconciled by the inbound archive path.
    return {
      ...base,
      action: "skipped",
      reason: "Notion page no longer exists",
    };
  }

  const remote = rowToRemoteFields(row, statusMap);

  // An unreadable cycle relation means the remote cycle is UNKNOWN, not empty:
  // neutralize it to the local value so the merge can neither clear the local
  // cycle (a phantom applyToLocal) nor push over a value it cannot see. The
  // cause is surfaced on the item; the inbound engine holds its window until
  // access is restored (frosty.flame).
  const cycleUnreadable = row.cycleUnreadable === true;
  if (cycleUnreadable) {
    remote.cycleName = local.cycleName;
  }

  const merged = mergeSyncedFields({
    base: (sync.snapshot ?? null) as Partial<SyncedFields> | null,
    local,
    remote,
    localEditedAt: sync.ticket.updatedAt,
    remoteEditedAt: row.lastEditedAt,
  });

  const conflictKeys = merged.conflicts.map((c) => c.field);
  const warnings: string[] = merged.conflicts.map(
    (c) => `conflict on ${c.field}: ${c.winner} wins`,
  );
  if (cycleUnreadable) warnings.push(CYCLE_UNREADABLE_WARNING);

  // Nothing to push. Either fully in sync, or the only divergence is a
  // remote-only change (or a conflict the remote won) — both are the inbound
  // poll's job to apply. Leave the snapshot untouched: it stays the last-synced
  // base, the inbound merge reconciles it, and we issue ZERO writes here — the
  // ping-pong invariant (a push must not trigger another write).
  if (Object.keys(merged.applyToRemote).length === 0) {
    return {
      ...base,
      action: merged.conflicts.length > 0 ? "conflict" : "skipped",
      reason:
        merged.conflicts.length > 0
          ? warnings.join("; ")
          : ["in sync — nothing to push", ...warnings].join("; "),
    };
  }

  // ── Build the Notion write payload ────────────────────────────────────────
  const schema = await adapter.getWriteSchema(config.databaseId);
  const scalar = mapFieldsToNotion(merged.applyToRemote, {
    schema,
    propertyNames,
    statusMap,
    titleProperty: findTitleProperty(schema),
    currentRemoteStatusRaw: row.rawStatus,
  });

  const properties = { ...scalar.properties };
  const wrote = [...scalar.wrote];
  const skipped = [...scalar.skipped];
  warnings.push(...scalar.warnings);

  // Relational fields need async id lookups; resolve them conservatively.
  if ("cycleName" in merged.applyToRemote) {
    const name = merged.applyToRemote.cycleName ?? null;
    if (name === null) {
      properties[propertyNames.cycle] = { relation: [] };
      wrote.push("cycleName");
    } else {
      const pageId = await adapter.findCyclePageIdByName(
        config.databaseId,
        propertyNames.cycle,
        name,
      );
      if (pageId) {
        properties[propertyNames.cycle] = { relation: [{ id: pageId }] };
        wrote.push("cycleName");
      } else {
        skipped.push("cycleName");
        warnings.push(
          `no Notion cycle page named "${name}" — cycle not pushed`,
        );
      }
    }
  }

  if ("assigneeEmail" in merged.applyToRemote) {
    const email = merged.applyToRemote.assigneeEmail ?? null;
    if (email === null) {
      properties[propertyNames.assignee] = { people: [] };
      wrote.push("assigneeEmail");
    } else {
      const personId = await adapter.findPersonIdByEmail(email);
      if (personId) {
        properties[propertyNames.assignee] = { people: [{ id: personId }] };
        wrote.push("assigneeEmail");
      } else {
        skipped.push("assigneeEmail");
        warnings.push(
          `no Notion workspace member with email ${email} — assignee not pushed`,
        );
      }
    }
  }

  if (dryRun) {
    return {
      ...base,
      action: merged.conflicts.length > 0 ? "conflict" : "pushed",
      reason: [
        `would push ${wrote.join(", ") || "nothing"}`,
        ...warnings,
      ].join("; "),
      wrote,
    };
  }

  // Write to Notion FIRST, then advance the snapshot — if the write throws we
  // leave the snapshot untouched so the retry re-detects the same pending
  // change (never a lost update). A partial-then-advance would silently drop it.
  if (Object.keys(properties).length > 0) {
    await adapter.updatePage(sync.externalId, properties);
  }

  await db.ticketSync.update({
    where: { id: sync.id },
    data: {
      snapshot: buildOutboundSnapshot(
        merged,
        local,
        remote,
        skipped,
      ) as unknown as Prisma.InputJsonValue,
      externalUrl: row.url ?? undefined,
      lastSyncedAt: new Date(),
    },
  });

  const reason = [
    wrote.length > 0 ? `pushed ${wrote.join(", ")}` : "nothing pushable",
    ...warnings,
  ].join("; ");

  // A conflict that was actually written to Notion is reported as `conflict`;
  // if every pushable field was skipped (no Notion counterpart) the outcome is
  // `skipped`, not a misleading `pushed`.
  const action =
    merged.conflicts.length > 0 && conflictKeys.some((k) => wrote.includes(k))
      ? "conflict"
      : wrote.length > 0
        ? "pushed"
        : "skipped";

  return { ...base, action, reason, wrote };
}

/**
 * Full-mirror creation: create the Notion row for a ticket born in Exponential
 * (sentinel externalId), then rewrite the sync record with the real page id and
 * the converged snapshot — so the next inbound poll adopts, never re-imports.
 * Terminal tickets are not mirrored (matching the backfill exclusion); the
 * sentinel is deleted so it doesn't linger as a phantom link.
 */
async function runOutboundCreate(
  db: PrismaClient,
  adapter: TicketPushAdapter,
  args: {
    sync: LoadedSync & { config: PushConfig };
    config: PushConfig;
    statusMap: Record<string, TicketStatus> | null;
    propertyNames: OutboundPropertyNames;
    local: SyncedFields;
    dryRun: boolean;
  },
): Promise<OutboundPushItem> {
  const { sync, config, statusMap, propertyNames, local, dryRun } = args;
  const base = {
    syncId: sync.id,
    externalId: null,
    ticketId: sync.ticketId,
    title: sync.ticket.title,
  };

  if (COMPLETED_STATUSES.has(sync.ticket.status)) {
    if (!dryRun) {
      // Drop the sentinel — a terminal ticket is never mirrored, and leaving
      // the placeholder link would block a later legitimate adoption.
      await db.ticketSync.delete({ where: { id: sync.id } });
    }
    return {
      ...base,
      action: "skipped",
      reason: "ticket is terminal — not mirrored to Notion",
    };
  }

  const schema = await adapter.getWriteSchema(config.databaseId);
  const titleProperty = findTitleProperty(schema);

  // Every local field is a creation property (currentRemoteStatusRaw = null:
  // no page yet, so sticky-collapse just picks the first matching option).
  const scalar = mapFieldsToNotion(local, {
    schema,
    propertyNames,
    statusMap,
    titleProperty,
    currentRemoteStatusRaw: null,
  });
  const properties: Record<string, unknown> = { ...scalar.properties };
  const warnings = [...scalar.warnings];

  if (local.cycleName) {
    const pageId = await adapter.findCyclePageIdByName(
      config.databaseId,
      propertyNames.cycle,
      local.cycleName,
    );
    if (pageId) properties[propertyNames.cycle] = { relation: [{ id: pageId }] };
    else warnings.push(`no Notion cycle page named "${local.cycleName}" — cycle not set`);
  }
  if (local.assigneeEmail) {
    const personId = await adapter.findPersonIdByEmail(local.assigneeEmail);
    if (personId) properties[propertyNames.assignee] = { people: [{ id: personId }] };
    else
      warnings.push(
        `no Notion workspace member with email ${local.assigneeEmail} — assignee not set`,
      );
  }

  const markerNames = resolveMarkerNames(config.propertyNames);
  const source = buildSourceProperty(schema, markerNames.source);
  if (source.property) Object.assign(properties, source.property);
  if (source.warning) warnings.push(source.warning);

  const backlinkUrl = ticketUrl(config, sync.ticket.number);
  const backlink = buildBacklinkProperty(schema, markerNames.backlink, backlinkUrl);
  if (backlink) Object.assign(properties, backlink);

  const children = buildBodyBlocks(sync.ticket.body, backlinkUrl);

  if (dryRun) {
    return {
      ...base,
      action: "created",
      reason: ["would create Notion row", ...warnings].join("; "),
    };
  }

  const { externalId, url } = await adapter.createPage({
    databaseId: config.databaseId,
    titleProperty,
    properties,
    children,
  });

  // Rewrite the sentinel into a real link with the converged snapshot.
  // `remoteCreatedAt` is the ONLY trustworthy record that this page is
  // machine-authored — the run ledger's "created" action is ambiguous across
  // directions. Anything that rewrites page CONTENT must gate on this column.
  //
  // The page above is already live in the customer's Notion, so a failure here
  // is not retryable: the sentinel would survive and the next drain would
  // create a duplicate page. Fail terminally and name the orphan instead.
  try {
    await db.ticketSync.update({
      where: { id: sync.id },
      data: {
        externalId,
        externalUrl: url,
        snapshot: local as unknown as Prisma.InputJsonValue,
        lastSyncedAt: new Date(),
        remoteCreatedAt: new Date(),
      },
    });
  } catch (error) {
    throw new NonRetryablePushError(
      `Notion page ${externalId} was created but could not be linked to ticket ${sync.ticketId}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      externalId,
    );
  }

  return {
    ...base,
    externalId,
    action: "created",
    reason: warnings.length > 0 ? warnings.join("; ") : undefined,
  };
}

/**
 * Outbound archive: trash the Notion page and tombstone the link (never a hard
 * delete). Snapshot status is advanced to ARCHIVED, mirroring the inbound
 * archive path so a later restore lets the remote status win.
 */
async function runOutboundArchive(
  db: PrismaClient,
  adapter: TicketPushAdapter,
  args: { sync: LoadedSync & { config: PushConfig }; dryRun: boolean },
): Promise<OutboundPushItem> {
  const { sync, dryRun } = args;
  const base = {
    syncId: sync.id,
    externalId: sync.externalId,
    ticketId: sync.ticketId,
    title: sync.ticket.title,
  };

  if (dryRun) {
    return {
      ...base,
      action: "archived",
      reason: "would archive the Notion page (ticket is ARCHIVED)",
    };
  }

  await adapter.archivePage(sync.externalId);

  const priorSnapshot = (sync.snapshot as Partial<SyncedFields> | null) ?? {};
  await db.ticketSync.update({
    where: { id: sync.id },
    data: {
      tombstonedAt: new Date(),
      snapshot: {
        ...priorSnapshot,
        status: "ARCHIVED",
      } as unknown as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    },
  });

  return {
    ...base,
    action: "archived",
    reason: "archived the Notion page (ticket ARCHIVED)",
  };
}
