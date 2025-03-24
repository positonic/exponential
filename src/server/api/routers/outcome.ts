import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

import { getMyOutcomes, createOutcome, updateOutcome } from "~/server/services/outcomeService";

const outcomeTypeEnum = z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'life', 'problem']);

export const outcomeRouter = createTRPCRouter({
  getMyOutcomes: protectedProcedure.query(getMyOutcomes),

  createOutcome: protectedProcedure
    .input(z.object({
      description: z.string(),
      dueDate: z.date().optional(),
      type: outcomeTypeEnum.default('daily'),
      projectId: z.string().optional(),
    }))
    .mutation(createOutcome),

  getProjectOutcomes: protectedProcedure
    .input(z.object({
      projectId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return await ctx.db.outcome.findMany({
        where: {
          projects: {
            some: {
              id: input.projectId
            }
          },
          userId: ctx.session.user.id,
        },
        include: {
          projects: true,
          goals: true,
        },
        orderBy: {
          dueDate: 'asc',
        },
      });
    }),

  updateOutcome: protectedProcedure
    .input(z.object({
      id: z.string(),
      description: z.string(),
      dueDate: z.date().optional(),
      type: outcomeTypeEnum,
      projectId: z.string().optional(),
    }))
    .mutation(updateOutcome),
}); 