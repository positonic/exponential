import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { feedbackDigestService } from "~/server/services/notifications/FeedbackDigestService";

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
          feedback: {
            select: {
              id: true,
              rating: true,
            },
            take: 1,
            orderBy: { createdAt: "desc" },
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
   * Get all users with engagement stats (admin only)
   */
  getAllUsers: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().nullish(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: {
        OR?: Array<{ name?: { contains: string; mode: "insensitive" }; email?: { contains: string; mode: "insensitive" } }>;
      } = {};

      if (input.search) {
        where.OR = [
          { name: { contains: input.search, mode: "insensitive" } },
          { email: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const users = await ctx.db.user.findMany({
        where,
        orderBy: { lastLogin: { sort: "desc", nulls: "last" } },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          lastLogin: true,
          isAdmin: true,
          onboardingCompletedAt: true,
          onboardingStep: true,
          projectSetupCompletedAt: true,
          _count: {
            select: {
              actions: true,
              projects: true,
            },
          },
        },
      });

      let nextCursor: typeof input.cursor | undefined = undefined;
      if (users.length > input.limit) {
        const nextItem = users.pop();
        nextCursor = nextItem?.id;
      }

      // Compute lifecycle status for each user
      const getUserStatus = (user: {
        onboardingCompletedAt: Date | null;
        onboardingStep: number;
        projectSetupCompletedAt: Date | null;
      }): "registered" | "onboarding" | "setup" | "active" => {
        if (!user.onboardingCompletedAt) {
          return user.onboardingStep === 1 ? "registered" : "onboarding";
        }
        if (!user.projectSetupCompletedAt) {
          return "setup";
        }
        return "active";
      };

      return {
        users: users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          lastLogin: user.lastLogin,
          isAdmin: user.isAdmin,
          status: getUserStatus(user),
          actionCount: user._count.actions,
          projectCount: user._count.projects,
          hasActions: user._count.actions > 0,
          hasProjects: user._count.projects > 0,
        })),
        nextCursor,
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

  /**
   * Generate and preview the feedback digest (without sending)
   */
  previewFeedbackDigest: adminProcedure.query(async () => {
    const digest = await feedbackDigestService.generateDailyDigest();
    return digest;
  }),

  /**
   * Send the feedback digest to all admin users via Slack
   */
  sendFeedbackDigest: adminProcedure.mutation(async () => {
    const result = await feedbackDigestService.sendDigestToAdmins();

    if (!result.success && result.errors.length > 0) {
      console.error("[Admin] Feedback digest errors:", result.errors);
    }

    return {
      success: result.success,
      sentTo: result.sentTo,
      errors: result.errors,
    };
  }),
});
