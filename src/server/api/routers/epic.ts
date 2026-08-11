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

/**
 * An epic belongs to a product, and that product must live in the epic's own
 * workspace — otherwise the product's name and slug leak back through the
 * `product` include on `getById`, the same sideways read the 2026-08-04 epic
 * audit closed for the epic itself.
 *
 * NOT_FOUND rather than FORBIDDEN so the error does not confirm the id exists
 * in some other workspace.
 */
async function assertProductInWorkspace(
  db: PrismaClient,
  productId: string,
  workspaceId: string,
) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { workspaceId: true },
  });

  if (!product || product.workspaceId !== workspaceId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Product not found in this workspace",
    });
  }
}

export const epicRouter = createTRPCRouter({
  // List all epics for a workspace
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        status: epicStatusSchema.optional(),
        /**
         * Scope to one product. Omit for the workspace-wide list (the action
         * side, which has no product context — an Action has no product).
         */
        productId: z.string().optional(),
        /**
         * Backfill window: epics created before `Epic.productId` existed have
         * none, and would be invisible — and therefore unassignable — from
         * every product board. Including them is what lets a user open one and
         * give it a product. Drops to a no-op once the backfill is done.
         */
        includeUnassigned: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertWorkspaceMember(ctx.db, ctx.session.user.id, input.workspaceId);

      return ctx.db.epic.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.status ? { status: input.status } : {}),
          ...(input.productId
            ? {
                OR: [
                  { productId: input.productId },
                  ...(input.includeUnassigned ? [{ productId: null }] : []),
                ],
              }
            : {}),
        },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        include: {
          owner: {
            select: { id: true, name: true, email: true, image: true },
          },
          product: { select: { id: true, name: true, slug: true } },
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
          product: { select: { id: true, name: true, slug: true } },
          // The detail page canonicalises its own URL, which needs the epic's
          // workspace slug — membership is checked against the epic's
          // workspace, not the one in the address bar, so the two can differ.
          workspace: { select: { id: true, slug: true } },
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
          // The detail page's main column. `product` comes back per ticket
          // because a pre-backfill epic can still hold tickets from more than
          // one product, and the page has to be able to say so rather than
          // render them as if they all belonged here.
          tickets: {
            select: {
              id: true,
              number: true,
              shortId: true,
              title: true,
              status: true,
              priority: true,
              type: true,
              product: { select: { id: true, slug: true, name: true, funTicketIds: true } },
              assignee: { select: { id: true, name: true, image: true } },
            },
            orderBy: [{ status: "asc" }, { number: "asc" }],
          },
          _count: { select: { actions: true, tickets: true } },
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
        productId: z.string(),
        name: boundedText("Name", TEXT_LIMITS.LABEL, { min: 1 }),
        description: boundedText("Description", TEXT_LIMITS.LARGE).optional(),
        priority: epicPrioritySchema.default("MEDIUM"),
        startDate: z.date().optional(),
        targetDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspaceMember(ctx.db, ctx.session.user.id, input.workspaceId);
      await assertProductInWorkspace(ctx.db, input.productId, input.workspaceId);

      return ctx.db.epic.create({
        data: {
          name: input.name,
          description: input.description,
          priority: input.priority,
          startDate: input.startDate,
          targetDate: input.targetDate,
          workspaceId: input.workspaceId,
          productId: input.productId,
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
        /**
         * Moving an epic between products is allowed — it is how a pre-backfill
         * epic gets its first product. Tickets are not moved with it; ones left
         * in another product show up as foreign on the detail page.
         */
        productId: z.string().optional(),
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

      if (updateData.productId) {
        await assertProductInWorkspace(
          ctx.db,
          updateData.productId,
          epic.workspaceId,
        );
      }

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
