import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { verifyGoalAccess } from "~/server/services/goalService";

const healthValues = z.enum(["on-track", "at-risk", "off-track"]);

export const goalUpdateRouter = createTRPCRouter({
  getUpdates: protectedProcedure
    .input(z.object({ goalId: z.number() }))
    .query(async ({ ctx, input }) => {
      await verifyGoalAccess({ ctx, goalId: input.goalId });

      return ctx.db.goalUpdate.findMany({
        where: { goalId: input.goalId },
        include: {
          author: { select: { id: true, name: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  addUpdate: protectedProcedure
    .input(
      z.object({
        goalId: z.number(),
        content: z.string().min(1).max(10000),
        health: healthValues,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyGoalAccess({ ctx, goalId: input.goalId });

      const [update] = await ctx.db.$transaction([
        ctx.db.goalUpdate.create({
          data: {
            goalId: input.goalId,
            authorId: ctx.session.user.id,
            content: input.content,
            health: input.health,
          },
          include: {
            author: { select: { id: true, name: true, image: true } },
          },
        }),
        // Sync the goal's cached health status
        ctx.db.goal.update({
          where: { id: input.goalId },
          data: {
            health: input.health,
            healthUpdatedAt: new Date(),
          },
        }),
      ]);

      return update;
    }),

  deleteUpdate: protectedProcedure
    .input(z.object({ updateId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const update = await ctx.db.goalUpdate.findFirst({
        where: {
          id: input.updateId,
          authorId: ctx.session.user.id,
        },
      });

      if (!update) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Update not found or not yours",
        });
      }

      return ctx.db.goalUpdate.delete({
        where: { id: input.updateId },
      });
    }),
});
