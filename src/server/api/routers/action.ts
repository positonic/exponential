import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { PRIORITY_VALUES, type Priority } from "~/types/priority";

export const actionRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    console.log("in getAll")
    return ctx.db.action.findMany({
      where: {
        createdById: ctx.session.user.id,
      },
      include: {
        project: true,
      },
      orderBy: {
        project: {
          priority: "asc",
        },
      },
    });
  }),

  getProjectActions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.action.findMany({
        where: {
          createdById: ctx.session.user.id,
          projectId: input.projectId,
        },
        include: {
          project: true,
        },
        orderBy: [
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
        dueDate: z.date().optional(),
        priority: z.enum(PRIORITY_VALUES).default("Quick"),
        status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).default("ACTIVE"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.action.create({
        data: {
          ...input,
          createdById: ctx.session.user.id,
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
        dueDate: z.date().optional(),
        priority: z.enum(PRIORITY_VALUES).optional(),
        status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;
      return ctx.db.action.update({
        where: { id },
        data: updateData,
      });
    }),

  getToday: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return ctx.db.action.findMany({
      where: {
        createdById: ctx.session.user.id,
        dueDate: {
          gte: today,
          lt: tomorrow,
        },
        status: "ACTIVE",
      },
      include: {
        project: true,
      },
      orderBy: {
        project: {
          priority: "desc",
        },
      },
    });
  }),
}); 