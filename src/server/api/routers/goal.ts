import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";

import { 
  getMyPublicGoals, 
  getAllMyGoals,
  updateGoal,
  getProjectGoals
} from "~/server/services/goalService";

export const goalRouter = createTRPCRouter({
  myPublicGoals: publicProcedure
    .query(getMyPublicGoals),

  getAllMyGoals: protectedProcedure.query(getAllMyGoals),

  createGoal: protectedProcedure
    .input(z.object({
      title: z.string(),
      description: z.string().optional(),
      dueDate: z.date().optional(),
      lifeDomainId: z.number(),
      projectId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {

      return await ctx.db.goal.create({
        data: {
          title: input.title,
          description: input.description,
          dueDate: input.dueDate,
          lifeDomainId: input.lifeDomainId,
          userId: ctx.session.user.id,
          projects: input.projectId
            ? { connect: [{ id: input.projectId }] }
            : undefined,
        }
      });
    }),

  updateGoal: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string(),
      description: z.string().optional(),
      dueDate: z.date().optional(),
      lifeDomainId: z.number(),
      projectId: z.string().optional(),
    }))
    .mutation(updateGoal),

  getProjectGoals: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return getProjectGoals({ ctx, projectId: input.projectId });
    }),
});
