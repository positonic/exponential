import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const blogCommentRouter = createTRPCRouter({
  getComments: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.blogComment.findMany({
        where: { slug: input.slug },
        include: {
          author: { select: { id: true, name: true, image: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    }),

  addComment: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
        content: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.blogComment.create({
        data: {
          slug: input.slug,
          authorId: ctx.session.user.id,
          content: input.content,
        },
        include: {
          author: { select: { id: true, name: true, image: true } },
        },
      });
    }),

  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.blogComment.findFirst({
        where: {
          id: input.commentId,
          authorId: ctx.session.user.id,
        },
      });

      if (!comment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found or not yours",
        });
      }

      return ctx.db.blogComment.delete({
        where: { id: input.commentId },
      });
    }),

  updateComment: protectedProcedure
    .input(
      z.object({
        commentId: z.string(),
        content: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.blogComment.findFirst({
        where: {
          id: input.commentId,
          authorId: ctx.session.user.id,
        },
      });

      if (!comment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found or not yours",
        });
      }

      return ctx.db.blogComment.update({
        where: { id: input.commentId },
        data: { content: input.content },
        include: {
          author: { select: { id: true, name: true, image: true } },
        },
      });
    }),
});
