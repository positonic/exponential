import type { Prisma, PrismaClient } from "@prisma/client";
import {
  describeEntityRef,
  resolveFeedHint,
  type FeedRenderHint,
} from "./feedRenderHints";
import {
  deriveActivitySource,
  GITHUB_ENTITY_PREFIX,
  GITHUB_SOURCE,
} from "./deriveActivitySource";
import { buildKnowledgePageAccessWhere } from "~/server/services/access/resolvers/knowledgePageResolver";
import { PAGE_ENTITY_TYPE } from "./pageActivity";

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
 * GitHub detail attached to `github*` rows so the feed can render the commit or
 * PR as its own kind of row — repo + branch context, the author's GitHub login
 * as the actor when no `User` is mapped, and a deep link out to GitHub. `null`
 * on every other event type.
 */
export interface GitHubRef {
  /** `push` | `pull_request` | `pull_request_review`, derived from entityType. */
  kind: string;
  repoFullName: string;
  repoUrl: string | null;
  branchName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  /** GitHub login. Used as the actor label when `actor` is null. */
  author: string | null;
  /** Push only — how many commits the push carried. */
  commitCount: number | null;
  commitSha: string | null;
  commitUrl: string | null;
  /** Review only — `approved`, `changes_requested`, `commented`. */
  reviewState: string | null;
  /** True when a pull_request row represents a merge, not just a close. */
  merged: boolean;
}

/**
 * Agent-run detail (ADR-0067) attached to `agent_run` rows so the feed can show
 * what the run said under the sentence. `null` on every other event type.
 */
export interface AgentRunRef {
  /** The action the run worked on. */
  actionId: string;
  /** The start of the run's public summary, or `null` when it left none. */
  summary: string | null;
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
    /** True when the actor is an External agent's shadow user (ADR-0049). */
    isAgent: boolean;
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
  /** GitHub detail; `null` unless the row is GitHub-origin. */
  github: GitHubRef | null;
  /** Agent-run detail; `null` unless `entityType === "agent_run"`. */
  agentRun: AgentRunRef | null;
  /**
   * OKR drawer deep-link target for the goals page, e.g. `objective:42` or
   * `keyResult:cuid` (the `drawer` query-param format parsed by
   * `parseDrawerParam`). Computed server-side because the client never sees
   * raw `metadata`. `null` for non-OKR rows.
   */
  drawerParam: string | null;
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

/** Read a numeric field off a Json metadata blob, or null. */
function readMetaNumber(metadata: unknown, key: string): number | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

/** Read a string-or-number id field off a Json metadata blob, or null. */
function readMetaId(metadata: unknown, key: string): string | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

/** Read a boolean field off a Json metadata blob, defaulting to false. */
function readMetaBoolean(metadata: unknown, key: string): boolean {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return (metadata as Record<string, unknown>)[key] === true;
  }
  return false;
}

/**
 * Build the `GitHubRef` for a GitHub-origin row. The entity type carries the
 * event kind (`github_push` → `push`), everything else rides in metadata as
 * written by `toGitHubFeedEvent`.
 */
function toGitHubRef(entityType: string, metadata: unknown): GitHubRef {
  return {
    kind: entityType.replace(`${GITHUB_ENTITY_PREFIX}_`, ""),
    repoFullName: readMetaString(metadata, "repoFullName") ?? "",
    repoUrl: readMetaString(metadata, "repoUrl"),
    branchName: readMetaString(metadata, "branchName"),
    prNumber: readMetaNumber(metadata, "prNumber"),
    prUrl: readMetaString(metadata, "prUrl"),
    author: readMetaString(metadata, "author"),
    commitCount: readMetaNumber(metadata, "commitCount"),
    commitSha: readMetaString(metadata, "commitSha"),
    commitUrl: readMetaString(metadata, "commitUrl"),
    reviewState: readMetaString(metadata, "reviewState"),
    merged: readMetaBoolean(metadata, "merged"),
  };
}
/**
 * Build the `AgentRunRef` for an `agent_run` row from the metadata written by
 * `onRunFinished`. Rows without an `actionId` (none are written that way) and
 * every other entity type get `null`.
 */
function toAgentRunRef(row: FeedRow): AgentRunRef | null {
  if (row.entityType !== "agent_run") return null;
  const actionId = readMetaString(row.metadata, "actionId");
  if (!actionId) return null;
  return { actionId, summary: readMetaString(row.metadata, "summary") };
}

/**
 * Compute the OKR drawer target for a feed row. Objective rows carry the goal
 * id in `entityId`; child rows (updates, comments, check-ins) point at their
 * parent via `metadata.goalId` / `metadata.keyResultId` because their
 * `entityId` is the child row itself. Non-OKR rows get `null`.
 */
function deriveDrawerParam(row: FeedRow): string | null {
  // A deleted row's target is gone by definition — linking it would be a
  // guaranteed-dead click. (Other rows may still go stale after a later
  // delete; those fail gracefully in the drawer.)
  if (row.action === "deleted") return null;
  switch (row.entityType) {
    case "goal":
      return `objective:${row.entityId}`;
    case "goal_update":
    case "goal_comment": {
      const goalId = readMetaId(row.metadata, "goalId");
      return goalId ? `objective:${goalId}` : null;
    }
    case "key_result": {
      // Check-in events use the check-in row as entityId and carry the KR id
      // in metadata; create/delete events use the KR id as entityId directly.
      const keyResultId =
        readMetaId(row.metadata, "keyResultId") ?? row.entityId;
      return `keyResult:${keyResultId}`;
    }
    case "key_result_comment": {
      const keyResultId = readMetaId(row.metadata, "keyResultId");
      return keyResultId ? `keyResult:${keyResultId}` : null;
    }
    default:
      return null;
  }
}

/**
 * Entity types recorded for audit purposes but never shown on feed surfaces.
 * Notion ticket-sync runs are operational noise at feed altitude — the synced
 * tickets themselves already surface as regular ticket events.
 */
const HIDDEN_ENTITY_TYPES = ["ticket_sync_run"] as const;

/**
 * Translate a `source` filter into a Prisma `where` fragment. `undefined`/`all`
 * → only the hidden-type exclusion; `internal` → everything except channel
 * summaries (and hidden types); any other value is treated as a provider →
 * that provider's `channel_summary` rows.
 */
function sourceWhere(
  source?: string,
): Prisma.WorkspaceActivityEventWhereInput {
  if (!source || source === "all") {
    return { entityType: { notIn: [...HIDDEN_ENTITY_TYPES] } };
  }
  if (source === "internal") {
    // "Internal" means things that happened inside Exponential, so it must
    // exclude BOTH external origins — channel summaries and GitHub. Excluding
    // only channel summaries would quietly file every merged PR under
    // "internal" and make the chip a lie.
    return {
      entityType: { notIn: ["channel_summary", ...HIDDEN_ENTITY_TYPES] },
      NOT: { entityType: { startsWith: GITHUB_ENTITY_PREFIX } },
    };
  }
  if (source === GITHUB_SOURCE) {
    return { entityType: { startsWith: GITHUB_ENTITY_PREFIX } };
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
  user: { id: string; name: string | null; image: string | null; isAgent: boolean } | null;
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
      github:
        source === GITHUB_SOURCE
          ? toGitHubRef(row.entityType, row.metadata)
          : null,
      agentRun: toAgentRunRef(row),
      drawerParam: deriveDrawerParam(row),
    };
  });
}

/**
 * How many extra fetches a reader makes when the access filter empties a whole
 * page of rows while older rows remain, before giving up and returning the
 * empty page with its cursor.
 */
const MAX_FILTER_ROUNDS = 3;

/**
 * Drop `page` rows whose page the viewer cannot open; every other row passes
 * through untouched.
 *
 * Access is checked here, when the feed is read, with the same clause every
 * other page listing uses (`buildKnowledgePageAccessWhere`). So a page that
 * goes invite-only, or a grant that is removed, hides its old rows at once —
 * and a deleted page fails the check too. One query per fetched page of rows.
 */
async function dropInaccessiblePageRows<T extends FeedRow>(
  db: PrismaClient,
  viewerId: string,
  rows: T[],
): Promise<{ visible: T[]; inaccessiblePageIds: string[] }> {
  const pageIds = [
    ...new Set(
      rows
        .filter((row) => row.entityType === PAGE_ENTITY_TYPE)
        .map((row) => row.entityId),
    ),
  ];
  if (pageIds.length === 0) return { visible: rows, inaccessiblePageIds: [] };

  const accessible = await db.knowledgePage.findMany({
    where: {
      AND: [{ id: { in: pageIds } }, buildKnowledgePageAccessWhere(viewerId)],
    },
    select: { id: true },
  });
  const accessibleIds = new Set(accessible.map((page) => page.id));

  return {
    visible: rows.filter(
      (row) =>
        row.entityType !== PAGE_ENTITY_TYPE || accessibleIds.has(row.entityId),
    ),
    inaccessiblePageIds: pageIds.filter((id) => !accessibleIds.has(id)),
  };
}

/** The feed's "strictly older than the cursor" clause, or nothing. */
function olderThan(
  cursor: CursorShape | null,
): Prisma.WorkspaceActivityEventWhereInput {
  if (!cursor) return {};
  // Stable compound ordering for a descending sort:
  //   createdAt < cursor.createdAt                         -- strictly older
  //   OR (createdAt = cursor.createdAt AND id < cursor.id) -- tiebreaker
  return {
    OR: [
      { createdAt: { lt: new Date(cursor.createdAt) } },
      {
        AND: [
          { createdAt: new Date(cursor.createdAt) },
          { id: { lt: cursor.id } },
        ],
      },
    ],
  };
}

/**
 * Shared page reader behind both feed functions: fetch a page of rows ordered
 * by `(createdAt desc, id desc)`, drop the page rows the viewer cannot open,
 * and return what is left with a cursor.
 *
 * The cursor always points at the last row *fetched*, not the last row shown,
 * so filtering never skips or repeats a row. A filtered page can therefore
 * come back short. If it comes back empty while older rows remain, the reader
 * fetches again (up to {@link MAX_FILTER_ROUNDS} times), and each further fetch
 * leaves out every row of the pages it has already found the viewer cannot
 * open. So one private page with a long run of edits is stepped over in a
 * single hop rather than a page of rows at a time.
 *
 * It can still give up: an empty `events` with a non-null `nextCursor` means
 * "nothing visible in this stretch, older rows remain". Callers must keep
 * offering the next page in that case instead of treating it as the end.
 */
async function readFeedPage(
  db: PrismaClient,
  args: {
    scope: Prisma.WorkspaceActivityEventWhereInput;
    withWorkspace: boolean;
    viewerId: string;
    cursor?: string;
    limit?: number;
    source?: string;
    actorUserId?: string;
    window?: { from: Date; to: Date };
  },
): Promise<ActivityFeedPage> {
  const limit = Math.max(
    1,
    Math.min(MAX_PAGE_SIZE, args.limit ?? FEED_PAGE_SIZE),
  );

  let cursor = args.cursor ? decodeCursor(args.cursor) : null;
  let nextCursor: string | null = null;
  /** Pages this read has found the viewer cannot open. */
  const inaccessible = new Set<string>();

  for (let round = 0; round <= MAX_FILTER_ROUNDS; round++) {
    const where: Prisma.WorkspaceActivityEventWhereInput = {
      ...args.scope,
      ...sourceWhere(args.source),
      ...(args.actorUserId ? { userId: args.actorUserId } : {}),
      ...(args.window
        ? { createdAt: { gte: args.window.from, lte: args.window.to } }
        : {}),
      ...olderThan(cursor),
      // `AND` so it composes with the `NOT` the source filter may carry.
      ...(inaccessible.size > 0
        ? {
            AND: [
              {
                NOT: {
                  entityType: PAGE_ENTITY_TYPE,
                  entityId: { in: [...inaccessible] },
                },
              },
            ],
          }
        : {}),
    };

    // Fetch one extra row so we can decide whether nextCursor should be set
    // without a second COUNT query.
    const rows: FeedRow[] = await db.workspaceActivityEvent.findMany({
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
          select: { id: true, name: true, image: true, isAgent: true },
        },
        ...(args.withWorkspace
          ? { workspace: { select: { id: true, name: true, slug: true } } }
          : {}),
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const lastCursor: CursorShape | null = last
      ? { createdAt: last.createdAt.toISOString(), id: last.id }
      : null;
    nextCursor = hasMore && lastCursor ? encodeCursor(lastCursor) : null;

    const { visible, inaccessiblePageIds } = await dropInaccessiblePageRows(
      db,
      args.viewerId,
      page,
    );
    if (visible.length > 0 || !hasMore) {
      return { events: await toFeedEvents(db, visible), nextCursor };
    }
    // Every row on this page was a page the viewer cannot open. Keep going
    // from where this fetch ended, skipping those pages' other rows.
    for (const pageId of inaccessiblePageIds) inaccessible.add(pageId);
    cursor = lastCursor;
  }

  return { events: [], nextCursor };
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
 *
 * Workspace membership is the caller's check. Page rows are the exception:
 * they are filtered here against `viewerId` (see {@link readFeedPage}).
 */
export async function getActivityFeed(
  db: PrismaClient,
  args: {
    workspaceId: string;
    /** Who is reading. Page rows are shown only if this user can open the page. */
    viewerId: string;
    cursor?: string;
    limit?: number;
    /** Filter by derived source: `all` (default) | `internal` | a provider. */
    source?: string;
    /** Only events this user performed (the "Mine" filter). */
    actorUserId?: string;
  },
): Promise<ActivityFeedPage> {
  return readFeedPage(db, {
    scope: { workspaceId: args.workspaceId },
    withWorkspace: false,
    viewerId: args.viewerId,
    cursor: args.cursor,
    limit: args.limit,
    source: args.source,
    actorUserId: args.actorUserId,
  });
}

/**
 * Cross-workspace reader for the top-level `/activity` page. Same compound
 * `(createdAt desc, id desc)` ordering and opaque cursor as
 * {@link getActivityFeed}, but scoped to a *set* of workspace ids and with
 * each event's originating workspace joined in so the UI can badge the row.
 *
 * Workspace access is NOT enforced here — the caller is responsible for
 * passing only workspace ids the user is allowed to see (the tRPC procedure
 * resolves these via `buildWorkspaceAccessWhere`). Passing an empty array
 * short-circuits to an empty page without touching the DB. Page rows are
 * filtered here against `viewerId`, as in {@link getActivityFeed}.
 */
export async function getAggregatedActivityFeed(
  db: PrismaClient,
  args: {
    workspaceIds: string[];
    /** Who is reading. Page rows are shown only if this user can open the page. */
    viewerId: string;
    cursor?: string;
    limit?: number;
    /** Filter by derived source: `all` (default) | `internal` | a provider. */
    source?: string;
    /** Only events this user performed (the "Mine" filter). */
    actorUserId?: string;
    /** Only events inside this time range, both ends included. */
    window?: { from: Date; to: Date };
  },
): Promise<ActivityFeedPage> {
  if (args.workspaceIds.length === 0) {
    return { events: [], nextCursor: null };
  }

  return readFeedPage(db, {
    scope: { workspaceId: { in: args.workspaceIds } },
    withWorkspace: true,
    viewerId: args.viewerId,
    cursor: args.cursor,
    limit: args.limit,
    source: args.source,
    actorUserId: args.actorUserId,
    window: args.window,
  });
}

/** Most distinct pages {@link hasVisibleActivity} will check access for. */
const MAX_PROBED_PAGES = 500;

/**
 * Whether `actorUserId` has at least one event in `workspaceIds` that a feed
 * read by `viewerId` would actually show — the same rules as the readers above:
 * hidden entity types never count, and a page event counts only if the viewer
 * can open the page.
 *
 * The Person page uses this to decide whether someone the viewer shares no
 * workspace with is visible at all. Asking "is there any event row?" instead
 * would name a person whose only trace is something the viewer cannot see.
 *
 * As with the readers, the caller passes only workspaces the viewer belongs to.
 */
export async function hasVisibleActivity(
  db: PrismaClient,
  args: { workspaceIds: string[]; viewerId: string; actorUserId: string },
): Promise<boolean> {
  if (args.workspaceIds.length === 0) return false;

  const scope: Prisma.WorkspaceActivityEventWhereInput = {
    workspaceId: { in: args.workspaceIds },
    userId: args.actorUserId,
  };

  // Anything that is neither hidden nor a page is visible to every member.
  const ordinary = await db.workspaceActivityEvent.findFirst({
    where: {
      ...scope,
      entityType: { notIn: [...HIDDEN_ENTITY_TYPES, PAGE_ENTITY_TYPE] },
    },
    select: { id: true },
  });
  if (ordinary) return true;

  // Only page events are left: they count if the viewer can open one of the
  // pages. Bounded, so a long history of private pages stays one cheap query.
  const pageRows = await db.workspaceActivityEvent.findMany({
    where: { ...scope, entityType: PAGE_ENTITY_TYPE },
    select: { entityId: true },
    distinct: ["entityId"],
    orderBy: { createdAt: "desc" },
    take: MAX_PROBED_PAGES,
  });
  if (pageRows.length === 0) return false;

  const openable = await db.knowledgePage.findFirst({
    where: {
      AND: [
        { id: { in: pageRows.map((row) => row.entityId) } },
        buildKnowledgePageAccessWhere(args.viewerId),
      ],
    },
    select: { id: true },
  });
  return openable !== null;
}
