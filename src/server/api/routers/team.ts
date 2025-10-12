import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const teamRouter = createTRPCRouter({
  // Create a new team
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if slug already exists
      const existingTeam = await ctx.db.team.findUnique({
        where: { slug: input.slug },
      });

      if (existingTeam) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A team with this slug already exists',
        });
      }

      // Create team with user as owner
      const team = await ctx.db.team.create({
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          members: {
            create: {
              userId: ctx.session.user.id,
              role: 'owner',
            },
          },
        },
        include: {
          members: {
            include: {
              user: true,
            },
          },
        },
      });

      return team;
    }),

  // Get all teams for the current user
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const teams = await ctx.db.team.findMany({
        where: {
          members: {
            some: {
              userId: ctx.session.user.id,
            },
          },
        },
        include: {
          members: {
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
          },
          _count: {
            select: {
              projects: true,
              integrations: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return teams;
    }),

  // Get a single team by slug
  getBySlug: protectedProcedure
    .input(z.object({
      slug: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const team = await ctx.db.team.findUnique({
        where: { slug: input.slug },
        include: {
          members: {
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
          },
          projects: {
            include: {
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              _count: {
                select: {
                  actions: true,
                },
              },
            },
          },
          integrations: {
            include: {
              _count: {
                select: {
                  credentials: true,
                  workflows: true,
                },
              },
            },
          },
        },
      });

      if (!team) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Team not found',
        });
      }

      // Check if user is a member
      const isMember = team.members.some(member => member.userId === ctx.session.user.id);
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not a member of this team',
        });
      }

      return team;
    }),

  // Update team details
  update: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is owner or admin
      const member = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
      });

      if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only team owners and admins can update team details',
        });
      }

      const updatedTeam = await ctx.db.team.update({
        where: { id: input.teamId },
        data: {
          name: input.name,
          description: input.description,
        },
      });

      return updatedTeam;
    }),

  // Add a member to the team
  addMember: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      email: z.string().email(),
      role: z.enum(['admin', 'member']).default('member'),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is owner or admin
      const currentMember = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
      });

      if (!currentMember || (currentMember.role !== 'owner' && currentMember.role !== 'admin')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only team owners and admins can add members',
        });
      }

      // Find user by email
      const userToAdd = await ctx.db.user.findUnique({
        where: { email: input.email },
      });

      if (!userToAdd) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User with this email not found',
        });
      }

      // Check if user is already a member
      const existingMember = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: userToAdd.id,
            teamId: input.teamId,
          },
        },
      });

      if (existingMember) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User is already a member of this team',
        });
      }

      // Add user to team
      const newMember = await ctx.db.teamUser.create({
        data: {
          userId: userToAdd.id,
          teamId: input.teamId,
          role: input.role,
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

      return newMember;
    }),

  // Remove a member from the team
  removeMember: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      userId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is owner or admin
      const currentMember = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
      });

      if (!currentMember || (currentMember.role !== 'owner' && currentMember.role !== 'admin')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only team owners and admins can remove members',
        });
      }

      // Check if trying to remove the owner
      const memberToRemove = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: input.userId,
            teamId: input.teamId,
          },
        },
      });

      if (memberToRemove?.role === 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot remove the team owner',
        });
      }

      // Remove member
      await ctx.db.teamUser.delete({
        where: {
          userId_teamId: {
            userId: input.userId,
            teamId: input.teamId,
          },
        },
      });

      return { success: true };
    }),

  // Update member role
  updateMemberRole: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      userId: z.string(),
      role: z.enum(['admin', 'member']),
    }))
    .mutation(async ({ ctx, input }) => {
      // Only owners can change roles
      const currentMember = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
      });

      if (!currentMember || currentMember.role !== 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only team owners can change member roles',
        });
      }

      // Update role
      const updatedMember = await ctx.db.teamUser.update({
        where: {
          userId_teamId: {
            userId: input.userId,
            teamId: input.teamId,
          },
        },
        data: {
          role: input.role,
        },
      });

      return updatedMember;
    }),

  // Delete a team (owner only)
  delete: protectedProcedure
    .input(z.object({
      teamId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is owner
      const member = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
      });

      if (!member || member.role !== 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only team owners can delete teams',
        });
      }

      // Delete team (cascade will handle related records)
      await ctx.db.team.delete({
        where: { id: input.teamId },
      });

      return { success: true };
    }),

  // Set team as organization (owner only)
  setAsOrganization: protectedProcedure
    .input(z.object({
      teamId: z.string(),
      isOrganization: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is owner
      const member = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
      });

      if (!member || member.role !== 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only team owners can modify organization settings',
        });
      }

      // Update team organization status
      const updatedTeam = await ctx.db.team.update({
        where: { id: input.teamId },
        data: { isOrganization: input.isOrganization },
      });

      return updatedTeam;
    }),

  // Get weekly reviews shared with team (members only)
  getWeeklyReviews: protectedProcedure
    .input(z.object({
      teamId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Check if user is team member
      const member = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
      });

      if (!member) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You must be a team member to view shared weekly reviews',
        });
      }

      // Get team to verify it's an organization
      const team = await ctx.db.team.findUnique({
        where: { id: input.teamId },
        select: { isOrganization: true },
      });

      if (!team?.isOrganization) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Weekly reviews are only available for organization teams',
        });
      }

      // Get shared weekly reviews from team members
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

      return sharedReviews;
    }),
});