import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { assertWorkspaceMember } from "./product";
import type { PrismaClient } from "@prisma/client";

/**
 * Cycles are thin wrappers around the existing `List` model with
 * `listType = SPRINT`. This router exposes only the fields Product
 * plugin cares about (dates, goal, achievements, ticket count).
 */

async function loadCycleWithAccess(
  db: PrismaClient,
  userId: string,
  cycleId: string,
) {
  const cycle = await db.list.findUnique({
    where: { id: cycleId },
    select: { id: true, workspaceId: true, listType: true },
  });
  if (!cycle) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Cycle not found" });
  }
  if (cycle.listType !== "SPRINT") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "List is not a cycle (listType must be SPRINT)",
    });
  }
  await assertWorkspaceMember(db, userId, cycle.workspaceId);
  return cycle;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export const cycleRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        status: z.enum(["PLANNED", "ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
      );

      return ctx.db.list.findMany({
        where: {
          workspaceId: input.workspaceId,
          listType: "SPRINT",
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        include: {
          _count: { select: { tickets: true, retrospectives: true } },
        },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const cycle = await ctx.db.list.findUnique({
        where: { id: input.id },
        include: {
          tickets: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              title: true,
              status: true,
              type: true,
              points: true,
              assignee: { select: { id: true, name: true, image: true } },
            },
          },
          retrospectives: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              title: true,
              conductedAt: true,
              createdAt: true,
            },
          },
          metrics: true,
        },
      });
      if (!cycle || cycle.listType !== "SPRINT") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cycle not found" });
      }
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        cycle.workspaceId,
      );
      return cycle;
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(120),
        slug: z.string().max(60).optional(),
        description: z.string().max(2000).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        cycleGoal: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
      );

      const baseSlug = input.slug ?? slugify(input.name);
      let slug = baseSlug;
      let counter = 1;
      // Ensure uniqueness within workspace
      while (
        await ctx.db.list.findUnique({
          where: {
            workspaceId_slug: { workspaceId: input.workspaceId, slug },
          },
          select: { id: true },
        })
      ) {
        counter += 1;
        slug = `${baseSlug}-${counter}`;
      }

      return ctx.db.list.create({
        data: {
          workspaceId: input.workspaceId,
          createdById: ctx.session.user.id,
          name: input.name,
          slug,
          description: input.description,
          listType: "SPRINT",
          status: "PLANNED",
          startDate: input.startDate,
          endDate: input.endDate,
          cycleGoal: input.cycleGoal,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(2000).nullable().optional(),
        startDate: z.date().nullable().optional(),
        endDate: z.date().nullable().optional(),
        status: z
          .enum(["PLANNED", "ACTIVE", "COMPLETED", "ARCHIVED"])
          .optional(),
        cycleGoal: z.string().max(2000).nullable().optional(),
        achievements: z.string().max(5000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadCycleWithAccess(ctx.db, ctx.session.user.id, input.id);
      const { id, ...data } = input;
      return ctx.db.list.update({
        where: { id },
        data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadCycleWithAccess(ctx.db, ctx.session.user.id, input.id);
      await ctx.db.list.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
