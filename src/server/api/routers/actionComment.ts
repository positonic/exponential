import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { getActionAccess } from "~/server/services/access";

function hasViewAccess(access: {
  isCreator: boolean;
  isAssignee: boolean;
  hasProjectAccess: boolean;
}): boolean {
  return access.isCreator || access.isAssignee || access.hasProjectAccess;
}

export const actionCommentRouter = createTRPCRouter({
  getComments: protectedProcedure
    .input(z.object({ actionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const access = await getActionAccess(
        ctx.db,
        ctx.session.user.id,
        input.actionId,
      );
      if (!access || !hasViewAccess(access)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Action not found",
        });
      }

      return ctx.db.actionComment.findMany({
        where: { actionId: input.actionId },
        include: {
          author: { select: { id: true, name: true, image: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    }),

  addComment: protectedProcedure
    .input(
      z.object({
        actionId: z.string(),
        content: z.string().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const access = await getActionAccess(
        ctx.db,
        ctx.session.user.id,
        input.actionId,
      );
      if (!access || !hasViewAccess(access)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Action not found",
        });
      }

      return ctx.db.actionComment.create({
        data: {
          actionId: input.actionId,
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
      const comment = await ctx.db.actionComment.findFirst({
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

      return ctx.db.actionComment.delete({
        where: { id: input.commentId },
      });
    }),
});
