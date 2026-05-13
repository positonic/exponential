import type { Prisma, PrismaClient } from "@prisma/client";
import {
  describeEntityRef,
  resolveFeedHint,
  type FeedRenderHint,
} from "./feedRenderHints";

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

  const events: ActivityFeedEvent[] = page.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    hint: resolveFeedHint(row.entityType, row.action),
    entityRef: describeEntityRef(row.entityId, row.metadata),
    actor: row.user,
  }));

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
