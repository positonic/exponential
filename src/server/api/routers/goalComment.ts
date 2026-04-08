import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { verifyGoalAccess } from "~/server/services/goalService";

export const goalCommentRouter = createTRPCRouter({
  getComments: protectedProcedure
    .input(z.object({ goalId: z.number() }))
    .query(async ({ ctx, input }) => {
      await verifyGoalAccess({ ctx, goalId: input.goalId });

      return ctx.db.goalComment.findMany({
        where: { goalId: input.goalId },
        include: {
          author: { select: { id: true, name: true, image: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    }),

  addComment: protectedProcedure
    .input(
      z.object({
        goalId: z.number(),
        content: z.string().min(1).max(10000),
        parentUpdateId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyGoalAccess({ ctx, goalId: input.goalId });

      return ctx.db.goalComment.create({
        data: {
          goalId: input.goalId,
          authorId: ctx.session.user.id,
          content: input.content,
          parentUpdateId: input.parentUpdateId ?? null,
        },
        include: {
          author: { select: { id: true, name: true, image: true } },
        },
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
      const comment = await ctx.db.goalComment.findFirst({
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

      return ctx.db.goalComment.update({
        where: { id: input.commentId },
        data: { content: input.content },
        include: {
          author: { select: { id: true, name: true, image: true } },
        },
      });
    }),

  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.goalComment.findFirst({
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

      return ctx.db.goalComment.delete({
        where: { id: input.commentId },
      });
    }),
});
