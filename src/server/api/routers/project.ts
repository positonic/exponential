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
        status: z.string(),
        priority: z.string(),
        progress: z.number().min(0).max(100),
        reviewDate: z.date().nullable(),
        nextActionDate: z.date().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.project.create({
        data: {
          name: input.name,
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
}); 