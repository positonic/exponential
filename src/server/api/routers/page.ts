import { z } from "zod";
import type { JSONContent } from "@tiptap/core";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { Prisma, type PrismaClient } from "@prisma/client";
import { slugifyPageTitle } from "~/lib/pages/public-url";
import { PUBLIC_SETTINGS_SELECT, publishOnePage } from "~/server/services/pages/publish";
import {
  collectPageLinkIds,
  remapPageLinkIds,
  type PageLinkRewrite,
} from "~/lib/pages/public-doc";
import { buildPageEditorPath } from "~/lib/pages/page-path";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";
import { checkStaleWrite } from "~/lib/prd/stale-write";
import {
  assertBaseRevision,
  conflictAfterMiss,
  isCompareAndSetMiss,
  RevisionConflictError,
  toConflictTRPCError,
  withConflictAsTRPC,
} from "~/server/services/revisions/revisionConflict";
import { docHasCommentMarks } from "~/lib/prd/comment-anchor";
import { markdownToDocServer } from "~/server/services/prd/markdown-doc";
import { withCarriedCommentMarks } from "~/server/services/prd/anchor-comment";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";
import { uploadToBlob } from "~/lib/blob";
import { getEmbeddingTriggerService } from "~/server/services/embedding/EmbeddingTriggerService";
import {
  syncPageLinks,
  writePageBodyIfVersion,
} from "~/server/services/pages/page-links";
import {
  assertNotRow,
  ensurePageAccess,
  loadPageForAccess,
  pageAccessDeniedError,
  type PageForAccess,
} from "~/server/services/pages/access";
import {
  expandDatabaseMarkers,
  projectRowPage,
} from "~/server/services/databases/projection";
import { syncPageDatabases } from "~/server/services/databases/sync";
import { stripProjectedTables } from "~/lib/databases/marker";
import { recordPageActivity } from "~/server/services/pages/pageActivity";
import {
  diffRevisionBodies,
  recordPageRevision,
} from "~/server/services/pages/revisions";
import {
  extractMarkdownSection,
  markdownBytes,
  markdownOutline,
} from "~/lib/pages/markdown-outline";
import { getKnowledgeService } from "~/server/services/KnowledgeService";
import { isAiConfigured } from "~/server/services/ai/requireAi";
import {
  getKnowledgePageAccess,
  canViewKnowledgePage,
  canEditKnowledgePage,
  canManageKnowledgePageAccess,
  canShareKnowledgePage,
  canGrantKnowledgePageRole,
  canChangeKnowledgePageGrant,
  getWorkspaceRoles,
  type KnowledgePageAccessInfo,
  type KnowledgePageInviteRole,
  isKnowledgePageInviteRole,
  buildKnowledgePageAccessWhere,
  getProjectAccess,
  canEditProject,
  getWorkspaceMembership,
  filterWorkspaceMembers,
  hasMinimumWorkspaceRole,
  listKnowledgePageViewers,
  projectAccessDeniedError,
} from "~/server/services/access";
import { emitNotification } from "~/server/services/notifications/emit/emitNotification";
import { NOTIFICATION_CATEGORIES } from "~/server/services/notifications/emit/constants";

/**
 * Canonical ProseMirror document shape for a Page body (ADR-0024). Same loose
 * shape the Feature PRD router uses — the editor owns the real schema; the
 * server only stores it as JSON.
 */
const prosemirrorDoc = z.record(z.string(), z.unknown());

// Moved to the pages access service (shared with pageComment and database).
export { ensurePageAccess, loadPageForAccess };

/** One `page.search` hit. */
export interface PageSearchResult {
  id: string;
  title: string;
  /** The best-matching chunk (semantic) or the text around the match, one line. */
  snippet: string;
  /** Cosine similarity for semantic hits; null for substring matches. */
  similarity: number | null;
  matchedBy: "semantic" | "text";
  url: string;
}

// Below this cosine similarity a chunk is unrelated to the query — the same
// cut-off the palette's Knowledge search uses (search.knowledge).
const PAGE_SEARCH_MIN_SIMILARITY = 0.3;
// A long page contributes several chunks; over-fetch so dedupe still fills `limit`.
const PAGE_SEARCH_CHUNKS_PER_PAGE = 4;
const SNIPPET_LENGTH = 160;

/**
 * The revision kind for a write that did not come from the page editor's
 * body save. A browser session is the person in the app (`editor`, which
 * folds into their open editing session); any token — the CLI, MCP, an
 * agent — is a write from outside the editor (`markdown`), which never folds.
 */
function revisionKindForWriter(tokenType: string | undefined): "editor" | "markdown" {
  return tokenType === undefined ? "editor" : "markdown";
}

/**
 * Whether a metadata update actually changes something history records
 * (title or provenance). Re-sending the stored values — agents retry a lot —
 * records nothing.
 */
async function metadataChangesHistory(
  db: PrismaClient,
  pageId: string,
  next: { title?: string; source?: string | null; asOf?: Date | null },
): Promise<boolean> {
  if (next.title === undefined && next.source === undefined && next.asOf === undefined) {
    return false;
  }
  const stored = await db.knowledgePage.findUnique({
    where: { id: pageId },
    select: { title: true, source: true, asOf: true },
  });
  if (!stored) return false;
  return (
    (next.title !== undefined && next.title !== stored.title) ||
    (next.source !== undefined && next.source !== stored.source) ||
    (next.asOf !== undefined && (next.asOf?.getTime() ?? null) !== (stored.asOf?.getTime() ?? null))
  );
}

/**
 * Whether revision authors are named to this caller: the Share popover's
 * audience rule (ADR-0074). Workspace members see names; a project-only
 * collaborator sees the revision, its diff and its time, but "A member".
 */
async function canSeeRevisionAuthors(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  return (await getWorkspaceMembership(db, userId, workspaceId)) !== null;
}

type RevisionAuthor = { id: string; name: string | null; image: string | null } | null;

/** `author` for the caller: the row's author, or null + `authorHidden` when names are withheld. */
export function presentRevisionAuthor(
  author: RevisionAuthor,
  namesAuthors: boolean,
): { author: RevisionAuthor; authorHidden: boolean } {
  if (!author) return { author: null, authorHidden: false };
  return namesAuthors ? { author, authorHidden: false } : { author: null, authorHidden: true };
}

function snippetOf(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_LENGTH ? `${flat.slice(0, SNIPPET_LENGTH - 1)}…` : flat;
}

/** The text around the first (case-insensitive) occurrence of `needle`. */
function snippetAround(body: string, needle: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return snippetOf(flat);
  const start = Math.max(0, at - Math.floor(SNIPPET_LENGTH / 3));
  const end = Math.min(flat.length, start + SNIPPET_LENGTH);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/** Most people one `page.invite` call may add. */
const INVITE_BATCH_LIMIT = 50;
/** Rows per `createMany` when "Apply to sub-pages" fans invitees out over sub-pages. */
const SUBPAGE_INVITE_ROWS_PER_STATEMENT = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const inviteRoleSchema = z.enum(["viewer", "editor"]);

/**
 * Load the caller's access to a page and refuse unless they may share it
 * (ADR-0080: anyone who can edit). Returns the access for the finer rules
 * ({@link canGrantKnowledgePageRole}, {@link canChangeKnowledgePageGrant}).
 */
async function ensureCanShare(
  db: PrismaClient,
  userId: string,
  page: PageForAccess,
): Promise<KnowledgePageAccessInfo> {
  const access = await getKnowledgePageAccess(db, userId, page);
  if (!canShareKnowledgePage(access)) {
    throw await pageAccessDeniedError(db, userId, page, access, "share");
  }
  return access;
}

/** Refuse unless the caller may give every one of `userIds` `role`. */
async function assertMayGrantRole(
  db: PrismaClient,
  access: KnowledgePageAccessInfo,
  workspaceId: string,
  userIds: string[],
  role: KnowledgePageInviteRole,
): Promise<void> {
  if (canManageKnowledgePageAccess(access)) return;
  const roles = await getWorkspaceRoles(db, workspaceId, userIds);
  if (userIds.some((id) => !canGrantKnowledgePageRole(access, role, roles.get(id) ?? null))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Only the page's owner can make someone with the workspace Viewer role an editor",
    });
  }
}

/**
 * Refuse unless the caller may change or remove `granteeId`'s grant.
 * NOT_FOUND when the person holds no grant.
 */
async function ensureMayChangeGrant(
  db: PrismaClient,
  access: KnowledgePageAccessInfo,
  userId: string,
  pageId: string,
  granteeId: string,
): Promise<void> {
  const grant = await db.knowledgePageMember.findUnique({
    where: { pageId_userId: { pageId, userId: granteeId } },
    select: { invitedById: true },
  });
  if (!grant) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Not shared with this person" });
  }
  if (!canChangeKnowledgePageGrant(access, userId, grant)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only change people you added — ask the page's owner",
    });
  }
}

/**
 * Pages that can't be made invite-only (ADR-0069): a Workspace update's body
 * and a ceremony occurrence's notes canvas are shared surfaces by design —
 * reviewers and ceremony participants must keep reaching them.
 */
async function inviteOnlyBlocker(
  db: PrismaClient,
  pageId: string,
): Promise<string | null> {
  const page = await db.knowledgePage.findUnique({
    where: { id: pageId },
    select: {
      workspaceUpdate: { select: { id: true } },
      ceremonyOccurrence: { select: { id: true } },
    },
  });
  if (page?.workspaceUpdate) return "A workspace update can't be invite-only.";
  if (page?.ceremonyOccurrence) return "Ceremony notes can't be invite-only.";
  return null;
}

/** Batch {@link inviteOnlyBlocker}: which of `pageIds` can't be invite-only. */
async function inviteOnlyBlockedIds(
  db: PrismaClient,
  pageIds: string[],
): Promise<Set<string>> {
  if (pageIds.length === 0) return new Set();
  const blocked = await db.knowledgePage.findMany({
    where: {
      id: { in: pageIds },
      OR: [{ workspaceUpdate: { isNot: null } }, { ceremonyOccurrence: { isNot: null } }],
    },
    select: { id: true },
  });
  return new Set(blocked.map((p) => p.id));
}

/**
 * What "Apply to sub-pages" (ADR-0069, ADR-0080) would do from `page`, shared
 * by the count in `sharing` and the mutation, so the button never promises
 * more than it does:
 * - `shareTo`: linked sub-pages the caller may share, which get the page's
 *   grants. Empty when the page has none to copy.
 * - `restrict`: when the page is restricted, the linked sub-pages the caller
 *   may restrict (today: owns) and that can be restricted.
 * - `skipped`: linked pages neither step touches.
 * Each decision comes from the centralized resolver per sub-page, so this
 * follows whatever "may share" and "may manage" mean without a second copy.
 * Rows of a Database follow their holding page and are never targets.
 */
async function applicableSubpages(
  db: PrismaClient,
  userId: string,
  page: { id: string; workspaceId: string; isInviteOnly: boolean },
  hasGrants: boolean,
) {
  const linked = (await collectLinkedPages(db, page)).filter((p) => !p.databaseId);
  const decided = await Promise.all(
    linked.map(async (p) => {
      const access = await getKnowledgePageAccess(db, userId, p);
      return {
        id: p.id,
        createdById: p.createdById,
        access,
        canShare: canShareKnowledgePage(access),
        canManage: canManageKnowledgePageAccess(access),
      };
    }),
  );
  const shareTo = hasGrants ? decided.filter((d) => d.canShare) : [];
  const manageable = page.isInviteOnly ? decided.filter((d) => d.canManage) : [];
  const blocked = await inviteOnlyBlockedIds(
    db,
    manageable.map((d) => d.id),
  );
  const restrict = manageable.filter((d) => !blocked.has(d.id)).map((d) => d.id);
  const touched = new Set([...shareTo.map((d) => d.id), ...restrict]);
  return {
    shareTo,
    restrict,
    touched: touched.size,
    skipped: linked.length - touched.size,
  };
}

/**
 * The page's grants that "Apply to sub-pages" may copy: only grantees who
 * still belong to the workspace, as `invite` admits only current members — a
 * person who left must not regain access to sub-pages nobody knowingly shared
 * with them by rejoining later.
 */
async function copyableGrants(
  db: PrismaClient,
  page: { id: string; workspaceId: string },
) {
  const grants = await db.knowledgePageMember.findMany({
    where: { pageId: page.id },
    select: { userId: true, role: true },
  });
  const stillMembers = await filterWorkspaceMembers(
    db,
    page.workspaceId,
    grants.map((g) => g.userId),
  );
  return grants.flatMap((g) =>
    stillMembers.has(g.userId) && isKnowledgePageInviteRole(g.role)
      ? [{ userId: g.userId, role: g.role }]
      : [],
  );
}

/** Most people `page.audience` returns; the rest are only counted. */
const AUDIENCE_PEOPLE_LIMIT = 50;

/** What {@link buildAudience} needs to know about a Page. */
const AUDIENCE_PAGE_SELECT = {
  id: true,
  createdById: true,
  projectId: true,
  workspaceId: true,
  isInviteOnly: true,
  databaseId: true,
  isPublic: true,
  workspace: { select: { name: true } },
  project: {
    select: {
      id: true,
      name: true,
      slug: true,
      isRestricted: true,
      isPublic: true,
    },
  },
} satisfies Prisma.KnowledgePageSelect;

/**
 * Who can see a page — the inherited audience plus its grantees — for
 * `page.audience` and `page.sharing`. Names are hydrated only for members of
 * the page's workspace: a page in a public project is viewable by every
 * signed-in user, who must not get a directory of the workspace from it.
 * The caller must already have passed the view check.
 */
async function buildAudience(
  db: PrismaClient,
  userId: string,
  page: Prisma.KnowledgePageGetPayload<{ select: typeof AUDIENCE_PAGE_SELECT }>,
) {
  const [{ isPublicProject, viewers }, membership] = await Promise.all([
    listKnowledgePageViewers(db, page),
    getWorkspaceMembership(db, userId, page.workspaceId),
  ]);
  // Hydrate only what the avatar row shows; `total` carries the rest.
  const people = membership
    ? await db.user.findMany({
        where: { id: { in: viewers.map((v) => v.userId) } },
        select: { id: true, name: true, image: true },
        orderBy: { name: "asc" },
        take: AUDIENCE_PEOPLE_LIMIT,
      })
    : [];
  return {
    isWorkspaceMember: membership !== null,
    audience: {
      workspaceName: page.workspace.name,
      project: page.project,
      isInviteOnly: page.isInviteOnly,
      isPublishedToWeb: page.isPublic,
      isPublicProject,
      total: viewers.length,
      people,
      includesAdminEscapeHatch: viewers.some((v) => v.viaAdminEscapeHatch),
    },
  };
}


/**
 * The occurrence a page is the notes canvas of (ADR-0059), enough to render
 * a crumb back to it. The occurrence itself is readable by any workspace
 * member, so exposing it on a page the caller can already view leaks nothing.
 */
const OCCURRENCE_CRUMB_SELECT = {
  select: {
    id: true,
    ceremonyId: true,
    scheduledStart: true,
    ceremony: { select: { name: true, timezone: true } },
  },
} satisfies Prisma.KnowledgePage$ceremonyOccurrenceArgs;

/** Everything duplicate-with-sub-pages copies per page (+ access fields). */
const DUPLICATE_SELECT = {
  id: true,
  title: true,
  body: true,
  bodyDoc: true,
  source: true,
  asOf: true,
  includeInSearch: true,
  workspaceId: true,
  projectId: true,
  createdById: true,
  isInviteOnly: true,
} satisfies Prisma.KnowledgePageSelect;

type DuplicateRow = Prisma.KnowledgePageGetPayload<{
  select: typeof DUPLICATE_SELECT;
}>;

/**
 * A Page's current `docVersion`, or null when it is gone. Inside a transaction
 * pass its `tx`: a second pooled connection could wait out the transaction
 * timeout under contention and turn the CONFLICT into a 500.
 */
async function readPageDocVersion(
  db: PrismaClient | Prisma.TransactionClient,
  id: string,
): Promise<number | null> {
  const row = await db.knowledgePage.findUnique({
    where: { id },
    select: { docVersion: true },
  });
  return row?.docVersion ?? null;
}

/**
 * Publishing gate (ADR-0038 + ADR-0069): edit access, and on an invite-only
 * page the owner alone — publishing is the widest possible share, so an
 * invited editor must not be able to do it.
 */
async function ensureCanPublish(
  db: PrismaClient,
  userId: string,
  page: PageForAccess,
): Promise<void> {
  await ensurePageAccess(db, userId, page, page.isInviteOnly ? "manage" : "edit");
}

/**
 * Gate Page creation / project re-assignment against the target scope, since no
 * row exists yet to feed the resolver. A project-linked Page requires edit
 * access to that project (restriction respected) and the project must live in
 * the same workspace (a project-linked Page always inherits the project's
 * workspace — mirrors the Meeting coherence rule). A project-less Page requires
 * a non-viewer workspace role.
 */
async function assertCanPlacePage(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
  projectId: string | null | undefined,
): Promise<void> {
  if (projectId) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!project) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    }
    if (project.workspaceId !== workspaceId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The project belongs to a different workspace",
      });
    }
    const access = await getProjectAccess(db, userId, projectId);
    if (!canEditProject(access)) {
      throw await projectAccessDeniedError(
        db,
        userId,
        projectId,
        "add a page to this project",
        access,
      );
    }
    return;
  }

  const membership = await getWorkspaceMembership(db, userId, workspaceId);
  if (!membership || !hasMinimumWorkspaceRole(membership.role, "member")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You need member access to this workspace to create a page",
    });
  }
}

/** Non-throwing {@link assertCanPlacePage} — for bulk paths (duplicate-with-
 * sub-pages) that skip un-placeable pages instead of failing the whole op. */
async function canPlacePage(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
  projectId: string | null | undefined,
): Promise<boolean> {
  try {
    await assertCanPlacePage(db, userId, workspaceId, projectId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Where a duplicate of `row` lands, or null when the caller can't place it.
 * An ordinary page keeps its placement (so the copy has the same visibility).
 * An invite-only page's copy stays invite-only (ADR-0069) — its project grants
 * nothing — so it keeps the project when the caller may place there and
 * otherwise lands project-less in the same workspace.
 */
async function copyPlacement(
  db: PrismaClient,
  userId: string,
  row: { workspaceId: string; projectId: string | null; isInviteOnly: boolean },
): Promise<{ projectId: string | null } | null> {
  if (await canPlacePage(db, userId, row.workspaceId, row.projectId)) {
    return { projectId: row.projectId };
  }
  if (
    row.isInviteOnly &&
    row.projectId &&
    (await canPlacePage(db, userId, row.workspaceId, null))
  ) {
    return { projectId: null };
  }
  return null;
}

/**
 * Publish a page and, when it holds databases, every row of them (ADR-0078
 * §4: rows publish with the holding page and never alone). Only *attached*
 * databases count: a removed block's retained rows must not go public.
 */
async function publishPage(db: PrismaClient, id: string) {
  const result = await publishOnePage(db, id);
  const rows = await db.knowledgePage.findMany({
    where: { database: { pageId: id, detachedAt: null } },
    select: { id: true },
  });
  for (const row of rows) await publishOnePage(db, row.id);
  return result;
}

/** Cap on the pageLink graph walk — keeps a pathological/cyclic doc bounded. */
const LINKED_PAGES_LIMIT = 50;

/**
 * Walk the `pageLink` graph from a root page (BFS over the stored `PageLink`
 * rows, cycle-safe, capped at {@link LINKED_PAGES_LIMIT}), returning the
 * distinct reachable pages in BFS/document order. Constrained to the root's
 * workspace: `/page` only ever creates same-workspace links, and a pasted
 * cross-workspace id must not leak another workspace's titles through this
 * query (`syncPageLinks` never stores one; the filter is belt and braces).
 */
async function collectLinkedPages(
  db: PrismaClient,
  root: { id: string; workspaceId: string },
) {
  const visited = new Set<string>([root.id]);
  const linked: {
    id: string;
    title: string;
    isPublic: boolean;
    createdById: string;
    projectId: string | null;
    workspaceId: string;
    isInviteOnly: boolean;
    databaseId: string | null;
  }[] = [];
  const rootLinks = await db.pageLink.findMany({
    where: { fromPageId: root.id },
    orderBy: { position: "asc" },
    select: { toPageId: true },
  });
  let frontier = rootLinks
    .map((l) => l.toPageId)
    .filter((id) => !visited.has(id));

  while (frontier.length > 0 && visited.size <= LINKED_PAGES_LIMIT) {
    frontier.forEach((id) => visited.add(id));
    const pages = await db.knowledgePage.findMany({
      where: { id: { in: frontier }, workspaceId: root.workspaceId },
      select: {
        id: true,
        title: true,
        isPublic: true,
        createdById: true,
        projectId: true,
        workspaceId: true,
        isInviteOnly: true,
        databaseId: true,
        linksFrom: {
          orderBy: { position: "asc" },
          select: { toPageId: true },
        },
      },
    });
    const byId = new Map(pages.map((p) => [p.id, p]));
    const next: string[] = [];
    // Iterate the frontier (not `pages`) to keep BFS/document order.
    for (const id of frontier) {
      const page = byId.get(id);
      if (!page) continue;
      const { linksFrom, ...rest } = page;
      linked.push(rest);
      next.push(
        ...linksFrom.map((l) => l.toPageId).filter((t) => !visited.has(t)),
      );
    }
    frontier = [...new Set(next)];
  }
  return linked;
}

export const pageRouter = createTRPCRouter({
  /**
   * List the Pages a user can see in a workspace (visibility per ADR-0033 /
   * `buildKnowledgePageAccessWhere`), newest-edited first. Optional `projectId`
   * filter and case-insensitive title `search`. For search by content or
   * meaning use {@link search}.
   */
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        projectId: z.string().optional(),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const filters: Prisma.KnowledgePageWhereInput[] = [
        buildKnowledgePageAccessWhere(userId),
        { workspaceId: input.workspaceId },
        // Rows live in their database, not in the Pages list (ADR-0078 §3).
        { databaseId: null },
      ];
      if (input.projectId) {
        filters.push({ projectId: input.projectId });
      }
      if (input.search?.trim()) {
        filters.push({
          title: { contains: input.search.trim(), mode: "insensitive" },
        });
      }

      return ctx.db.knowledgePage.findMany({
        where: { AND: filters },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          projectId: true,
          includeInSearch: true,
          source: true,
          asOf: true,
          docVersion: true,
          updatedAt: true,
          createdAt: true,
          project: { select: { id: true, name: true } },
        },
      });
    }),

  /**
   * The workspace's pages arranged as a nesting tree (ADR-0039). Nesting is the
   * `pageLink` graph: a child is a page linked from another page's body. Builds
   * the adjacency over the caller's *viewable* pages only (same access `where`
   * as {@link list}), picks one canonical parent per child — the newest-edited
   * linker, matching `parentCrumb` — and returns a depth-flattened, display-
   * ordered list (roots newest-first, children in the parent's document order).
   * Cycle- and multi-parent-safe: every viewable page appears exactly once.
   */
  tree: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        projectId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const filters: Prisma.KnowledgePageWhereInput[] = [
        buildKnowledgePageAccessWhere(userId),
        { workspaceId: input.workspaceId },
        // Rows are reached through their database, never the tree (ADR-0078 §3).
        { databaseId: null },
      ];
      if (input.projectId) {
        filters.push({ projectId: input.projectId });
      }

      const pages = await ctx.db.knowledgePage.findMany({
        where: { AND: filters },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          projectId: true,
          isPublic: true,
          updatedAt: true,
          createdAt: true,
          project: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, image: true } },
          ceremonyOccurrence: OCCURRENCE_CRUMB_SELECT,
        },
      });
      // The workspace's link graph — three short columns per link, not a doc
      // per page. Restricted to the viewable set below.
      const links = await ctx.db.pageLink.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { position: "asc" },
        select: { fromPageId: true, toPageId: true },
      });

      type Row = (typeof pages)[number];
      const rowById = new Map<string, Row>(pages.map((p) => [p.id, p]));
      // Child ids per page, restricted to viewable pages in this set and in the
      // page's document order.
      const childIdsOf = new Map<string, string[]>();
      for (const { fromPageId, toPageId } of links) {
        if (!rowById.has(fromPageId) || !rowById.has(toPageId)) continue;
        const childIds = childIdsOf.get(fromPageId);
        if (childIds) childIds.push(toPageId);
        else childIdsOf.set(fromPageId, [toPageId]);
      }

      // Canonical parent per child = the newest-edited page that links it.
      // `pages` is already newest-first, so the first linker we see wins.
      const parentOf = new Map<string, string>();
      for (const page of pages) {
        for (const childId of childIdsOf.get(page.id) ?? []) {
          if (childId === page.id) continue; // ignore self-links
          if (!parentOf.has(childId)) parentOf.set(childId, page.id);
        }
      }

      const flat: (Row & { depth: number; hasChildren: boolean })[] = [];
      const visited = new Set<string>();
      const visit = (id: string, depth: number) => {
        if (visited.has(id)) return; // cycle / multi-parent guard
        visited.add(id);
        const row = rowById.get(id);
        if (!row) return;
        const children = (childIdsOf.get(id) ?? []).filter(
          (childId) => parentOf.get(childId) === id && !visited.has(childId),
        );
        flat.push({ ...row, depth, hasChildren: children.length > 0 });
        for (const childId of children) visit(childId, depth + 1);
      };

      // Roots: pages nothing viewable links to, newest-first (order preserved).
      for (const page of pages) {
        if (!parentOf.has(page.id)) visit(page.id, 0);
      }
      // Any page still unvisited sits in a link cycle with no external root —
      // surface it as a root so the tree never silently drops a page.
      for (const page of pages) {
        if (!visited.has(page.id)) visit(page.id, 0);
      }

      return flat;
    }),

  /**
   * One Page. `format` picks how much of the body comes back:
   *
   * - `full` (default, the editor): `bodyDoc` (ProseMirror JSON) and the
   *   Markdown `body`. The doc is several times the size of the Markdown.
   * - `markdown` (CLI, MCP, agents): the Markdown `body` only; `bodyDoc` is
   *   null. Everything an agent reads is in the Markdown.
   * - `outline`: headings only (`outline`), no body — the shape of a long page
   *   before deciding which `section` to read.
   *
   * `section` narrows the Markdown `body` to one heading's section (the
   * heading line through to the next heading of the same or a higher level).
   * `bodyBytes` is always the full body's UTF-8 size, so a caller can tell a
   * section from the whole.
   */
  get: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        format: z.enum(["full", "markdown", "outline"]).default("full"),
        section: z.string().trim().min(1).max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const page = await ctx.db.knowledgePage.findUnique({
        where: { id: input.id },
        include: {
          project: { select: { id: true, name: true, slug: true } },
          createdBy: { select: { id: true, name: true, image: true } },
          ceremonyOccurrence: OCCURRENCE_CRUMB_SELECT,
        },
      });
      if (!page) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
      }
      const access = await getKnowledgePageAccess(
        ctx.db,
        ctx.session.user.id,
        page,
      );
      if (!canViewKnowledgePage(access)) {
        throw await pageAccessDeniedError(ctx.db, ctx.session.user.id, page, access, "view");
      }

      // A database block is stored as a marker; readers see its table
      // (ADR-0078 §7). Expanded before sectioning so a table under a heading
      // is part of that section. A Row page instead gets its property header
      // above its prose for readers — but the editor (`full`) gets the stored
      // prose alone, with the header beside it in `database.header`: what the
      // editor initialises from is what it saves back, and the header must
      // never become editable prose.
      const row = await projectRowPage(ctx.db, page);
      const fullBody = row
        ? input.format === "full"
          ? (page.body ?? null)
          : row.body
        : await expandDatabaseMarkers(ctx.db, page.id, page.body);
      let body = fullBody;
      let section: { level: number; text: string; line: number } | null = null;
      if (input.section) {
        const found = extractMarkdownSection(fullBody ?? "", input.section);
        if (!found) {
          const headings = markdownOutline(fullBody ?? "").map((h) => h.text);
          throw new TRPCError({
            code: "NOT_FOUND",
            message: headings.length
              ? `No section "${input.section}". Headings: ${headings.join(" | ")}`
              : `No section "${input.section}": the page has no headings`,
          });
        }
        body = found.body;
        section = found.heading;
      }
      const outline =
        input.format === "outline" ? markdownOutline(fullBody ?? "") : null;
      if (input.format === "outline") body = null;
      // The doc only makes sense whole, for the editor.
      const bodyDoc =
        input.format === "full" && !input.section ? page.bodyDoc : null;

      return {
        ...page,
        bodyDoc,
        body,
        bodyBytes: markdownBytes(fullBody),
        format: input.format,
        section,
        outline,
        // The editor needs to know whether to render read-only.
        canEdit: canEditKnowledgePage(access),
        /** Set on a Row: its database, the page holding it, and the property header (ADR-0078). */
        database: row ? { ...row.database, header: row.header, relations: row.relations } : null,
      };
    }),

  /**
   * Who can see this page right now — the Share popover's "General access"
   * line. Resolved by `listKnowledgePageViewers`, the batch inverse of the
   * page access resolver, so the roster matches who `get` would admit. Any
   * viewer gets the counts; only workspace members get names and avatars, so
   * a project-only collaborator can't enumerate the workspace roster through
   * a page. A page in a public project returns no roster (everyone signed in
   * can view).
   */
  audience: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const page = await ctx.db.knowledgePage.findUnique({
        where: { id: input.id },
        select: AUDIENCE_PAGE_SELECT,
      });
      if (!page) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
      }
      const userId = ctx.session.user.id;
      await ensurePageAccess(ctx.db, userId, page, "view");
      return (await buildAudience(ctx.db, userId, page)).audience;
    }),

  /**
   * The "parent" of a page for breadcrumbs: a page whose body links to this
   * one via a `pageLink` node. Sub-pages are soft — there is no stored parent
   * pointer (ADR-0033/0038) — so this is a reverse lookup over the `PageLink`
   * index: same-workspace pages linking this id, gated on the caller's view
   * access in the query (buildKnowledgePageAccessWhere mirrors
   * getKnowledgePageAccess). A page can have several linkers; the
   * newest-edited viewable one wins, matching `tree`. Returns null when the
   * page is top-level or has no viewable linker.
   */
  parentCrumb: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, userId, page, "view");

      return ctx.db.knowledgePage.findFirst({
        where: {
          AND: [
            {
              workspaceId: page.workspaceId,
              id: { not: input.id },
              linksFrom: { some: { toPageId: input.id } },
            },
            buildKnowledgePageAccessWhere(userId),
          ],
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true },
      });
    }),

  /**
   * The sub-pages of a page: the `pageLink` targets in its own `bodyDoc`
   * (ADR-0039 — nesting is the link graph, so a child is literally a link in
   * the parent's body), read from the `PageLink` index and resolved to live
   * `{id, title, isPublic}` in document order, filtered to the ones the caller
   * can view.
   */
  children: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, userId, page, "view");

      // Same-workspace only: a pasted cross-workspace id must not surface
      // another workspace's title (mirrors collectLinkedPages / parentCrumb).
      // Push the view-access filter into the query (buildKnowledgePageAccessWhere
      // mirrors getKnowledgePageAccess) — no per-child access resolution.
      const links = await ctx.db.pageLink.findMany({
        where: {
          fromPageId: input.id,
          to: {
            AND: [
              { workspaceId: page.workspaceId },
              buildKnowledgePageAccessWhere(userId),
            ],
          },
        },
        orderBy: { position: "asc" },
        select: { to: { select: { id: true, title: true, isPublic: true } } },
      });
      return links.map((l) => l.to);
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        projectId: z.string().nullish(),
        title: boundedText("Title", TEXT_LIMITS.LABEL).optional(),
        body: boundedText("Body", TEXT_LIMITS.HUGE).optional(),
        bodyDoc: prosemirrorDoc.optional(),
        includeInSearch: z.boolean().optional(),
        /** Why the page was created — stored on its first revision. */
        note: boundedText("Note", TEXT_LIMITS.SHORT).optional(),
        source: boundedText("Source", TEXT_LIMITS.SHORT).nullish(),
        asOf: z.coerce.date().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await assertCanPlacePage(
        ctx.db,
        userId,
        input.workspaceId,
        input.projectId,
      );

      const page = await ctx.db.$transaction(async (tx) => {
        const created = await tx.knowledgePage.create({
          data: {
            workspaceId: input.workspaceId,
            projectId: input.projectId ?? null,
            title: input.title?.trim() ? input.title.trim() : "Untitled",
            body: input.body === undefined ? undefined : stripProjectedTables(input.body),
            bodyDoc: input.bodyDoc as Prisma.InputJsonValue | undefined,
            includeInSearch: input.includeInSearch ?? true,
            source: input.source?.trim() ? input.source.trim() : null,
            asOf: input.asOf ?? null,
            createdById: userId,
          },
        });
        await syncPageLinks(tx, created.id, input.bodyDoc as JSONContent | undefined);
        await syncPageDatabases(tx, created.id, {
          doc: input.bodyDoc as JSONContent | undefined,
          body: input.body,
        });
        await recordPageRevision(tx, {
          pageId: created.id,
          kind: "create",
          authorId: userId,
          note: input.note,
        });
        return created;
      });

      await recordPageActivity(ctx.db, {
        pageId: page.id,
        action: "created",
        authorId: userId,
      });

      // Index any seeded body (e.g. agent-authored pages) — no-op when empty.
      if (input.body?.trim()) {
        getEmbeddingTriggerService(ctx.db).triggerPageEmbedding(page.id);
      }
      return page;
    }),

  /**
   * Update a Page. The body-save path (ADR-0024) carries `bodyDoc` (canonical
   * ProseMirror) plus its derived Markdown `body`, guarded by an
   * optimistic-concurrency compare-and-set on `docVersion`; metadata-only
   * updates (title, project link, search toggle) skip the version dance.
   *
   * A Markdown-source write (`body` without `bodyDoc`, the path the CLI and
   * Zoe take) is compare-and-set on `docVersion` too when it carries the
   * `baseVersion` it read. A mismatch leaves the page unchanged and throws
   * CONFLICT with `data.conflict` (ADR-0071 change integrity). `baseVersion`
   * is optional on this path for now; without it the write bumps
   * `docVersion` unconditionally, as before.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: boundedText("Title", TEXT_LIMITS.LABEL, { min: 1 }).optional(),
        projectId: z.string().nullish(),
        includeInSearch: z.boolean().optional(),
        bodyDoc: prosemirrorDoc.optional(),
        body: boundedText("Body", TEXT_LIMITS.HUGE).optional(),
        baseVersion: z.number().int().min(0).optional(),
        /** Why this change — recorded on the revision (ADR-0074). */
        note: boundedText("Note", TEXT_LIMITS.SHORT).optional(),
        source: boundedText("Source", TEXT_LIMITS.SHORT).nullish(),
        asOf: z.coerce.date().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, userId, page, "edit");
      if (input.projectId !== undefined || input.includeInSearch !== undefined) {
        assertNotRow(page, "placement and search inclusion");
      }

      const { id, bodyDoc, body: rawBody, baseVersion, projectId, note, source, ...rest } =
        input;
      // A Markdown writer may hand back a body it read *expanded* (a database
      // block's table under its marker). The stored body holds markers only
      // (ADR-0078 §7), so strip those tables before comparing or storing.
      const body =
        rawBody !== undefined && bodyDoc === undefined ? stripProjectedTables(rawBody) : rawBody;
      // `rest` carries title / includeInSearch / asOf straight through; an
      // explicit empty source clears the field.
      const provenance =
        source !== undefined
          ? { source: source?.trim() ? source.trim() : null }
          : {};

      // Re-assigning the project changes visibility + workspace coherence, so
      // re-run placement gating for the new target (null = detach to workspace).
      const projectIdProvided = projectId !== undefined;
      if (projectIdProvided) {
        await assertCanPlacePage(
          ctx.db,
          userId,
          page.workspaceId,
          projectId,
        );
      }

      // A Markdown-source write — `body` set without `bodyDoc` — comes from a
      // non-editor writer (the Zoe agent authors Markdown; the rich editor
      // always sends both). Treat the Markdown as canonical and bump
      // `docVersion`: null out `bodyDoc` so the editor re-derives the doc from
      // the new Markdown on next open (the same lazy migration a null bodyDoc
      // triggers) — or, when the old doc has comment marks, derive it here so
      // they can be carried across (below).
      //
      // Re-sending the stored Markdown unchanged (agents retry-write a lot)
      // writes nothing to the body, as on features and tickets: rewriting it
      // would bump `docVersion` for nothing, hand every open editor tab a
      // spurious CONFLICT, and land unguarded however stale its base was.
      const stored =
        body !== undefined && bodyDoc === undefined
          ? await ctx.db.knowledgePage.findUnique({
              where: { id },
              select: { bodyDoc: true, body: true, docVersion: true },
            })
          : null;
      const markdownSourceWrite =
        body !== undefined && bodyDoc === undefined && stored?.body !== body;
      // Nulling the doc would take every comment mark with it, orphaning the
      // page's anchored threads. When there are marks to keep, derive the doc
      // here instead and carry them across wherever their text survived.
      let carriedDoc: JSONContent | null = null;
      let markdownBaseVersion: number | undefined;
      if (markdownSourceWrite) {
        // The Markdown path is checked when the caller sent the revision it
        // read. Fail fast here; the WHERE on docVersion below closes the race.
        if (baseVersion !== undefined) {
          markdownBaseVersion = baseVersion;
          await withConflictAsTRPC(async () =>
            assertBaseRevision({
              entity: "page",
              id,
              field: "body",
              storedRevision: stored?.docVersion ?? page.docVersion,
              baseRevision: baseVersion,
            }),
          );
        }
        const storedDoc = stored?.bodyDoc as JSONContent | null | undefined;
        if (docHasCommentMarks(storedDoc)) {
          try {
            carriedDoc = withCarriedCommentMarks(
              storedDoc,
              markdownToDocServer(body),
              "page.update",
            );
          } catch (error) {
            // Fall back to the lazy re-derivation (marks lost, as before).
            reportHandledErrorServer(error, { area: "page.update" });
          }
        }
      }
      const data: Prisma.KnowledgePageUpdateInput = {
        ...rest,
        ...provenance,
        ...(projectIdProvided
          ? {
              project: projectId
                ? { connect: { id: projectId } }
                : { disconnect: true },
            }
          : {}),
        ...(markdownSourceWrite
          ? {
              body,
              bodyDoc: carriedDoc
                ? (carriedDoc as Prisma.InputJsonValue)
                : Prisma.DbNull,
              docVersion: { increment: 1 },
            }
          : {}),
      };

      // Body autosave path: optimistic-concurrency guard + atomic version bump.
      if (bodyDoc !== undefined) {
        if (baseVersion === undefined) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "baseVersion is required when saving the page body",
          });
        }
        const decision = checkStaleWrite({
          storedVersion: page.docVersion,
          baseVersion,
        });
        if (!decision.accept) {
          throw toConflictTRPCError(
            new RevisionConflictError(
              {
                entity: "page",
                id,
                field: "body",
                expectedRevision: baseVersion,
                currentRevision: page.docVersion,
              },
              decision.reason === "stale"
                ? "This page was updated in another tab or by another member. Reload to get the latest version."
                : "Stale document version — reload and try again.",
            ),
          );
        }
        // The WHERE on docVersion closes the read→write race so two concurrent
        // saves can't both bump from the same base.
        // Autosaves inside history's fold window are one revision — one
        // editing session — and only a new revision is an activity event.
        // (A holder, because the flag is set inside the transaction callback.)
        const session = { started: false };
        const written = await writePageBodyIfVersion(ctx.db, {
          pageId: id,
          expectedVersion: baseVersion,
          doc: bodyDoc as JSONContent,
          data: {
            ...rest,
            ...provenance,
            ...(projectIdProvided ? { projectId: projectId ?? null } : {}),
            ...(body !== undefined ? { body } : {}),
          },
          afterWrite: async (tx) => {
            const revision = await recordPageRevision(tx, {
              pageId: id,
              kind: "editor",
              authorId: userId,
              note,
            });
            session.started = !revision.folded;
          },
        });
        if (!written) {
          throw await conflictAfterMiss({
            entity: "page",
            id,
            field: "body",
            expectedRevision: baseVersion,
            readCurrentRevision: () => readPageDocVersion(ctx.db, id),
            message:
              "This page was updated concurrently. Reload to get the latest version.",
          });
        }
        if (session.started) {
          await recordPageActivity(ctx.db, {
            pageId: id,
            action: "updated",
            authorId: userId,
          });
        }
        // Body changed → re-index after a settle delay (embeds, or clears when
        // includeInSearch is off / body emptied). Fire-and-forget.
        getEmbeddingTriggerService(ctx.db).triggerPageEmbedding(id);
        return { id, docVersion: decision.nextVersion };
      }

      // A Markdown-source write replaces the doc (carried, or nulled for lazy
      // re-derivation), so its links are re-derived with it; a metadata-only
      // update leaves the doc and its links alone.
      const guardedBase = markdownBaseVersion;
      // Set when this write produced a new revision (never for a folded one).
      const history = { newRevision: false };
      const updated = markdownSourceWrite
        ? await ctx.db.$transaction(async (tx) => {
            // With a base version the update is a compare-and-set: a save
            // that landed since the check above makes it miss (P2025) and
            // the transaction writes nothing.
            const row = await tx.knowledgePage
              .update({
                where:
                  guardedBase !== undefined
                    ? { id, docVersion: guardedBase }
                    : { id },
                data,
              })
              .catch(async (error: unknown) => {
                if (guardedBase === undefined || !isCompareAndSetMiss(error)) {
                  throw error;
                }
                throw await conflictAfterMiss({
                  entity: "page",
                  id,
                  field: "body",
                  expectedRevision: guardedBase,
                  readCurrentRevision: () => readPageDocVersion(tx, id),
                });
              });
            await syncPageLinks(tx, id, carriedDoc);
            // No doc to read blocks from on this path: the markers decide.
            await syncPageDatabases(tx, id, { doc: carriedDoc, body });
            const revision = await recordPageRevision(tx, {
              pageId: id,
              kind: "markdown",
              authorId: userId,
              note,
            });
            history.newRevision = !revision.folded;
            return row;
          })
        : (await metadataChangesHistory(ctx.db, id, {
              title: rest.title,
              source: provenance.source,
              asOf: rest.asOf,
            }))
          ? // A rename or a provenance change is part of the page's history
            // too (a silently moved as-of date is exactly what history is
            // for). From the app it folds into the author's open editing
            // session; from the CLI, MCP or an agent it is its own revision.
            await ctx.db.$transaction(async (tx) => {
              const row = await tx.knowledgePage.update({ where: { id }, data });
              const revision = await recordPageRevision(tx, {
                pageId: id,
                kind: revisionKindForWriter(ctx.tokenType),
                authorId: userId,
                note,
              });
              history.newRevision = !revision.folded;
              return row;
            })
          : await ctx.db.knowledgePage.update({ where: { id }, data });
      if (history.newRevision) {
        await recordPageActivity(ctx.db, {
          pageId: id,
          action: "updated",
          authorId: userId,
        });
      }
      // Re-index when the content or its search inclusion changed. A Markdown
      // `body` set without `bodyDoc` is a non-editor write (the Zoe agent) that
      // doesn't take the bodyDoc save path above, so cover it here too.
      if (markdownSourceWrite || input.includeInSearch !== undefined) {
        getEmbeddingTriggerService(ctx.db).triggerPageEmbedding(id);
      }
      return updated;
    }),

  /**
   * Persist the one-time lazy migration of a null `bodyDoc` into the canonical
   * ProseMirror JSON (ADR-0024), mirroring `feature.initDescriptionDoc`. The
   * client converts the Markdown `body` (or an empty doc) on first open and
   * calls this once. Idempotent and write-once: if `bodyDoc` is already set, the
   * existing doc wins and nothing is written.
   */
  initBodyDoc: protectedProcedure
    .input(z.object({ id: z.string(), doc: prosemirrorDoc }))
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "edit");

      const existing = await ctx.db.knowledgePage.findUnique({
        where: { id: input.id },
        select: { bodyDoc: true },
      });
      if (existing?.bodyDoc != null) {
        return { migrated: false, bodyDoc: existing.bodyDoc };
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const row = await tx.knowledgePage.update({
          where: { id: input.id },
          data: { bodyDoc: input.doc as Prisma.InputJsonValue },
          select: { bodyDoc: true },
        });
        await syncPageLinks(tx, input.id, input.doc as JSONContent);
        await syncPageDatabases(tx, input.id, { doc: input.doc as JSONContent });
        return row;
      });
      return { migrated: true, bodyDoc: updated.bodyDoc };
    }),

  /**
   * Upload an image pasted/dropped into the page body (ADR-0024 Tier B),
   * mirroring `feature.uploadImage`: base64 in, public URL out, via Vercel Blob.
   * Gated by the same edit check as saving.
   */
  uploadImage: protectedProcedure
    .input(z.object({ id: z.string(), base64Data: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "edit");

      // Same 5MB cap as feature.uploadImage (base64 is ~4/3 the byte size).
      const approxBytes = Math.floor((input.base64Data.length * 3) / 4);
      if (approxBytes > 5 * 1024 * 1024) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Image too large. Please use an image under 5MB.",
        });
      }

      const timestamp = new Date().toISOString().replace(/[/:]/g, "-");
      const filename = `screenshots/pages/${input.id}/${timestamp}.png`;
      const blob = await uploadToBlob(input.base64Data, filename);
      return { url: blob.url };
    }),

  /**
   * Publish a Page to the web (ADR-0038). Edit access is the whole gate —
   * including restricted-project Pages; the share popover is the consent
   * surface. First publish mints the immutable `publicId` and derives
   * `publicSlug` from the title; republish reuses both, reviving old links.
   */
  publish: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.id);
      assertNotRow(page, "publishing");
      await ensureCanPublish(ctx.db, ctx.session.user.id, page);
      return publishPage(ctx.db, input.id);
    }),

  /**
   * The pages this page links to (via `pageLink` nodes, transitively) that are
   * not yet published and that the caller could publish. The share popover
   * lists them so publishing a sub-tree stays an explicit, visible act —
   * ADR-0038's "publishing never follows from visibility rules" holds; this
   * only extends the consent surface.
   */
  linkedUnpublished: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, userId, page, "view");

      const linked = await collectLinkedPages(ctx.db, page);

      const publishable: { id: string; title: string }[] = [];
      for (const candidate of linked) {
        if (candidate.isPublic) continue;
        const access = await getKnowledgePageAccess(ctx.db, userId, candidate);
        const canPublish = candidate.isInviteOnly
          ? canManageKnowledgePageAccess(access)
          : canEditKnowledgePage(access);
        if (canPublish) {
          publishable.push({ id: candidate.id, title: candidate.title });
        }
      }
      return publishable;
    }),

  /**
   * Publish several pages at once — the share popover's "publish linked pages"
   * action (typically the ids returned by `linkedUnpublished`). Each page is
   * gated by the same edit check as `publish`; ids are explicit so the server
   * never publishes anything the user didn't see listed.
   */
  publishMany: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(LINKED_PAGES_LIMIT),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const ids = [...new Set(input.ids)];
      // Pre-flight: require edit access on *every* page before publishing any,
      // so "you can't publish X" rejects the whole request up front instead of
      // after publishing some of the batch. This is not a transaction —
      // publishPage's mint-collision retry must survive a unique violation,
      // which would abort a Postgres tx — so a rare failure mid-loop leaves a
      // partial batch. That's safe: publishing is idempotent, so the caller can
      // simply retry. (The permission window between check and publish is
      // sub-second and low-impact: at worst a page the user could edit moments
      // ago gets published.)
      for (const id of ids) {
        const page = await loadPageForAccess(ctx.db, id);
      assertNotRow(page, "publishing");
        await ensureCanPublish(ctx.db, userId, page);
      }
      const results = [];
      for (const id of ids) {
        results.push(await publishPage(ctx.db, id));
      }
      return results;
    }),

  /** Unpublish → the public URL 404s immediately. `publicId`/`publicSlug` are
   * kept so republishing revives previously shared links (ADR-0038). */
  unpublish: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.id);
      assertNotRow(page, "publishing");
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "edit");
      // Rows go dark with their holding page (ADR-0078 §4).
      await ctx.db.knowledgePage.updateMany({
        where: { database: { pageId: input.id } },
        data: { isPublic: false },
      });
      return ctx.db.knowledgePage.update({
        where: { id: input.id },
        data: { isPublic: false },
        select: PUBLIC_SETTINGS_SELECT,
      });
    }),

  /** Edit the cosmetic slug and/or the search-engine opt-in. The slug is
   * re-slugified server-side, so any input collapses to a valid URL segment;
   * old URLs keep working via the canonical redirect (lookup is by `publicId`). */
  updatePublicSettings: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        publicSlug: boundedText("Slug", TEXT_LIMITS.LABEL, { min: 1 }).optional(),
        publicSeoIndexed: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.id);
      assertNotRow(page, "publishing");
      await ensureCanPublish(ctx.db, ctx.session.user.id, page);
      return ctx.db.knowledgePage.update({
        where: { id: input.id },
        data: {
          ...(input.publicSlug !== undefined
            ? { publicSlug: slugifyPageTitle(input.publicSlug) }
            : {}),
          ...(input.publicSeoIndexed !== undefined
            ? { publicSeoIndexed: input.publicSeoIndexed }
            : {}),
        },
        select: PUBLIC_SETTINGS_SELECT,
      });
    }),

  /**
   * Duplicate a Page: view access on the source + the same placement gate as
   * create (so the copy lands with identical visibility — same project /
   * workspace, per ADR-0038). Copies content and the search toggle; the copy
   * is owned by the duplicator and never inherits publish state. An
   * invite-only page's copy stays invite-only with no invitees (ADR-0069); see
   * {@link copyPlacement} for where it lands.
   *
   * With `withSubpages`, the whole sub-tree is copied (ADR-0039): BFS the
   * `pageLink` graph (workspace-scoped, cycle-safe, capped at
   * {@link LINKED_PAGES_LIMIT}), deep-copy the reachable pages the caller can
   * both view and place, remap old→new ids, and rewrite the copied bodies'
   * `pageLink` targets so the copy links to the copies. Links to pages that
   * can't be copied (no access, or beyond the cap) keep pointing at the
   * originals. Only the root is titled "(copy)"; sub-pages keep their names.
   */
  duplicate: protectedProcedure
    .input(z.object({ id: z.string(), withSubpages: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      assertNotRow(page, "duplicating");
      await ensurePageAccess(ctx.db, userId, page, "view");
      const rootPlacement = await copyPlacement(ctx.db, userId, page);
      if (!rootPlacement) {
        // Re-run the throwing gate for its specific error message.
        await assertCanPlacePage(ctx.db, userId, page.workspaceId, page.projectId);
      }

      const workspace = await ctx.db.workspace.findUniqueOrThrow({
        where: { id: page.workspaceId },
        select: { slug: true },
      });

      // The set of pages to copy: the root, plus (when requested) the reachable
      // sub-tree the caller can view AND place. Order the root first so it gets
      // the "(copy)" title and is returned as the entry point.
      const rootRow = await ctx.db.knowledgePage.findUniqueOrThrow({
        where: { id: input.id },
        select: DUPLICATE_SELECT,
      });
      const toCopy: { row: DuplicateRow; projectId: string | null }[] = [
        // `rootPlacement` is non-null here (the gate above threw otherwise);
        // its `projectId` may be a deliberate null — don't `??` it away.
        { row: rootRow, projectId: rootPlacement ? rootPlacement.projectId : rootRow.projectId },
      ];

      if (input.withSubpages) {
        const linked = await collectLinkedPages(ctx.db, page);
        const extraIds = linked.map((l) => l.id).filter((id) => id !== input.id);
        // Filter to viewable rows in the query (buildKnowledgePageAccessWhere
        // mirrors getKnowledgePageAccess) rather than resolving access per row.
        const rows =
          extraIds.length > 0
            ? await ctx.db.knowledgePage.findMany({
                where: {
                  id: { in: extraIds },
                  ...buildKnowledgePageAccessWhere(userId),
                },
                select: DUPLICATE_SELECT,
              })
            : [];
        const rowById = new Map(rows.map((r) => [r.id, r]));
        // Memoize the placement gate per (workspace, project, mode) — sub-pages
        // of a tree overwhelmingly share one, collapsing it to ~one round-trip.
        const placements = new Map<string, { projectId: string | null } | null>();
        // Iterate extraIds (not rows) to preserve BFS/document order.
        for (const id of extraIds) {
          const row = rowById.get(id);
          if (!row) continue;
          const placeKey = `${row.workspaceId}:${row.projectId ?? ""}:${row.isInviteOnly}`;
          let placement = placements.get(placeKey);
          if (placement === undefined) {
            placement = await copyPlacement(ctx.db, userId, row);
            placements.set(placeKey, placement);
          }
          if (placement) toCopy.push({ row, projectId: placement.projectId });
        }
      }

      // Two passes in one transaction: create every copy (to mint ids and build
      // the old→new remap), then rewrite each copied body's `pageLink` targets
      // and index the copy's links (which may point at copies minted later in
      // the first pass, so they can't be indexed on create).
      const copies = await ctx.db.$transaction(async (tx) => {
        const remap = new Map<string, PageLinkRewrite>();
        const created: { source: DuplicateRow; id: string }[] = [];
        for (const [index, { row, projectId }] of toCopy.entries()) {
          const created0 = await tx.knowledgePage.create({
            data: {
              title: index === 0 ? `${row.title} (copy)` : row.title,
              body: row.body,
              bodyDoc:
                row.bodyDoc === null
                  ? undefined
                  : (row.bodyDoc as Prisma.InputJsonValue),
              includeInSearch: row.includeInSearch,
              workspaceId: row.workspaceId,
              projectId,
              // A copy never widens access: an invite-only page's copy is
              // invite-only too, owned by the duplicator with no invitees.
              isInviteOnly: row.isInviteOnly,
              // A copy states the same facts, so it keeps where they came from.
              source: row.source,
              asOf: row.asOf,
              createdById: userId,
            },
            select: { id: true },
          });
          remap.set(row.id, {
            pageId: created0.id,
            href: buildPageEditorPath(workspace.slug, created0.id),
          });
          created.push({ source: row, id: created0.id });
        }

        // Rewrite links only for copies whose body actually links a copied
        // page — skip the no-op writes.
        for (const { source, id } of created) {
          if (source.bodyDoc === null) continue;
          let doc = source.bodyDoc as JSONContent;
          if (collectPageLinkIds(doc).some((linkId) => remap.has(linkId))) {
            doc = remapPageLinkIds(doc, remap);
            await tx.knowledgePage.update({
              where: { id },
              data: { bodyDoc: doc as Prisma.InputJsonValue },
            });
          }
          await syncPageLinks(tx, id, doc);
        }
        // Snapshot once the links point at the copies, so restoring a copy's
        // first revision never re-points it at the originals.
        for (const { source, id } of created) {
          await recordPageRevision(tx, {
            pageId: id,
            kind: "create",
            authorId: userId,
            note: `Duplicated from page ${source.id}`,
          });
        }
        return created;
      });

      // One "created" event, for the copy the caller asked for. Its copied
      // sub-pages come with it and would only flood the feed.
      if (copies[0]) {
        await recordPageActivity(ctx.db, {
          pageId: copies[0].id,
          action: "created",
          authorId: userId,
        });
      }

      // Index every copied body like create does for seeded bodies.
      for (const { source, id } of copies) {
        if (source.body?.trim()) {
          getEmbeddingTriggerService(ctx.db).triggerPageEmbedding(id);
        }
      }
      // The root copy is the entry point the client navigates to. `toCopy`
      // always leads with `rootRow`, so `copies` is never empty — guard anyway
      // so a partial transaction surfaces a clear error instead of a crash.
      const rootCopy = copies[0];
      if (!rootCopy) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Duplicate produced no pages",
        });
      }
      return { id: rootCopy.id };
    }),

  /**
   * Everything the Share popover shows, in one call (ADR-0069, ADR-0080): the
   * inherited audience (`audience`, as `page.audience` returns it), the
   * grantees with their roles, and what the caller may do. Any viewer may read
   * it. Grantees are listed only to members of the page's workspace and to
   * its owner (a page in a public project is viewable by every signed-in
   * user); emails only to
   * people who can share. `canShare` (anyone who can edit) drives Add people;
   * `canManage` (the owner) drives the restrict switch; each grantee's
   * `canChange` says whether the caller may change or remove that row.
   * `subpagesToApply` counts the linked sub-pages "Apply to sub-pages" would
   * update.
   */
  sharing: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await ctx.db.knowledgePage.findUnique({
        where: { id: input.id },
        select: AUDIENCE_PAGE_SELECT,
      });
      if (!page) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
      }
      const access = await getKnowledgePageAccess(ctx.db, userId, page);
      if (!canViewKnowledgePage(access)) {
        throw await pageAccessDeniedError(ctx.db, userId, page, access, "view");
      }
      const canManage = canManageKnowledgePageAccess(access);
      const canShare = canShareKnowledgePage(access);

      const [{ audience, isWorkspaceMember }, blocker, subpagesToApply] = await Promise.all([
        buildAudience(ctx.db, userId, page),
        canManage ? inviteOnlyBlocker(ctx.db, page.id) : Promise.resolve(null),
        canShare
          ? copyableGrants(ctx.db, page).then(
              async (grants) =>
                (await applicableSubpages(ctx.db, userId, page, grants.length > 0)).touched,
            )
          : Promise.resolve(0),
      ]);
      // Names go to workspace members only; the owner chose these people, so
      // an owner who has since left the workspace still sees and manages them.
      const invites = isWorkspaceMember || canManage
        ? await ctx.db.knowledgePageMember.findMany({
            where: { pageId: page.id },
            orderBy: { createdAt: "asc" },
            select: {
              role: true,
              invitedById: true,
              user: { select: { id: true, name: true, image: true, email: true } },
            },
          })
        : [];
      const stillMembers = await filterWorkspaceMembers(
        ctx.db,
        page.workspaceId,
        invites.map((i) => i.user.id),
      );

      return {
        isInviteOnly: page.isInviteOnly,
        ownerId: page.createdById,
        canShare,
        canManage,
        inviteOnlyBlockedReason: blocker,
        subpagesToApply,
        audience,
        invitees: invites.map((i) => ({
          id: i.user.id,
          name: i.user.name,
          image: i.user.image,
          // Email only to people who can share; everyone else sees names.
          email: canShare ? i.user.email : null,
          role: isKnowledgePageInviteRole(i.role) ? i.role : ("viewer" as const),
          // Has since left the workspace: the grant gives no access.
          isWorkspaceMember: stillMembers.has(i.user.id),
          // The owner may change anyone's grant; other sharers only their own.
          canChange: canChangeKnowledgePageGrant(access, userId, i),
        })),
      };
    }),

  /**
   * Turn invite-only on or off (owner only, ADR-0069). On: the page is visible
   * to the owner and its invitees only. Off: back to project/workspace
   * visibility. Invitee rows are kept either way, so switching back restores
   * the list.
   */
  setInviteOnly: protectedProcedure
    .input(z.object({ id: z.string(), inviteOnly: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.id);
      assertNotRow(page, "sharing");
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "manage");
      if (input.inviteOnly) {
        const blocker = await inviteOnlyBlocker(ctx.db, page.id);
        if (blocker) {
          throw new TRPCError({ code: "BAD_REQUEST", message: blocker });
        }
      }
      return ctx.db.knowledgePage.update({
        where: { id: page.id },
        data: { isInviteOnly: input.inviteOnly },
        select: { id: true, isInviteOnly: true },
      });
    }),

  /**
   * Grant workspace members access to a page, in any mode (ADR-0080): on a
   * restricted page the grant is the only way in; elsewhere it adds to what
   * the project or workspace already allows. Everyone must belong to the
   * page's workspace — no guests (ADR-0069). Re-inviting
   * someone updates their role; only people new to the page are notified.
   */
  invite: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        userIds: z.array(z.string()).min(1).max(INVITE_BATCH_LIMIT),
        role: inviteRoleSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      assertNotRow(page, "sharing");
      const access = await ensureCanShare(ctx.db, userId, page);

      const userIds = [...new Set(input.userIds)].filter(
        (id) => id !== page.createdById,
      );
      if (userIds.length === 0) return { added: 0, updated: 0, unchanged: 0 };
      const members = await filterWorkspaceMembers(
        ctx.db,
        page.workspaceId,
        userIds,
      );
      const outsiders = userIds.filter((id) => !members.has(id));
      if (outsiders.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can only invite members of this workspace",
        });
      }

      await assertMayGrantRole(ctx.db, access, page.workspaceId, userIds, input.role);

      const existing = await ctx.db.knowledgePageMember.findMany({
        where: { pageId: page.id, userId: { in: userIds } },
        select: { userId: true, invitedById: true },
      });
      const already = new Set(existing.map((e) => e.userId));
      const added = userIds.filter((id) => !already.has(id));
      // Re-sharing changes the role only on grants the caller may change: the
      // owner any, anyone else only their own. The rest stay as they are.
      const changeable = existing
        .filter((e) => canChangeKnowledgePageGrant(access, userId, e))
        .map((e) => e.userId);

      await ctx.db.$transaction([
        ...(added.length
          ? [
              ctx.db.knowledgePageMember.createMany({
                data: added.map((id) => ({
                  pageId: page.id,
                  userId: id,
                  role: input.role,
                  invitedById: userId,
                })),
                skipDuplicates: true,
              }),
            ]
          : []),
        ...(changeable.length
          ? [
              ctx.db.knowledgePageMember.updateMany({
                where: { pageId: page.id, userId: { in: changeable } },
                data: { role: input.role },
              }),
            ]
          : []),
      ]);

      if (added.length > 0) {
        // Fire-and-forget: the invite has landed; a notification failure is
        // logged by emitNotification itself and must not fail the request.
        emitNotification({
          category: NOTIFICATION_CATEGORIES.PAGE_SHARED,
          actorUserId: userId,
          subject: { pageId: page.id, invitedUserIds: added },
          db: ctx.db,
        }).catch(() => undefined);
      }
      return {
        added: added.length,
        updated: changeable.length,
        unchanged: already.size - changeable.length,
      };
    }),

  /**
   * Change a grantee's role. The owner may change anyone's; another editor
   * only the grants they added, and never to editor for a workspace Viewer.
   */
  updateInvite: protectedProcedure
    .input(z.object({ id: z.string(), userId: z.string(), role: inviteRoleSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      assertNotRow(page, "sharing");
      const access = await ensureCanShare(ctx.db, userId, page);
      await ensureMayChangeGrant(ctx.db, access, userId, page.id, input.userId);
      await assertMayGrantRole(ctx.db, access, page.workspaceId, [input.userId], input.role);
      await ctx.db.knowledgePageMember.updateMany({
        where: { pageId: page.id, userId: input.userId },
        data: { role: input.role },
      });
      return { success: true };
    }),

  /**
   * Remove a grantee. Takes effect immediately. The owner may remove anyone;
   * another editor only the people they added.
   */
  removeInvite: protectedProcedure
    .input(z.object({ id: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      assertNotRow(page, "sharing");
      const access = await ensureCanShare(ctx.db, userId, page);
      const grant = await ctx.db.knowledgePageMember.findUnique({
        where: { pageId_userId: { pageId: page.id, userId: input.userId } },
        select: { id: true },
      });
      // Already gone: removing is idempotent.
      if (!grant) return { success: true };
      await ensureMayChangeGrant(ctx.db, access, userId, page.id, input.userId);
      await ctx.db.knowledgePageMember.deleteMany({
        where: { pageId: page.id, userId: input.userId },
      });
      return { success: true };
    }),

  /**
   * One-off "Apply to sub-pages" (ADR-0069, ADR-0080: sub-pages keep their own
   * access, nothing is inherited live). From any page the caller may share:
   * - copies this page's grants to each linked sub-page the caller may share;
   * - when this page is restricted, also restricts the linked sub-pages the
   *   caller may restrict (their own).
   * Additive — a sub-page's own grants are kept and nobody's role is changed
   * (existing rows are skipped). A non-owner of a sub-page copies an editor
   * grant for a workspace Viewer as a viewer grant, the rule `invite`
   * applies. Nobody is re-notified — they were shared the parent.
   */
  applySharingToSubpages: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      assertNotRow(page, "sharing");
      await ensureCanShare(ctx.db, userId, page);

      const grants = await copyableGrants(ctx.db, page);
      const { shareTo, restrict, skipped } = await applicableSubpages(
        ctx.db,
        userId,
        page,
        grants.length > 0,
      );
      const roles = await getWorkspaceRoles(
        ctx.db,
        page.workspaceId,
        grants.map((g) => g.userId),
      );
      const rows = shareTo.flatMap((target) =>
        grants
          // The sub-page's owner has access already; a grant row adds nothing.
          .filter((g) => g.userId !== target.createdById)
          .map((g) => ({
            pageId: target.id,
            userId: g.userId,
            // A role the caller may not grant on this sub-page (an editor
            // grant for a workspace Viewer, from a non-owner) is copied as
            // viewer — the same rule `invite` applies.
            role: canGrantKnowledgePageRole(target.access, g.role, roles.get(g.userId) ?? null)
              ? g.role
              : "viewer",
            invitedById: userId,
          })),
      );

      if (rows.length > 0 || restrict.length > 0) {
        await ctx.db.$transaction([
          ...(restrict.length > 0
            ? [
                ctx.db.knowledgePage.updateMany({
                  where: { id: { in: restrict } },
                  data: { isInviteOnly: true },
                }),
              ]
            : []),
          // Targets are capped by LINKED_PAGES_LIMIT; grants are not, so the
          // product is written in bounded statements inside the one transaction.
          ...chunk(rows, SUBPAGE_INVITE_ROWS_PER_STATEMENT).map((data) =>
            ctx.db.knowledgePageMember.createMany({ data, skipDuplicates: true }),
          ),
        ]);
      }
      return { shared: shareTo.length, restricted: restrict.length, skipped };
    }),

  /**
   * Re-home a Page: move it to another workspace and/or project in one step
   * (same-workspace project changes can also go through `update`). The caller
   * must be able to edit the page and to place a page in the target scope.
   * Page links are same-workspace only (ADR-0039), so a cross-workspace move
   * detaches the page from its parent and sub-pages — the links' index rows
   * are dropped; the `pageLink` nodes in the docs remain as plain links.
   */
  move: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        workspaceId: z.string(),
        projectId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      assertNotRow(page, "moving");
      const crossWorkspace = input.workspaceId !== page.workspaceId;
      // Taking a page out of its workspace cuts off every grantee who isn't in
      // the new one — an unshare. On a restricted page that is the owner's call
      // alone (ADR-0069); on any other page, a non-owner may unshare only the
      // grants they added (ADR-0080), so a grant someone else added makes the
      // move owner-only too. Within the workspace grants are untouched, so an
      // editor may still re-file the page under a project.
      const unsharesOthers =
        crossWorkspace &&
        (page.isInviteOnly ||
          (await ctx.db.knowledgePageMember.count({
            where: {
              pageId: page.id,
              OR: [{ invitedById: null }, { invitedById: { not: userId } }],
            },
          })) > 0);
      await ensurePageAccess(ctx.db, userId, page, unsharesOthers ? "manage" : "edit");
      await assertCanPlacePage(ctx.db, userId, input.workspaceId, input.projectId);

      if (crossWorkspace) {
        const anchors = await ctx.db.knowledgePage.findUniqueOrThrow({
          where: { id: input.id },
          select: {
            ceremonyOccurrence: { select: { id: true } },
            workspaceUpdate: { select: { id: true } },
            _count: { select: { features: true } },
          },
        });
        if (
          anchors.ceremonyOccurrence ||
          anchors.workspaceUpdate ||
          anchors._count.features > 0
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This page belongs to a ceremony, workspace update or feature and can't leave its workspace",
          });
        }
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.knowledgePage.update({
          where: { id: input.id },
          data: { workspaceId: input.workspaceId, projectId: input.projectId },
        });
        // A page's databases and their rows live where the page lives
        // (ADR-0078 §4): same workspace, rows on the same project.
        await tx.pageDatabase.updateMany({
          where: { pageId: input.id },
          data: { workspaceId: input.workspaceId },
        });
        await tx.knowledgePage.updateMany({
          where: { database: { pageId: input.id } },
          data: { workspaceId: input.workspaceId, projectId: input.projectId },
        });
        if (crossWorkspace) {
          await tx.pageLink.deleteMany({
            where: { OR: [{ fromPageId: input.id }, { toPageId: input.id }] },
          });
        }
      });
      // Search chunks are scoped by the page's placement — re-index the page
      // and every row that moved with it.
      const embeddings = getEmbeddingTriggerService(ctx.db);
      embeddings.triggerPageEmbedding(input.id);
      const movedRows = await ctx.db.knowledgePage.findMany({
        where: { database: { pageId: input.id } },
        select: { id: true },
      });
      for (const row of movedRows) embeddings.triggerPageEmbedding(row.id);

      const workspace = await ctx.db.workspace.findUniqueOrThrow({
        where: { id: input.workspaceId },
        select: { slug: true },
      });
      return { id: input.id, workspaceSlug: workspace.slug };
    }),

  /**
   * Search a workspace's pages by meaning (ADR-0033's Knowledge index,
   * `KnowledgeChunk.sourceType = "page"`) and by substring, in one call. Semantic
   * hits come first, nearest first, each with the best-matching chunk as its
   * snippet; pages whose title or body contain the query but that the index
   * missed (not yet embedded, or `includeInSearch` off) follow with
   * `matchedBy: "text"`. Scoped to pages the caller can view. A vector or
   * embedding failure degrades to text matches only — it never throws.
   */
  search: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        query: z.string().trim().min(2).max(200),
        projectId: z.string().optional(),
        limit: z.number().int().min(1).max(25).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const empty = {
        query: input.query,
        workspaceId: input.workspaceId,
        results: [] as PageSearchResult[],
      };
      // Scoped by the page access rule, not by workspace membership: a
      // project-only collaborator searches the pages they can view. Someone
      // who can view no page here gets nothing, without paying for an
      // embedding.
      const viewable = await ctx.db.knowledgePage.findFirst({
        where: {
          AND: [buildKnowledgePageAccessWhere(userId), { workspaceId: input.workspaceId }],
        },
        select: { id: true },
      });
      if (!viewable) return empty;
      const workspace = await ctx.db.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { slug: true },
      });
      if (!workspace) return empty;

      const results: PageSearchResult[] = [];
      const seen = new Set<string>();
      const pageUrl = (id: string) => `/w/${workspace.slug}/pages/${id}`;

      // Semantic matches need an embeddings provider; without one, page search
      // is the title/body text match below.
      if (isAiConfigured("openai")) {
        try {
          // `pageViewerId` is the access rule; the service's `userId` option
          // would narrow to chunks the caller authored, which is not "pages I
          // can read". The project filter is applied strictly below (the
          // service's own includes project-less chunks).
          const chunks = await getKnowledgeService(ctx.db).search(input.query, {
            workspaceId: input.workspaceId,
            pageViewerId: userId,
            sourceTypes: ["page"],
            projectId: input.projectId,
            limit: input.limit * PAGE_SEARCH_CHUNKS_PER_PAGE,
          });
          let inProject: Set<string> | null = null;
          if (input.projectId && chunks.length) {
            const rows = await ctx.db.knowledgePage.findMany({
              where: {
                id: { in: [...new Set(chunks.map((c) => c.sourceId))] },
                projectId: input.projectId,
              },
              select: { id: true },
            });
            inProject = new Set(rows.map((r) => r.id));
          }
          // Nearest first, so a page's first chunk is its best.
          for (const chunk of chunks) {
            if (chunk.similarity < PAGE_SEARCH_MIN_SIMILARITY) break;
            if (seen.has(chunk.sourceId)) continue;
            if (inProject && !inProject.has(chunk.sourceId)) continue;
            seen.add(chunk.sourceId);
            results.push({
              id: chunk.sourceId,
              title: chunk.sourceTitle ?? "Untitled",
              snippet: snippetOf(chunk.content),
              similarity: chunk.similarity,
              matchedBy: "semantic",
              url: pageUrl(chunk.sourceId),
            });
            if (results.length >= input.limit) break;
          }
        } catch (error) {
          console.error("[page.search] Knowledge search failed:", error);
        }
      }

      if (results.length < input.limit) {
        const needle = input.query;
        const textMatches = await ctx.db.knowledgePage.findMany({
          where: {
            AND: [
              buildKnowledgePageAccessWhere(userId),
              { workspaceId: input.workspaceId },
              ...(input.projectId ? [{ projectId: input.projectId }] : []),
              ...(seen.size ? [{ id: { notIn: [...seen] } }] : []),
              {
                OR: [
                  { title: { contains: needle, mode: "insensitive" } },
                  { body: { contains: needle, mode: "insensitive" } },
                ],
              },
            ],
          },
          orderBy: { updatedAt: "desc" },
          take: input.limit - results.length,
          select: { id: true, title: true, body: true },
        });
        for (const page of textMatches) {
          results.push({
            id: page.id,
            title: page.title,
            snippet: snippetAround(page.body ?? "", needle),
            similarity: null,
            matchedBy: "text",
            url: pageUrl(page.id),
          });
        }
      }

      return { ...empty, results };
    }),

  /**
   * The page's history (ADR-0074), newest first: one row per revision with
   * who, when, why and the size of the body at that point — never the bodies
   * themselves. Page through with `cursor` (the last row's id).
   */
  history: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, userId, page, "view");
      const namesAuthors = await canSeeRevisionAuthors(ctx.db, userId, page.workspaceId);
      const rows = await ctx.db.knowledgePageRevision.findMany({
        where: { pageId: input.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          docVersion: true,
          title: true,
          kind: true,
          note: true,
          // The stored size, never the body: a long page's history would
          // otherwise pull every revision's Markdown out of Postgres.
          bodyBytes: true,
          source: true,
          asOf: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { id: true, name: true, image: true } },
        },
      });
      const hasMore = rows.length > input.limit;
      const slice = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        revisions: slice.map(({ author, ...row }) => ({
          ...row,
          ...presentRevisionAuthor(author, namesAuthors),
        })),
        nextCursor: hasMore ? slice[slice.length - 1]!.id : null,
      };
    }),

  /** One revision with its Markdown body (the doc stays server-side; `restore` uses it). */
  revision: protectedProcedure
    .input(z.object({ id: z.string(), revisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, userId, page, "view");
      const revision = await ctx.db.knowledgePageRevision.findUnique({
        where: { id: input.revisionId },
        select: {
          id: true,
          pageId: true,
          docVersion: true,
          title: true,
          body: true,
          source: true,
          asOf: true,
          kind: true,
          note: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { id: true, name: true, image: true } },
        },
      });
      if (!revision || revision.pageId !== input.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Revision not found" });
      }
      const namesAuthors = await canSeeRevisionAuthors(ctx.db, userId, page.workspaceId);
      const { author, ...rest } = revision;
      return {
        ...rest,
        ...presentRevisionAuthor(author, namesAuthors),
        bodyBytes: markdownBytes(revision.body),
      };
    }),

  /**
   * What a revision changed, as a unified diff of the Markdown. By default the
   * revision is compared with the one before it (so the result reads "what
   * this edit did"); `against: "current"` compares it with the page as it is
   * now, and any other revision id compares the two revisions.
   */
  diff: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        revisionId: z.string(),
        against: z.string().default("previous"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "view");
      const select = {
        id: true,
        pageId: true,
        docVersion: true,
        title: true,
        body: true,
        source: true,
        asOf: true,
        createdAt: true,
      } satisfies Prisma.KnowledgePageRevisionSelect;
      const revision = await ctx.db.knowledgePageRevision.findUnique({
        where: { id: input.revisionId },
        select,
      });
      if (!revision || revision.pageId !== input.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Revision not found" });
      }
      type Side = {
        revisionId: string | null;
        docVersion: number;
        title: string;
        body: string | null;
        source: string | null;
        asOf: Date | null;
        createdAt: Date | null;
      };
      const side = (r: typeof revision): Side => ({
        revisionId: r.id,
        docVersion: r.docVersion,
        title: r.title,
        body: r.body,
        source: r.source,
        asOf: r.asOf,
        createdAt: r.createdAt,
      });

      let from: Side;
      let to: Side;
      if (input.against === "previous") {
        const previous = await ctx.db.knowledgePageRevision.findFirst({
          where: {
            pageId: input.id,
            OR: [
              { createdAt: { lt: revision.createdAt } },
              { createdAt: revision.createdAt, id: { lt: revision.id } },
            ],
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select,
        });
        from = previous
          ? side(previous)
          : { revisionId: null, docVersion: 0, title: "", body: "", source: null, asOf: null, createdAt: null };
        to = side(revision);
      } else if (input.against === "current") {
        const current = await ctx.db.knowledgePage.findUniqueOrThrow({
          where: { id: input.id },
          select: { docVersion: true, title: true, body: true, source: true, asOf: true, updatedAt: true },
        });
        from = side(revision);
        to = {
          revisionId: null,
          docVersion: current.docVersion,
          title: current.title,
          body: current.body,
          source: current.source,
          asOf: current.asOf,
          createdAt: current.updatedAt,
        };
      } else {
        const other = await ctx.db.knowledgePageRevision.findUnique({
          where: { id: input.against },
          select,
        });
        if (!other || other.pageId !== input.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Revision to compare with not found" });
        }
        // Older side first, whichever was passed where.
        const [a, b] =
          other.createdAt <= revision.createdAt ? [other, revision] : [revision, other];
        from = side(a);
        to = side(b);
      }

      const label = (x: Side) =>
        x.revisionId ? `revision ${x.revisionId} (v${x.docVersion})` : x.createdAt ? "current" : "(empty)";
      const diff = diffRevisionBodies(
        { label: label(from), ...from },
        { label: label(to), ...to },
      );
      const strip = ({ body: _body, ...meta }: Side) => meta;
      return { from: strip(from), to: strip(to), ...diff };
    }),

  /**
   * Put a revision's title and body back as the page's current content. A
   * forward-moving write (ADR-0071): the page's `docVersion` bumps and a
   * "restore" revision is recorded, so the history keeps the state that was
   * replaced. Compare-and-set on the page's current version, like any body
   * write.
   */
  restore: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        revisionId: z.string(),
        note: boundedText("Note", TEXT_LIMITS.SHORT).optional(),
        /**
         * The page's `docVersion` when the caller decided to restore (the
         * History panel sends the version it showed). With it, a page saved
         * since then is a CONFLICT rather than silently replaced.
         */
        baseVersion: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = await loadPageForAccess(ctx.db, input.id);
      await ensurePageAccess(ctx.db, userId, page, "edit");
      const revision = await ctx.db.knowledgePageRevision.findUnique({
        where: { id: input.revisionId },
        select: {
          id: true,
          pageId: true,
          title: true,
          body: true,
          bodyDoc: true,
          source: true,
          asOf: true,
          properties: true,
          createdAt: true,
        },
      });
      if (!revision || revision.pageId !== input.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Revision not found" });
      }
      const doc = (revision.bodyDoc as JSONContent | null) ?? null;

      const restored = await ctx.db.$transaction(async (tx) => {
        const expectedVersion = input.baseVersion ?? page.docVersion;
        const { count } = await tx.knowledgePage.updateMany({
          where: { id: input.id, docVersion: expectedVersion },
          data: {
            title: revision.title,
            body: revision.body,
            // The whole snapshot comes back, provenance included — February's
            // words under a June as-of date is the mismatch provenance exists
            // to prevent.
            source: revision.source,
            asOf: revision.asOf,
            // No stored doc → the editor re-derives one from the Markdown on
            // next open, as after a Markdown-source write.
            bodyDoc: doc ? (doc as Prisma.InputJsonValue) : Prisma.DbNull,
            // A Row's values are part of its snapshot too (ADR-0078); an
            // ordinary page's revision carries null and stays null.
            ...(revision.properties !== undefined
              ? {
                  properties:
                    revision.properties === null
                      ? Prisma.DbNull
                      : (revision.properties as Prisma.InputJsonValue),
                }
              : {}),
            docVersion: { increment: 1 },
          },
        });
        if (count !== 1) {
          throw await conflictAfterMiss({
            entity: "page",
            id: input.id,
            field: "body",
            expectedRevision: expectedVersion,
            readCurrentRevision: () => readPageDocVersion(tx, input.id),
            message:
              "This page changed since you looked at its history. Reopen the history and try the restore again.",
          });
        }
        await syncPageLinks(tx, input.id, doc);
        await syncPageDatabases(tx, input.id, { doc, body: revision.body });
        const recorded = await recordPageRevision(tx, {
          pageId: input.id,
          kind: "restore",
          authorId: userId,
          note:
            input.note ??
            `Restored the version from ${revision.createdAt.toISOString()}`,
        });
        return {
          docVersion: expectedVersion + 1,
          revisionId: recorded.id,
          newRevision: !recorded.folded,
        };
      });
      const { newRevision, ...result } = restored;

      // Restoring a version is an edit by whoever restored it.
      if (newRevision) {
        await recordPageActivity(ctx.db, {
          pageId: input.id,
          action: "updated",
          authorId: userId,
        });
      }

      getEmbeddingTriggerService(ctx.db).triggerPageEmbedding(input.id);
      return { id: input.id, ...result };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.id);
      assertNotRow(page, "deleting");
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "edit");
      await ctx.db.knowledgePage.delete({ where: { id: input.id } });
      // Drop the Page's chunks from the Knowledge index so search can't return
      // a deleted page.
      await getEmbeddingTriggerService(ctx.db).clearPageChunks(input.id);
      return { success: true };
    }),
});
