import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const projectRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.project.findMany({
      where: {
        createdById: ctx.session.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
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
}); 