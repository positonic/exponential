import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const contentRouter = createTRPCRouter({
  /** List content drafts with filtering */
  listDrafts: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        platform: z
          .enum(["BLOG", "TWITTER", "LINKEDIN", "YOUTUBE_SCRIPT"])
          .optional(),
        status: z
          .enum(["DRAFT", "REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"])
          .optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const drafts = await ctx.db.contentDraft.findMany({
        where: {
          workspaceId: input.workspaceId,
          createdById: ctx.session.user.id,
          ...(input.platform ? { platform: input.platform } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
        include: {
          assistant: { select: { name: true, emoji: true } },
          pipelineRun: {
            select: { id: true, status: true, startedAt: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | undefined;
      if (drafts.length > input.limit) {
        const next = drafts.pop();
        nextCursor = next?.id;
      }

      return { drafts, nextCursor };
    }),

  /** Get a single draft with version history */
  getDraft: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.contentDraft.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          assistant: { select: { name: true, emoji: true } },
          pipelineRun: {
            select: { id: true, status: true, startedAt: true },
          },
          previousVersion: {
            select: {
              id: true,
              version: true,
              createdAt: true,
              title: true,
            },
          },
          newerVersions: {
            select: {
              id: true,
              version: true,
              createdAt: true,
              title: true,
            },
          },
        },
      });
    }),

  /** Update a draft (edit content, change status) */
  updateDraft: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        content: z.string().optional(),
        status: z
          .enum(["DRAFT", "REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"])
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, content, ...data } = input;
      return ctx.db.contentDraft.update({
        where: { id },
        data: {
          ...data,
          ...(content !== undefined
            ? { content, wordCount: content.split(/\s+/).length }
            : {}),
        },
      });
    }),

  /** Delete a draft */
  deleteDraft: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.contentDraft.delete({
        where: { id: input.id },
      });
    }),
});
