import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { DEFAULT_VIEW_CONFIG } from "~/types/view";
import type { ViewFilters } from "~/types/view";
import type { Prisma } from "@prisma/client";

const kanbanStatusSchema = z.enum([
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELLED",
]);

const viewFiltersSchema = z.object({
  projectIds: z.array(z.string()).optional(),
  statuses: z.array(kanbanStatusSchema).optional(),
  priorities: z.array(z.string()).optional(),
  assigneeIds: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional(),
  includeCompleted: z.boolean().optional(),
});

const sortConfigSchema = z.object({
  field: z.enum(["name", "dueDate", "priority", "createdAt", "kanbanOrder"]),
  direction: z.enum(["asc", "desc"]),
});

const viewTypeSchema = z.enum(["KANBAN", "LIST"]);
const groupBySchema = z.enum(["STATUS", "PROJECT", "ASSIGNEE", "PRIORITY"]);

export const viewRouter = createTRPCRouter({
  // List all views for a workspace
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify workspace membership
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
          message: "You must be a member of this workspace",
        });
      }

      return ctx.db.view.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: [
          { isDefault: "desc" },
          { displayOrder: "asc" },
          { name: "asc" },
        ],
        include: {
          createdBy: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      });
    }),

  // Get the default view for a workspace (virtual if not persisted)
  getDefault: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Try to find existing system default view
      const systemView = await ctx.db.view.findFirst({
        where: {
          workspaceId: input.workspaceId,
          isSystem: true,
          isDefault: true,
        },
      });

      if (systemView) {
        return {
          ...systemView,
          isVirtual: false as const,
        };
      }

      // Return virtual default (not persisted)
      return {
        ...DEFAULT_VIEW_CONFIG,
        workspaceId: input.workspaceId,
      };
    }),

  // Get a single view by slug
  getBySlug: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        slug: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Handle virtual default view
      if (input.slug === "all-items") {
        const systemView = await ctx.db.view.findFirst({
          where: {
            workspaceId: input.workspaceId,
            isSystem: true,
            isDefault: true,
          },
        });

        if (systemView) {
          return {
            ...systemView,
            isVirtual: false as const,
          };
        }

        return {
          ...DEFAULT_VIEW_CONFIG,
          workspaceId: input.workspaceId,
        };
      }

      const view = await ctx.db.view.findUnique({
        where: {
          workspaceId_slug: {
            workspaceId: input.workspaceId,
            slug: input.slug,
          },
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      });

      if (!view) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "View not found",
        });
      }

      return {
        ...view,
        isVirtual: false as const,
      };
    }),

  // Create a new view
  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(100),
        slug: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
        description: z.string().max(500).optional(),
        viewType: viewTypeSchema.default("KANBAN"),
        groupBy: groupBySchema.default("STATUS"),
        filters: viewFiltersSchema.optional(),
        sortConfig: sortConfigSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify workspace membership
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
          message: "You must be a member of this workspace to create views",
        });
      }

      // Check slug uniqueness
      const existing = await ctx.db.view.findUnique({
        where: {
          workspaceId_slug: {
            workspaceId: input.workspaceId,
            slug: input.slug,
          },
        },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A view with this slug already exists in this workspace",
        });
      }

      return ctx.db.view.create({
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          viewType: input.viewType,
          groupBy: input.groupBy,
          filters: (input.filters ?? {}) as Prisma.InputJsonValue,
          sortConfig: (input.sortConfig ?? {
            field: "kanbanOrder",
            direction: "asc",
          }) as Prisma.InputJsonValue,
          workspaceId: input.workspaceId,
          createdById: ctx.session.user.id,
        },
      });
    }),

  // Update a view
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        viewType: viewTypeSchema.optional(),
        groupBy: groupBySchema.optional(),
        filters: viewFiltersSchema.optional(),
        sortConfig: sortConfigSchema.optional(),
        displayOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Get view and verify it exists
      const view = await ctx.db.view.findUnique({
        where: { id },
      });

      if (!view) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "View not found",
        });
      }

      // Verify user is a workspace member
      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: view.workspaceId,
          },
        },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this workspace to update views",
        });
      }

      return ctx.db.view.update({
        where: { id },
        data: {
          ...updateData,
          filters: updateData.filters
            ? (updateData.filters as Prisma.InputJsonValue)
            : undefined,
          sortConfig: updateData.sortConfig
            ? (updateData.sortConfig as Prisma.InputJsonValue)
            : undefined,
        },
      });
    }),

  // Delete a view
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const view = await ctx.db.view.findUnique({
        where: { id: input.id },
      });

      if (!view) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "View not found",
        });
      }

      if (view.isSystem) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "System views cannot be deleted",
        });
      }

      // Verify user is a workspace member with sufficient permissions
      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: view.workspaceId,
          },
        },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this workspace to delete views",
        });
      }

      // Only owners, admins, or the creator can delete
      const canDelete =
        member.role === "owner" ||
        member.role === "admin" ||
        view.createdById === ctx.session.user.id;

      if (!canDelete) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to delete this view",
        });
      }

      await ctx.db.view.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  // Get actions for a view (applies filters)
  getViewActions: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        viewId: z.string().optional(),
        filters: viewFiltersSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify workspace membership
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
          message: "You must be a member of this workspace",
        });
      }

      let filters: ViewFilters = input.filters ?? {};

      // If viewId provided and not virtual, get filters from the view
      if (input.viewId && input.viewId !== "default-virtual") {
        const view = await ctx.db.view.findUnique({
          where: { id: input.viewId },
        });
        if (view) {
          filters = view.filters as ViewFilters;
        }
      }

      // Build where clause
      const whereClause: Prisma.ActionWhereInput = {
        status: { not: "DELETED" },
        // Actions must be in this workspace (via project or directly)
        OR: [
          { project: { workspaceId: input.workspaceId } },
          { workspaceId: input.workspaceId },
        ],
      };

      // Filter by projects
      if (filters.projectIds?.length) {
        whereClause.projectId = { in: filters.projectIds };
      }

      // Filter by kanban statuses
      if (filters.statuses?.length) {
        whereClause.kanbanStatus = { in: filters.statuses };
      }

      // Filter by priorities
      if (filters.priorities?.length) {
        whereClause.priority = { in: filters.priorities };
      }

      // Filter by assignees
      if (filters.assigneeIds?.length) {
        whereClause.assignees = {
          some: { userId: { in: filters.assigneeIds } },
        };
      }

      // Filter by tags
      if (filters.tagIds?.length) {
        whereClause.tags = {
          some: { tagId: { in: filters.tagIds } },
        };
      }

      // Exclude completed unless explicitly included
      if (!filters.includeCompleted) {
        whereClause.kanbanStatus = {
          ...((whereClause.kanbanStatus as Prisma.EnumActionStatusNullableFilter) ?? {}),
          notIn: ["DONE", "CANCELLED"],
        };
      }

      return ctx.db.action.findMany({
        where: whereClause,
        include: {
          project: { select: { id: true, name: true, slug: true } },
          assignees: {
            include: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
          tags: { include: { tag: true } },
          createdBy: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: [
          { kanbanOrder: { sort: "asc", nulls: "last" } },
          { priority: "asc" },
          { dueDate: "asc" },
        ],
      });
    }),

  // Update kanban status for an action (workspace-level, doesn't require projectId)
  updateKanbanStatus: protectedProcedure
    .input(
      z.object({
        actionId: z.string(),
        kanbanStatus: kanbanStatusSchema,
        kanbanOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const action = await ctx.db.action.findUnique({
        where: { id: input.actionId },
        select: {
          id: true,
          createdById: true,
          workspaceId: true,
          project: { select: { workspaceId: true } },
        },
      });

      if (!action) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Action not found",
        });
      }

      // Verify user has permission (creator, assignee, or workspace member)
      const workspaceId = action.workspaceId ?? action.project?.workspaceId;

      if (workspaceId) {
        const member = await ctx.db.workspaceUser.findUnique({
          where: {
            userId_workspaceId: {
              userId: ctx.session.user.id,
              workspaceId,
            },
          },
        });

        if (!member) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You must be a member of the workspace to update this action",
          });
        }
      } else if (action.createdById !== ctx.session.user.id) {
        // No workspace context, must be the creator
        const isAssignee = await ctx.db.actionAssignee.findFirst({
          where: {
            actionId: input.actionId,
            userId: ctx.session.user.id,
          },
        });

        if (!isAssignee) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to update this action",
          });
        }
      }

      return ctx.db.action.update({
        where: { id: input.actionId },
        data: {
          kanbanStatus: input.kanbanStatus,
          kanbanOrder: input.kanbanOrder,
          // Auto-set completedAt when marking as DONE
          completedAt:
            input.kanbanStatus === "DONE" ? new Date() : undefined,
        },
        include: {
          project: { select: { id: true, name: true, slug: true } },
          assignees: {
            include: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
          tags: { include: { tag: true } },
        },
      });
    }),
});
