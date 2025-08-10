import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const feedbackRouter = createTRPCRouter({
  submitCalendarFeedback: protectedProcedure
    .input(z.object({
      feature: z.string(),
      rating: z.number().min(1).max(5),
      feedback: z.string().min(1).max(1000),
      metadata: z.object({
        userAgent: z.string().optional(),
        timestamp: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Create feedback entry in database
      const feedbackEntry = await ctx.db.feedback.create({
        data: {
          userId: ctx.session.user.id,
          feature: input.feature,
          rating: input.rating,
          content: input.feedback,
          metadata: input.metadata as any,
        },
      });

      // Log feedback for monitoring
      console.log(`[FEEDBACK] User ${ctx.session.user.email} submitted ${input.rating}/5 rating for ${input.feature}`);

      return {
        success: true,
        id: feedbackEntry.id,
      };
    }),

  getFeatureFeedback: protectedProcedure
    .input(z.object({
      feature: z.string(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const feedback = await ctx.db.feedback.findMany({
        where: {
          feature: input.feature,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: input.limit,
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      return feedback;
    }),

  getAverageRating: protectedProcedure
    .input(z.object({
      feature: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const aggregation = await ctx.db.feedback.aggregate({
        where: {
          feature: input.feature,
        },
        _avg: {
          rating: true,
        },
        _count: {
          rating: true,
        },
      });

      return {
        averageRating: aggregation._avg.rating || 0,
        totalFeedback: aggregation._count.rating,
      };
    }),
});