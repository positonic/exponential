import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { TAG_COLORS } from "~/types/tag";

const tagColorSchema = z.enum(TAG_COLORS);

export const tagRouter = createTRPCRouter({
  // List all tags available for a workspace (global + workspace-specific)
  list: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      // Get global tags (system tags + user-created global tags)
      const globalTags = await ctx.db.tag.findMany({
        where: {
          workspaceId: null,
        },
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      });

      // Get workspace-specific tags if workspaceId provided
      let workspaceTags: typeof globalTags = [];
      if (input?.workspaceId) {
        workspaceTags = await ctx.db.tag.findMany({
          where: {
            workspaceId: input.workspaceId,
          },
          include: {
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { name: "asc" },
        });
      }

      return {
        globalTags,
        workspaceTags,
        allTags: [...globalTags, ...workspaceTags],
      };
    }),

  // Get a single tag by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const tag = await ctx.db.tag.findUnique({
        where: { id: input.id },
        include: {
          workspace: { select: { id: true, name: true, slug: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { actions: true } },
        },
      });

      if (!tag) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tag not found",
        });
      }

      return tag;
    }),

  // Create a new tag (workspace-specific only, users cannot create global tags)
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        color: tagColorSchema,
        description: z.string().max(200).optional(),
        workspaceId: z.string(), // Required - users create workspace-specific tags
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user is a member of the workspace
      const membership = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: {
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        },
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be a member of the workspace to create tags",
        });
      }

      // Generate slug from name
      const slug = input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // Check if slug already exists in this workspace
      const existingTag = await ctx.db.tag.findFirst({
        where: {
          slug,
          workspaceId: input.workspaceId,
        },
      });

      if (existingTag) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A tag with this name already exists in this workspace",
        });
      }

      return ctx.db.tag.create({
        data: {
          name: input.name,
          slug,
          color: input.color,
          description: input.description,
          workspaceId: input.workspaceId,
          createdById: ctx.session.user.id,
          isSystem: false,
        },
      });
    }),

  // Update a tag
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50).optional(),
        color: tagColorSchema.optional(),
        description: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tag = await ctx.db.tag.findUnique({
        where: { id: input.id },
      });

      if (!tag) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tag not found",
        });
      }

      // System tags cannot be modified (except by admins, potentially)
      if (tag.isSystem) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "System tags cannot be modified",
        });
      }

      // Verify user has permission (workspace member)
      if (tag.workspaceId) {
        const membership = await ctx.db.workspaceUser.findUnique({
          where: {
            userId_workspaceId: {
              userId: ctx.session.user.id,
              workspaceId: tag.workspaceId,
            },
          },
        });

        if (!membership) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You must be a member of the workspace to update tags",
          });
        }
      }

      // If name is changing, update slug and check for conflicts
      let slug = tag.slug;
      if (input.name && input.name !== tag.name) {
        slug = input.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        const existingTag = await ctx.db.tag.findFirst({
          where: {
            slug,
            workspaceId: tag.workspaceId,
            id: { not: input.id },
          },
        });

        if (existingTag) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A tag with this name already exists",
          });
        }
      }

      return ctx.db.tag.update({
        where: { id: input.id },
        data: {
          name: input.name,
          slug: input.name ? slug : undefined,
          color: input.color,
          description: input.description,
        },
      });
    }),

  // Delete a tag
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tag = await ctx.db.tag.findUnique({
        where: { id: input.id },
      });

      if (!tag) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tag not found",
        });
      }

      // System tags cannot be deleted
      if (tag.isSystem) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "System tags cannot be deleted",
        });
      }

      // Verify user has permission (workspace admin/owner for workspace tags)
      if (tag.workspaceId) {
        const membership = await ctx.db.workspaceUser.findUnique({
          where: {
            userId_workspaceId: {
              userId: ctx.session.user.id,
              workspaceId: tag.workspaceId,
            },
          },
        });

        if (
          !membership ||
          (membership.role !== "owner" && membership.role !== "admin")
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only workspace owners and admins can delete tags",
          });
        }
      }

      // Delete the tag (cascade will remove ActionTag entries)
      await ctx.db.tag.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  // Add tags to an action
  addToAction: protectedProcedure
    .input(
      z.object({
        actionId: z.string(),
        tagIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify action exists and user has permission
      const action = await ctx.db.action.findUnique({
        where: { id: input.actionId },
        select: { id: true, createdById: true, workspaceId: true },
      });

      if (!action) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Action not found",
        });
      }

      // Check if user is the creator or an assignee
      const isCreator = action.createdById === ctx.session.user.id;
      const isAssignee = await ctx.db.actionAssignee.findFirst({
        where: {
          actionId: input.actionId,
          userId: ctx.session.user.id,
        },
      });

      if (!isCreator && !isAssignee) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to tag this action",
        });
      }

      // Create tag associations (skip duplicates)
      await ctx.db.actionTag.createMany({
        data: input.tagIds.map((tagId) => ({
          actionId: input.actionId,
          tagId,
        })),
        skipDuplicates: true,
      });

      // Return updated action with tags
      return ctx.db.action.findUnique({
        where: { id: input.actionId },
        include: {
          tags: {
            include: { tag: true },
          },
        },
      });
    }),

  // Remove tags from an action
  removeFromAction: protectedProcedure
    .input(
      z.object({
        actionId: z.string(),
        tagIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify action exists and user has permission
      const action = await ctx.db.action.findUnique({
        where: { id: input.actionId },
        select: { id: true, createdById: true },
      });

      if (!action) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Action not found",
        });
      }

      // Check if user is the creator or an assignee
      const isCreator = action.createdById === ctx.session.user.id;
      const isAssignee = await ctx.db.actionAssignee.findFirst({
        where: {
          actionId: input.actionId,
          userId: ctx.session.user.id,
        },
      });

      if (!isCreator && !isAssignee) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to untag this action",
        });
      }

      // Remove tag associations
      await ctx.db.actionTag.deleteMany({
        where: {
          actionId: input.actionId,
          tagId: { in: input.tagIds },
        },
      });

      // Return updated action with tags
      return ctx.db.action.findUnique({
        where: { id: input.actionId },
        include: {
          tags: {
            include: { tag: true },
          },
        },
      });
    }),

  // Set tags for an action (replace all)
  setActionTags: protectedProcedure
    .input(
      z.object({
        actionId: z.string(),
        tagIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify action exists and user has permission
      const action = await ctx.db.action.findUnique({
        where: { id: input.actionId },
        select: { id: true, createdById: true },
      });

      if (!action) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Action not found",
        });
      }

      // Check if user is the creator or an assignee
      const isCreator = action.createdById === ctx.session.user.id;
      const isAssignee = await ctx.db.actionAssignee.findFirst({
        where: {
          actionId: input.actionId,
          userId: ctx.session.user.id,
        },
      });

      if (!isCreator && !isAssignee) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to tag this action",
        });
      }

      // Transaction: delete all existing tags, then create new ones
      await ctx.db.$transaction([
        ctx.db.actionTag.deleteMany({
          where: { actionId: input.actionId },
        }),
        ctx.db.actionTag.createMany({
          data: input.tagIds.map((tagId) => ({
            actionId: input.actionId,
            tagId,
          })),
        }),
      ]);

      // Return updated action with tags
      return ctx.db.action.findUnique({
        where: { id: input.actionId },
        include: {
          tags: {
            include: { tag: true },
          },
        },
      });
    }),

  // Get actions by tag
  getActionsByTag: protectedProcedure
    .input(
      z.object({
        tagId: z.string(),
        workspaceId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.action.findMany({
        where: {
          createdById: ctx.session.user.id,
          tags: {
            some: { tagId: input.tagId },
          },
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        },
        include: {
          project: { select: { id: true, name: true } },
          tags: { include: { tag: true } },
          assignees: {
            include: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
        },
        orderBy: { dueDate: "asc" },
      });
    }),
});
