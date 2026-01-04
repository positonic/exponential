import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const workspaceRouter = createTRPCRouter({
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
        },
      });

      return updatedWorkspace;
    }),

  // Add a member to the workspace
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

      if (!userToAdd) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User with this email not found",
        });
      }

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

      return newMember;
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
});
