import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { getKnowledgeService } from "~/server/services/KnowledgeService";

const contentTypeEnum = z.enum([
  "web_page",
  "document",
  "pdf",
  "bookmark",
  "note",
]);

export const resourceRouter = createTRPCRouter({
  // Create a new resource
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        url: z.string().url().optional(),
        content: z.string().optional(),
        rawContent: z.string().optional(),
        contentType: contentTypeEnum.default("web_page"),
        mimeType: z.string().optional(),
        author: z.string().optional(),
        publishedAt: z.string().optional(), // ISO date string
        tags: z.array(z.string()).default([]),
        projectId: z.string().optional(),
        workspaceId: z.string().optional(),
        generateEmbeddings: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify project access if specified
      if (input.projectId) {
        const project = await ctx.db.project.findUnique({
          where: { id: input.projectId, createdById: userId },
        });
        if (!project) {
          throw new TRPCError({
            code: "NOT_FOUND",
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

      // Calculate word count if content is provided
      const wordCount = input.content
        ? input.content.split(/\s+/).filter(Boolean).length
        : null;

      const resource = await ctx.db.resource.create({
        data: {
          title: input.title,
          description: input.description,
          url: input.url,
          content: input.content,
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
        },
      });

      // Generate embeddings if requested and content is available
      if (input.generateEmbeddings && (input.content ?? input.rawContent)) {
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

      return { resource };
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
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const where: Record<string, unknown> = {
        userId,
        ...(input.projectId && { projectId: input.projectId }),
        ...(input.workspaceId && { workspaceId: input.workspaceId }),
        ...(input.contentType && { contentType: input.contentType }),
        ...(!input.includeArchived && { archivedAt: null }),
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
        select: {
          id: true,
          title: true,
          description: true,
          url: true,
          contentType: true,
          wordCount: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
          archivedAt: true,
          project: { select: { id: true, name: true } },
        },
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

      // Verify new project access if changing
      if (input.projectId) {
        const project = await ctx.db.project.findUnique({
          where: { id: input.projectId, createdById: userId },
        });
        if (!project) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Project not found or access denied",
          });
        }
      }

      const { id, regenerateEmbeddings, ...updateData } = input;

      // Recalculate word count if content changed
      const wordCount = input.content
        ? input.content.split(/\s+/).filter(Boolean).length
        : undefined;

      const resource = await ctx.db.resource.update({
        where: { id },
        data: {
          ...updateData,
          ...(wordCount !== undefined && { wordCount }),
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

  // Search resources using semantic search
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        projectId: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const knowledgeService = getKnowledgeService(ctx.db);
      const results = await knowledgeService.search(input.query, {
        userId,
        projectId: input.projectId,
        sourceTypes: ["resource"],
        limit: input.limit,
      });

      return { results };
    }),
});
