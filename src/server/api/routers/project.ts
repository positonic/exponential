import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { slugify } from "~/utils/slugify";

// Middleware to check API key (similar to transcription router)
const apiKeyMiddleware = publicProcedure.use(async ({ ctx, next }) => {
  const apiKey = ctx.headers.get("x-api-key");

  if (!apiKey) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "API key is required",
    });
  }

  // Find the verification token and associated user
  const verificationToken = await ctx.db.verificationToken.findFirst({
    where: {
      token: apiKey,
      expires: {
        gt: new Date(), // Only non-expired tokens
      },
    },
    include: {
      user: true,
    },
  });

  if (!verificationToken) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired API key",
    });
  }

  // Type-safe error handling
  const userId = verificationToken.userId;
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No user associated with this API key",
    });
  }

  // Add the user id to the context
  return next({
    ctx: {
      ...ctx,
      userId, // Now type-safe
      user: verificationToken.user,
    },
  });
});

export const projectRouter = createTRPCRouter({
  // API endpoint for browser plugin - uses API key authentication
  getUserProjects: apiKeyMiddleware
    .output(z.object({
      projects: z.array(z.object({
        id: z.string(),
        name: z.string(),
      }))
    }))
    .query(async ({ ctx }) => {
      const projects = await ctx.db.project.findMany({
        where: {
          createdById: ctx.userId,
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
        projects,
      };
    }),

  getAll: protectedProcedure
    .input(z.object({
      include: z.object({
        actions: z.boolean()
      }).optional()
    }).optional())
    .query(async ({ ctx, input }) => {
      console.log('🔍 [PROJECT.GETALL DEBUG] Query started', {
        timestamp: new Date().toISOString(),
        userId: ctx.session.user.id,
        userEmail: ctx.session.user.email,
        userName: ctx.session.user.name,
        sessionExpires: ctx.session.expires,
        includeActions: input?.include?.actions ?? false
      });

      const projects = await ctx.db.project.findMany({
        where: {
          OR: [
            // User is the project creator
            { createdById: ctx.session.user.id },
            // User is a member of the project's team
            {
              team: {
                members: {
                  some: {
                    userId: ctx.session.user.id
                  }
                }
              }
            }
          ]
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          actions: input?.include?.actions ?? false,
          goals: true,
          outcomes: true,
          lifeDomains: true
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
        goalIds: z.array(z.string()).optional(),
        outcomeIds: z.array(z.string()).optional(),
        lifeDomainIds: z.array(z.number()).optional(),
        teamId: z.string().optional(),
        notionProjectId: z.string().optional(),
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

      return ctx.db.project.create({
        data: {
          name: input.name,
          description: input.description,
          status: input.status,
          priority: input.priority,
          progress: input.progress ?? 0,
          slug,
          reviewDate: input.reviewDate ?? null,
          nextActionDate: input.nextActionDate ?? null,
          notionProjectId: input.notionProjectId,
          createdBy: {
            connect: {
              id: ctx.session.user.id,
            },
          },
          team: input.teamId ? {
            connect: {
              id: input.teamId,
            },
          } : undefined,
          goals: input.goalIds?.length ? {
            connect: input.goalIds.map(id => ({ id: parseInt(id) })),
          } : undefined,
          outcomes: input.outcomeIds?.length ? {
            connect: input.outcomeIds.map(id => ({ id })),
          } : undefined,
          lifeDomains: input.lifeDomainIds?.length ? {
            connect: input.lifeDomainIds.map(id => ({ id })),
          } : undefined,
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.project.delete({
        where: {
          id: input.id,
          createdById: ctx.session.user.id,
        },
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
        lifeDomainIds: z.array(z.number()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, goalIds, outcomeIds, lifeDomainIds, ...updateData } = input;
      
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
      
      return ctx.db.project.update({
        where: {
          id,
          createdById: ctx.session.user.id,
        },
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
    .mutation(async ({ ctx, input }) => {
      return ctx.db.project.update({
        where: {
          id: input.projectId,
          createdById: ctx.session.user.id,
        },
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
    .query(async ({ ctx }) => {
      return await ctx.db.project.findMany({
        where: {
          createdById: ctx.session.user.id,
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
          outcomes: {
            where: {
              type: 'weekly',
            },
            orderBy: {
              dueDate: 'asc',
            },
          },
        },
        orderBy: {
          priority: 'asc',
        },
      });
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
          outcomes: {
            where: {
              type: 'weekly',
            },
            orderBy: {
              dueDate: 'asc',
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
            {
              OR: [
                // User is the project creator
                { createdById: ctx.session.user.id },
                // User is a member of the project's team (for already assigned projects)
                {
                  team: {
                    members: {
                      some: {
                        userId: ctx.session.user.id
                      }
                    }
                  }
                }
              ]
            },
            // Project is not assigned to any team
            { teamId: null }
          ]
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
      return ctx.db.project.findFirst({
        where: { 
          id: input.id,
          OR: [
            // User is the project creator
            { createdById: ctx.session.user.id },
            // User is a member of the project's team
            {
              team: {
                members: {
                  some: {
                    userId: ctx.session.user.id
                  }
                }
              }
            }
          ]
        },
        include: {
          goals: true,
          outcomes: true,
          lifeDomains: true,
          actions: true,
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

  getTeamMembers: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.projectMember.findMany({
        where: {
          projectId: input.projectId,
        },
      });
    }),

  updateTaskManagement: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        taskManagementTool: z.enum(["internal", "monday", "notion"]),
        taskManagementConfig: z.object({
          // Core workflow configuration
          workflowId: z.string().optional(),
          databaseId: z.string().optional(), // for Notion
          boardId: z.string().optional(), // for Monday
          
          // New sync strategy options
          syncStrategy: z.enum(['manual', 'auto_pull_then_push', 'notion_canonical']).optional().default('manual'),
          conflictResolution: z.enum(['local_wins', 'remote_wins']).optional().default('local_wins'),
          deletionBehavior: z.enum(['mark_deleted', 'archive']).optional().default('mark_deleted'),
        }).optional(),
        notionProjectId: z.string().optional(), // ID of the associated Notion Projects database record
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.project.update({
        where: {
          id: input.id,
          createdById: ctx.session.user.id,
        },
        data: {
          taskManagementTool: input.taskManagementTool,
          taskManagementConfig: input.taskManagementConfig,
          notionProjectId: input.notionProjectId,
        },
      });
    }),
}); 