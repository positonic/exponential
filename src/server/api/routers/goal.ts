import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";

import {
  getMyPublicGoals,
  updateGoal,
  getProjectGoals,
  deleteGoal
} from "~/server/services/goalService";

export const goalRouter = createTRPCRouter({
  myPublicGoals: publicProcedure
    .query(getMyPublicGoals),

  getAllMyGoals: protectedProcedure
    .input(z.object({
      workspaceId: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return await ctx.db.goal.findMany({
        where: {
          userId: ctx.session.user.id,
          ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
        },
        include: {
          lifeDomain: true,
          projects: true,
          outcomes: true,
        },
      });
    }),

  createGoal: protectedProcedure
    .input(z.object({
      title: z.string(),
      description: z.string().optional(),
      whyThisGoal: z.string().optional(),
      notes: z.string().optional(),
      dueDate: z.date().optional(),
      period: z.string().optional(),
      lifeDomainId: z.number().optional(),
      projectId: z.string().optional(),
      outcomeIds: z.array(z.string()).optional(),
      workspaceId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.goal.create({
        data: {
          title: input.title,
          description: input.description,
          whyThisGoal: input.whyThisGoal,
          notes: input.notes,
          dueDate: input.dueDate,
          period: input.period ?? null,
          lifeDomainId: input.lifeDomainId ?? null,
          userId: ctx.session.user.id,
          workspaceId: input.workspaceId ?? null,
          projects: input.projectId
            ? { connect: [{ id: input.projectId }] }
            : undefined,
          outcomes: input.outcomeIds?.length
            ? { connect: input.outcomeIds.map(id => ({ id })) }
            : undefined,
        },
        include: {
          lifeDomain: true,
          projects: true,
          outcomes: true,
        },
      });
    }),

  updateGoal: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string(),
      description: z.string().optional(),
      whyThisGoal: z.string().optional(),
      notes: z.string().optional(),
      dueDate: z.date().optional(),
      period: z.string().optional(),
      lifeDomainId: z.number().optional(),
      projectId: z.string().optional(),
      outcomeIds: z.array(z.string()).optional(),
      workspaceId: z.string().optional(),
    }))
    .mutation(updateGoal),

  getProjectGoals: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return getProjectGoals({ ctx, projectId: input.projectId });
    }),

  deleteGoal: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return deleteGoal({ ctx, input });
    }),
});
