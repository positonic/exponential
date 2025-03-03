import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { slugify } from "~/utils/slugify";

export const projectRouter = createTRPCRouter({
  getAll: protectedProcedure
    .input(z.object({
      include: z.object({
        actions: z.boolean()
      }).optional()
    }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.project.findMany({
        where: {
          createdById: ctx.session.user.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          actions: input?.include?.actions ?? false
        }
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        status: z.string(),
        priority: z.string(),
        progress: z.number().min(0).max(100),
        reviewDate: z.date().nullable(),
        nextActionDate: z.date().nullable(),
        goalIds: z.array(z.string()).optional(),
        outcomeIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.project.create({
        data: {
          name: input.name,
          description: input.description,
          status: input.status,
          priority: input.priority,
          progress: input.progress,
          slug: slugify(input.name),
          reviewDate: input.reviewDate,
          nextActionDate: input.nextActionDate,
          createdBy: {
            connect: {
              id: ctx.session.user.id,
            },
          },
          goals: input.goalIds?.length ? {
            connect: input.goalIds.map(id => ({ id: parseInt(id) })),
          } : undefined,
          outcomes: input.outcomeIds?.length ? {
            connect: input.outcomeIds.map(id => ({ id })),
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
        goalIds: z.array(z.string()).optional(),
        outcomeIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.project.update({
        where: {
          id,
          createdById: ctx.session.user.id,
        },
        data: {
          ...data,
          slug: slugify(data.name),
          goals: data.goalIds?.length ? {
            set: data.goalIds.map(id => ({ id: parseInt(id) })),
          } : undefined,
          outcomes: data.outcomeIds?.length ? {
            set: data.outcomeIds.map(id => ({ id })),
          } : undefined,
        },
      });
    }),
}); 