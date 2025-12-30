import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getEmbeddingService } from "~/server/services/EmbeddingService";

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

  /**
   * Submit feedback for an AI agent response
   */
  submitAgentFeedback: protectedProcedure
    .input(
      z.object({
        aiInteractionId: z.string(),
        rating: z.number().min(1).max(5),
        comment: z.string().optional(),
        improvementSuggestion: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Create feedback linked to the AI interaction
      const feedbackEntry = await ctx.db.feedback.create({
        data: {
          userId: ctx.session.user.id,
          feature: "agent_response",
          rating: input.rating,
          content: input.comment ?? "",
          aiInteractionId: input.aiInteractionId,
          metadata: {
            improvementSuggestion: input.improvementSuggestion,
            timestamp: new Date().toISOString(),
          },
        },
      });

      // If there's an improvement suggestion, use AI clustering to deduplicate
      if (input.improvementSuggestion) {
        try {
          const embeddingService = getEmbeddingService(ctx.db);
          const result = await embeddingService.processImprovementSuggestion(
            input.improvementSuggestion,
            feedbackEntry.id,
            input.rating
          );
          console.log(
            `[FEEDBACK] Feature request ${result.action}: ${result.featureRequestId}`
          );
        } catch (embeddingError) {
          // Fallback to simple creation if embedding fails
          console.error(
            "[FEEDBACK] Embedding service failed, using fallback:",
            embeddingError
          );
          await ctx.db.featureRequest.create({
            data: {
              title: input.improvementSuggestion.slice(0, 100),
              description: input.improvementSuggestion,
              embedding: [],
              priority: input.rating <= 2 ? 50 : 10,
              feedbackIds: [feedbackEntry.id],
              avgRating: input.rating,
            },
          });
        }
      }

      console.log(
        `[FEEDBACK] Agent feedback: ${input.rating}/5 for interaction ${input.aiInteractionId}`
      );

      return {
        success: true,
        id: feedbackEntry.id,
      };
    }),

  /**
   * Get agent feedback stats for admin dashboard
   */
  getAgentFeedbackStats: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [todayStats, weekStats, allTimeStats, ratingDistribution] =
      await Promise.all([
        ctx.db.feedback.aggregate({
          where: {
            feature: "agent_response",
            createdAt: { gte: dayAgo },
          },
          _avg: { rating: true },
          _count: { rating: true },
        }),
        ctx.db.feedback.aggregate({
          where: {
            feature: "agent_response",
            createdAt: { gte: weekAgo },
          },
          _avg: { rating: true },
          _count: { rating: true },
        }),
        ctx.db.feedback.aggregate({
          where: { feature: "agent_response" },
          _avg: { rating: true },
          _count: { rating: true },
        }),
        ctx.db.feedback.groupBy({
          by: ["rating"],
          where: { feature: "agent_response" },
          _count: { rating: true },
        }),
      ]);

    return {
      today: {
        count: todayStats._count.rating,
        avgRating: todayStats._avg.rating ?? 0,
      },
      week: {
        count: weekStats._count.rating,
        avgRating: weekStats._avg.rating ?? 0,
      },
      allTime: {
        count: allTimeStats._count.rating,
        avgRating: allTimeStats._avg.rating ?? 0,
      },
      distribution: ratingDistribution.map((r) => ({
        rating: r.rating,
        count: r._count.rating,
      })),
    };
  }),

  /**
   * Get recent low-rated agent feedback for admin alerts
   */
  getLowRatedFeedback: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const feedback = await ctx.db.feedback.findMany({
        where: {
          feature: "agent_response",
          rating: { lte: 2 },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        include: {
          user: {
            select: { name: true, email: true },
          },
          aiInteraction: {
            select: {
              userMessage: true,
              aiResponse: true,
              agentName: true,
              platform: true,
            },
          },
        },
      });

      return feedback;
    }),
});