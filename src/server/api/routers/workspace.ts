import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

// Middleware to check API key for external integrations (browser extension, etc.)
const apiKeyMiddleware = publicProcedure.use(async ({ ctx, next }) => {
  const apiKey = ctx.headers.get("x-api-key");

  if (!apiKey) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "API key is required",
    });
  }

  const verificationToken = await ctx.db.verificationToken.findFirst({
    where: {
      token: apiKey,
      expires: {
        gt: new Date(),
      },
    },
  });

  if (!verificationToken) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired API key",
    });
  }

  const userId = verificationToken.userId;
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No user associated with this API key",
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId,
    },
  });
});
import {
  generateSecureToken,
  generateInviteUrl,
} from "~/server/utils/tokens";

export const workspaceRouter = createTRPCRouter({
  // API endpoint for browser extension - uses API key authentication
  getUserWorkspaces: apiKeyMiddleware
    .output(z.object({
      workspaces: z.array(z.object({
        id: z.string(),
        name: z.string(),
      }))
    }))
    .query(async ({ ctx }) => {
      const workspaces = await ctx.db.workspace.findMany({
        where: {
          members: {
            some: {
              userId: ctx.userId,
            },
          },
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          name: "asc",
        },
      });

      return {
        workspaces,
      };
    }),

  // Create a new workspace
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z
          .string()
          .min(1)
          .regex(
            /^[a-z0-9-]+$/,
            "Slug can only contain lowercase letters, numbers, and hyphens"
          ),
        description: z.string().optional(),
        type: z.enum(["personal", "team", "organization"]).default("team"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if slug already exists
      const existingWorkspace = await ctx.db.workspace.findUnique({
        where: { slug: input.slug },
      });

      if (existingWorkspace) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A workspace with this slug already exists",
        });
      }

      // Create workspace with user as owner
      const workspace = await ctx.db.workspace.create({
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          type: input.type,
          ownerId: ctx.session.user.id,
          members: {
            create: {
              userId: ctx.session.user.id,
              role: "owner",
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
        },
      });

      return workspace;
    }),

  // Get all workspaces for the current user
  list: protectedProcedure.query(async ({ ctx }) => {
    const workspaces = await ctx.db.workspace.findMany({
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
            goals: true,
            outcomes: true,
            teams: true,
          },
        },
      },
      orderBy: [{ type: "asc" }, { createdAt: "desc" }],
    });

    // Add current user's role to each workspace
    return workspaces.map((workspace) => {
      const currentMember = workspace.members.find(
        (m) => m.userId === ctx.session.user.id
      );
      return {
        ...workspace,
        currentUserRole: currentMember?.role ?? null,
      };
    });
  }),

  // Get a single workspace by slug
  getBySlug: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const workspace = await ctx.db.workspace.findUnique({
        where: { slug: input.slug },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
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
              goals: true,
              outcomes: true,
              teams: true,
            },
          },
        },
      });

      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace not found",
        });
      }

      // Check if user is a member
      const currentMember = workspace.members.find(
        (member) => member.userId === ctx.session.user.id
      );
      if (!currentMember) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this workspace",
        });
      }

      return {
        ...workspace,
        currentUserRole: currentMember.role,
      };
    }),

  // Update workspace details
  update: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        effortUnit: z.enum(["STORY_POINTS", "T_SHIRT", "HOURS"]).optional(),
        enableAdvancedActions: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is owner or admin
      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
      });

      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace owners and admins can update workspace details",
        });
      }

      const updatedWorkspace = await ctx.db.workspace.update({
        where: { id: input.workspaceId },
        data: {
          name: input.name,
          description: input.description,
          effortUnit: input.effortUnit,
          enableAdvancedActions: input.enableAdvancedActions,
        },
      });

      return updatedWorkspace;
    }),

  // Add a member to the workspace (or create invitation if user doesn't exist)
  addMember: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        email: z.string().email(),
        role: z.enum(["admin", "member", "viewer"]).default("member"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is owner or admin
      const currentMember = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
      });

      if (
        !currentMember ||
        (currentMember.role !== "owner" && currentMember.role !== "admin")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace owners and admins can add members",
        });
      }

      // Find user by email
      const userToAdd = await ctx.db.user.findUnique({
        where: { email: input.email },
      });

      if (userToAdd) {
        // User exists - add directly
        // Check if user is already a member
        const existingMember = await ctx.db.workspaceUser.findUnique({
          where: {
            userId_workspaceId: {
              userId: userToAdd.id,
              workspaceId: input.workspaceId,
            },
          },
        });

        if (existingMember) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "User is already a member of this workspace",
          });
        }

        // Add user to workspace
        const newMember = await ctx.db.workspaceUser.create({
          data: {
            userId: userToAdd.id,
            workspaceId: input.workspaceId,
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
        // Check if already invited
        const existingInvitation = await ctx.db.workspaceInvitation.findUnique({
          where: {
            workspaceId_email: {
              workspaceId: input.workspaceId,
              email: input.email,
            },
          },
        });

        if (existingInvitation && existingInvitation.status === "pending") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An invitation has already been sent to this email",
          });
        }

        const token = generateSecureToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const invitation = await ctx.db.workspaceInvitation.upsert({
          where: {
            workspaceId_email: {
              workspaceId: input.workspaceId,
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
            workspaceId: input.workspaceId,
            email: input.email,
            role: input.role,
            token,
            expiresAt,
            createdById: ctx.session.user.id,
          },
        });

        return {
          type: "invitation_created" as const,
          invitation,
          inviteUrl: generateInviteUrl(token),
        };
      }
    }),

  // Remove a member from the workspace
  removeMember: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is owner or admin
      const currentMember = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
      });

      if (
        !currentMember ||
        (currentMember.role !== "owner" && currentMember.role !== "admin")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace owners and admins can remove members",
        });
      }

      // Check if trying to remove the owner
      const memberToRemove = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: input.userId,
            workspaceId: input.workspaceId,
          },
        },
      });

      if (memberToRemove?.role === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot remove the workspace owner",
        });
      }

      // Remove member
      await ctx.db.workspaceUser.delete({
        where: {
          userId_workspaceId: {
            userId: input.userId,
            workspaceId: input.workspaceId,
          },
        },
      });

      return { success: true };
    }),

  // Update member role
  updateMemberRole: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        userId: z.string(),
        role: z.enum(["admin", "member", "viewer"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Only owners can change roles
      const currentMember = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
      });

      if (!currentMember || currentMember.role !== "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace owners can change member roles",
        });
      }

      // Update role
      const updatedMember = await ctx.db.workspaceUser.update({
        where: {
          userId_workspaceId: {
            userId: input.userId,
            workspaceId: input.workspaceId,
          },
        },
        data: {
          role: input.role,
        },
      });

      return updatedMember;
    }),

  // Set default workspace for user
  setDefault: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user is a member of the workspace
      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of a workspace to set it as default",
        });
      }

      // Update user's default workspace
      const updatedUser = await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { defaultWorkspaceId: input.workspaceId },
      });

      return { success: true, defaultWorkspaceId: updatedUser.defaultWorkspaceId };
    }),

  // Get user's default workspace
  getDefault: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { defaultWorkspaceId: true },
    });

    if (!user?.defaultWorkspaceId) {
      // Return the first workspace user is a member of (preferably personal)
      const firstWorkspace = await ctx.db.workspace.findFirst({
        where: {
          members: {
            some: {
              userId: ctx.session.user.id,
            },
          },
        },
        orderBy: [{ type: "asc" }, { createdAt: "asc" }],
        select: { id: true, slug: true, name: true, type: true },
      });

      return firstWorkspace;
    }

    const workspace = await ctx.db.workspace.findUnique({
      where: { id: user.defaultWorkspaceId },
      select: { id: true, slug: true, name: true, type: true },
    });

    return workspace;
  }),

  // Delete a workspace (owner only)
  delete: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is owner
      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
      });

      if (!member || member.role !== "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace owners can delete workspaces",
        });
      }

      // Check if this is the user's only workspace
      const workspaceCount = await ctx.db.workspaceUser.count({
        where: { userId: ctx.session.user.id },
      });

      if (workspaceCount <= 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete your only workspace",
        });
      }

      // Delete workspace (cascade will handle related records)
      await ctx.db.workspace.delete({
        where: { id: input.workspaceId },
      });

      // Clear user's default if it was this workspace
      await ctx.db.user.updateMany({
        where: {
          id: ctx.session.user.id,
          defaultWorkspaceId: input.workspaceId,
        },
        data: { defaultWorkspaceId: null },
      });

      return { success: true };
    }),

  // Ensure user has a personal workspace (for onboarding/migration)
  ensurePersonalWorkspace: protectedProcedure.mutation(async ({ ctx }) => {
    // Check if user already has a personal workspace
    const existingPersonal = await ctx.db.workspace.findFirst({
      where: {
        type: "personal",
        ownerId: ctx.session.user.id,
      },
    });

    if (existingPersonal) {
      return existingPersonal;
    }

    // Create personal workspace
    const slug = `personal-${ctx.session.user.id}`;
    const workspace = await ctx.db.workspace.create({
      data: {
        name: "Personal",
        slug,
        type: "personal",
        ownerId: ctx.session.user.id,
        members: {
          create: {
            userId: ctx.session.user.id,
            role: "owner",
          },
        },
      },
    });

    // Set as default if user has no default
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { defaultWorkspaceId: true },
    });

    if (!user?.defaultWorkspaceId) {
      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { defaultWorkspaceId: workspace.id },
      });
    }

    return workspace;
  }),

  // ============================================
  // Invitation Management
  // ============================================

  // List pending invitations for a workspace
  listInvitations: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check if user is a member
      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member to view invitations",
        });
      }

      return ctx.db.workspaceInvitation.findMany({
        where: {
          workspaceId: input.workspaceId,
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

  // Cancel a pending invitation
  cancelInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.workspaceInvitation.findUnique({
        where: { id: input.invitationId },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }

      // Check permissions
      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: invitation.workspaceId,
          },
        },
      });

      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace owners and admins can cancel invitations",
        });
      }

      return ctx.db.workspaceInvitation.update({
        where: { id: input.invitationId },
        data: { status: "cancelled" },
      });
    }),

  // Resend an invitation (regenerate token and extend expiry)
  resendInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.workspaceInvitation.findUnique({
        where: { id: input.invitationId },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }

      // Check permissions
      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: invitation.workspaceId,
          },
        },
      });

      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace owners and admins can resend invitations",
        });
      }

      const newToken = generateSecureToken();
      const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const updated = await ctx.db.workspaceInvitation.update({
        where: { id: input.invitationId },
        data: {
          token: newToken,
          expiresAt: newExpiry,
          status: "pending",
        },
      });

      return {
        invitation: updated,
        inviteUrl: generateInviteUrl(newToken),
      };
    }),

  // Accept an invitation (called by the invitee)
  acceptInvitation: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.workspaceInvitation.findUnique({
        where: { token: input.token },
        include: { workspace: true },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid invitation link",
        });
      }

      if (invitation.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation is no longer valid",
        });
      }

      if (invitation.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation has expired",
        });
      }

      if (invitation.email !== ctx.session.user.email) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This invitation was sent to a different email address",
        });
      }

      // Check if user is already a member
      const existingMember = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: invitation.workspaceId,
          },
        },
      });

      if (existingMember) {
        // Mark invitation as accepted but don't create duplicate membership
        await ctx.db.workspaceInvitation.update({
          where: { id: invitation.id },
          data: { status: "accepted", acceptedAt: new Date() },
        });

        return { success: true, workspace: invitation.workspace };
      }

      // Transaction: update invitation + create membership
      await ctx.db.$transaction([
        ctx.db.workspaceInvitation.update({
          where: { id: invitation.id },
          data: { status: "accepted", acceptedAt: new Date() },
        }),
        ctx.db.workspaceUser.create({
          data: {
            userId: ctx.session.user.id,
            workspaceId: invitation.workspaceId,
            role: invitation.role,
          },
        }),
      ]);

      return { success: true, workspace: invitation.workspace };
    }),

  // Get pending invitations for the current user
  getMyPendingInvitations: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session.user.email) {
      return [];
    }

    return ctx.db.workspaceInvitation.findMany({
      where: {
        email: ctx.session.user.email,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      include: {
        workspace: {
          select: { id: true, name: true, slug: true, type: true },
        },
        createdBy: {
          select: { name: true, email: true, image: true },
        },
      },
    });
  }),

  // Get invitation details by token (public info for accept page)
  getInvitationByToken: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const invitation = await ctx.db.workspaceInvitation.findUnique({
        where: { token: input.token },
        include: {
          workspace: {
            select: { id: true, name: true, slug: true, type: true },
          },
          createdBy: {
            select: { name: true, email: true, image: true },
          },
        },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid invitation link",
        });
      }

      return {
        ...invitation,
        isExpired: invitation.expiresAt < new Date(),
        isForCurrentUser: invitation.email === ctx.session.user.email,
      };
    }),

  // ============================================
  // Team Linking
  // ============================================

  // Link a team to this workspace
  linkTeam: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        teamId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check workspace permissions (owner/admin)
      const workspaceMember = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
      });

      if (
        !workspaceMember ||
        (workspaceMember.role !== "owner" && workspaceMember.role !== "admin")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace owners/admins can link teams",
        });
      }

      // Check team permissions (owner only can link to workspace)
      const teamMember = await ctx.db.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: ctx.session.user.id,
            teamId: input.teamId,
          },
        },
      });

      if (!teamMember || teamMember.role !== "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only team owners can link their team to a workspace",
        });
      }

      // Check if team is already linked to another workspace
      const team = await ctx.db.team.findUnique({
        where: { id: input.teamId },
      });

      if (team?.workspaceId && team.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Team is already linked to another workspace",
        });
      }

      return ctx.db.team.update({
        where: { id: input.teamId },
        data: { workspaceId: input.workspaceId },
      });
    }),

  // Unlink a team from this workspace
  unlinkTeam: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        teamId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check workspace permissions (owner/admin)
      const workspaceMember = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
      });

      if (
        !workspaceMember ||
        (workspaceMember.role !== "owner" && workspaceMember.role !== "admin")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace owners/admins can unlink teams",
        });
      }

      // Verify team is linked to this workspace
      const team = await ctx.db.team.findUnique({
        where: { id: input.teamId },
      });

      if (!team || team.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team is not linked to this workspace",
        });
      }

      return ctx.db.team.update({
        where: { id: input.teamId },
        data: { workspaceId: null },
      });
    }),

  // Get all user's teams with their link status for this workspace
  getUserTeamsForLinking: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Get all teams user is a member of
      const userTeams = await ctx.db.team.findMany({
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
                select: { id: true, name: true, email: true, image: true },
              },
            },
          },
          _count: {
            select: { projects: true },
          },
        },
      });

      // Add link status and user's role for each team
      return userTeams.map((team) => {
        const userMembership = team.members.find(
          (m) => m.userId === ctx.session.user.id
        );
        return {
          ...team,
          isLinkedToThisWorkspace: team.workspaceId === input.workspaceId,
          isLinkedToOtherWorkspace:
            team.workspaceId !== null && team.workspaceId !== input.workspaceId,
          userRole: userMembership?.role ?? null,
          canLink: userMembership?.role === "owner",
        };
      });
    }),
});
