import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

const listTypeSchema = z.enum(["SPRINT", "BACKLOG", "CUSTOM"]);
const listStatusSchema = z.enum(["PLANNED", "ACTIVE", "COMPLETED", "ARCHIVED"]);

export const listRouter = createTRPCRouter({
  // List all lists for a workspace
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        status: listStatusSchema.optional(),
      })
    )
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
          message: "You must be a member of this workspace",
        });
      }

      return ctx.db.list.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        include: {
          createdBy: {
            select: { id: true, name: true, email: true, image: true },
          },
          _count: { select: { actions: true } },
        },
      });
    }),

  // Get a single list by slug
  getBySlug: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        slug: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const list = await ctx.db.list.findUnique({
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
          _count: { select: { actions: true } },
        },
      });

      if (!list) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "List not found",
        });
      }

      return list;
    }),

  // Create a new list
  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(100),
        slug: z
          .string()
          .min(1)
          .max(100)
          .regex(
            /^[a-z0-9-]+$/,
            "Slug must be lowercase alphanumeric with hyphens"
          ),
        description: z.string().max(500).optional(),
        listType: listTypeSchema.default("CUSTOM"),
        status: listStatusSchema.default("ACTIVE"),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
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

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this workspace to create lists",
        });
      }

      const existing = await ctx.db.list.findUnique({
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
          message: "A list with this slug already exists in this workspace",
        });
      }

      return ctx.db.list.create({
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          listType: input.listType,
          status: input.status,
          startDate: input.startDate,
          endDate: input.endDate,
          workspaceId: input.workspaceId,
          createdById: ctx.session.user.id,
        },
      });
    }),

  // Update a list
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        listType: listTypeSchema.optional(),
        status: listStatusSchema.optional(),
        startDate: z.date().nullable().optional(),
        endDate: z.date().nullable().optional(),
        displayOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const list = await ctx.db.list.findUnique({
        where: { id },
      });

      if (!list) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "List not found",
        });
      }

      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: list.workspaceId,
          },
        },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this workspace to update lists",
        });
      }

      return ctx.db.list.update({
        where: { id },
        data: updateData,
      });
    }),

  // Delete a list
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const list = await ctx.db.list.findUnique({
        where: { id: input.id },
      });

      if (!list) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "List not found",
        });
      }

      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: list.workspaceId,
          },
        },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this workspace to delete lists",
        });
      }

      const canDelete =
        member.role === "owner" ||
        member.role === "admin" ||
        list.createdById === ctx.session.user.id;

      if (!canDelete) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to delete this list",
        });
      }

      await ctx.db.list.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  // Add an action to a list
  addAction: protectedProcedure
    .input(
      z.object({
        listId: z.string(),
        actionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const list = await ctx.db.list.findUnique({
        where: { id: input.listId },
      });

      if (!list) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "List not found",
        });
      }

      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: list.workspaceId,
          },
        },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this workspace",
        });
      }

      return ctx.db.actionList.create({
        data: {
          actionId: input.actionId,
          listId: input.listId,
        },
      });
    }),

  // Remove an action from a list
  removeAction: protectedProcedure
    .input(
      z.object({
        listId: z.string(),
        actionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const list = await ctx.db.list.findUnique({
        where: { id: input.listId },
      });

      if (!list) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "List not found",
        });
      }

      const member = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: list.workspaceId,
          },
        },
      });

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of this workspace",
        });
      }

      await ctx.db.actionList.delete({
        where: {
          actionId_listId: {
            actionId: input.actionId,
            listId: input.listId,
          },
        },
      });

      return { success: true };
    }),
});
