import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { after } from "next/server";
import { getKnowledgeService } from "~/server/services/KnowledgeService";
import { requireAi } from "~/server/services/ai/requireAi";
import { htmlToMarkdown } from "~/lib/content/contentFormat";
import {
  getProjectAccess,
  hasProjectAccess,
  canEditProject,
  buildSharedResourceWhere,
} from "~/server/services/access";
import { resolvePrincipal, type PrincipalContext } from "~/server/services/access/principal";
import { triggerVideoArticle } from "~/server/services/youtubeSummary/triggerVideoArticle";
import { isVideoArticle } from "~/lib/resources/reader";
import { resourceAddresses } from "~/lib/resources/identity";
import {
  findPageInProject,
  ResourceAlreadyInProjectError,
  type AlreadyInProject,
} from "~/server/services/resources/alreadyInProject";
import { youtubeVideoId } from "~/utils/youtube";

const contentTypeEnum = z.enum([
  "web_page",
  "document",
  "pdf",
  "bookmark",
  "note",
  // Set by the YouTube summary once a saved video is summarised.
  "video",
]);

/**
 * Embed a Resource where nobody is waiting on the result. A failure is logged,
 * never surfaced: the row is saved, and `reindex` re-runs it on demand.
 */
async function embedSafely(db: PrismaClient, resourceId: string, context: string): Promise<void> {
  try {
    await getKnowledgeService(db).embedResource(resourceId);
  } catch (error) {
    console.error(`[resourceRouter] Failed to embed resource ${resourceId} (${context}):`, error);
  }
}

/**
 * The slow work a save triggers, once the response has gone out, so the save
 * returns straight away: embedding a body the caller sent (a hung OpenAI call
 * would otherwise hold the save open), and starting a YouTube link's article
 * job. The cron sweep retries what that job misses.
 *
 * One `after()` callback on purpose: Next runs separate callbacks concurrently,
 * and the article job re-embeds the same row, so the body's embedding finishes
 * before it starts. Needs a request scope (`after()` throws
 * outside one); every caller of this router — tRPC over HTTP, the Slack
 * webhook, server components — has one.
 */
function processSaveAfterResponse(
  db: PrismaClient,
  resource: { id: string; url: string | null; contentType: string; mimeType: string | null },
  options: { embedBody: boolean; context: string },
): void {
  const enrich = !isVideoArticle(resource) && youtubeVideoId(resource.url) !== null;
  if (!options.embedBody && !enrich) return;
  after(async () => {
    if (options.embedBody) await embedSafely(db, resource.id, options.context);
    if (enrich) await triggerVideoArticle(resource.id);
  });
}

// Reading list: has the owner consumed this Resource yet? Orthogonal to
// archivedAt. Indexing follows *content*, never read state — a bare URL
// saved "to read" has nothing to embed, and marking it read fetches nothing.
export const readStatusEnum = z.enum(["to_read", "reading", "read"]);
export type ReadStatus = z.infer<typeof readStatusEnum>;

/**
 * The data patch for a read-state change. `readAt` records the FIRST time a
 * resource was marked read: re-marking an already-read row keeps it, and a
 * finished item picked up again (`read` → `reading`) keeps it too, so a
 * re-read never erases when it was first read. Only `to_read` — "I have not
 * read this" — clears it, so the Reading list's "read on" column never shows
 * a stale date.
 */
export function readTransition(
  next: ReadStatus,
  current: string,
  currentReadAt: Date | null,
): { readStatus: ReadStatus; readAt: Date | null } {
  if (next === "read") {
    return {
      readStatus: next,
      readAt: current === "read" && currentReadAt ? currentReadAt : new Date(),
    };
  }
  if (next === "reading") {
    return { readStatus: next, readAt: currentReadAt };
  }
  return { readStatus: next, readAt: null };
}

/**
 * The most article HTML a single save may carry (D-0025). A readability
 * extract of a long article is tens of KB; a million characters is past any
 * real page and short of what a serverless request body allows. Over the cap
 * is rejected, never truncated — a silently cut body would read as a whole
 * article.
 */
export const MAX_RAW_CONTENT_CHARS = 1_000_000;

/**
 * The most Page text a Resource keeps. Unlike an Article body, Page text is
 * never read, only searched, so a long page is cut here instead of refused:
 * the top of a listing is what says what it is.
 */
export const MAX_PAGE_TEXT_CHARS = 100_000;

/**
 * The Page text a save stores: the visible text of a page that has no
 * Article body. A save that carries a body keeps the body and no Page text,
 * and blank text is no text.
 */
export function pageTextToStore(pageText: string | undefined, hasBody: boolean): string | null {
  if (hasBody || !pageText?.trim()) return null;
  return pageText.slice(0, MAX_PAGE_TEXT_CHARS);
}

/**
 * The text a Resource is read and indexed from: what the caller supplied as
 * `content`, else Markdown derived from the article HTML in `rawContent`.
 * Derivation lives here, on the server, so every client (extension, web Save
 * link, a phone share sheet, a later URL fetcher) yields the same text
 * (ADR-0072).
 */
export function deriveContent(input: {
  content?: string;
  rawContent?: string;
}): string | undefined {
  if (input.content !== undefined) return input.content;
  if (input.rawContent) return htmlToMarkdown(input.rawContent);
  return undefined;
}

export function countWords(text: string | undefined): number | null {
  if (!text) return null;
  const n = text.split(/\s+/).filter(Boolean).length;
  return n > 0 ? n : null;
}

/**
 * The read state a re-saved Resource lands in (D-0027). A repeat save means
 * "put this back in my queue", so an archived or finished item returns to
 * `to_read` — unless it is mid-read (`reading`), which a save must not
 * interrupt. A caller that explicitly asks for `read` or `reading` gets it.
 */
export function resaveReadStatus(
  requested: ReadStatus,
  current: string,
): ReadStatus {
  if (requested === "to_read" && current === "reading") return "reading";
  return requested;
}

/**
 * The read-state patch a save applies. A save **for reference** files the
 * page without touching the Reading list: a new Resource starts `read`, so it
 * never joins the queue, and one already saved keeps the read state and
 * `readAt` it has (`{}`), whatever they are. That is not the same as asking
 * for `read`, which would pull a queued page out of the list and mark a
 * mid-read one finished. Every other save lands on the requested state, by
 * the re-save rule above when the Resource exists.
 */
export function saveReadState(
  input: { forReference: boolean; readStatus: ReadStatus },
  existing: { readStatus: string; readAt: Date | null } | null,
): { readStatus: ReadStatus; readAt: Date | null } | Record<string, never> {
  if (existing) {
    if (input.forReference) return {};
    return readTransition(
      resaveReadStatus(input.readStatus, existing.readStatus),
      existing.readStatus,
      existing.readAt,
    );
  }
  const readStatus = input.forReference ? "read" : input.readStatus;
  return { readStatus, readAt: readStatus === "read" ? new Date() : null };
}

/** The select every list-style endpoint returns for a Resource row. */
const resourceListSelect = {
  id: true,
  title: true,
  description: true,
  url: true,
  contentType: true,
  wordCount: true,
  tags: true,
  pinnedAsContext: true,
  readStatus: true,
  readAt: true,
  summary: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  project: { select: { id: true, name: true } },
  // Who saved it. Leaves the response as `owner`; see `forViewer`.
  user: { select: { id: true, name: true } },
} as const;

/**
 * Whose Resources a caller works on (ADR-0079). A person works on their own.
 * An agent — an External agent's key or an Assistant — works on its OWNER's,
 * because a reading list is a personal store the agent keeps for someone,
 * like their time (ADR-0061). It reaches only the owner's rows in workspaces
 * the owner has delegated to it, so the carve-out never goes past ADR-0049's
 * delegation; the owner's no-workspace rows stay out of its reach.
 */
export interface ResourceScope {
  /** Whose rows: the caller, or the agent's owner. */
  ownerId: string;
  /** Everyone a workspace or project gate must admit: the caller, and the owner under an agent. */
  gateUserIds: string[];
  /** The agent recorded as `createdByAgentId`; null for a person. */
  agentId: string | null;
  /** Under an agent, the workspaces it was granted; null = no limit. */
  workspaceIds: string[] | null;
}

export async function resolveResourceScope(ctx: PrincipalContext): Promise<ResourceScope> {
  const principal = await resolvePrincipal(ctx);
  if (principal.kind !== "agent") {
    return {
      ownerId: principal.userId,
      gateUserIds: [principal.userId],
      agentId: null,
      workspaceIds: null,
    };
  }
  const memberships = await ctx.db.workspaceUser.findMany({
    where: { userId: principal.userId },
    select: { workspaceId: true },
  });
  return {
    ownerId: principal.ownerId,
    gateUserIds: [principal.userId, principal.ownerId],
    agentId: principal.agentId,
    workspaceIds: memberships.map((m) => m.workspaceId),
  };
}

/**
 * The rows that are the scope's own: the only rows it may CHANGE, and the
 * whole of its Knowledge page and Reading list. Every write is scoped by
 * this, so a Resource shared through a Project stays its owner's to describe,
 * move, archive, delete, pin, re-index and mark read (ADR-0082). The one
 * write that is not is `unfile`.
 */
function scopedRows(scope: ResourceScope): Prisma.ResourceWhereInput {
  return {
    userId: scope.ownerId,
    ...(scope.workspaceIds && { workspaceId: { in: scope.workspaceIds } }),
  };
}

/**
 * The rows a scope may READ: its own, and for a person the Resources other
 * people filed under Projects they are in, because filing shares (ADR-0082;
 * the rule is `buildSharedResourceWhere`). An agent's reach is unchanged
 * (ADR-0079): its owner's rows in delegated workspaces, never anyone else's
 * shared Resources.
 *
 * Shaped to be spread into a `where` beside other fields.
 */
async function visibleRows(
  db: PrismaClient,
  scope: ResourceScope,
  only: { projectId?: string } = {},
): Promise<Prisma.ResourceWhereInput> {
  const own = scopedRows(scope);
  if (scope.agentId) return own;
  const shared = await buildSharedResourceWhere(db, scope.ownerId, only);
  return shared ? { OR: [own, shared] } : own;
}

/**
 * A row as its viewer may see it: who saved it, whether that is the caller,
 * and the read state only when it is. Read state belongs to the owner alone,
 * so nobody else's `readStatus` or `readAt` leaves the server.
 */
function forViewer<
  Row extends { user: { id: string; name: string | null }; readStatus: string; readAt: Date | null },
>(row: Row, scope: ResourceScope) {
  const { user, ...rest } = row;
  const isMine = user.id === scope.ownerId;
  return {
    ...rest,
    owner: user,
    isMine,
    readStatus: isMine ? row.readStatus : null,
    readAt: isMine ? row.readAt : null,
  };
}

/**
 * The workspace of a Project. Filing a Resource under a Project puts it in
 * the Project's workspace (ADR-0082): that is what makes it shared, and a
 * row filed in one workspace but sitting in another would be shared with
 * nobody.
 */
async function projectWorkspaceId(db: PrismaClient, projectId: string): Promise<string | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  return project?.workspaceId ?? null;
}

/** Every gate user must be a member of the workspace. */
async function assertWorkspaceMember(
  db: PrismaClient,
  scope: ResourceScope,
  workspaceId: string,
  error: TRPCError,
): Promise<void> {
  const members = await db.workspaceUser.count({
    where: { workspaceId, userId: { in: scope.gateUserIds } },
  });
  if (members < scope.gateUserIds.length) throw error;
}

/** Every gate user must pass `allowed` on the project. */
async function assertProjectAccess(
  db: PrismaClient,
  scope: ResourceScope,
  projectId: string,
  allowed: (access: Awaited<ReturnType<typeof getProjectAccess>>) => boolean,
  error: TRPCError,
): Promise<void> {
  for (const userId of scope.gateUserIds) {
    if (!allowed(await getProjectAccess(db, userId, projectId))) throw error;
  }
}

/** Under an agent a Resource must sit in a delegated workspace (ADR-0079). */
function assertAgentCanPlace(scope: ResourceScope, workspaceId: string | null | undefined): void {
  if (scope.agentId && !workspaceId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "An agent must save a Resource into a workspace",
    });
  }
}

/**
 * Page text is searched, never read, and can be 100,000 characters: no
 * response carries it back, not even the save that just sent it.
 */
const SAVED_ROW_OMIT = { pageText: true } as const;

/** Entries per page of `resource.identities`. */
export const IDENTITIES_PAGE_SIZE = 1000;

/** The refusal for filing a page under a Project that already lists it. */
function alreadyInProjectError(alreadyInProject: AlreadyInProject): TRPCError {
  const cause = new ResourceAlreadyInProjectError(alreadyInProject);
  return new TRPCError({ code: "CONFLICT", message: cause.message, cause });
}

/**
 * Keep a Resource's index entries where the Resource is. A chunk carries a
 * copy of its source's workspace and Project, which the Knowledge search
 * scopes and filters by, and moving a Resource does not re-embed it. Without
 * this a Resource filed under a Project in another workspace could be opened
 * by the Project's members and never found by them.
 */
async function moveChunksWithResource(
  db: PrismaClient,
  resource: { id: string; projectId: string | null; workspaceId: string | null },
): Promise<void> {
  await db.knowledgeChunk.updateMany({
    where: { sourceType: "resource", sourceId: resource.id },
    data: { projectId: resource.projectId, workspaceId: resource.workspaceId },
  });
}

const resourceProcedure = protectedProcedure.use(async ({ ctx, next }) =>
  next({ ctx: { scope: await resolveResourceScope(ctx) } }),
);

export const resourceRouter = createTRPCRouter({
  // Create a new resource
  create: resourceProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        // The address visited. Stored without tracking parameters, as the
        // address the Resource's link opens.
        url: z.string().url().optional(),
        // The URL the page declares for itself (`og:url` or a canonical
        // link). Used for matching only, and only when it passes the guard in
        // `pageIdentity`; never validated as a URL, because a page that
        // declares nonsense must still save.
        declaredUrl: z.string().optional(),
        content: z.string().optional(),
        rawContent: z
          .string()
          .max(MAX_RAW_CONTENT_CHARS, {
            message: `Article body is too large (over ${MAX_RAW_CONTENT_CHARS} characters)`,
          })
          .optional(),
        // Page text: the visible text of a page with no Article body. Cut at
        // MAX_PAGE_TEXT_CHARS, and dropped when the save carries a body.
        pageText: z.string().optional(),
        contentType: contentTypeEnum.default("web_page"),
        mimeType: z.string().optional(),
        author: z.string().optional(),
        publishedAt: z.string().optional(), // ISO date string
        tags: z.array(z.string()).default([]),
        projectId: z.string().optional(),
        workspaceId: z.string().optional(),
        generateEmbeddings: z.boolean().default(true),
        // Defaults to "to_read" so a quick-saved link lands in the Reading
        // list; callers saving finished reference material pass "read".
        readStatus: readStatusEnum.default("to_read"),
        // Filed for reference, not to read: the save leaves the Reading list
        // alone and `readStatus` is ignored. See `saveReadState`.
        forReference: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { scope } = ctx;

      // Verify project access if specified — creating a resource in a project
      // requires edit access to that project.
      if (input.projectId) {
        await assertProjectAccess(
          ctx.db,
          scope,
          input.projectId,
          canEditProject,
          new TRPCError({ code: "FORBIDDEN", message: "Project not found or access denied" }),
        );
      }

      // Filing under a Project puts the Resource in the Project's workspace,
      // whatever workspace the caller named.
      const workspaceId =
        (input.projectId ? await projectWorkspaceId(ctx.db, input.projectId) : null) ??
        input.workspaceId;
      assertAgentCanPlace(scope, workspaceId);

      // The caller must belong to a workspace they name. An agent must be
      // delegated the workspace the Resource lands in, named or not.
      const gatedWorkspaceId = scope.agentId ? workspaceId : input.workspaceId;
      if (gatedWorkspaceId) {
        await assertWorkspaceMember(
          ctx.db,
          scope,
          gatedWorkspaceId,
          new TRPCError({ code: "NOT_FOUND", message: "Workspace not found or access denied" }),
        );
      }

      const content = deriveContent(input);
      const wordCount = countWords(content);
      // A save "carries a body" when it brings text or article HTML; a bare
      // link does not, and must not blank out a body saved earlier.
      const hasBody = Boolean(content ?? input.rawContent);
      const pageText = pageTextToStore(input.pageText, hasBody);

      // One Resource per page (D-0027, ADR-0082): a page the caller already
      // saved is refreshed, never duplicated, and brought back to the queue
      // unless the save is for reference. Pages are matched by identity, so
      // the same listing saved with other dates or a tracking parameter is
      // the same Resource. An agent only
      // matches rows in its scope, so a re-save never reveals or moves a row
      // its owner keeps outside the delegated workspaces. Rows that pre-date
      // identity were never merged, so two may match: the one touched last
      // is the one a save refreshes.
      const addresses = input.url ? resourceAddresses(input.url, input.declaredUrl) : null;
      const existing = addresses
        ? await ctx.db.resource.findFirst({
            where: { ...scopedRows(scope), identity: addresses.identity },
            orderBy: { updatedAt: "desc" },
          })
        : null;

      // A Project lists a page once (ADR-0082). If someone else already filed
      // this page under the Project, nothing new is filed there. A save for
      // reference is refused, naming their Resource. A save that asks for the
      // Reading list still gives the caller their own Resource, saved as a
      // save with no Project would be: that is how a member puts a shared
      // page on their own list. The caller's own Resource already in the
      // Project is not a second filing, so it is updated as before.
      //
      // An archived Resource does not hold the page's place, so a save that
      // brings the caller's archived Resource back is a filing too: if a
      // teammate filed the page there in the meantime, theirs stays and the
      // caller's comes back with no Project.
      const filingProjectId =
        input.projectId ?? (existing?.archivedAt ? existing.projectId : null) ?? undefined;
      const holdsThePlace =
        existing != null && !existing.archivedAt && existing.projectId === filingProjectId;
      const alreadyInProject =
        filingProjectId && addresses && !holdsThePlace
          ? await findPageInProject(ctx.db, scope.ownerId, {
              projectId: filingProjectId,
              identity: addresses.identity,
            })
          : null;
      const asksForReadingList = !input.forReference && input.readStatus !== "read";
      if (alreadyInProject && input.projectId && !asksForReadingList) {
        throw alreadyInProjectError(alreadyInProject);
      }
      const placement: { projectId?: string | null; workspaceId?: string } = alreadyInProject
        ? {
            // The caller's own Resource leaves the Project if it was there.
            projectId: existing?.projectId === alreadyInProject.projectId ? null : undefined,
            // As a save with no Project: the workspace the caller named. An
            // agent must still land in a delegated workspace (ADR-0079), so
            // with none named its save stays in the Project's.
            workspaceId: input.workspaceId ?? (scope.agentId ? workspaceId : undefined),
          }
        : { projectId: input.projectId, workspaceId };

      if (existing) {
        // A video's article is the body. Saving its page again (the extension
        // captures one) must not replace it with a scrape of the watch page.
        const replacesBody = hasBody && !isVideoArticle(existing);
        // Page text is a record of the day it was saved, so saving the page
        // again replaces it. A Resource that has a body keeps it and takes no
        // Page text, whichever of the two arrived first.
        const replacesPageText =
          pageText !== null && !existing.content?.trim() && !existing.rawContent?.trim();
        const read = saveReadState(input, existing);
        const resource = await ctx.db.resource.update({
          where: { id: existing.id },
          omit: SAVED_ROW_OMIT,
          data: {
            archivedAt: null,
            // The latest save wins: the link reopens the page as it was
            // last saved, with that visit's dates.
            ...addresses,
            ...read,
            ...(replacesBody && {
              title: input.title,
              content,
              rawContent: input.rawContent,
              contentType: input.contentType,
              mimeType: input.mimeType,
              pageText: null,
              wordCount,
              fetchedAt: new Date(),
            }),
            ...(replacesPageText && {
              title: input.title,
              pageText,
              contentType: input.contentType,
              fetchedAt: new Date(),
            }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.author !== undefined && { author: input.author }),
            ...(input.publishedAt !== undefined && {
              publishedAt: new Date(input.publishedAt),
            }),
            ...(input.tags.length > 0 && { tags: input.tags }),
            // A save that names a Project files the Resource there, in the
            // Project's workspace. One that names only a workspace moves a
            // Resource that is not filed, and leaves a filed one with its
            // Project.
            ...(placement.projectId !== undefined
              ? {
                  projectId: placement.projectId,
                  ...(placement.workspaceId !== undefined && { workspaceId: placement.workspaceId }),
                }
              : placement.workspaceId !== undefined &&
                !existing.projectId && { workspaceId: placement.workspaceId }),
          },
        });

        if (
          resource.projectId !== existing.projectId ||
          resource.workspaceId !== existing.workspaceId
        ) {
          await moveChunksWithResource(ctx.db, resource);
        }

        processSaveAfterResponse(ctx.db, resource, {
          embedBody: input.generateEmbeddings && (replacesBody || replacesPageText),
          context: "re-save",
        });

        return { resource, created: false, alreadyInProject };
      }

      const resource = await ctx.db.resource.create({
        omit: SAVED_ROW_OMIT,
        data: {
          title: input.title,
          description: input.description,
          ...addresses,
          content,
          rawContent: input.rawContent,
          pageText,
          contentType: input.contentType,
          mimeType: input.mimeType,
          author: input.author,
          publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
          fetchedAt: input.url ? new Date() : null,
          wordCount,
          tags: input.tags,
          userId: scope.ownerId,
          createdByAgentId: scope.agentId,
          ...placement,
          ...saveReadState(input, null),
        },
      });

      processSaveAfterResponse(ctx.db, resource, {
        embedBody: input.generateEmbeddings && (hasBody || pageText !== null),
        context: "create",
      });

      return { resource, created: true, alreadyInProject };
    }),

  // Get a single resource by ID
  get: resourceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // The reader opens anything the caller can see: their own Resources,
      // and those filed under Projects they are in.
      const row = await ctx.db.resource.findFirst({
        where: { id: input.id, ...(await visibleRows(ctx.db, ctx.scope)) },
        omit: SAVED_ROW_OMIT,
        include: {
          project: { select: { id: true, name: true } },
          workspace: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
        },
      });

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }
      const resource = forViewer(row, ctx.scope);

      // Get chunk count
      const knowledgeService = getKnowledgeService(ctx.db);
      const chunkCount = await knowledgeService.getChunkCount(
        "resource",
        resource.id
      );

      return { resource, chunkCount };
    }),

  // The identities of the Resources the caller can see, so a client can say
  // "this page is already saved" by matching in the browser. It takes no URL,
  // identity or page content on purpose: the Chrome extension must not tell
  // the server which pages its user visits (its ADR 0001, "a page reaches the
  // server only when it is saved"). Do not add a lookup-by-URL beside it.
  //
  // One entry per unarchived Resource that has an identity, which is every
  // one saved from a URL; a pasted note has no page to match. Read state is
  // the owner's alone, so it is returned only on the caller's own entries.
  // Paged by id so a few thousand Resources arrive complete: follow
  // `nextCursor` until it is absent.
  identities: resourceProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(IDENTITIES_PAGE_SIZE).default(IDENTITIES_PAGE_SIZE),
          cursor: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { scope } = ctx;
      const limit = input?.limit ?? IDENTITIES_PAGE_SIZE;

      const rows = await ctx.db.resource.findMany({
        where: {
          ...(await visibleRows(ctx.db, scope)),
          archivedAt: null,
          identity: { not: null },
        },
        take: limit + 1,
        ...(input?.cursor && { cursor: { id: input.cursor }, skip: 1 }),
        orderBy: { id: "asc" },
        select: {
          id: true,
          identity: true,
          title: true,
          workspaceId: true,
          readStatus: true,
          project: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
        },
      });

      // The cursor is the last entry handed out: the next page skips it.
      const hasMore = rows.length > limit;
      if (hasMore) rows.pop();
      const nextCursor = hasMore ? rows[rows.length - 1]?.id : undefined;
      const items = rows.map(({ user, readStatus, ...row }) => {
        // A Resource someone else filed under a Project the caller is in is
        // listed too, flagged as not theirs and without its read state.
        const isMine = user.id === scope.ownerId;
        return { ...row, owner: user, isMine, readStatus: isMine ? readStatus : null };
      });

      return { items, nextCursor };
    }),

  // List resources with filters
  list: resourceProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        workspaceId: z.string().optional(),
        contentType: contentTypeEnum.optional(),
        tags: z.array(z.string()).optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(), // For pagination
        includeArchived: z.boolean().default(false),
        // Reading list filter. "unread" = to_read + reading (the Reading
        // tab); a single status narrows to that status; omitted = all.
        readStatus: z.union([readStatusEnum, z.literal("unread")]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { scope } = ctx;

      // Gate: filtering by a specific project requires access to that project.
      if (input.projectId) {
        await assertProjectAccess(
          ctx.db,
          scope,
          input.projectId,
          hasProjectAccess,
          new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" }),
        );
      }

      // A Project's list is everything filed there that the caller may see,
      // whoever saved it (ADR-0082). Every other list is the caller's own:
      // the Knowledge page, and the Reading list, which a shared Resource
      // joins for its owner only. So a read-state filter keeps the list the
      // caller's own even inside a Project.
      const listsProject = Boolean(input.projectId) && !input.readStatus && !scope.agentId;
      const rows = listsProject
        ? await visibleRows(ctx.db, scope, { projectId: input.projectId })
        : scopedRows(scope);

      // Under AND so neither can collide with the title/description `OR`
      // below: the rows of a Project's list, which are an OR of the caller's
      // own and the shared, and the workspace view.
      const and: Prisma.ResourceWhereInput[] = [
        ...(listsProject ? [rows] : []),
        // A workspace view also lists the caller's rows that have no
        // workspace (saved from the unscoped /knowledge-base page, or
        // pre-dating workspaces) — otherwise they show up nowhere. Safe
        // because a row with no workspace is never shared, so only the
        // caller's own can match; an agent's `workspaceId IN` scope still
        // drops them.
        ...(input.workspaceId
          ? [{ OR: [{ workspaceId: input.workspaceId }, { workspaceId: null }] }]
          : []),
      ];

      const where: Record<string, unknown> = {
        ...(!listsProject && rows),
        ...(and.length > 0 && { AND: and }),
        ...(input.projectId && { projectId: input.projectId }),
        ...(input.contentType && { contentType: input.contentType }),
        ...(!input.includeArchived && { archivedAt: null }),
        ...(input.readStatus === "unread"
          ? { readStatus: { in: ["to_read", "reading"] } }
          : input.readStatus
            ? { readStatus: input.readStatus }
            : {}),
      };

      // Tag filter (if any tag matches)
      if (input.tags && input.tags.length > 0) {
        where.tags = { hasSome: input.tags };
      }

      // Simple search in title/description
      if (input.search) {
        where.OR = [
          { title: { contains: input.search, mode: "insensitive" } },
          { description: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const resources = await ctx.db.resource.findMany({
        where,
        take: input.limit + 1, // Get one extra for cursor
        ...(input.cursor && {
          cursor: { id: input.cursor },
          skip: 1,
        }),
        orderBy: { createdAt: "desc" },
        select: resourceListSelect,
      });

      // The cursor is the last row handed out, because the next page skips
      // its cursor row. (It used to be the first row held back, which the
      // next page then skipped: one row lost at every page boundary.)
      let nextCursor: string | undefined;
      if (resources.length > input.limit) {
        resources.pop();
        nextCursor = resources[resources.length - 1]?.id;
      }

      return { resources: resources.map((row) => forViewer(row, scope)), nextCursor };
    }),

  // Update a resource
  update: resourceProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        content: z.string().optional(),
        tags: z.array(z.string()).optional(),
        projectId: z.string().nullable().optional(),
        workspaceId: z.string().nullable().optional(),
        regenerateEmbeddings: z.boolean().default(false),
        readStatus: readStatusEnum.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { scope } = ctx;

      // Verify resource exists and belongs to user
      const existing = await ctx.db.resource.findFirst({
        where: { id: input.id, ...scopedRows(scope) },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      // Verify new project access if changing — moving a resource into a
      // project requires edit access to that project.
      if (input.projectId) {
        await assertProjectAccess(
          ctx.db,
          scope,
          input.projectId,
          canEditProject,
          new TRPCError({ code: "FORBIDDEN", message: "Project not found or access denied" }),
        );
      }

      // An agent may move a Resource only between its delegated workspaces.
      if (scope.agentId && input.workspaceId !== undefined) {
        assertAgentCanPlace(scope, input.workspaceId);
        if (input.workspaceId && !scope.workspaceIds?.includes(input.workspaceId)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found or access denied" });
        }
      }

      // Filing sets the workspace (ADR-0082). Moving into a Project is what
      // shares a Resource, so it goes to the Project's workspace; and while it
      // is filed it stays there, whatever workspace the caller names.
      const projectId = input.projectId === undefined ? existing.projectId : input.projectId;
      const changesPlacement = Boolean(input.projectId) || input.workspaceId !== undefined;
      const filedWorkspaceId =
        projectId && changesPlacement ? await projectWorkspaceId(ctx.db, projectId) : null;
      if (filedWorkspaceId && scope.workspaceIds && !scope.workspaceIds.includes(filedWorkspaceId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found or access denied" });
      }

      // A move obeys the same rule as a save: a Project lists a page once.
      if (input.projectId && input.projectId !== existing.projectId && existing.identity) {
        const alreadyInProject = await findPageInProject(ctx.db, scope.ownerId, {
          projectId: input.projectId,
          identity: existing.identity,
        });
        if (alreadyInProject) throw alreadyInProjectError(alreadyInProject);
      }

      const { id, regenerateEmbeddings, readStatus, ...updateData } = input;

      // Recalculate word count if content changed
      const wordCount = input.content
        ? input.content.split(/\s+/).filter(Boolean).length
        : undefined;

      const resource = await ctx.db.resource.update({
        where: { id },
        omit: SAVED_ROW_OMIT,
        data: {
          ...updateData,
          ...(filedWorkspaceId && { workspaceId: filedWorkspaceId }),
          ...(wordCount !== undefined && { wordCount }),
          ...(readStatus !== undefined &&
            readTransition(readStatus, existing.readStatus, existing.readAt)),
        },
      });

      if (
        resource.projectId !== existing.projectId ||
        resource.workspaceId !== existing.workspaceId
      ) {
        await moveChunksWithResource(ctx.db, resource);
      }

      // Regenerate embeddings if content changed or requested
      if (regenerateEmbeddings || input.content) {
        after(() => embedSafely(ctx.db, resource.id, "update"));
      }

      return { resource };
    }),

  // Unfile: take a Resource out of its Project. It goes back to its owner
  // unshared, visible to them alone, and keeps everything else: description,
  // read state, text and index. Nothing is destroyed, which is why this is
  // the one thing a non-owner may do to a Resource (ADR-0082): anyone who can
  // edit the Project may unfile what is filed under it, so a misfiled page is
  // never stuck there while its owner is away. Say *unfile*, never remove or
  // delete: those mean something else here.
  unfile: resourceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { scope } = ctx;

      // Only a Resource the caller can see: their own, or one filed under a
      // Project they are in. Anything else does not exist to them.
      const existing = await ctx.db.resource.findFirst({
        where: { id: input.id, ...(await visibleRows(ctx.db, scope)) },
        select: { id: true, userId: true, projectId: true, workspaceId: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
      }
      // Not filed: nothing to do, and saying so twice is not an error.
      if (!existing.projectId) return { id: existing.id, projectId: null, unfiled: false };

      if (existing.userId !== scope.ownerId) {
        await assertProjectAccess(
          ctx.db,
          scope,
          existing.projectId,
          canEditProject,
          new TRPCError({
            code: "FORBIDDEN",
            message: "Unfiling a Resource takes edit access to its project",
          }),
        );
      }

      const resource = await ctx.db.resource.update({
        where: { id: existing.id },
        data: { projectId: null },
        select: { id: true, projectId: true, workspaceId: true },
      });
      // Its index entries leave the Project with it.
      await moveChunksWithResource(ctx.db, resource);

      return { id: resource.id, projectId: null, unfiled: true };
    }),

  // Reading list: move a resource between to_read / reading / read.
  // Marking read stamps readAt (first time only); un-reading clears it.
  // Deliberately touches nothing else — no fetch, no embedding.
  setReadStatus: resourceProcedure
    .input(z.object({ id: z.string(), readStatus: readStatusEnum }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.resource.findFirst({
        where: { id: input.id, ...scopedRows(ctx.scope) },
        select: { id: true, readStatus: true, readAt: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
      }

      return ctx.db.resource.update({
        where: { id: input.id },
        data: readTransition(input.readStatus, existing.readStatus, existing.readAt),
        select: { id: true, readStatus: true, readAt: true },
      });
    }),

  // Archive a resource (soft delete)
  archive: resourceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const resource = await ctx.db.resource.updateMany({
        where: { id: input.id, ...scopedRows(ctx.scope) },
        data: { archivedAt: new Date() },
      });

      if (resource.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      return { success: true };
    }),

  // Unarchive a resource
  unarchive: resourceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const resource = await ctx.db.resource.updateMany({
        where: { id: input.id, ...scopedRows(ctx.scope) },
        data: { archivedAt: null },
      });

      if (resource.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      return { success: true };
    }),

  // Delete a resource permanently
  delete: resourceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Delete embeddings first
      const knowledgeService = getKnowledgeService(ctx.db);
      await knowledgeService.deleteChunks("resource", input.id);

      // Delete the resource
      const deleted = await ctx.db.resource.deleteMany({
        where: { id: input.id, ...scopedRows(ctx.scope) },
      });

      if (deleted.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      return { success: true };
    }),

  // Regenerate embeddings for a resource
  regenerateEmbeddings: resourceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const resource = await ctx.db.resource.findFirst({
        where: { id: input.id, ...scopedRows(ctx.scope) },
      });

      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      if (!resource.content && !resource.rawContent && !resource.pageText) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Resource has no content to embed",
        });
      }

      requireAi("openai", "Knowledge indexing");
      const knowledgeService = getKnowledgeService(ctx.db);
      const chunkCount = await knowledgeService.embedResource(resource.id);

      return { chunkCount };
    }),

  // Toggle pinned-as-context for a resource
  setPinned: resourceProcedure
    .input(z.object({ id: z.string(), pinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.resource.findFirst({
        where: { id: input.id, ...scopedRows(ctx.scope) },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
      }

      return ctx.db.resource.update({
        where: { id: input.id },
        data: { pinnedAsContext: input.pinned },
        select: { id: true, pinnedAsContext: true },
      });
    }),

  // Search resources using semantic search.
  // workspaceId is REQUIRED — KnowledgeService.search refuses unscoped calls.
  search: resourceProcedure
    .input(
      z.object({
        query: z.string().min(1),
        workspaceId: z.string(),
        projectId: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { scope } = ctx;

      // Gate: must be a member of the workspace being searched.
      await assertWorkspaceMember(
        ctx.db,
        scope,
        input.workspaceId,
        new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this workspace" }),
      );

      // Gate: filtering by a specific project requires access to that project.
      if (input.projectId) {
        await assertProjectAccess(
          ctx.db,
          scope,
          input.projectId,
          hasProjectAccess,
          new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" }),
        );
      }

      const { KnowledgeService } = await import("~/server/services/KnowledgeService");
      const knowledgeService = getKnowledgeService(ctx.db);
      // Search follows visibility (ADR-0082): a person finds the text of
      // their own Resources and of those filed under Projects they are in,
      // and nothing else. `userId` would narrow to chunks the owner embedded,
      // hiding every shared Resource, so only an agent, whose reach is its
      // owner's rows, passes it.
      const results = await knowledgeService.search(input.query, {
        workspaceId: input.workspaceId,
        ...(scope.agentId && { userId: scope.ownerId }),
        resourceViewerId: scope.ownerId,
        resourceSharedWithViewer: !scope.agentId,
        projectId: input.projectId,
        sourceTypes: ["resource"],
        limit: input.limit,
      });

      // SECURITY: Include provenance-wrapped format for safe AI context injection
      const aiContext = KnowledgeService.formatForAIContext(results);

      return { results, aiContext };
    }),
});
