import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { getKnowledgeService } from "~/server/services/KnowledgeService";
import { htmlToMarkdown } from "~/lib/content/contentFormat";
import {
  getProjectAccess,
  hasProjectAccess,
  canEditProject,
} from "~/server/services/access";

const contentTypeEnum = z.enum([
  "web_page",
  "document",
  "pdf",
  "bookmark",
  "note",
]);

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
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  project: { select: { id: true, name: true } },
} as const;

export const resourceRouter = createTRPCRouter({
  // Create a new resource
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        url: z.string().url().optional(),
        content: z.string().optional(),
        rawContent: z
          .string()
          .max(MAX_RAW_CONTENT_CHARS, {
            message: `Article body is too large (over ${MAX_RAW_CONTENT_CHARS} characters)`,
          })
          .optional(),
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify project access if specified — creating a resource in a project
      // requires edit access to that project.
      if (input.projectId) {
        const access = await getProjectAccess(ctx.db, userId, input.projectId);
        if (!canEditProject(access)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Project not found or access denied",
          });
        }
      }

      // Verify workspace access if specified
      if (input.workspaceId) {
        const workspaceUser = await ctx.db.workspaceUser.findFirst({
          where: { workspaceId: input.workspaceId, userId },
        });
        if (!workspaceUser) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Workspace not found or access denied",
          });
        }
      }

      const content = deriveContent(input);
      const wordCount = countWords(content);
      // A save "carries a body" when it brings text or article HTML; a bare
      // link does not, and must not blank out a body saved earlier.
      const hasBody = Boolean(content ?? input.rawContent);

      // Dedupe by URL (D-0027): a URL the caller already saved is brought
      // back to the queue and refreshed, never duplicated.
      const existing = input.url
        ? await ctx.db.resource.findFirst({
            where: { userId, url: input.url },
          })
        : null;

      if (existing) {
        const read = readTransition(
          resaveReadStatus(input.readStatus, existing.readStatus),
          existing.readStatus,
          existing.readAt,
        );
        const resource = await ctx.db.resource.update({
          where: { id: existing.id },
          data: {
            archivedAt: null,
            ...read,
            ...(hasBody && {
              title: input.title,
              content,
              rawContent: input.rawContent,
              contentType: input.contentType,
              mimeType: input.mimeType,
              wordCount,
              fetchedAt: new Date(),
            }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.author !== undefined && { author: input.author }),
            ...(input.publishedAt !== undefined && {
              publishedAt: new Date(input.publishedAt),
            }),
            ...(input.tags.length > 0 && { tags: input.tags }),
            ...(input.projectId !== undefined && { projectId: input.projectId }),
            ...(input.workspaceId !== undefined && { workspaceId: input.workspaceId }),
          },
        });

        if (input.generateEmbeddings && hasBody) {
          try {
            const knowledgeService = getKnowledgeService(ctx.db);
            await knowledgeService.embedResource(resource.id);
          } catch (error) {
            console.error(
              `[resourceRouter] Failed to re-embed resource ${resource.id} on re-save:`,
              error
            );
          }
        }

        return { resource, created: false };
      }

      const resource = await ctx.db.resource.create({
        data: {
          title: input.title,
          description: input.description,
          url: input.url,
          content,
          rawContent: input.rawContent,
          contentType: input.contentType,
          mimeType: input.mimeType,
          author: input.author,
          publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
          fetchedAt: input.url ? new Date() : null,
          wordCount,
          tags: input.tags,
          userId,
          projectId: input.projectId,
          workspaceId: input.workspaceId,
          readStatus: input.readStatus,
          readAt: input.readStatus === "read" ? new Date() : null,
        },
      });

      // Generate embeddings if requested and content is available
      if (input.generateEmbeddings && hasBody) {
        try {
          const knowledgeService = getKnowledgeService(ctx.db);
          await knowledgeService.embedResource(resource.id);
        } catch (error) {
          console.error(
            `[resourceRouter] Failed to generate embeddings for resource ${resource.id}:`,
            error
          );
          // Don't fail the request if embedding fails
        }
      }

      return { resource, created: true };
    }),

  // Get a single resource by ID
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const resource = await ctx.db.resource.findFirst({
        where: { id: input.id, userId },
        include: {
          project: { select: { id: true, name: true } },
          workspace: { select: { id: true, name: true } },
        },
      });

      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      // Get chunk count
      const knowledgeService = getKnowledgeService(ctx.db);
      const chunkCount = await knowledgeService.getChunkCount(
        "resource",
        resource.id
      );

      return { resource, chunkCount };
    }),

  // List resources with filters
  list: protectedProcedure
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
      const userId = ctx.session.user.id;

      // Gate: filtering by a specific project requires access to that project.
      if (input.projectId) {
        const access = await getProjectAccess(ctx.db, userId, input.projectId);
        if (!hasProjectAccess(access)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this project",
          });
        }
      }

      const where: Record<string, unknown> = {
        userId,
        ...(input.projectId && { projectId: input.projectId }),
        // A workspace view also lists the caller's rows that have no
        // workspace (saved from the unscoped /knowledge-base page, or
        // pre-dating workspaces) — otherwise they show up nowhere. Safe
        // because `userId` already limits the list to the caller's own rows.
        // Under AND so it can't collide with the title/description `OR` below.
        ...(input.workspaceId && {
          AND: [{ OR: [{ workspaceId: input.workspaceId }, { workspaceId: null }] }],
        }),
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

      let nextCursor: string | undefined;
      if (resources.length > input.limit) {
        const nextItem = resources.pop();
        nextCursor = nextItem?.id;
      }

      return { resources, nextCursor };
    }),

  // Update a resource
  update: protectedProcedure
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
      const userId = ctx.session.user.id;

      // Verify resource exists and belongs to user
      const existing = await ctx.db.resource.findFirst({
        where: { id: input.id, userId },
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
        const access = await getProjectAccess(ctx.db, userId, input.projectId);
        if (!canEditProject(access)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Project not found or access denied",
          });
        }
      }

      const { id, regenerateEmbeddings, readStatus, ...updateData } = input;

      // Recalculate word count if content changed
      const wordCount = input.content
        ? input.content.split(/\s+/).filter(Boolean).length
        : undefined;

      const resource = await ctx.db.resource.update({
        where: { id },
        data: {
          ...updateData,
          ...(wordCount !== undefined && { wordCount }),
          ...(readStatus !== undefined &&
            readTransition(readStatus, existing.readStatus, existing.readAt)),
        },
      });

      // Regenerate embeddings if content changed or requested
      if (regenerateEmbeddings || input.content) {
        try {
          const knowledgeService = getKnowledgeService(ctx.db);
          await knowledgeService.embedResource(resource.id);
        } catch (error) {
          console.error(
            `[resourceRouter] Failed to regenerate embeddings for resource ${resource.id}:`,
            error
          );
        }
      }

      return { resource };
    }),

  // Reading list: move a resource between to_read / reading / read.
  // Marking read stamps readAt (first time only); un-reading clears it.
  // Deliberately touches nothing else — no fetch, no embedding.
  setReadStatus: protectedProcedure
    .input(z.object({ id: z.string(), readStatus: readStatusEnum }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const existing = await ctx.db.resource.findFirst({
        where: { id: input.id, userId },
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
  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const resource = await ctx.db.resource.updateMany({
        where: { id: input.id, userId },
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
  unarchive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const resource = await ctx.db.resource.updateMany({
        where: { id: input.id, userId },
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
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Delete embeddings first
      const knowledgeService = getKnowledgeService(ctx.db);
      await knowledgeService.deleteChunks("resource", input.id);

      // Delete the resource
      const deleted = await ctx.db.resource.deleteMany({
        where: { id: input.id, userId },
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
  regenerateEmbeddings: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const resource = await ctx.db.resource.findFirst({
        where: { id: input.id, userId },
      });

      if (!resource) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Resource not found",
        });
      }

      if (!resource.content && !resource.rawContent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Resource has no content to embed",
        });
      }

      const knowledgeService = getKnowledgeService(ctx.db);
      const chunkCount = await knowledgeService.embedResource(resource.id);

      return { chunkCount };
    }),

  // Toggle pinned-as-context for a resource
  setPinned: protectedProcedure
    .input(z.object({ id: z.string(), pinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const existing = await ctx.db.resource.findFirst({
        where: { id: input.id, userId },
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
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        workspaceId: z.string(),
        projectId: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Gate: must be a member of the workspace being searched.
      const wsMembership = await ctx.db.workspaceUser.findUnique({
        where: { userId_workspaceId: { userId, workspaceId: input.workspaceId } },
        select: { userId: true },
      });
      if (!wsMembership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this workspace",
        });
      }

      // Gate: filtering by a specific project requires access to that project.
      if (input.projectId) {
        const access = await getProjectAccess(ctx.db, userId, input.projectId);
        if (!hasProjectAccess(access)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this project",
          });
        }
      }

      const { KnowledgeService } = await import("~/server/services/KnowledgeService");
      const knowledgeService = getKnowledgeService(ctx.db);
      const results = await knowledgeService.search(input.query, {
        workspaceId: input.workspaceId,
        userId,
        resourceViewerId: userId,
        projectId: input.projectId,
        sourceTypes: ["resource"],
        limit: input.limit,
      });

      // SECURITY: Include provenance-wrapped format for safe AI context injection
      const aiContext = KnowledgeService.formatForAIContext(results);

      return { results, aiContext };
    }),
});
