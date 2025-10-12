import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const weeklyReviewRouter = createTRPCRouter({
  
  // Get user's sharing settings for all teams
  getSharingSettings: protectedProcedure
    .query(async ({ ctx }) => {
      const sharingSettings = await ctx.db.weeklyReviewSharing.findMany({
        where: {
          userId: ctx.session.user.id,
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
              isOrganization: true,
            },
          },
        },
      });

      return sharingSettings;
    }),

  // Get user's organization teams (for sharing options)
  getOrganizationTeams: protectedProcedure
    .query(async ({ ctx }) => {
      const organizationTeams = await ctx.db.teamUser.findMany({
        where: {
          userId: ctx.session.user.id,
        },
        include: {
          team: {
            where: {
              isOrganization: true,
            },
            select: {
              id: true,
              name: true,
              slug: true,
              isOrganization: true,
            },
          },
        },
      });

      // Filter out teams that aren't organizations and flatten the structure
      return organizationTeams
        .filter(membership => membership.team?.isOrganization)
        .map(membership => membership.team!)
        .filter(Boolean);
    }),

  // Enable/disable sharing with a specific team
  updateSharingWithTeam: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      isEnabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify user is member of the team
      const membership = await ctx.db.teamUser.findUnique({
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

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You must be a member of this team to share weekly reviews',
        });
      }

      if (!membership.team.isOrganization) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Weekly reviews can only be shared with organization teams',
        });
      }

      // Upsert sharing setting
      const sharingSettings = await ctx.db.weeklyReviewSharing.upsert({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
        update: {
          isEnabled: input.isEnabled,
        },
        create: {
          userId: ctx.session.user.id,
          teamId: input.teamId,
          isEnabled: input.isEnabled,
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      return sharingSettings;
    }),

  // Get shared weekly reviews for a specific team (used by team dashboard)
  getTeamSharedReviews: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      weekStartDate: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify user is member of the team
      const membership = await ctx.db.teamUser.findUnique({
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

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You must be a member of this team to view shared weekly reviews',
        });
      }

      if (!membership.team.isOrganization) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Weekly reviews are only available for organization teams',
        });
      }

      // Get all users sharing with this team
      const sharedReviews = await ctx.db.weeklyReviewSharing.findMany({
        where: {
          teamId: input.teamId,
          isEnabled: true,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });

      // TODO: In a future iteration, we could fetch actual weekly review data
      // For now, we just return who is sharing and their basic info
      return sharedReviews;
    }),

  // Bulk enable sharing with multiple teams
  enableSharingWithTeams: protectedProcedure
    .input(z.object({
      teamIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify user is member of all teams and they are organizations
      const memberships = await ctx.db.teamUser.findMany({
        where: {
          userId: ctx.session.user.id,
          teamId: {
            in: input.teamIds,
          },
        },
        include: {
          team: {
            select: {
              id: true,
              isOrganization: true,
            },
          },
        },
      });

      if (memberships.length !== input.teamIds.length) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You must be a member of all teams to enable sharing',
        });
      }

      const nonOrgTeams = memberships.filter(m => !m.team.isOrganization);
      if (nonOrgTeams.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Weekly reviews can only be shared with organization teams',
        });
      }

      // Enable sharing for all teams
      const results = await Promise.all(
        input.teamIds.map(teamId =>
          ctx.db.weeklyReviewSharing.upsert({
            where: {
              userId_teamId: {
                userId: ctx.session.user.id,
                teamId,
              },
            },
            update: {
              isEnabled: true,
            },
            create: {
              userId: ctx.session.user.id,
              teamId,
              isEnabled: true,
            },
          })
        )
      );

      return results;
    }),
});