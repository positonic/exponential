import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const userRouter = createTRPCRouter({
  getCurrentUser: protectedProcedure
    .query(async ({ ctx }) => {
      return {
        id: ctx.session.user.id,
        name: ctx.session.user.name,
        email: ctx.session.user.email,
        image: ctx.session.user.image,
      };
    }),

  getById: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return user;
    }),

  searchByEmail: protectedProcedure
    .input(z.object({
      query: z.string().min(2),
      excludeTeamId: z.string().optional(),
      limit: z.number().min(1).max(20).default(5),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.user.findMany({
        where: {
          OR: [
            { email: { contains: input.query, mode: 'insensitive' } },
            { name: { contains: input.query, mode: 'insensitive' } },
          ],
          id: { not: ctx.session.user.id },
          ...(input.excludeTeamId ? {
            teams: { none: { teamId: input.excludeTeamId } },
          } : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
        take: input.limit,
        orderBy: { name: 'asc' },
      });
    }),

  getSelectedTools: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { selectedTools: true },
      });
      return user?.selectedTools ?? [];
    }),
});