import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

import { getMyOutcomes, createOutcome, updateOutcome, deleteOutcome, deleteOutcomes } from "~/server/services/outcomeService";

const outcomeTypeEnum = z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'life', 'problem']);

export const outcomeRouter = createTRPCRouter({
  getMyOutcomes: protectedProcedure.query(getMyOutcomes),

  getOutcomesForUser: protectedProcedure
    .input(z.object({
      userId: z.string(),
      teamId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify that the requesting user is a member of the specified team
      const requestingUserMembership = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
        include: {
          team: {
            select: {
              isOrganization: true,
            },
          },
        },
      });

      if (!requestingUserMembership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You must be a member of this team to view shared weekly reviews',
        });
      }

      if (!requestingUserMembership.team.isOrganization) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Weekly reviews can only be viewed in organization teams',
        });
      }

      // Verify that the target user is also a member of the team
      const targetUserMembership = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: input.userId,
            teamId: input.teamId,
          },
        },
      });

      if (!targetUserMembership) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'The requested user is not a member of this team',
        });
      }

      // Verify that the target user has enabled sharing with this team
      const sharingSettings = await ctx.db.weeklyReviewSharing.findUnique({
        where: {
          userId_teamId: {
            userId: input.userId,
            teamId: input.teamId,
          },
        },
      });

      if (!sharingSettings?.isEnabled) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This user has not enabled weekly review sharing with this team',
        });
      }

      // Get the user's outcomes with the same structure as getMyOutcomes
      return await ctx.db.outcome.findMany({
        where: {
          userId: input.userId,
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

  deleteOutcome: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(deleteOutcome),

  deleteOutcomes: protectedProcedure
    .input(z.object({
      ids: z.array(z.string()),
    }))
    .mutation(deleteOutcomes),
}); 