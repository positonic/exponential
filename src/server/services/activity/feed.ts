import type { Prisma, PrismaClient } from "@prisma/client";
import {
  describeEntityRef,
  resolveFeedHint,
  type FeedRenderHint,
} from "./feedRenderHints";
import { deriveActivitySource } from "./deriveActivitySource";

/**
 * Channel-summary detail (ADR-0023) attached to `channel_summary` rows so the
 * feed can render the channel as the actor (provider icon + name), the summary
 * as the body, and deep-link to the routed project when present. `null` on
 * every other event type.
 */
export interface ChannelSummaryRef {
  provider: string;
  displayName: string | null;
  summary: string;
  projectId: string | null;
  projectSlug: string | null;
  projectName: string | null;
}

/**
 * One event in the workspace activity feed, joined with the actor user and
 * pre-resolved render hint. The component renders this directly without
 * needing any registry lookups of its own.
 */
export interface ActivityFeedEvent {
  id: string;
  createdAt: Date;
  entityType: string;
  entityId: string;
  action: string;
  /** Pre-resolved sentence template + icon kind. */
  hint: FeedRenderHint;
  /** Human-readable label derived from the event's metadata. */
  entityRef: string;
  /** Joined actor — null if the event's user was deleted (SET NULL). */
  actor: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  /**
   * Originating workspace. Only populated by the aggregated cross-workspace
   * reader (`getAggregatedActivityFeed`); the single-workspace reader leaves
   * this `null` since the surface already knows its workspace.
   */
  workspace: {
    id: string;
    name: string;
    slug: string;
  } | null;
  /** Derived read-side source: `internal` | `github` | a provider string. */
  source: string;
  /** Channel-summary detail; `null` unless `entityType === "channel_summary"`. */
  channel: ChannelSummaryRef | null;
}

export interface ActivityFeedPage {
  events: ActivityFeedEvent[];
  /**
   * Opaque cursor for the next page. Pass back into the next call as `cursor`.
   * `null` when there are no more events.
   */
  nextCursor: string | null;
}

/** Default page size. Capped at 50 to keep payloads bounded. */
export const FEED_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

interface CursorShape {
  createdAt: string; // ISO
  id: string;
}

function encodeCursor(value: CursorShape): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(raw: string): CursorShape | null {
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(decoded);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as CursorShape).createdAt === "string" &&
      typeof (parsed as CursorShape).id === "string"
    ) {
      return parsed as CursorShape;
    }
  } catch {
    // fall through
  }
  return null;
}

/** Read a string field off a Json metadata blob, or null. */
function readMetaString(metadata: unknown, key: string): string | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

/**
 * Translate a `source` filter into a Prisma `where` fragment. `undefined`/`all`
 * → no constraint; `internal` → everything except channel summaries; any other
 * value is treated as a provider → that provider's `channel_summary` rows.
 */
function sourceWhere(
  source?: string,
): Prisma.WorkspaceActivityEventWhereInput {
  if (!source || source === "all") return {};
  if (source === "internal") {
    return { entityType: { not: "channel_summary" } };
  }
  return {
    entityType: "channel_summary",
    metadata: { path: ["provider"], equals: source },
  };
}

/** Row shape selected by both readers (workspace optional). */
interface FeedRow {
  id: string;
  createdAt: Date;
  entityType: string;
  entityId: string;
  action: string;
  metadata: Prisma.JsonValue | null;
  user: { id: string; name: string | null; image: string | null } | null;
  workspace?: { id: string; name: string; slug: string } | null;
}

/**
 * Map raw rows to `ActivityFeedEvent`s, resolving the derived source and — for
 * `channel_summary` rows — a `ChannelSummaryRef` (with the routed project's
 * slug/name batch-fetched in a single query for deep-linking).
 */
async function toFeedEvents(
  db: PrismaClient,
  rows: FeedRow[],
): Promise<ActivityFeedEvent[]> {
  const projectIds = new Set<string>();
  for (const row of rows) {
    if (row.entityType === "channel_summary") {
      const pid = readMetaString(row.metadata, "projectId");
      if (pid) projectIds.add(pid);
    }
  }

  const projects =
    projectIds.size > 0
      ? await db.project.findMany({
          where: { id: { in: [...projectIds] } },
          select: { id: true, slug: true, name: true },
        })
      : [];
  const projectById = new Map(projects.map((p) => [p.id, p]));

  return rows.map((row) => {
    const source = deriveActivitySource(row);
    let channel: ChannelSummaryRef | null = null;
    if (row.entityType === "channel_summary") {
      const projectId = readMetaString(row.metadata, "projectId");
      const project = projectId ? projectById.get(projectId) : undefined;
      channel = {
        provider: source,
        displayName: readMetaString(row.metadata, "displayName"),
        summary: readMetaString(row.metadata, "summary") ?? "",
        projectId: projectId ?? null,
        projectSlug: project?.slug ?? null,
        projectName: project?.name ?? null,
      };
    }
    return {
      id: row.id,
      createdAt: row.createdAt,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      hint: resolveFeedHint(row.entityType, row.action),
      entityRef: describeEntityRef(row.entityId, row.metadata),
      actor: row.user,
      workspace: row.workspace ?? null,
      source,
      channel,
    };
  });
}

/**
 * Reader for the workspace home activity feed. Returns the most recent
 * events for the workspace ordered by `(createdAt desc, id desc)`, with
 * cursor-based pagination keyed on the same compound tuple.
 *
 * The cursor is an opaque base64url string holding `{ createdAt, id }`. We
 * key on both fields so two events at the same `createdAt` don't drop one
 * from the next page — the `id` tiebreaker makes the order total.
 *
 * Workspace scoping is enforced at the Prisma `where` clause; the join on
 * `user` is left-side (User?) so events whose actor was deleted still
 * appear with `actor: null` and the component renders "Someone" as the
 * actor name.
 */
export async function getActivityFeed(
  db: PrismaClient,
  args: {
    workspaceId: string;
    cursor?: string;
    limit?: number;
    /** Filter by derived source: `all` (default) | `internal` | a provider. */
    source?: string;
  },
): Promise<ActivityFeedPage> {
  const limit = Math.max(
    1,
    Math.min(MAX_PAGE_SIZE, args.limit ?? FEED_PAGE_SIZE),
  );

  const decoded = args.cursor ? decodeCursor(args.cursor) : null;

  // Stable compound ordering. The OR captures the typical "stable cursor"
  // pattern for descending sort:
  //   createdAt < cursor.createdAt  -- strictly older days
  //   OR (createdAt = cursor.createdAt AND id < cursor.id)  -- tiebreaker
  const where: Prisma.WorkspaceActivityEventWhereInput = {
    workspaceId: args.workspaceId,
    ...sourceWhere(args.source),
    ...(decoded
      ? {
          OR: [
            { createdAt: { lt: new Date(decoded.createdAt) } },
            {
              AND: [
                { createdAt: new Date(decoded.createdAt) },
                { id: { lt: decoded.id } },
              ],
            },
          ],
        }
      : {}),
  };

  // Fetch one extra row so we can decide whether nextCursor should be set
  // without a second COUNT query.
  const rows = await db.workspaceActivityEvent.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      createdAt: true,
      entityType: true,
      entityId: true,
      action: true,
      metadata: true,
      user: {
        select: { id: true, name: true, image: true },
      },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const events = await toFeedEvents(db, page);

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          createdAt: last.createdAt.toISOString(),
          id: last.id,
        })
      : null;

  return { events, nextCursor };
}

/**
 * Cross-workspace reader for the top-level `/activity` page. Same compound
 * `(createdAt desc, id desc)` ordering and opaque cursor as
 * {@link getActivityFeed}, but scoped to a *set* of workspace ids and with
 * each event's originating workspace joined in so the UI can badge the row.
 *
 * Access is NOT enforced here — the caller is responsible for passing only
 * workspace ids the user is allowed to see (the tRPC procedure resolves these
 * via `buildWorkspaceVisibilityWhere`). Passing an empty array short-circuits
 * to an empty page without touching the DB.
 */
export async function getAggregatedActivityFeed(
  db: PrismaClient,
  args: {
    workspaceIds: string[];
    cursor?: string;
    limit?: number;
    /** Filter by derived source: `all` (default) | `internal` | a provider. */
    source?: string;
  },
): Promise<ActivityFeedPage> {
  if (args.workspaceIds.length === 0) {
    return { events: [], nextCursor: null };
  }

  const limit = Math.max(
    1,
    Math.min(MAX_PAGE_SIZE, args.limit ?? FEED_PAGE_SIZE),
  );

  const decoded = args.cursor ? decodeCursor(args.cursor) : null;

  const where: Prisma.WorkspaceActivityEventWhereInput = {
    workspaceId: { in: args.workspaceIds },
    ...sourceWhere(args.source),
    ...(decoded
      ? {
          OR: [
            { createdAt: { lt: new Date(decoded.createdAt) } },
            {
              AND: [
                { createdAt: new Date(decoded.createdAt) },
                { id: { lt: decoded.id } },
              ],
            },
          ],
        }
      : {}),
  };

  const rows = await db.workspaceActivityEvent.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      createdAt: true,
      entityType: true,
      entityId: true,
      action: true,
      metadata: true,
      user: {
        select: { id: true, name: true, image: true },
      },
      workspace: {
        select: { id: true, name: true, slug: true },
      },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const events = await toFeedEvents(db, page);

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          createdAt: last.createdAt.toISOString(),
          id: last.id,
        })
      : null;

  return { events, nextCursor };
}
