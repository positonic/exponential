import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import {
  getWorkspaceMembership,
  buildWorkspaceAccessWhere,
  buildWorkspaceVisibilityWhere,
} from "~/server/services/access";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";
import {
  generateSecureToken,
  generateInviteUrl,
} from "~/server/utils/tokens";
import {
  sendTeamInvitationEmail,
  sendWorkspaceMemberAddedEmail,
} from "~/server/services/EmailService";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { uploadToBlob, deleteFromBlob } from "~/lib/blob";
import { getWorkspaceHomeStats } from "~/server/services/activity/workspaceHomeStats";
import { backfillWorkspaceActivity } from "~/server/services/activity/backfillActivity";
import { getActivityHeatmap } from "~/server/services/activity/heatmap";
import { getActivityFeed, FEED_PAGE_SIZE } from "~/server/services/activity/feed";
import {
  getOrGenerateWeeklyNarrative,
  NarrativeRateLimitError,
} from "~/server/services/activity/weeklyNarrativeService";
import type { PrismaClient } from "@prisma/client";

// Workspace membership gate shared by the home-activity endpoints. Falls
// back to team-based access so guest project members still pass, matching
// the behaviour `getHomeStats` already had inline.
async function requireWorkspaceAccess(
  ctx: { db: PrismaClient; session: { user: { id: string } } },
  workspaceId: string,
): Promise<void> {
  const member = await ctx.db.workspaceUser.findUnique({
    where: {
      userId_workspaceId: { userId: ctx.session.user.id, workspaceId },
    },
    select: { role: true },
  });
  if (member) return;

  const teamBased = await getWorkspaceMembership(
    ctx.db,
    ctx.session.user.id,
    workspaceId,
  );
  if (!teamBased) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this workspace",
    });
  }
}

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
        where: buildWorkspaceAccessWhere(ctx.userId),
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
        homeLayout: z.enum(["command", "activity", "coaching"]).default("command"),
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
          homeLayout: input.homeLayout,
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

  // Get all workspaces for the current user.
  // Includes direct WorkspaceUser membership, team-based access, AND
  // project-only access (synthesized "guest" role). Role precedence:
  //   direct WorkspaceUser role > team-based ("member") > project-only ("guest")
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const workspaces = await ctx.db.workspace.findMany({
      where: buildWorkspaceVisibilityWhere(userId),
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
        // Teams the current user belongs to (signals team-based access)
        teams: {
          where: {
            members: { some: { userId } },
          },
          select: {
            id: true,
            members: {
              where: { userId },
              select: { role: true },
            },
          },
        },
        // Projects within this workspace where the current user is a
        // ProjectMember (signals project-only "guest" access)
        projects: {
          where: {
            projectMembers: { some: { userId } },
          },
          select: { id: true },
          take: 1,
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

    return workspaces.map((workspace) => {
      const currentMember = workspace.members.find((m) => m.userId === userId);

      // Precedence: direct → team-based → project-only ("guest")
      const currentUserRole: string | null =
        currentMember?.role ??
        (workspace.teams.length > 0
          ? "member"
          : workspace.projects.length > 0
            ? "guest"
            : null);

      const { teams: _teams, projects: _projects, ...workspaceData } = workspace;
      return {
        ...workspaceData,
        currentUserRole,
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

      const userId = ctx.session.user.id;

      // Direct WorkspaceUser membership wins
      const currentMember = workspace.members.find(
        (member) => member.userId === userId
      );

      if (currentMember) {
        return {
          ...workspace,
          currentUserRole: currentMember.role,
        };
      }

      // Team-based access synthesizes "member"
      const teamBasedMembership = await getWorkspaceMembership(
        ctx.db,
        userId,
        workspace.id,
      );

      if (teamBasedMembership) {
        return {
          ...workspace,
          currentUserRole: teamBasedMembership.role,
        };
      }

      // Project-only access synthesizes "guest"
      const guestProjectMember = await ctx.db.projectMember.findFirst({
        where: {
          userId,
          project: { workspaceId: workspace.id },
        },
        select: { id: true },
      });

      if (guestProjectMember) {
        return {
          ...workspace,
          currentUserRole: "guest" as const,
        };
      }

      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You are not a member of this workspace",
      });
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
        enableDetailedActions: z.boolean().optional(),
        enableBounties: z.boolean().optional(),
        enableDailyPlanBanner: z.boolean().optional(),
        enableWeeklyReviewBanner: z.boolean().optional(),
        enableEmailNotifications: z.boolean().optional(),
        homeLayout: z.enum(["command", "activity", "coaching"]).optional(),
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
          enableDetailedActions: input.enableDetailedActions,
          enableBounties: input.enableBounties,
          enableDailyPlanBanner: input.enableDailyPlanBanner,
          enableWeeklyReviewBanner: input.enableWeeklyReviewBanner,
          enableEmailNotifications: input.enableEmailNotifications,
          homeLayout: input.homeLayout,
        },
      });

      return updatedWorkspace;
    }),

  // Upload a workspace logo (base64-encoded image -> Vercel Blob -> Workspace.logoUrl)
  uploadLogo: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        base64Data: z.string().min(1),
        contentType: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
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
          message: "Only workspace owners and admins can change the workspace logo",
        });
      }

      // Cache-bust by including a timestamp so the new URL replaces the old one in CDN/clients
      const filename = `workspace-logos/${input.workspaceId}-${Date.now()}.png`;
      const blob = await uploadToBlob(input.base64Data, filename);

      const previous = await ctx.db.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { logoUrl: true },
      });

      const updated = await ctx.db.workspace.update({
        where: { id: input.workspaceId },
        data: { logoUrl: blob.url },
      });

      if (previous?.logoUrl && previous.logoUrl !== blob.url) {
        try {
          await deleteFromBlob(previous.logoUrl);
        } catch {
          // Best-effort cleanup; do not fail the upload if the old blob can't be deleted
        }
      }

      return { logoUrl: updated.logoUrl };
    }),

  // Remove the workspace logo (clears logoUrl, deletes underlying blob)
  removeLogo: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
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
          message: "Only workspace owners and admins can change the workspace logo",
        });
      }

      const previous = await ctx.db.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { logoUrl: true },
      });

      await ctx.db.workspace.update({
        where: { id: input.workspaceId },
        data: { logoUrl: null },
      });

      if (previous?.logoUrl) {
        try {
          await deleteFromBlob(previous.logoUrl);
        } catch {
          // Best-effort cleanup
        }
      }

      return { logoUrl: null };
    }),

  // Get workspace Notion configuration
  getNotionConfig: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
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
          message: "You must be a member to view workspace settings",
        });
      }

      const workspace = await ctx.db.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { notionDefaultConfig: true },
      });

      return (workspace?.notionDefaultConfig as {
        defaultIntegrationId?: string;
        defaultDatabaseId?: string;
        fieldMappings?: Record<string, string>;
        syncDirection?: "pull" | "push" | "bidirectional";
        syncFrequency?: "manual" | "hourly" | "daily";
      }) ?? null;
    }),

  // Update workspace Notion configuration
  updateNotionConfig: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        notionDefaultConfig: z.object({
          defaultIntegrationId: z.string().optional(),
          defaultDatabaseId: z.string().optional(),
          fieldMappings: z.record(z.string()).optional(),
          syncDirection: z.enum(["pull", "push", "bidirectional"]).optional(),
          syncFrequency: z.enum(["manual", "hourly", "daily"]).optional(),
        }).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
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
          message: "Only workspace owners and admins can update Notion configuration",
        });
      }

      return ctx.db.workspace.update({
        where: { id: input.workspaceId },
        data: {
          notionDefaultConfig: input.notionDefaultConfig ?? undefined,
        },
      });
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

        // Fire-and-forget: notify the user that they've been added
        if (newMember.user.email) {
          const workspace = await ctx.db.workspace.findUnique({
            where: { id: input.workspaceId },
            select: { name: true, slug: true },
          });
          if (!workspace?.slug) {
            console.warn(
              "[workspace.addMember] Skipping member-added email: workspace or slug missing",
              {
                workspaceId: input.workspaceId,
                recipientEmail: newMember.user.email,
              },
            );
          } else {
            const workspaceUrl = `${getPublicBaseUrlFromEnv()}/w/${workspace.slug}`;
            sendWorkspaceMemberAddedEmail({
              to: newMember.user.email,
              workspaceName: workspace.name ?? "a workspace",
              inviterName:
                ctx.session.user.name ??
                ctx.session.user.email ??
                "A workspace member",
              workspaceUrl,
            }).catch((err: unknown) => {
              console.error(
                "[workspace.addMember] Failed to send member-added email:",
                err,
              );
            });
          }
        }

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

        const inviteUrl = generateInviteUrl(token);

        // Fetch workspace name for email
        const workspace = await ctx.db.workspace.findUnique({
          where: { id: input.workspaceId },
          select: { name: true },
        });

        // Fire-and-forget: send invitation email
        sendTeamInvitationEmail({
          to: input.email,
          teamName: workspace?.name ?? "a workspace",
          inviterName: ctx.session.user.name ?? ctx.session.user.email ?? "A workspace member",
          inviteUrl,
        }).catch((err: unknown) => {
          console.error("[workspace.addMember] Failed to send invitation email:", err);
        });

        return {
          type: "invitation_created" as const,
          invitation,
          inviteUrl,
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
      // Return the first workspace user has access to (preferably personal)
      const firstWorkspace = await ctx.db.workspace.findFirst({
        where: buildWorkspaceAccessWhere(ctx.session.user.id),
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

      const inviteUrl = generateInviteUrl(newToken);

      // Fetch workspace name for email
      const workspace = await ctx.db.workspace.findUnique({
        where: { id: invitation.workspaceId },
        select: { name: true },
      });

      // Fire-and-forget: send invitation email
      sendTeamInvitationEmail({
        to: invitation.email,
        teamName: workspace?.name ?? "a workspace",
        inviterName: ctx.session.user.name ?? ctx.session.user.email ?? "A workspace member",
        inviteUrl,
      }).catch((err: unknown) => {
        console.error("[workspace.resendInvitation] Failed to send invitation email:", err);
      });

      return {
        invitation: updated,
        inviteUrl,
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
  getInvitationByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const invitation = await ctx.db.workspaceInvitation.findUnique({
        where: { token: input.token },
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true,
              _count: { select: { members: true } },
              members: {
                take: 4,
                orderBy: { joinedAt: "asc" },
                select: {
                  user: {
                    select: { id: true, name: true, email: true, image: true },
                  },
                },
              },
            },
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

      const { members, _count, ...workspaceRest } = invitation.workspace;

      return {
        ...invitation,
        workspace: {
          ...workspaceRest,
          memberCount: _count.members,
          memberPreview: members.map((m) => m.user),
        },
        isExpired: invitation.expiresAt < new Date(),
        isLoggedIn: !!ctx.session?.user,
        isForCurrentUser: invitation.email === ctx.session?.user?.email,
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

  // List project-only "guests" of a workspace: users with ProjectMember rows
  // in some project of the workspace but no WorkspaceUser row and no
  // team-based membership. Read-only for the Members tab; management happens
  // on the individual project's Access tab.
  listProjectGuests: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Permission: owner or admin only, mirroring the rest of the Members tab.
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
          message: "Only workspace owners and admins can view project guests",
        });
      }

      // All ProjectMember rows attached to projects in this workspace.
      const projectMembers = await ctx.db.projectMember.findMany({
        where: {
          project: { workspaceId: input.workspaceId },
        },
        select: {
          userId: true,
          role: true,
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
          project: {
            select: { id: true, name: true, slug: true },
          },
        },
      });

      if (projectMembers.length === 0) {
        return [];
      }

      const candidateUserIds = Array.from(
        new Set(projectMembers.map((pm) => pm.userId)),
      );

      // Exclude users who already have direct workspace membership.
      const directMemberRows = await ctx.db.workspaceUser.findMany({
        where: {
          workspaceId: input.workspaceId,
          userId: { in: candidateUserIds },
        },
        select: { userId: true },
      });
      const directMemberIds = new Set(directMemberRows.map((r) => r.userId));

      // Exclude users who already have team-based access to this workspace.
      const teamMemberRows = await ctx.db.teamUser.findMany({
        where: {
          userId: { in: candidateUserIds },
          team: { workspaceId: input.workspaceId },
        },
        select: { userId: true },
      });
      const teamMemberIds = new Set(teamMemberRows.map((r) => r.userId));

      // Group remaining (guest) project memberships by user.
      const byUser = new Map<
        string,
        {
          user: { id: string; name: string | null; email: string | null; image: string | null };
          projects: { id: string; name: string; slug: string; role: string }[];
        }
      >();

      for (const pm of projectMembers) {
        if (directMemberIds.has(pm.userId) || teamMemberIds.has(pm.userId)) {
          continue;
        }
        const existing = byUser.get(pm.userId);
        if (existing) {
          existing.projects.push({
            id: pm.project.id,
            name: pm.project.name,
            slug: pm.project.slug,
            role: pm.role,
          });
        } else {
          byUser.set(pm.userId, {
            user: pm.user,
            projects: [
              {
                id: pm.project.id,
                name: pm.project.name,
                slug: pm.project.slug,
                role: pm.role,
              },
            ],
          });
        }
      }

      return Array.from(byUser.values()).sort((a, b) => {
        const aName = a.user.name ?? a.user.email ?? "";
        const bName = b.user.name ?? b.user.email ?? "";
        return aName.localeCompare(bName);
      });
    }),

  // Hero strip stats for the Activity-layout workspace home. Composed from
  // DailyScore (this week/last week totals), ProductivityStreak (day streak),
  // and Project (active count). Sparkline payload is null until slice 6.
  getHomeStats: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Caller must be a member of the workspace.
      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
        select: { role: true },
      });

      if (!member) {
        // Fall back to team-based access so guest project members also work.
        const teamBased = await getWorkspaceMembership(
          ctx.db,
          ctx.session.user.id,
          input.workspaceId,
        );
        if (!teamBased) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not a member of this workspace",
          });
        }
      }

      return getWorkspaceHomeStats(ctx.db, {
        workspaceId: input.workspaceId,
        userId: ctx.session.user.id,
      });
    }),

  // AI-generated Week-in-Review narrative + 3 highlights. Cached per
  // (workspace, ISO week). See
  // src/server/services/activity/weeklyNarrativeService.ts for cache
  // staleness rules and the empty-week shortcut.
  getWeeklyNarrative: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx, input.workspaceId);
      return getOrGenerateWeeklyNarrative(ctx.db, {
        workspaceId: input.workspaceId,
        userId: ctx.session.user.id,
      });
    }),

  // Forces a fresh narrative generation, bypassing the cache. Used by the
  // refresh icon in the Week-in-Review card. Rate-limited per-workspace via
  // the service-level cooldown (NarrativeRateLimitError → 429).
  regenerateWeeklyNarrative: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx, input.workspaceId);
      try {
        return await getOrGenerateWeeklyNarrative(ctx.db, {
          workspaceId: input.workspaceId,
          userId: ctx.session.user.id,
          force: true,
        });
      } catch (err) {
        if (err instanceof NarrativeRateLimitError) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Try again in ${Math.ceil(err.retryAfterMs / 1000)}s.`,
          });
        }
        throw err;
      }
    }),

  // One-time backfill of WorkspaceActivityEvent from existing entity
  // timestamps so the heatmap and activity feed look alive on day one.
  // Owner-only; idempotent unless `force` is set. See
  // `src/server/services/activity/backfillActivity.ts` for the source table
  // mapping and metadata strategy.
  backfillActivity: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        force: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
        select: { role: true },
      });

      if (!member || member.role !== "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace owners can run the activity backfill",
        });
      }

      return backfillWorkspaceActivity(ctx.db, {
        workspaceId: input.workspaceId,
        force: input.force,
      });
    }),

  // 12-month activity heatmap for the Activity-layout workspace home.
  // Returns 371 cells (53 weeks × 7 days) ending at "today", with each
  // cell's level computed from quartiles of non-zero days in the window.
  getActivityHeatmap: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
        select: { role: true },
      });

      if (!member) {
        const teamBased = await getWorkspaceMembership(
          ctx.db,
          ctx.session.user.id,
          input.workspaceId,
        );
        if (!teamBased) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not a member of this workspace",
          });
        }
      }

      return getActivityHeatmap(ctx.db, { workspaceId: input.workspaceId });
    }),

  // Workspace home activity feed: most-recent N events with actor join +
  // pre-resolved render hint. Cursor pagination, page size 10 by default.
  getActivityFeed: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
        select: { role: true },
      });

      if (!member) {
        const teamBased = await getWorkspaceMembership(
          ctx.db,
          ctx.session.user.id,
          input.workspaceId,
        );
        if (!teamBased) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not a member of this workspace",
          });
        }
      }

      return getActivityFeed(ctx.db, {
        workspaceId: input.workspaceId,
        cursor: input.cursor,
        limit: input.limit ?? FEED_PAGE_SIZE,
      });
    }),
});
