import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { PRIORITY_VALUES } from "~/types/priority";
import { parseActionInput } from "~/server/services/parsing";
import { ScoringService } from "~/server/services/ScoringService";
import { startOfDay } from "date-fns";
import { getActionAccess, canEditAction, getProjectAccess, hasProjectAccess } from "~/server/services/access";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";
import { uploadToBlob } from "~/lib/blob";

// Helper to build permission check for user's accessible actions
// Includes: action creator, assignees, and project membership (creator, member, team member)
const buildUserActionPermissions = (userId: string) => ({
  OR: [
    // Created by user AND no assignees
    { createdById: userId, assignees: { none: {} } },
    // Assigned to user
    { assignees: { some: { userId: userId } } },
    // User is the project creator
    { project: { createdById: userId } },
    // User is a direct project member
    { project: { projectMembers: { some: { userId: userId } } } },
    // User is a member of the project's team
    { project: { team: { members: { some: { userId: userId } } } } },
    // Action belongs to a public project
    { project: { isPublic: true } },
  ],
});

export const actionRouter = createTRPCRouter({
  getAll: protectedProcedure
    .input(z.object({
      assigneeId: z.string().optional(),
      workspaceId: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
    console.log("in getAll")
    const userId = ctx.session.user.id;

    // Base condition: show tasks I created (with no assignees) OR assigned to me
    const whereClause: any = {
      OR: [
        // Created by me AND no assignees
        { createdById: userId, assignees: { none: {} } },
        // Assigned to me via ActionAssignee
        { assignees: { some: { userId: userId } } },
      ],
      status: {
        notIn: ["DELETED", "DRAFT"],
      },
      // Filter by workspace via the action's project
      ...(input?.workspaceId ? { project: { workspaceId: input.workspaceId } } : {}),
    };

    // Add additional assignee filtering if specified (for filtering within user's tasks)
    if (input?.assigneeId) {
      whereClause.assignees = {
        some: {
          userId: input.assigneeId,
        },
      };
    }

    return ctx.db.action.findMany({
      where: whereClause,
      include: {
        project: true,
        syncs: true, // Include ActionSync records to show sync status
        assignees: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        },
        createdBy: { select: { id: true, name: true, email: true, image: true } },
        tags: { include: { tag: true } },
        lists: {
          include: {
            list: { select: { id: true, name: true, slug: true, listType: true, status: true } },
          },
        },
        epic: { select: { id: true, name: true, status: true } },
      },
      orderBy: {
        project: {
          priority: "asc",
        },
      },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const action = await ctx.db.action.findFirst({
        where: {
          id: input.id,
          status: { notIn: ["DELETED", "DRAFT"] },
          ...buildUserActionPermissions(userId),
        },
        include: {
          project: true,
          syncs: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          createdBy: { select: { id: true, name: true, email: true, image: true } },
          tags: { include: { tag: true } },
          lists: {
            include: {
              list: { select: { id: true, name: true, slug: true, listType: true, status: true } },
            },
          },
          epic: { select: { id: true, name: true, status: true } },
        },
      });

      if (!action) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Action not found or access denied",
        });
      }

      return action;
    }),

  getByTranscription: protectedProcedure
    .input(
      z.object({
        transcriptionId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.action.findMany({
        where: {
          transcriptionSessionId: input.transcriptionId,
          status: { notIn: ["DELETED", "DRAFT"] },
          ...buildUserActionPermissions(ctx.session.user.id),
        },
        include: {
          project: true,
          syncs: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          createdBy: { select: { id: true, name: true, email: true, image: true } },
          tags: { include: { tag: true } },
          lists: {
            include: {
              list: { select: { id: true, name: true, slug: true, listType: true, status: true } },
            },
          },
          epic: { select: { id: true, name: true, status: true } },
          actionScreenshots: {
            include: {
              screenshot: { select: { id: true, url: true, timestamp: true } },
            },
          },
        },
        orderBy: [
          { kanbanOrder: { sort: "asc", nulls: "last" } },
          { priority: "asc" },
          { dueDate: "asc" }
        ],
      });
    }),

  getDraftByTranscription: protectedProcedure
    .input(
      z.object({
        transcriptionId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.action.findMany({
        where: {
          transcriptionSessionId: input.transcriptionId,
          status: "DRAFT",
          createdById: ctx.session.user.id,
        },
        include: {
          project: true,
          syncs: true,
          assignees: {
            include: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
          createdBy: { select: { id: true, name: true, email: true, image: true } },
          tags: { include: { tag: true } },
          lists: {
            include: {
              list: { select: { id: true, name: true, slug: true, listType: true, status: true } },
            },
          },
          epic: { select: { id: true, name: true, status: true } },
          actionScreenshots: {
            include: {
              screenshot: { select: { id: true, url: true, timestamp: true } },
            },
          },
        },
        orderBy: { id: "asc" },
      });
    }),

  getProjectActions: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      assigneeId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify user has access to this project
      const projectAccess = await getProjectAccess(ctx.db, ctx.session.user.id, input.projectId);
      if (!hasProjectAccess(projectAccess)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this project",
        });
      }

      const whereClause: any = {
        projectId: input.projectId,
        status: {
          notIn: ["DELETED", "DRAFT"],
        },
      };

      // Add assignee filtering if specified
      if (input.assigneeId) {
        whereClause.assignees = {
          some: {
            userId: input.assigneeId,
          },
        };
      }

      return ctx.db.action.findMany({
        where: whereClause,
        include: {
          project: true,
          syncs: true, // Include ActionSync records to show sync status
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          createdBy: { select: { id: true, name: true, email: true, image: true } },
          tags: { include: { tag: true } },
        },
        orderBy: [
          { kanbanOrder: { sort: "asc", nulls: "last" } },
          { priority: "asc" },
          { dueDate: "asc" }
        ],
      });
    }),

  // Get actions imported from Notion that don't have a project assigned
  getNotionImportedWithoutProject: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id;

      return ctx.db.action.findMany({
        where: {
          // Same logic as getAll - show actions I created (with no assignees) OR assigned to me
          OR: [
            { createdById: userId, assignees: { none: {} } },
            { assignees: { some: { userId: userId } } },
          ],
          projectId: null,
          status: { notIn: ["DELETED", "DRAFT"] },
          syncs: {
            some: { provider: "notion" }
          }
        },
        include: {
          syncs: true,
          project: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          tags: { include: { tag: true } },
        },
        orderBy: { id: 'desc' }
      });
    }),

  // Get actions for Kanban board with comprehensive filtering
  getKanbanActions: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
      assigneeId: z.string().optional(),
      kanbanStatus: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const whereClause: any = {
        createdById: ctx.session.user.id,
        status: {
          notIn: ["DELETED", "DRAFT"],
        },
        // Only include actions that have a kanbanStatus (project-associated actions)
        kanbanStatus: {
          not: null,
        },
      };

      // Add project filtering if specified
      if (input?.projectId) {
        whereClause.projectId = input.projectId;
      }

      // Add assignee filtering if specified
      if (input?.assigneeId) {
        whereClause.assignees = {
          some: {
            userId: input.assigneeId,
          },
        };
      }

      // Add kanban status filtering if specified
      if (input?.kanbanStatus) {
        whereClause.kanbanStatus = input.kanbanStatus;
      }

      return ctx.db.action.findMany({
        where: whereClause,
        include: {
          project: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          tags: { include: { tag: true } },
        },
        orderBy: [
          { kanbanStatus: "asc" }, // Order by kanban status first
          { kanbanOrder: { sort: "asc", nulls: "last" } },
          { priority: "asc" },
          { dueDate: "asc" }
        ],
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        projectId: z.string().optional(),
        workspaceId: z.string().optional(),
        dueDate: z.date().optional(),
        scheduledStart: z.date().optional(),
        scheduledEnd: z.date().optional(),
        duration: z.number().min(1).optional(), // Duration in minutes
        priority: z.enum(PRIORITY_VALUES).default("Quick"),
        status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED", "DELETED", "DRAFT"]).default("ACTIVE"),
        epicId: z.string().optional(),
        effortEstimate: z.number().min(0).optional(),
        blockedByIds: z.array(z.string()).optional(),
        // Bounty fields
        isBounty: z.boolean().optional(),
        bountyAmount: z.number().positive().optional(),
        bountyToken: z.string().optional(),
        bountyDifficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
        bountySkills: z.array(z.string()).optional(),
        bountyDeadline: z.date().optional(),
        bountyMaxClaimants: z.number().int().min(1).optional(),
        bountyExternalUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user exists before creating action
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id }
      });
      
      if (!user) {
        throw new Error(`User not found: ${ctx.session.user.id}. Please ensure your account is properly set up.`);
      }

      // Verify user has access to the target project
      if (input.projectId) {
        const project = await ctx.db.project.findUnique({
          where: { id: input.projectId },
          select: { id: true, createdById: true, teamId: true, workspaceId: true, isPublic: true },
        });

        if (!project) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Project not found",
          });
        }

        let hasAccess = project.createdById === ctx.session.user.id || project.isPublic;

        if (!hasAccess && project.teamId) {
          const teamMembership = await ctx.db.teamUser.findFirst({
            where: { teamId: project.teamId, userId: ctx.session.user.id },
          });
          hasAccess = !!teamMembership;
        }

        if (!hasAccess && project.workspaceId) {
          const workspaceMembership = await ctx.db.workspaceUser.findUnique({
            where: {
              userId_workspaceId: {
                userId: ctx.session.user.id,
                workspaceId: project.workspaceId,
              },
            },
          });
          hasAccess = !!workspaceMembership;
        }

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to create actions on this project",
          });
        }
      }

      // Set default kanban status for project tasks
      const actionData: any = {
        ...input,
        createdById: ctx.session.user.id,
        // Auto-set bountyStatus when creating a bounty
        ...(input.isBounty ? { bountyStatus: "OPEN" } : {}),
      };

      // If this action is being created for a project, set default kanban status to TODO
      if (input.projectId) {
        // Get the current highest order across all statuses in this project
        const maxOrderAcrossBoard = await ctx.db.action.findFirst({
          where: {
            projectId: input.projectId,
            kanbanOrder: { not: null }
          },
          orderBy: { kanbanOrder: 'desc' },
          select: { kanbanOrder: true }
        });

        // Get the current highest order in the TODO column specifically
        const maxOrderInTodo = await ctx.db.action.findFirst({
          where: {
            projectId: input.projectId,
            kanbanStatus: "TODO",
            kanbanOrder: { not: null }
          },
          orderBy: { kanbanOrder: 'desc' },
          select: { kanbanOrder: true }
        });

        // Calculate next order position
        let nextOrder: number;
        
        if (maxOrderInTodo?.kanbanOrder) {
          // If there are existing tasks in TODO column, add after the last one
          nextOrder = maxOrderInTodo.kanbanOrder + 1;
        } else if (maxOrderAcrossBoard?.kanbanOrder) {
          // If TODO column is empty but board has other tasks, 
          // place at the end of the board order
          nextOrder = maxOrderAcrossBoard.kanbanOrder + 1;
        } else {
          // First task in the entire project
          nextOrder = 1;
        }

        actionData.kanbanStatus = "TODO";
        actionData.kanbanOrder = nextOrder;
      }

      return ctx.db.action.create({
        data: actionData,
        include: {
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          project: { select: { id: true, name: true } },
          tags: { include: { tag: true } },
          epic: { select: { id: true, name: true, status: true } },
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        projectId: z.string().optional(),
        workspaceId: z.string().nullable().optional(),
        dueDate: z.date().nullable().optional(), // nullable allows explicitly setting to null
        scheduledStart: z.date().nullable().optional(),
        scheduledEnd: z.date().nullable().optional(),
        duration: z.number().min(1).nullable().optional(), // Duration in minutes
        priority: z.enum(PRIORITY_VALUES).optional(),
        status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED", "DELETED", "DRAFT"]).optional(),
        kanbanStatus: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]).optional(),
        epicId: z.string().nullable().optional(),
        effortEstimate: z.number().min(0).nullable().optional(),
        blockedByIds: z.array(z.string()).optional(),
        // Bounty fields
        isBounty: z.boolean().optional(),
        bountyAmount: z.number().positive().nullable().optional(),
        bountyToken: z.string().nullable().optional(),
        bountyStatus: z.enum(["OPEN", "IN_PROGRESS", "IN_REVIEW", "COMPLETED", "CANCELLED"]).nullable().optional(),
        bountyDifficulty: z.enum(["beginner", "intermediate", "advanced"]).nullable().optional(),
        bountySkills: z.array(z.string()).optional(),
        bountyDeadline: z.date().nullable().optional(),
        bountyMaxClaimants: z.number().int().min(1).optional(),
        bountyExternalUrl: z.string().url().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify user has edit access to this action
      const access = await getActionAccess(ctx.db, ctx.session.user.id, id);
      if (!access || !canEditAction(access)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to edit this action",
        });
      }

      // Check if action is being marked as completed
      const isCompleting = updateData.status === "COMPLETED" || updateData.kanbanStatus === "DONE";
      const isUncompleting = updateData.status === "ACTIVE" || (updateData.kanbanStatus && updateData.kanbanStatus !== "DONE");

      // Get current action to check previous state
      const currentAction = await ctx.db.action.findUnique({
        where: { id },
        select: { status: true, kanbanStatus: true, completedAt: true }
      });

      const wasCompleted = currentAction?.status === "COMPLETED" || currentAction?.kanbanStatus === "DONE";

      // Set completedAt timestamp when completing, clear when uncompleting
      // Clear kanbanOrder when priority is updated to restore automatic sorting
      const finalUpdateData = {
        ...updateData,
        ...(isCompleting && !wasCompleted && { completedAt: new Date() }),
        ...(isUncompleting && wasCompleted && { completedAt: null }),
        ...(updateData.priority !== undefined && { kanbanOrder: null }),
      };

      const updatedAction = await ctx.db.action.update({
        where: { id },
        data: finalUpdateData,
        include: {
          dailyPlanActions: {
            include: {
              dailyPlan: true,
            },
          },
        },
      });

      // Recalculate score if completion status changed and action is linked to daily plan
      // Run async without blocking the response for faster UI
      if ((isCompleting && !wasCompleted) || (isUncompleting && wasCompleted)) {
        if (updatedAction.dailyPlanActions.length > 0) {
          // Fire and forget - don't await scoring calculation
          void Promise.all(
            updatedAction.dailyPlanActions.map((dpa) =>
              ScoringService.calculateDailyScore(
                ctx,
                startOfDay(dpa.dailyPlan.date),
                dpa.dailyPlan.workspaceId ?? undefined
              ).catch((err) => {
                console.error("[action.update] Failed to recalculate score:", err);
              })
            )
          );
        }
      }

      return updatedAction;
    }),

  // Update kanban status (for drag-and-drop)
  updateKanbanStatus: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      kanbanStatus: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the action exists and user has permission to modify it
      const action = await ctx.db.action.findFirst({
        where: {
          id: input.actionId,
          ...buildUserActionPermissions(ctx.session.user.id),
        },
        select: {
          id: true,
          kanbanStatus: true,
          completedAt: true
        }
      });

      if (!action) {
        // Check if action exists to give appropriate error message
        const actionExists = await ctx.db.action.findUnique({
          where: { id: input.actionId },
          select: { id: true },
        });

        if (!actionExists) {
          throw new Error("Action not found");
        }
        throw new Error("You don't have permission to modify this action");
      }

      // Check if action is being completed or uncompleted
      const isCompleting = input.kanbanStatus === "DONE";
      const isUncompleting = input.kanbanStatus !== "DONE";
      const wasCompleted = action.kanbanStatus === "DONE";

      // Prepare update data with completion timestamp
      const updateData = {
        kanbanStatus: input.kanbanStatus,
        ...(isCompleting && !wasCompleted && { completedAt: new Date() }),
        ...(isUncompleting && wasCompleted && { completedAt: null }),
      };

      // Update the kanban status
      const updated = await ctx.db.action.update({
        where: { id: input.actionId },
        data: updateData,
        include: {
          project: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
        },
      });

      // Track status change for PM agent analytics (cycle time, lead time)
      if (action.kanbanStatus !== input.kanbanStatus) {
        await ctx.db.actionStatusChange.create({
          data: {
            actionId: input.actionId,
            fromStatus: action.kanbanStatus,
            toStatus: input.kanbanStatus,
            changedById: ctx.session.user.id,
          },
        }).catch((err: unknown) => {
          console.error("Failed to record status change:", err);
        });
      }

      return updated;
    }),

  getToday: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const userId = ctx.session.user.id;

      return ctx.db.action.findMany({
        where: {
          OR: [
            // Created by me AND no assignees
            { createdById: userId, assignees: { none: {} } },
            // Assigned to me via ActionAssignee
            { assignees: { some: { userId: userId } } },
          ],
          dueDate: {
            gte: today,
            lt: tomorrow,
          },
          status: "ACTIVE",
          // Filter by workspace via the action's project
          ...(input?.workspaceId ? { project: { workspaceId: input.workspaceId } } : {}),
        },
        include: {
          project: true,
          syncs: true, // Include ActionSync records to show sync status
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          createdBy: { select: { id: true, name: true, email: true, image: true } },
          tags: { include: { tag: true } },
        },
        orderBy: {
          project: {
            priority: "desc",
          },
        },
      });
    }),

  getByDateRange: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        workspaceId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return ctx.db.action.findMany({
        where: {
          OR: [
            // Created by me AND no assignees
            { createdById: userId, assignees: { none: {} } },
            // Assigned to me via ActionAssignee
            { assignees: { some: { userId: userId } } },
          ],
          dueDate: {
            gte: input.startDate,
            lt: input.endDate,
          },
          status: "ACTIVE",
          // Filter by workspace via the action's project
          ...(input.workspaceId ? { project: { workspaceId: input.workspaceId } } : {}),
        },
        include: {
          project: true,
          syncs: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          createdBy: { select: { id: true, name: true, email: true, image: true } },
          tags: { include: { tag: true } },
        },
        orderBy: { dueDate: "asc" },
      });
    }),

  // Get scheduled actions for calendar display
  getScheduledByDate: protectedProcedure
    .input(
      z.object({
        date: z.date(),
        workspaceId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Get start and end of the day
      const startOfDay = new Date(input.date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(input.date);
      endOfDay.setHours(23, 59, 59, 999);

      return ctx.db.action.findMany({
        where: {
          OR: [
            { createdById: userId, assignees: { none: {} } },
            { assignees: { some: { userId: userId } } },
          ],
          scheduledStart: {
            gte: startOfDay,
            lte: endOfDay,
          },
          status: "ACTIVE",
          ...(input.workspaceId ? { project: { workspaceId: input.workspaceId } } : {}),
        },
        include: {
          project: true,
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          createdBy: { select: { id: true, name: true, email: true, image: true } },
          tags: { include: { tag: true } },
        },
        orderBy: { scheduledStart: "asc" },
      });
    }),

  // Get scheduled actions for a date range (calendar week/month view)
  getScheduledByDateRange: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        workspaceId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [scheduledActions, scheduledDailyPlanTasks] = await Promise.all([
        ctx.db.action.findMany({
          where: {
            OR: [
              { createdById: userId, assignees: { none: {} } },
              { assignees: { some: { userId: userId } } },
            ],
            scheduledStart: {
              gte: input.startDate,
              lte: input.endDate,
            },
            status: "ACTIVE",
            ...(input.workspaceId ? { project: { workspaceId: input.workspaceId } } : {}),
          },
          include: {
            project: true,
            assignees: {
              include: { user: { select: { id: true, name: true, email: true, image: true } } },
            },
            createdBy: { select: { id: true, name: true, email: true, image: true } },
            tags: { include: { tag: true } },
          },
          orderBy: { scheduledStart: "asc" },
        }),
        ctx.db.dailyPlanAction.findMany({
          where: {
            actionId: null,
            scheduledStart: {
              gte: input.startDate,
              lte: input.endDate,
            },
            dailyPlan: {
              userId,
              ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
            },
          },
          include: {
            action: {
              include: {
                project: true,
              },
            },
          },
        }),
      ]);

      const scheduledItems = [
        ...scheduledActions.map((action) => ({
          id: action.id,
          actionId: action.id,
          dailyPlanActionId: null,
          name: action.name,
          scheduledStart: action.scheduledStart!,
          scheduledEnd: action.scheduledEnd,
          duration: action.duration,
          status: action.status,
          project: action.project,
          source: "action" as const,
        })),
        ...scheduledDailyPlanTasks.map((task) => ({
          id: task.id,
          actionId: null,
          dailyPlanActionId: task.id,
          name: task.name,
          scheduledStart: task.scheduledStart!,
          scheduledEnd: task.scheduledEnd,
          duration: task.duration,
          status: task.completed ? "COMPLETED" : "ACTIVE",
          project: task.action?.project ?? null,
          source: "daily-plan" as const,
        })),
      ];

      return scheduledItems.sort(
        (a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime()
      );
    }),

  updateActionsProject: protectedProcedure
    .input(
      z.object({
        transcriptionSessionId: z.string(),
        projectId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      console.log('🔄 updateActionsProject called with:', {
        transcriptionSessionId: input.transcriptionSessionId,
        projectId: input.projectId,
        userId: ctx.session.user.id
      });

      // First, let's check what actions exist for this transcription session
      let existingActions;
      try {
        existingActions = await ctx.db.action.findMany({
          where: {
            transcriptionSessionId: input.transcriptionSessionId,
            createdById: ctx.session.user.id,
          },
          select: {
            id: true,
            name: true,
            projectId: true,
            transcriptionSessionId: true,
          },
        });

        console.log('📋 Found existing actions for this transcription:', {
          count: existingActions.length,
          actions: existingActions.map((a: any) => ({
            id: a.id,
            name: a.name,
            currentProjectId: a.projectId,
            transcriptionSessionId: a.transcriptionSessionId
          }))
        });
      } catch (error) {
        console.error('❌ Error finding actions:', error);
        throw new Error(`Failed to find actions: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Update all actions associated with this transcription session
      let result;
      try {
        result = await ctx.db.action.updateMany({
          where: {
            transcriptionSessionId: input.transcriptionSessionId,
            createdById: ctx.session.user.id, // Ensure user can only update their own actions
          },
          data: {
            projectId: input.projectId,
          },
        });

        console.log('✅ Update result:', {
          count: result.count,
          message: `Updated ${result.count} action${result.count === 1 ? '' : 's'}`,
          existingActionsFound: existingActions.length
        });
      } catch (error) {
        console.error('❌ Error updating actions:', error);
        throw new Error(`Failed to update actions: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      return {
        count: result.count,
        message: `Updated ${result.count} action${result.count === 1 ? '' : 's'}`,
      };
    }),

  // Debug endpoint to check action-transcription relationships
  debugTranscriptionActions: protectedProcedure
    .input(z.object({ transcriptionSessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const actions = await ctx.db.action.findMany({
        where: {
          createdById: ctx.session.user.id,
        },
        select: {
          id: true,
          name: true,
          projectId: true,
          transcriptionSessionId: true,
        },
        orderBy: {
          id: 'desc'
        }
      });

      const transcriptionSession = await ctx.db.transcriptionSession.findUnique({
        where: { id: input.transcriptionSessionId },
        select: {
          id: true,
          sessionId: true,
          title: true,
        }
      });

      return {
        transcriptionSession,
        allUserActions: actions,
        actionsForThisTranscription: actions.filter((a: any) => a.transcriptionSessionId === input.transcriptionSessionId),
        totalActions: actions.length,
      };
    }),

  // Link existing actions to a transcription session
  linkActionsToTranscription: protectedProcedure
    .input(z.object({ 
      actionIds: z.array(z.string()),
      transcriptionSessionId: z.string() 
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.action.updateMany({
        where: {
          id: { in: input.actionIds },
          createdById: ctx.session.user.id, // Ensure user owns the actions
        },
        data: {
          transcriptionSessionId: input.transcriptionSessionId,
        },
      });

      return {
        count: result.count,
        message: `Linked ${result.count} action${result.count === 1 ? '' : 's'} to transcription`,
      };
    }),

  // Bulk delete actions
  bulkDelete: protectedProcedure
    .input(z.object({
      actionIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.action.deleteMany({
        where: {
          id: { in: input.actionIds },
          ...buildUserActionPermissions(ctx.session.user.id),
        },
      });

      return {
        count: result.count,
        message: `Deleted ${result.count} action${result.count === 1 ? '' : 's'}`,
      };
    }),

  // Bulk reschedule actions (update scheduledStart/doDate and dueDate)
  bulkReschedule: protectedProcedure
    .input(z.object({
      actionIds: z.array(z.string()),
      dueDate: z.date().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Always update scheduledStart (the "do date" - when the action is scheduled)
      // Also update dueDate if it would be before the new scheduledStart
      if (input.dueDate) {
        // First: update scheduledStart for all actions
        await ctx.db.action.updateMany({
          where: {
            id: { in: input.actionIds },
            ...buildUserActionPermissions(ctx.session.user.id),
          },
          data: {
            scheduledStart: input.dueDate,
          },
        });

        // Second: update dueDate only for actions where dueDate is before the new date (or null)
        await ctx.db.action.updateMany({
          where: {
            id: { in: input.actionIds },
            ...buildUserActionPermissions(ctx.session.user.id),
            OR: [
              { dueDate: null },
              { dueDate: { lt: input.dueDate } },
            ],
          },
          data: {
            dueDate: input.dueDate,
          },
        });
      } else {
        // Clearing the schedule: remove both dates
        await ctx.db.action.updateMany({
          where: {
            id: { in: input.actionIds },
            ...buildUserActionPermissions(ctx.session.user.id),
          },
          data: {
            scheduledStart: null,
            dueDate: null,
          },
        });
      }

      return {
        count: input.actionIds.length,
        actionIds: input.actionIds,
      };
    }),

  // Bulk assign project to multiple actions
  bulkAssignProject: protectedProcedure
    .input(z.object({
      actionIds: z.array(z.string()),
      projectId: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.action.updateMany({
        where: {
          id: { in: input.actionIds },
          ...buildUserActionPermissions(ctx.session.user.id),
        },
        data: {
          projectId: input.projectId,
          kanbanStatus: input.projectId ? "TODO" : null,
        },
      });

      return {
        count: result.count,
        actionIds: input.actionIds,
        projectId: input.projectId,
      };
    }),

  // Assign users to an action
  assign: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      userIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the action exists and user has permission to modify it
      const action = await ctx.db.action.findUnique({
        where: { id: input.actionId },
        include: { 
          project: {
            include: {
              projectMembers: {
                select: { userId: true }
              },
              team: {
                include: {
                  members: {
                    select: { userId: true }
                  }
                }
              }
            }
          },
          team: {
            include: {
              members: {
                select: { userId: true }
              }
            }
          }
        },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      // Check if user has permission to modify this action (creator, assignee, project member, or team member)
      const hasPermission = await ctx.db.action.findFirst({
        where: {
          id: input.actionId,
          ...buildUserActionPermissions(ctx.session.user.id),
        },
        select: { id: true },
      });

      if (!hasPermission) {
        throw new Error("You don't have permission to modify this action");
      }

      // Validate that all users can be assigned to this action
      for (const userId of input.userIds) {
        let canAssign = false;
        
        // Check if action has a project - users must be project members, team members, project creator, or workspace members
        if (action.projectId && action.project) {
          // Check if user is a project member
          const isProjectMember = action.project.projectMembers.some((member: any) => member.userId === userId);

          // Check if user is a team member (if project has a team)
          const isTeamMember = action.project.team?.members.some((member: any) => member.userId === userId);

          // Check if user is the project creator
          const isProjectCreator = action.project.createdById === userId;

          // Check if user is a workspace member
          let isWorkspaceMember = false;
          if (action.project.workspaceId) {
            const workspaceUser = await ctx.db.workspaceUser.findFirst({
              where: {
                workspaceId: action.project.workspaceId,
                userId,
              },
              select: { id: true },
            });
            isWorkspaceMember = !!workspaceUser;
          }

          // Check if user shares a team with the assigning user
          let sharesTeam = false;
          if (!isProjectMember && !isTeamMember && !isProjectCreator && !isWorkspaceMember) {
            const sharedTeam = await ctx.db.team.findFirst({
              where: {
                AND: [
                  { members: { some: { userId } } },
                  { members: { some: { userId: ctx.session.user.id } } },
                ],
              },
              select: { id: true },
            });
            sharesTeam = !!sharedTeam;
          }

          canAssign = isProjectMember || isTeamMember || isProjectCreator || isWorkspaceMember || sharesTeam;
        }
        // Check if action has a team (but no project) - users must be team members
        else if (action.teamId && action.team) {
          const isTeamMember = action.team.members.some((member: any) => member.userId === userId);
          canAssign = isTeamMember;
        }
        // If action has neither project nor team, allow assignment to any user
        else {
          canAssign = true;
        }

        if (!canAssign) {
          // Get user info for better error message
          const user = await ctx.db.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true }
          });
          const userName = user?.name || user?.email || userId;

          throw new Error(`User ${userName} cannot be assigned to this action. They must be a member of the ${action.projectId ? 'project' : 'team'}.`);
        }
      }

      // Create assignments for each user (using createMany with skipDuplicates)
      await ctx.db.actionAssignee.createMany({
        data: input.userIds.map(userId => ({
          actionId: input.actionId,
          userId,
        })),
        skipDuplicates: true,
      });

      // Return updated action with assignees
      return ctx.db.action.findUnique({
        where: { id: input.actionId },
        include: {
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          project: true,
        },
      });
    }),

  // Unassign users from an action
  unassign: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      userIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is removing themselves (self-removal should always be allowed)
      const isSelfRemoval = input.userIds.length === 1 && input.userIds[0] === ctx.session.user.id;

      // Verify the action exists
      const action = await ctx.db.action.findFirst({
        where: {
          id: input.actionId,
          // For self-removal, just verify the action exists
          // For unassigning others, verify user has permission
          ...(isSelfRemoval ? {} : buildUserActionPermissions(ctx.session.user.id)),
        },
      });

      if (!action) {
        // Check if the action exists at all (to give appropriate error message)
        const actionExists = await ctx.db.action.findUnique({
          where: { id: input.actionId },
          select: { id: true },
        });

        if (!actionExists) {
          throw new Error("Action not found");
        }
        throw new Error("You don't have permission to modify this action");
      }

      // Remove assignments
      await ctx.db.actionAssignee.deleteMany({
        where: {
          actionId: input.actionId,
          userId: { in: input.userIds },
        },
      });

      // Return updated action with assignees
      return ctx.db.action.findUnique({
        where: { id: input.actionId },
        include: {
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          project: true,
        },
      });
    }),

  // Bulk assign users to multiple actions
  bulkAssign: protectedProcedure
    .input(z.object({
      actionIds: z.array(z.string()),
      userIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify all actions exist and user has permission to modify them
      const actions = await ctx.db.action.findMany({
        where: {
          id: { in: input.actionIds },
          createdById: ctx.session.user.id, // Ensure user owns all actions
        },
        include: { 
          project: {
            include: {
              projectMembers: {
                select: { userId: true }
              },
              team: {
                include: {
                  members: {
                    select: { userId: true }
                  }
                }
              }
            }
          },
          team: {
            include: {
              members: {
                select: { userId: true }
              }
            }
          }
        },
      });

      if (actions.length !== input.actionIds.length) {
        throw new Error("Some actions not found or you don't have permission to modify them");
      }

      // Validate assignments for each action-user combination
      for (const action of actions) {
        for (const userId of input.userIds) {
          let canAssign = false;
          
          // Check if action has a project - users must be project members, team members, project creator, or workspace members
          if (action.projectId && action.project) {
            // Check if user is a project member
            const isProjectMember = action.project.projectMembers.some((member: any) => member.userId === userId);

            // Check if user is a team member (if project has a team)
            const isTeamMember = action.project.team?.members.some((member: any) => member.userId === userId);

            // Check if user is the project creator
            const isProjectCreator = action.project.createdById === userId;

            // Check if user is a workspace member
            let isWorkspaceMember = false;
            if (action.project.workspaceId) {
              const workspaceUser = await ctx.db.workspaceUser.findFirst({
                where: {
                  workspaceId: action.project.workspaceId,
                  userId,
                },
                select: { id: true },
              });
              isWorkspaceMember = !!workspaceUser;
            }

            canAssign = isProjectMember || isTeamMember || isProjectCreator || isWorkspaceMember;
          }
          // Check if action has a team (but no project) - users must be team members
          else if (action.teamId && action.team) {
            const isTeamMember = action.team.members.some((member: any) => member.userId === userId);
            canAssign = isTeamMember;
          }
          // If action has neither project nor team, allow assignment to any user
          else {
            canAssign = true;
          }

          if (!canAssign) {
            // Get user info for better error message
            const user = await ctx.db.user.findUnique({
              where: { id: userId },
              select: { name: true, email: true }
            });
            const userName = user?.name || user?.email || userId;

            throw new Error(`User ${userName} cannot be assigned to action "${action.name}". They must be a member of the ${action.projectId ? 'project' : 'team'}.`);
          }
        }
      }

      // Create all assignments
      const assignments = input.actionIds.flatMap(actionId =>
        input.userIds.map(userId => ({ actionId, userId }))
      );

      await ctx.db.actionAssignee.createMany({
        data: assignments,
        skipDuplicates: true,
      });

      return {
        count: assignments.length,
        message: `Assigned ${input.userIds.length} user${input.userIds.length === 1 ? '' : 's'} to ${input.actionIds.length} action${input.actionIds.length === 1 ? '' : 's'}`,
      };
    }),

  // Get users available for assignment to a specific action
  // Returns all users from all teams the current user belongs to
  getAssignableUsers: protectedProcedure
    .input(z.object({
      actionId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Get the action to verify it exists and get context
      const action = await ctx.db.action.findUnique({
        where: { id: input.actionId },
        include: {
          project: true,
          team: true,
        },
      });

      if (!action) {
        throw new Error("Action not found");
      }

      // Collect assignable users from multiple sources
      const userMap = new Map<string, { id: string; name: string | null; email: string | null; image: string | null }>();

      // 1. Get users from teams the current user belongs to
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
        },
      });

      userTeams.forEach(team => {
        team.members.forEach(member => {
          userMap.set(member.user.id, member.user);
        });
      });

      // 2. Get workspace members (if action belongs to a project in a workspace)
      if (action.project?.workspaceId) {
        const workspaceUsers = await ctx.db.workspaceUser.findMany({
          where: { workspaceId: action.project.workspaceId },
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        });
        workspaceUsers.forEach(wu => {
          userMap.set(wu.user.id, wu.user);
        });
      }

      // 3. Get project members (if action belongs to a project)
      if (action.projectId) {
        const projectMembers = await ctx.db.projectMember.findMany({
          where: { projectId: action.projectId },
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        });
        projectMembers.forEach(pm => {
          userMap.set(pm.user.id, pm.user);
        });
      }

      // 4. Always include the current user
      if (!userMap.has(ctx.session.user.id)) {
        const currentUser = await ctx.db.user.findUnique({
          where: { id: ctx.session.user.id },
          select: { id: true, name: true, email: true, image: true },
        });
        if (currentUser) {
          userMap.set(currentUser.id, currentUser);
        }
      }

      const assignableUsers = Array.from(userMap.values());

      return {
        assignableUsers,
        actionContext: {
          hasProject: !!action.projectId,
          hasTeam: !!action.teamId,
          projectName: action.project?.name,
          teamName: action.team?.name,
          userTeamCount: userTeams.length,
        }
      };
    }),

  updateKanbanStatusWithOrder: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      kanbanStatus: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]),
      targetPosition: z.number().optional(),
      droppedOnTaskId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { actionId, kanbanStatus, targetPosition, droppedOnTaskId } = input;

      // Get the action being moved
      const action = await ctx.db.action.findUnique({
        where: { id: actionId },
        include: { project: true }
      });

      if (!action) {
        throw new Error("Action not found");
      }

      // Ensure user has permission to update this action
      const isCreator = action.createdById === ctx.session.user.id;
      const isAssignee = await ctx.db.actionAssignee.findFirst({
        where: {
          actionId,
          userId: ctx.session.user.id,
        },
      });

      if (!isCreator && !isAssignee) {
        if (action.project) {
          // Check if user is a project member
          const projectMember = await ctx.db.projectMember.findFirst({
            where: {
              projectId: action.projectId!,
              userId: ctx.session.user.id,
            },
          });

          if (!projectMember) {
            throw new Error("Not authorized to update this action");
          }
        } else {
          throw new Error("Not authorized to update this action");
        }
      }

      let newOrder: number;

      if (droppedOnTaskId) {
        // Get the target task details
        const targetTask = await ctx.db.action.findUnique({
          where: { id: droppedOnTaskId },
          select: { kanbanOrder: true, kanbanStatus: true }
        });

        if (!targetTask) {
          throw new Error("Target task not found");
        }

        // Get the target task's order
        const targetOrder = targetTask.kanbanOrder ?? 1;

        // Find all tasks in the same column that need to be shifted down
        const tasksToShift = await ctx.db.action.findMany({
          where: {
            projectId: action.projectId,
            kanbanStatus,
            kanbanOrder: { gte: targetOrder },
            id: { not: actionId } // Don't include the task being moved
          },
          select: { id: true, kanbanOrder: true },
          orderBy: { kanbanOrder: 'asc' }
        });

        // Use a transaction to update all affected tasks
        await ctx.db.$transaction(async (tx: any) => {
          // First, shift all tasks down by 1
          for (const task of tasksToShift) {
            await tx.action.update({
              where: { id: task.id },
              data: { kanbanOrder: (task.kanbanOrder ?? 0) + 1 }
            });
          }
        });

        // Set the moved task to take the target position
        newOrder = targetOrder;
      } else if (targetPosition !== undefined) {
        // Use provided position
        newOrder = targetPosition;
      } else {
        // Get the highest order in this status column
        const maxOrderInColumn = await ctx.db.action.findFirst({
          where: {
            projectId: action.projectId,
            kanbanStatus,
            kanbanOrder: { not: null }
          },
          orderBy: { kanbanOrder: 'desc' },
          select: { kanbanOrder: true }
        });

        // Get the highest order across the entire board
        const maxOrderAcrossBoard = await ctx.db.action.findFirst({
          where: {
            projectId: action.projectId,
            kanbanOrder: { not: null }
          },
          orderBy: { kanbanOrder: 'desc' },
          select: { kanbanOrder: true }
        });

        if (maxOrderInColumn?.kanbanOrder) {
          // Add to the end of the specific column
          newOrder = maxOrderInColumn.kanbanOrder + 1;
        } else if (maxOrderAcrossBoard?.kanbanOrder) {
          // Column is empty, but board has tasks - place at end of board order
          newOrder = maxOrderAcrossBoard.kanbanOrder + 1;
        } else {
          // First task in the entire project
          newOrder = 1;
        }
      }

      // Update the action
      const updated = await ctx.db.action.update({
        where: { id: actionId },
        data: {
          kanbanStatus,
          kanbanOrder: newOrder,
          // Track completion timestamp
          ...(kanbanStatus === "DONE" && action.kanbanStatus !== "DONE" && { completedAt: new Date() }),
          ...(kanbanStatus !== "DONE" && action.kanbanStatus === "DONE" && { completedAt: null }),
        },
        include: {
          assignees: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          project: { select: { id: true, name: true } },
        },
      });

      // Track status change for PM agent analytics (cycle time, lead time)
      if (action.kanbanStatus !== kanbanStatus) {
        await ctx.db.actionStatusChange.create({
          data: {
            actionId,
            fromStatus: action.kanbanStatus,
            toStatus: kanbanStatus,
            changedById: ctx.session.user.id,
          },
        }).catch((err: unknown) => {
          console.error("Failed to record status change:", err);
        });
      }

      return updated;
    }),

  reorderKanbanCard: protectedProcedure
    .input(z.object({
      actionId: z.string(),
      newPosition: z.number(), // 0-based index position
      targetColumnStatus: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { actionId, newPosition, targetColumnStatus } = input;

      // Get the action to verify permissions
      const action = await ctx.db.action.findUnique({
        where: { id: actionId },
        select: {
          id: true,
          projectId: true,
          kanbanStatus: true,
          kanbanOrder: true,
          createdById: true,
          project: true
        }
      });

      if (!action) {
        throw new Error("Action not found");
      }

      // Ensure user has permission to reorder this action
      const isCreator = action.createdById === ctx.session.user.id;
      const isAssignee = await ctx.db.actionAssignee.findFirst({
        where: {
          actionId,
          userId: ctx.session.user.id,
        },
      });

      if (!isCreator && !isAssignee) {
        if (action.project) {
          const projectMember = await ctx.db.projectMember.findFirst({
            where: {
              projectId: action.projectId!,
              userId: ctx.session.user.id,
            },
          });

          if (!projectMember) {
            throw new Error("Not authorized to reorder this action");
          }
        } else {
          throw new Error("Not authorized to reorder this action");
        }
      }

      // Get all tasks in the target column, ordered
      const columnTasks = await ctx.db.action.findMany({
        where: {
          projectId: action.projectId,
          kanbanStatus: targetColumnStatus,
          id: { not: actionId } // Exclude the task being moved
        },
        select: { id: true, kanbanOrder: true },
        orderBy: { kanbanOrder: 'asc' }
      });

      // Calculate new order values for all tasks in the column
      return ctx.db.$transaction(async (tx: any) => {
        // Update the moved task first
        await tx.action.update({
          where: { id: actionId },
          data: {
            kanbanStatus: targetColumnStatus,
            kanbanOrder: newPosition + 1 // Convert 0-based to 1-based
          }
        });

        // Reorder all other tasks in the column
        for (let i = 0; i < columnTasks.length; i++) {
          const task = columnTasks[i];
          let newOrder: number;
          
          if (i < newPosition) {
            // Tasks before the insertion point keep their relative position
            newOrder = i + 1;
          } else {
            // Tasks at and after the insertion point are shifted down by 1
            newOrder = i + 2;
          }

          await tx.action.update({
            where: { id: task!.id },
            data: { kanbanOrder: newOrder }
          });
        }

        return { message: "Reordering completed successfully" };
      });
    }),

  // Utility endpoint to initialize kanban orders for existing tasks
  initializeKanbanOrders: protectedProcedure
    .input(z.object({
      projectId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get all actions in this project without kanban orders
      const actionsWithoutOrder = await ctx.db.action.findMany({
        where: {
          projectId: input.projectId,
          kanbanOrder: null,
        },
        orderBy: [
          { kanbanStatus: 'asc' },
          // { createdAt: 'asc' }
        ],
      });

      if (actionsWithoutOrder.length === 0) {
        return { message: 'No actions need order initialization', updated: 0 };
      }

      // Get the current highest order in the project
      const maxOrder = await ctx.db.action.findFirst({
        where: {
          projectId: input.projectId,
          kanbanOrder: { not: null }
        },
        orderBy: { kanbanOrder: 'desc' },
        select: { kanbanOrder: true }
      });

      const startingOrder = maxOrder?.kanbanOrder ? maxOrder.kanbanOrder + 1 : 1;

      // Update each action with a kanban order
      const updates = actionsWithoutOrder.map(async (action: any, index: number) => {
        // Set default kanban status if not set
        const kanbanStatus = action.kanbanStatus || "TODO";
        
        return ctx.db.action.update({
          where: { id: action.id },
          data: {
            kanbanStatus,
            kanbanOrder: startingOrder + index,
          },
        });
      });

      await Promise.all(updates);

      return { 
        message: `Initialized kanban orders for ${actionsWithoutOrder.length} actions`,
        updated: actionsWithoutOrder.length 
      };
    }),

  // Get actions completed today
  getCompletedToday: protectedProcedure
    .query(async ({ ctx }) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      return ctx.db.action.findMany({
        where: {
          createdById: ctx.session.user.id,
          completedAt: {
            gte: today,
            lt: tomorrow,
          },
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          completedAt: 'desc',
        },
      });
    }),

  // Get recent completed actions with date range
  getRecentCompleted: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(90).default(7), // Default to last 7 days, max 90
    }))
    .query(async ({ ctx, input }) => {
      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.days);
      startDate.setHours(0, 0, 0, 0);

      return ctx.db.action.findMany({
        where: {
          createdById: ctx.session.user.id,
          completedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          completedAt: 'desc',
        },
      });
    }),

  // Quick create action via API key (for iOS shortcuts, external integrations)
  // Supports natural language date parsing (e.g., "Call John tomorrow")
  quickCreate: apiKeyMiddleware
    .input(
      z.object({
        name: z.string().min(1),
        projectId: z.string().optional(),
        priority: z.enum(PRIORITY_VALUES).default("Quick"),
        source: z.string().default("ios-shortcut"),
        parseNaturalLanguage: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;

      // Verify user exists
      const user = await ctx.db.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Parse natural language input using shared helper
      const parsed = await parseActionInput(input.name, userId, ctx.db, {
        projectId: input.projectId,
        parseNaturalLanguage: input.parseNaturalLanguage,
      });

      // If explicit projectId provided, verify it belongs to the user
      if (input.projectId) {
        const project = await ctx.db.project.findFirst({
          where: {
            id: input.projectId,
            createdById: userId,
          },
        });

        if (!project) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Project not found or does not belong to user",
          });
        }
      }

      // Calculate kanban order if this is a project action
      let kanbanOrder: number | null = null;
      if (parsed.projectId) {
        const maxOrderAction = await ctx.db.action.findFirst({
          where: {
            projectId: parsed.projectId,
            kanbanOrder: { not: null },
          },
          orderBy: { kanbanOrder: "desc" },
          select: { kanbanOrder: true },
        });
        kanbanOrder = (maxOrderAction?.kanbanOrder ?? 0) + 1;
      }

      // Create the action
      const action = await ctx.db.action.create({
        data: {
          name: parsed.name,
          projectId: parsed.projectId,
          priority: input.priority,
          status: "ACTIVE",
          createdById: userId,
          scheduledStart: parsed.scheduledStart,
          dueDate: parsed.dueDate,
          source: input.source,
          kanbanStatus: parsed.projectId ? "TODO" : null,
          kanbanOrder,
        },
        select: {
          id: true,
          name: true,
          priority: true,
          status: true,
          dueDate: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return {
        success: true,
        message: "✅ Added to Exponential",
        title: action.name,
        url: `https://exponential.im/actions?actionId=${action.id}`,
        action,
        parsing: parsed.parsingMetadata,
      };
    }),

  // Search actions for dependency picker
  searchForDependencies: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        workspaceId: z.string().optional(),
        excludeId: z.string().optional(),
        limit: z.number().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.action.findMany({
        where: {
          name: { contains: input.query, mode: "insensitive" },
          status: { not: "COMPLETED" },
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
          ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
          createdById: ctx.session.user.id,
        },
        take: input.limit,
        select: {
          id: true,
          name: true,
          status: true,
          kanbanStatus: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
      });
    }),

  // Save a screenshot and associate it with an action
  saveScreenshot: apiKeyMiddleware
    .input(
      z.object({
        actionId: z.string(),
        screenshot: z.string(),
        timestamp: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const filename = `screenshots/actions/${input.actionId}/${input.timestamp.replace(/[/:]/g, "-")}.png`;
        const blob = await uploadToBlob(input.screenshot, filename);

        const screenshot = await ctx.db.screenshot.create({
          data: {
            url: blob.url,
            timestamp: input.timestamp,
          },
        });

        await ctx.db.actionScreenshot.create({
          data: {
            actionId: input.actionId,
            screenshotId: screenshot.id,
          },
        });

        return { success: true, url: blob.url };
      } catch (error) {
        console.error("Error saving action screenshot:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save screenshot",
        });
      }
    }),
}); 