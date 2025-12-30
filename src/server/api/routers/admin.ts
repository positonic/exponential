import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

/**
 * Admin procedure - extends protectedProcedure with isAdmin check
 */
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session.user.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next();
});

export const adminRouter = createTRPCRouter({
  /**
   * Get all AI interactions (admin only - no user filter)
   */
  getAllAiInteractions: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().nullish(),
        platform: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: {
        platform?: string;
        createdAt?: { gte?: Date; lte?: Date };
      } = {};

      if (input.platform) {
        where.platform = input.platform;
      }
      if (input.startDate ?? input.endDate) {
        where.createdAt = {};
        if (input.startDate) where.createdAt.gte = input.startDate;
        if (input.endDate) where.createdAt.lte = input.endDate;
      }

      const interactions = await ctx.db.aiInteractionHistory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      let nextCursor: typeof input.cursor | undefined = undefined;
      if (interactions.length > input.limit) {
        const nextItem = interactions.pop();
        nextCursor = nextItem?.id;
      }

      return {
        interactions,
        nextCursor,
      };
    }),

  /**
   * Get admin dashboard stats
   */
  getStats: adminProcedure.query(async ({ ctx }) => {
    const [
      totalUsers,
      totalInteractions,
      totalProjects,
      recentInteractions,
    ] = await Promise.all([
      ctx.db.user.count(),
      ctx.db.aiInteractionHistory.count(),
      ctx.db.project.count(),
      ctx.db.aiInteractionHistory.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      }),
    ]);

    return {
      totalUsers,
      totalInteractions,
      totalProjects,
      recentInteractions,
    };
  }),

  /**
   * Get platform breakdown for AI interactions
   */
  getPlatformStats: adminProcedure.query(async ({ ctx }) => {
    const platforms = await ctx.db.aiInteractionHistory.groupBy({
      by: ["platform"],
      _count: { platform: true },
    });

    return platforms.map((p) => ({
      platform: p.platform,
      count: p._count.platform,
    }));
  }),
});
