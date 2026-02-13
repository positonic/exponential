import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { generateSecureToken, generateTeamInviteUrl } from "~/server/utils/tokens";
import { sendTeamInvitationEmail } from "~/server/services/EmailService";

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

  // Add a member to the team (or create invitation if user doesn't exist)
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

      if (userToAdd) {
        // User exists - add directly
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

        return { type: "member_added" as const, member: newMember };
      } else {
        // User doesn't exist - create invitation
        const existingInvitation = await ctx.db.teamInvitation.findUnique({
          where: {
            teamId_email: {
              teamId: input.teamId,
              email: input.email,
            },
          },
        });

        if (existingInvitation?.status === "pending") {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'An invitation has already been sent to this email',
          });
        }

        const token = generateSecureToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const invitation = await ctx.db.teamInvitation.upsert({
          where: {
            teamId_email: {
              teamId: input.teamId,
              email: input.email,
            },
          },
          update: {
            token,
            role: input.role,
            status: "pending",
            expiresAt,
            createdById: ctx.session.user.id,
          },
          create: {
            teamId: input.teamId,
            email: input.email,
            role: input.role,
            token,
            expiresAt,
            createdById: ctx.session.user.id,
          },
        });

        const inviteUrl = generateTeamInviteUrl(token);

        // Fetch team name for email
        const team = await ctx.db.team.findUnique({
          where: { id: input.teamId },
          select: { name: true },
        });

        // Fire-and-forget: send invitation email
        sendTeamInvitationEmail({
          to: input.email,
          teamName: team?.name ?? "a team",
          inviterName: ctx.session.user.name ?? ctx.session.user.email ?? "A team member",
          inviteUrl,
        }).catch((err: unknown) => {
          console.error("[team.addMember] Failed to send invitation email:", err);
        });

        return {
          type: "invitation_created" as const,
          invitation,
          inviteUrl,
        };
      }
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

  // List pending invitations for a team
  listInvitations: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
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
          message: 'You must be a team member to view invitations',
        });
      }

      return ctx.db.teamInvitation.findMany({
        where: {
          teamId: input.teamId,
          status: "pending",
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  // Cancel a pending team invitation
  cancelInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.teamInvitation.findUnique({
        where: { id: input.invitationId },
      });

      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
      }

      const member = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: invitation.teamId,
          },
        },
      });

      if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only team owners and admins can cancel invitations',
        });
      }

      return ctx.db.teamInvitation.update({
        where: { id: input.invitationId },
        data: { status: "cancelled" },
      });
    }),

  // Resend a team invitation (regenerate token + expiry)
  resendInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.teamInvitation.findUnique({
        where: { id: input.invitationId },
      });

      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
      }

      const member = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: invitation.teamId,
          },
        },
      });

      if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only team owners and admins can resend invitations',
        });
      }

      const newToken = generateSecureToken();
      const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const updated = await ctx.db.teamInvitation.update({
        where: { id: input.invitationId },
        data: {
          token: newToken,
          expiresAt: newExpiry,
          status: "pending",
        },
      });

      const inviteUrl = generateTeamInviteUrl(newToken);

      // Fetch team name for email
      const team = await ctx.db.team.findUnique({
        where: { id: invitation.teamId },
        select: { name: true },
      });

      // Fire-and-forget: send invitation email
      sendTeamInvitationEmail({
        to: invitation.email,
        teamName: team?.name ?? "a team",
        inviterName: ctx.session.user.name ?? ctx.session.user.email ?? "A team member",
        inviteUrl,
      }).catch((err: unknown) => {
        console.error("[team.resendInvitation] Failed to send invitation email:", err);
      });

      return {
        invitation: updated,
        inviteUrl,
      };
    }),

  // Get invitation details by token (for accept page - public so invite links work before login)
  getInvitationByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const invitation = await ctx.db.teamInvitation.findUnique({
        where: { token: input.token },
        include: {
          team: {
            select: { id: true, name: true, slug: true, description: true },
          },
          createdBy: {
            select: { name: true, email: true, image: true },
          },
        },
      });

      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invalid invitation link' });
      }

      return {
        ...invitation,
        isExpired: invitation.expiresAt < new Date(),
        isLoggedIn: !!ctx.session?.user,
        isForCurrentUser: invitation.email === ctx.session?.user?.email,
      };
    }),

  // Accept a team invitation
  acceptInvitation: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.teamInvitation.findUnique({
        where: { token: input.token },
        include: { team: true },
      });

      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invalid invitation link' });
      }

      if (invitation.status !== "pending") {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invitation is no longer valid' });
      }

      if (invitation.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invitation has expired' });
      }

      if (invitation.email !== ctx.session.user.email) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This invitation was sent to a different email address',
        });
      }

      // Check if already a member
      const existingMember = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: invitation.teamId,
          },
        },
      });

      if (existingMember) {
        await ctx.db.teamInvitation.update({
          where: { id: invitation.id },
          data: { status: "accepted", acceptedAt: new Date() },
        });
        return { success: true, team: invitation.team };
      }

      await ctx.db.$transaction([
        ctx.db.teamInvitation.update({
          where: { id: invitation.id },
          data: { status: "accepted", acceptedAt: new Date() },
        }),
        ctx.db.teamUser.create({
          data: {
            userId: ctx.session.user.id,
            teamId: invitation.teamId,
            role: invitation.role,
          },
        }),
      ]);

      return { success: true, team: invitation.team };
    }),
});