import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { slugify } from "~/utils/slugify";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";
import {
  getProjectAccess,
  canEditProject,
  canManageProjectMembers,
  hasProjectAccess,
  buildProjectAccessWhere,
  requireProjectAccess,
  AccessControlService,
} from "~/server/services/access";
import { completeOnboardingStep } from "~/server/services/onboarding/syncOnboardingProgress";

export const projectRouter = createTRPCRouter({
  // API endpoint for browser plugin - uses API key authentication
  getUserProjects: apiKeyMiddleware
    .input(z.object({
      workspaceId: z.string().optional(),
    }).optional())
    .output(z.object({
      projects: z.array(z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
      }))
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId;
      const projects = await ctx.db.project.findMany({
        where: {
          ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
          ...buildProjectAccessWhere(userId),
        },
        select: {
          id: true,
          name: true,
          slug: true,
        },
        orderBy: {
          name: "asc",
        },
      });

      return {
        projects,
      };
    }),

  getAll: protectedProcedure
    .input(z.object({
      include: z.object({
        actions: z.boolean()
      }).optional(),
      workspaceId: z.string().optional(),
      goalId: z.number().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      console.log('🔍 [PROJECT.GETALL DEBUG] Query started', {
        timestamp: new Date().toISOString(),
        userId: ctx.session.user.id,
        userEmail: ctx.session.user.email,
        userName: ctx.session.user.name,
        sessionExpires: ctx.session.expires,
        includeActions: input?.include?.actions ?? false,
        workspaceId: input?.workspaceId ?? 'none'
      });

      const projects = await ctx.db.project.findMany({
        where: {
          // Filter by workspace if provided
          ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
          // Filter by goal if provided
          ...(input?.goalId ? { goals: { some: { id: input.goalId } } } : {}),
          ...buildProjectAccessWhere(ctx.session.user.id),
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          actions: input?.include?.actions ?? false,
          goals: true,
          outcomes: true,
          lifeDomains: true,
          keyResults: {
            select: { keyResultId: true },
          },
          dri: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          workspace: {
            select: {
              slug: true,
              name: true,
            },
          },
        }
      });

      // Sort projects by priority (HIGH -> MEDIUM -> LOW -> NONE)
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 };
      const sortedProjects = projects.sort((a, b) => {
        const priorityA = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3;
        const priorityB = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3;
        
        // If priorities are the same, sort by creation date (newer first)
        if (priorityA === priorityB) {
          return b.createdAt.getTime() - a.createdAt.getTime();
        }
        
        return priorityA - priorityB;
      });

      console.log('📊 [PROJECT.GETALL RESULT] Query completed', {
        projectCount: projects.length,
        userIdQueried: ctx.session.user.id,
        projectIds: projects.map(p => p.id),
        projectNames: projects.map(p => p.name),
        sampleProject: projects[0] ? {
          id: projects[0].id,
          name: projects[0].name,
          createdById: projects[0].createdById,
          status: projects[0].status,
          goalsCount: projects[0].goals?.length || 0,
          actionsCount: projects[0].actions?.length || 0,
          outcomesCount: projects[0].outcomes?.length || 0
        } : 'No projects found'
      });

      // Also check if there are ANY projects in the database for debugging
      const totalProjectsInDb = await ctx.db.project.count();
      console.log('📈 [PROJECT.GETALL CONTEXT] Database context', {
        totalProjectsInDatabase: totalProjectsInDb,
        userSpecificProjects: projects.length,
        userHasProjects: projects.length > 0
      });

      return sortedProjects;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        status: z.string(),
        priority: z.string(),
        progress: z.number().min(0).max(100).optional().default(0),
        reviewDate: z.date().nullable().optional(),
        nextActionDate: z.date().nullable().optional(),
        startDate: z.date().nullable().optional(),
        endDate: z.date().nullable().optional(),
        goalIds: z.array(z.string()).optional(),
        outcomeIds: z.array(z.string()).optional(),
        keyResultIds: z.array(z.string()).optional(),
        lifeDomainIds: z.array(z.number()).optional(),
        teamId: z.string().optional(),
        notionProjectId: z.string().optional(),
        workspaceId: z.string().optional(),
        driId: z.string().nullable().optional(),
        isPublic: z.boolean().optional().default(false),
        isRestricted: z.boolean().optional().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Generate a unique slug
      const baseSlug = slugify(input.name);
      let slug = baseSlug;
      let counter = 1;

      // Check if slug exists and increment counter until we find a unique one
      while (await ctx.db.project.findFirst({ where: { slug } })) {
        slug = `${baseSlug}_${counter}`;
        counter++;
      }

      const project = await ctx.db.project.create({
        data: {
          name: input.name,
          description: input.description,
          status: input.status,
          priority: input.priority,
          progress: input.progress ?? 0,
          slug,
          reviewDate: input.reviewDate ?? null,
          nextActionDate: input.nextActionDate ?? null,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          notionProjectId: input.notionProjectId,
          createdById: ctx.session.user.id,
          workspaceId: input.workspaceId ?? null,
          teamId: input.teamId ?? null,
          driId: input.driId ?? null,
          isPublic: input.isPublic ?? false,
          isRestricted: input.isRestricted ?? false,
        },
      });

      // Connect relations if provided
      if (input.goalIds?.length || input.outcomeIds?.length || input.lifeDomainIds?.length) {
        await ctx.db.project.update({
          where: { id: project.id },
          data: {
            ...(input.goalIds?.length && {
              goals: {
                connect: input.goalIds.map(id => ({ id: parseInt(id) })),
              },
            }),
            ...(input.outcomeIds?.length && {
              outcomes: {
                connect: input.outcomeIds.map(id => ({ id })),
              },
            }),
            ...(input.lifeDomainIds?.length && {
              lifeDomains: {
                connect: input.lifeDomainIds.map(id => ({ id })),
              },
            }),
          },
        });
      }

      // Link to key results via the KeyResultProject join table
      if (input.keyResultIds?.length) {
        await ctx.db.keyResultProject.createMany({
          data: input.keyResultIds.map((keyResultId) => ({
            keyResultId,
            projectId: project.id,
          })),
          skipDuplicates: true,
        });
      }

      // Sync onboarding progress (fire-and-forget)
      void completeOnboardingStep(ctx.db, ctx.session.user.id, "project").catch(
        (err: unknown) => { console.error("[onboarding-sync] project:", err); },
      );

      return project;
    }),

  delete: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const service = new AccessControlService(ctx.db);
      const result = await service.canAccess({
        userId: ctx.session.user.id,
        resourceType: "project",
        resourceId: input.id,
        permission: "delete",
      });
      if (!result.allowed) {
        throw new TRPCError({ code: "FORBIDDEN", message: result.reason });
      }

      return ctx.db.project.delete({
        where: { id: input.id },
      });
    }),

  // Slim mutation used by the portfolio review's cross-workspace project list.
  // Avoids the full update() input shape just to change priority.
  updatePriority: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        priority: z.enum(["HIGH", "MEDIUM", "LOW", "NONE"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const access = await getProjectAccess(ctx.db, ctx.session.user.id, input.id);
      if (!canEditProject(access)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have edit access to this project",
        });
      }

      return ctx.db.project.update({
        where: { id: input.id },
        data: { priority: input.priority },
        select: { id: true, priority: true },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        description: z.string().optional(),
        status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]),
        priority: z.enum(["HIGH", "MEDIUM", "LOW", "NONE"]),
        taskManagementTool: z.enum(["internal", "monday", "notion"]).optional(),
        taskManagementConfig: z.record(z.any()).optional(),
        goalIds: z.array(z.string()).optional(),
        outcomeIds: z.array(z.string()).optional(),
        keyResultIds: z.array(z.string()).optional(),
        lifeDomainIds: z.array(z.number()).optional(),
        workspaceId: z.string().nullable().optional(),
        driId: z.string().nullable().optional(),
        reviewDate: z.date().nullable().optional(),
        nextActionDate: z.date().nullable().optional(),
        startDate: z.date().nullable().optional(),
        endDate: z.date().nullable().optional(),
        isPublic: z.boolean().optional(),
        isRestricted: z.boolean().optional(),
        enableDetailedActions: z.boolean().nullable().optional(),
        enableBounties: z.boolean().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, goalIds, outcomeIds, keyResultIds, lifeDomainIds, workspaceId, driId, isPublic, isRestricted, enableDetailedActions, enableBounties, ...updateData } = input;

      // Generate a unique slug, excluding the current project
      const baseSlug = slugify(updateData.name);
      let slug = baseSlug;
      let counter = 1;

      // Check if slug exists (excluding current project) and increment counter until we find a unique one
      while (await ctx.db.project.findFirst({
        where: {
          slug,
          id: { not: id }
        }
      })) {
        slug = `${baseSlug}_${counter}`;
        counter++;
      }

      // Check edit access (creator, workspace admin+, team admin+)
      const access = await getProjectAccess(ctx.db, ctx.session.user.id, id);
      if (!canEditProject(access)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have edit access to this project",
        });
      }

      // Flipping isRestricted requires manage_members (creator, project admin,
      // workspace owner/admin escape hatch). Plain editors cannot change it.
      if (isRestricted !== undefined && isRestricted !== access.isRestricted) {
        if (!canManageProjectMembers(access)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only project admins can change the restriction setting",
          });
        }
      }

      const updated = await ctx.db.project.update({
        where: { id },
        data: {
          ...updateData,
          slug,
          goals: goalIds?.length ? {
            set: goalIds.map(id => ({ id: parseInt(id) })),
          } : undefined,
          outcomes: outcomeIds !== undefined ? {
            set: outcomeIds.map(id => ({ id })),
          } : undefined,
          lifeDomains: lifeDomainIds !== undefined ? {
            set: lifeDomainIds.map(id => ({ id })),
          } : undefined,
          // Handle workspace: null means disconnect, string means connect
          workspace: workspaceId === null
            ? { disconnect: true }
            : workspaceId !== undefined
              ? { connect: { id: workspaceId } }
              : undefined,
          // Handle DRI: null means disconnect, string means connect
          dri: driId === null
            ? { disconnect: true }
            : driId !== undefined
              ? { connect: { id: driId } }
              : undefined,
          // Handle public visibility toggle
          ...(isPublic !== undefined ? { isPublic } : {}),
          // Handle restriction toggle (gated above by canManageProjectMembers)
          ...(isRestricted !== undefined ? { isRestricted } : {}),
          // Handle detailed actions override (null = inherit from workspace)
          ...(enableDetailedActions !== undefined ? { enableDetailedActions } : {}),
          // Handle bounties override (null = inherit from workspace)
          ...(enableBounties !== undefined ? { enableBounties } : {}),
        },
      });

      // Replace key result links when keyResultIds is provided
      if (keyResultIds !== undefined) {
        await ctx.db.$transaction([
          ctx.db.keyResultProject.deleteMany({ where: { projectId: id } }),
          ...(keyResultIds.length > 0
            ? [
                ctx.db.keyResultProject.createMany({
                  data: keyResultIds.map((keyResultId) => ({
                    keyResultId,
                    projectId: id,
                  })),
                  skipDuplicates: true,
                }),
              ]
            : []),
        ]);
      }

      return updated;
    }),

  updateDates: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        startDate: z.date().nullable(),
        endDate: z.date().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const access = await getProjectAccess(ctx.db, ctx.session.user.id, input.id);
      if (!hasProjectAccess(access)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this project",
        });
      }

      return ctx.db.project.update({
        where: { id: input.id },
        data: {
          startDate: input.startDate,
          endDate: input.endDate,
        },
      });
    }),

  assignToTeam: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        teamId: z.string().nullable(),
      })
    )
    .use(requireProjectAccess("edit"))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.project.update({
        where: { id: input.projectId },
        data: {
          team: input.teamId ? {
            connect: { id: input.teamId }
          } : {
            disconnect: true
          },
        },
      });
    }),

  getActiveWithDetails: protectedProcedure
    .input(z.object({
      workspaceId: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return await ctx.db.project.findMany({
        where: {
          createdById: ctx.session.user.id,
          status: "ACTIVE",
          ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
        },
        include: {
          actions: {
            orderBy: {
              priority: 'asc',
            },
            include: {
              project: true,
              syncs: true,
              assignees: {
                include: { user: { select: { id: true, name: true, email: true, image: true } } },
              },
            },
          },
          outcomes: {
            orderBy: {
              dueDate: 'asc',
            },
          },
          goals: {
            select: { id: true, title: true },
          },
          dri: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          keyResults: {
            select: {
              keyResultId: true,
              keyResult: {
                select: {
                  id: true,
                  title: true,
                  goal: { select: { id: true, title: true } },
                },
              },
            },
          },
        },
        orderBy: {
          priority: 'asc',
        },
      });
    }),

  // Get projects with their actions for the hierarchical projects-tasks view
  getProjectsWithActions: protectedProcedure
    .input(z.object({
      workspaceId: z.string().optional(),
      includeCompleted: z.boolean().default(false),
      goalId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Fetch projects with their actions
      const projects = await ctx.db.project.findMany({
        where: {
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
          ...(input.goalId ? { goals: { some: { id: input.goalId } } } : {}),
          ...buildProjectAccessWhere(userId),
        },
        include: {
          actions: {
            where: {
              status: input.includeCompleted
                ? { notIn: ["DELETED", "DRAFT"] }
                : { notIn: ["DELETED", "COMPLETED", "DRAFT"] }
            },
            include: {
              assignees: {
                include: {
                  user: {
                    select: { id: true, name: true, email: true, image: true }
                  }
                }
              },
              project: { select: { id: true, name: true } },
              tags: { include: { tag: true } },
            },
            orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }],
          },
          _count: { select: { actions: true } },
        },
        orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      });

      // Fetch actions without projects (unassigned)
      const noProjectActions = await ctx.db.action.findMany({
        where: {
          projectId: null,
          status: input.includeCompleted
            ? { notIn: ["DELETED", "DRAFT"] }
            : { notIn: ["DELETED", "COMPLETED", "DRAFT"] },
          OR: [
            { createdById: userId, assignees: { none: {} } },
            { assignees: { some: { userId } } },
          ],
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        },
        include: {
          assignees: {
            include: {
              user: {
                select: { id: true, name: true, email: true, image: true }
              }
            }
          },
          tags: { include: { tag: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }],
      });

      return { projects, noProjectActions };
    }),

  getActiveWithDetailsForUser: protectedProcedure
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
          message: 'You must be a member of this team to view shared weekly plans',
        });
      }

      if (!requestingUserMembership.team.isOrganization) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Weekly plans can only be viewed in organization teams',
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
          message: 'This user has not enabled weekly plan sharing with this team',
        });
      }

      // Get the user's active projects with the same structure as getActiveWithDetails
      return await ctx.db.project.findMany({
        where: {
          createdById: input.userId,
          status: "ACTIVE",
        },
        include: {
          actions: {
            orderBy: {
              priority: 'asc',
            },
            include: {
              project: true,
              syncs: true,
              assignees: {
                include: { user: { select: { id: true, name: true, email: true, image: true } } },
              },
            },
          },
          dri: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          outcomes: {
            where: {
              type: 'weekly',
            },
            orderBy: {
              dueDate: 'asc',
            },
          },
          goals: {
            select: { id: true, title: true },
          },
          keyResults: {
            select: {
              keyResultId: true,
              keyResult: {
                select: {
                  id: true,
                  title: true,
                  goal: { select: { id: true, title: true } },
                },
              },
            },
          },
        },
        orderBy: {
          priority: 'asc',
        },
      });
    }),

  getUnassignedProjects: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.db.project.findMany({
        where: {
          AND: [
            buildProjectAccessWhere(ctx.session.user.id),
            // Project is not assigned to any team
            { teamId: null },
          ],
        },
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          priority: true,
          slug: true,
        },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Try finding by id first, then fall back to slug lookup
      const selectFields = { id: true } as const;

      let projectExists = await ctx.db.project.findUnique({
        where: { id: input.id },
        select: selectFields,
      });

      if (!projectExists) {
        projectExists = await ctx.db.project.findUnique({
          where: { slug: input.id },
          select: selectFields,
        });
      }

      // URLs use compound format: "slug-cuid" (e.g. "my_project-cmjoko5550000rz03x4eqvycy")
      // Extract the CUID suffix and try looking up by that
      if (!projectExists) {
        const cuidMatch = input.id.match(/-(c[a-z0-9]{24,})$/);
        if (cuidMatch) {
          projectExists = await ctx.db.project.findUnique({
            where: { id: cuidMatch[1] },
            select: selectFields,
          });
        }
      }

      if (!projectExists) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      const access = await getProjectAccess(ctx.db, ctx.session.user.id, projectExists.id);
      if (!hasProjectAccess(access)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied - you don't have permission to view this project",
        });
      }

      // Return full project with includes (use resolved id in case input was a slug)
      return ctx.db.project.findUnique({
        where: { id: projectExists.id },
        include: {
          goals: true,
          outcomes: true,
          lifeDomains: true,
          actions: true,
          keyResults: {
            select: {
              keyResultId: true,
              keyResult: {
                select: {
                  id: true,
                  title: true,
                  goal: { select: { id: true, title: true } },
                },
              },
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          dri: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
            },
          },
          transcriptionSessions: {
            include: {
              screenshots: true,
              sourceIntegration: {
                select: {
                  id: true,
                  provider: true,
                  name: true,
                },
              },
              actions: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  status: true,
                  priority: true,
                  dueDate: true,
                },
              },
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      });
    }),

  // Get resolved Notion config with inheritance chain (project > workspace > app defaults)
  getResolvedNotionConfig: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const access = await getProjectAccess(ctx.db, ctx.session.user.id, input.projectId);
      if (!access) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      const { resolveNotionConfig } = await import("~/server/services/notion-config-resolver");
      return resolveNotionConfig(input.projectId);
    }),

  getTeamMembers: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .use(requireProjectAccess("view"))
    .query(async ({ ctx, input }) => {
      return ctx.db.projectMember.findMany({
        where: {
          projectId: input.projectId,
        },
      });
    }),

  // Recent project activity feed — powers the "What shifted this week"
  // section on the new Overview tab. Returns rows with the changing user
  // and (when applicable) the action so the UI can render verb + target.
  getRecentActivity: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        sinceDays: z.number().int().min(1).max(60).default(7),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .use(requireProjectAccess("view"))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.sinceDays * 24 * 60 * 60 * 1000);
      return ctx.db.projectActivity.findMany({
        where: {
          projectId: input.projectId,
          changedAt: { gte: since },
        },
        orderBy: { changedAt: "desc" },
        take: input.limit,
        include: {
          changedBy: { select: { id: true, name: true, image: true } },
          action: { select: { id: true, name: true } },
        },
      });
    }),

  // ── Restriction & Membership Management ──────────────────────────
  // Capability check for the current user against a project. Used by UI
  // (e.g. ProjectMembersPanel) to gate controls without re-deriving rules.
  getMyAccess: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .use(requireProjectAccess("view"))
    .query(async ({ ctx, input }) => {
      const access = await getProjectAccess(
        ctx.db,
        ctx.session.user.id,
        input.projectId,
      );
      return {
        isCreator: access.isCreator,
        memberRole: access.memberRole ?? null,
        workspaceRole: access.workspaceRole ?? null,
        isPublic: access.isPublic,
        isRestricted: access.isRestricted,
        canEdit: canEditProject(access),
        canManageMembers: canManageProjectMembers(access),
      };
    }),

  setRestricted: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        isRestricted: z.boolean(),
      }),
    )
    .use(requireProjectAccess("manage_members"))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.project.update({
        where: { id: input.projectId },
        data: { isRestricted: input.isRestricted },
        select: { id: true, isRestricted: true },
      });
    }),

  listMembers: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .use(requireProjectAccess("view"))
    .query(async ({ ctx, input }) => {
      return ctx.db.projectMember.findMany({
        where: { projectId: input.projectId },
        select: {
          id: true,
          role: true,
          name: true,
          responsibilities: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: { name: "asc" },
      });
    }),

  addMember: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
        role: z.enum(["admin", "editor", "viewer"]),
        name: z.string().optional(),
        responsibilities: z.array(z.string()).optional(),
      }),
    )
    .use(requireProjectAccess("manage_members"))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: { name: true, email: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Idempotent via @@unique([projectId, userId]): upsert keeps repeated
      // calls from failing and lets the same call adjust the role.
      return ctx.db.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: input.projectId,
            userId: input.userId,
          },
        },
        create: {
          projectId: input.projectId,
          userId: input.userId,
          role: input.role,
          name: input.name ?? user.name ?? user.email ?? "Member",
          responsibilities: input.responsibilities ?? [],
        },
        update: {
          role: input.role,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.responsibilities !== undefined
            ? { responsibilities: input.responsibilities }
            : {}),
        },
      });
    }),

  removeMember: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
      }),
    )
    .use(requireProjectAccess("manage_members"))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({
        where: { id: input.projectId },
        select: { createdById: true },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }
      if (project.createdById === input.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The project creator cannot be removed",
        });
      }

      await ctx.db.projectMember.deleteMany({
        where: {
          projectId: input.projectId,
          userId: input.userId,
        },
      });

      return { success: true };
    }),

  updateMemberRole: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
        role: z.enum(["admin", "editor", "viewer"]),
      }),
    )
    .use(requireProjectAccess("manage_members"))
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.projectMember.findFirst({
        where: { projectId: input.projectId, userId: input.userId },
        select: { id: true },
      });
      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project member not found",
        });
      }

      return ctx.db.projectMember.update({
        where: { id: member.id },
        data: { role: input.role },
      });
    }),

  updateTaskManagement: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        taskManagementTool: z.enum(["internal", "monday", "notion"]),
        taskManagementConfig: z.object({
          // Core workflow configuration
          integrationId: z.string().optional(), // which integration (Notion account) to use
          workflowId: z.string().optional(),
          databaseId: z.string().optional(), // for Notion
          boardId: z.string().optional(), // for Monday

          // Sync configuration
          syncDirection: z.enum(['pull', 'push', 'bidirectional']).optional().default('pull'),
          syncFrequency: z.enum(['manual', 'hourly', 'daily']).optional().default('manual'),
          syncStrategy: z.enum(['manual', 'auto_pull_then_push', 'notion_canonical']).optional().default('manual'),
          conflictResolution: z.enum(['local_wins', 'remote_wins']).optional().default('local_wins'),
          deletionBehavior: z.enum(['mark_deleted', 'archive']).optional().default('mark_deleted'),
        }).optional(),
        notionProjectId: z.string().optional(), // ID of the associated Notion Projects database record
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const access = await getProjectAccess(ctx.db, ctx.session.user.id, input.id);
      if (!canEditProject(access)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have edit access to this project",
        });
      }

      return ctx.db.project.update({
        where: { id: input.id },
        data: {
          taskManagementTool: input.taskManagementTool,
          taskManagementConfig: input.taskManagementConfig,
          notionProjectId: input.notionProjectId,
        },
      });
    }),
}); 