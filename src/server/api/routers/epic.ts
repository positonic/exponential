import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { getWorkspaceMembership } from "~/server/services/access";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";

const epicStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]);
const epicPrioritySchema = z.enum(["HIGH", "MEDIUM", "LOW", "NONE"]);

/**
 * Ensure the caller is a member of the workspace (directly or via a team).
 * Throws FORBIDDEN otherwise.
 */
async function assertWorkspaceMember(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
) {
  const membership = await getWorkspaceMembership(db, userId, workspaceId);
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You must be a member of this workspace",
    });
  }
  return membership;
}

export const epicRouter = createTRPCRouter({
  // List all epics for a workspace
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        status: epicStatusSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertWorkspaceMember(ctx.db, ctx.session.user.id, input.workspaceId);

      return ctx.db.epic.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        include: {
          owner: {
            select: { id: true, name: true, email: true, image: true },
          },
          _count: { select: { actions: true, tickets: true } },
        },
      });
    }),

  // Get a single epic by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const epic = await ctx.db.epic.findUnique({
        where: { id: input.id },
        include: {
          owner: {
            select: { id: true, name: true, email: true, image: true },
          },
          actions: {
            select: {
              id: true,
              name: true,
              status: true,
              kanbanStatus: true,
              priority: true,
              effortEstimate: true,
              assignees: {
                include: {
                  user: {
                    select: { id: true, name: true, image: true },
                  },
                },
              },
            },
          },
          _count: { select: { actions: true } },
        },
      });

      if (!epic) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Epic not found",
        });
      }

      await assertWorkspaceMember(ctx.db, ctx.session.user.id, epic.workspaceId);

      return epic;
    }),

  // Create a new epic
  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: boundedText("Name", TEXT_LIMITS.LABEL, { min: 1 }),
        description: boundedText("Description", TEXT_LIMITS.LARGE).optional(),
        priority: epicPrioritySchema.default("MEDIUM"),
        startDate: z.date().optional(),
        targetDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspaceMember(ctx.db, ctx.session.user.id, input.workspaceId);

      return ctx.db.epic.create({
        data: {
          name: input.name,
          description: input.description,
          priority: input.priority,
          startDate: input.startDate,
          targetDate: input.targetDate,
          workspaceId: input.workspaceId,
          ownerId: ctx.session.user.id,
        },
      });
    }),

  // Update an epic
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: boundedText("Name", TEXT_LIMITS.LABEL, { min: 1 }).optional(),
        description: boundedText("Description", TEXT_LIMITS.LARGE).nullable().optional(),
        status: epicStatusSchema.optional(),
        priority: epicPrioritySchema.optional(),
        startDate: z.date().nullable().optional(),
        targetDate: z.date().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const epic = await ctx.db.epic.findUnique({
        where: { id },
      });

      if (!epic) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Epic not found",
        });
      }

      await assertWorkspaceMember(ctx.db, ctx.session.user.id, epic.workspaceId);

      return ctx.db.epic.update({
        where: { id },
        data: updateData,
      });
    }),

  // Delete an epic
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const epic = await ctx.db.epic.findUnique({
        where: { id: input.id },
      });

      if (!epic) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Epic not found",
        });
      }

      const member = await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        epic.workspaceId,
      );

      const canDelete =
        member.role === "owner" ||
        member.role === "admin" ||
        epic.ownerId === ctx.session.user.id;

      if (!canDelete) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to delete this epic",
        });
      }

      await ctx.db.epic.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});
