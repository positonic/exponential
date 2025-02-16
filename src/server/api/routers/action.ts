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
        priority: z.enum([
          "Quick",
          "Scheduled",
          "1st Priority",
          "2nd Priority",
          "3rd Priority",
          "4th Priority",
          "5th Priority",
          "Errand",
          "Remember",
          "Watch",
          "Someday Maybe"
        ]).default("Quick"),
        status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).default("ACTIVE"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.action.create({
        data: input,
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.action.update({
        where: { id: input.id },
        data: { status: input.status },
      });
    }),
}); 