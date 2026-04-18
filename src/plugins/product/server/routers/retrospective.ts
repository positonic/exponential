import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { assertWorkspaceMember } from "./product";
import type { PrismaClient } from "@prisma/client";

async function loadRetroWithAccess(
  db: PrismaClient,
  userId: string,
  retroId: string,
) {
  const retro = await db.retrospective.findUnique({
    where: { id: retroId },
    select: { id: true, workspaceId: true },
  });
  if (!retro) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Retrospective not found",
    });
  }
  await assertWorkspaceMember(db, userId, retro.workspaceId);
  return retro;
}

export const retrospectiveRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        productId: z.string().optional(),
        cycleId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
      );

      return ctx.db.retrospective.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.productId ? { productId: input.productId } : {}),
          ...(input.cycleId ? { cycleId: input.cycleId } : {}),
        },
        orderBy: [{ conductedAt: "desc" }, { createdAt: "desc" }],
        include: {
          product: { select: { id: true, name: true, slug: true } },
          cycle: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, image: true } },
        },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const retro = await ctx.db.retrospective.findUnique({
        where: { id: input.id },
        include: {
          product: { select: { id: true, slug: true, name: true } },
          cycle: {
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
            },
          },
          createdBy: { select: { id: true, name: true, image: true } },
        },
      });
      if (!retro) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Retrospective not found",
        });
      }
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        retro.workspaceId,
      );
      return retro;
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        productId: z.string().optional(),
        cycleId: z.string().optional(),
        title: z.string().min(1).max(300),
        coversFromDate: z.date().optional(),
        coversToDate: z.date().optional(),
        conductedAt: z.date().optional(),
        participants: z.string().max(2000).optional(),
        wentWell: z.string().max(20000).optional(),
        wentPoorly: z.string().max(20000).optional(),
        actionItems: z.string().max(20000).optional(),
        notes: z.string().max(20000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
      );

      // Validate product belongs to workspace if provided
      if (input.productId) {
        const product = await ctx.db.product.findUnique({
          where: { id: input.productId },
          select: { workspaceId: true },
        });
        if (!product || product.workspaceId !== input.workspaceId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Product does not belong to this workspace",
          });
        }
      }

      // Validate cycle belongs to workspace if provided
      if (input.cycleId) {
        const cycle = await ctx.db.list.findUnique({
          where: { id: input.cycleId },
          select: { workspaceId: true, listType: true },
        });
        if (
          !cycle ||
          cycle.workspaceId !== input.workspaceId ||
          cycle.listType !== "SPRINT"
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cycle does not belong to this workspace",
          });
        }
      }

      return ctx.db.retrospective.create({
        data: {
          workspaceId: input.workspaceId,
          productId: input.productId,
          cycleId: input.cycleId,
          title: input.title,
          coversFromDate: input.coversFromDate,
          coversToDate: input.coversToDate,
          conductedAt: input.conductedAt,
          participants: input.participants,
          wentWell: input.wentWell,
          wentPoorly: input.wentPoorly,
          actionItems: input.actionItems,
          notes: input.notes,
          createdById: ctx.session.user.id,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(300).optional(),
        productId: z.string().nullable().optional(),
        cycleId: z.string().nullable().optional(),
        coversFromDate: z.date().nullable().optional(),
        coversToDate: z.date().nullable().optional(),
        conductedAt: z.date().nullable().optional(),
        participants: z.string().max(2000).nullable().optional(),
        wentWell: z.string().max(20000).nullable().optional(),
        wentPoorly: z.string().max(20000).nullable().optional(),
        actionItems: z.string().max(20000).nullable().optional(),
        notes: z.string().max(20000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const retro = await loadRetroWithAccess(ctx.db, ctx.session.user.id, input.id);

      if (input.productId) {
        const product = await ctx.db.product.findUnique({
          where: { id: input.productId },
          select: { workspaceId: true },
        });
        if (!product || product.workspaceId !== retro.workspaceId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Product does not belong to this workspace",
          });
        }
      }

      if (input.cycleId) {
        const cycle = await ctx.db.list.findUnique({
          where: { id: input.cycleId },
          select: { workspaceId: true, listType: true },
        });
        if (!cycle || cycle.workspaceId !== retro.workspaceId || cycle.listType !== "SPRINT") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cycle does not belong to this workspace",
          });
        }
      }

      const { id, ...data } = input;
      return ctx.db.retrospective.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadRetroWithAccess(ctx.db, ctx.session.user.id, input.id);
      await ctx.db.retrospective.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
