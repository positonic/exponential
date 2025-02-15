import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const actionRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.action.findMany({
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

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        projectId: z.string(),
        priority: z.enum(["NONE", "LOW", "MEDIUM", "HIGH"]).default("NONE"),
        status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).default("ACTIVE"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.action.create({
        data: input,
      });
    }),
}); 