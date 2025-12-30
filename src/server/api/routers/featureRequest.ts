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

export const featureRequestRouter = createTRPCRouter({
  /**
   * Get all feature requests with filtering
   */
  getAll: adminProcedure
    .input(
      z.object({
        status: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: { status?: string } = {};
      if (input.status) {
        where.status = input.status;
      }

      const requests = await ctx.db.featureRequest.findMany({
        where,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
      });

      let nextCursor: typeof input.cursor | undefined = undefined;
      if (requests.length > input.limit) {
        const nextItem = requests.pop();
        nextCursor = nextItem?.id;
      }

      return {
        requests,
        nextCursor,
      };
    }),

  /**
   * Get a single feature request with linked feedbacks
   */
  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const request = await ctx.db.featureRequest.findUnique({
        where: { id: input.id },
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found",
        });
      }

      // Get linked feedbacks
      const feedbacks = await ctx.db.feedback.findMany({
        where: {
          id: { in: request.feedbackIds },
        },
        include: {
          user: {
            select: { name: true, email: true },
          },
          aiInteraction: {
            select: {
              userMessage: true,
              aiResponse: true,
              agentName: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return {
        ...request,
        feedbacks,
      };
    }),

  /**
   * Update feature request status
   */
  updateStatus: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["open", "planned", "in_progress", "done", "wont_fix"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.db.featureRequest.update({
        where: { id: input.id },
        data: {
          status: input.status,
          resolvedAt:
            input.status === "done" || input.status === "wont_fix"
              ? new Date()
              : null,
        },
      });

      return request;
    }),

  /**
   * Merge two feature requests
   */
  merge: adminProcedure
    .input(
      z.object({
        sourceId: z.string(),
        targetId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [source, target] = await Promise.all([
        ctx.db.featureRequest.findUnique({ where: { id: input.sourceId } }),
        ctx.db.featureRequest.findUnique({ where: { id: input.targetId } }),
      ]);

      if (!source || !target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or both feature requests not found",
        });
      }

      // Merge feedbackIds
      const mergedFeedbackIds = [
        ...new Set([...target.feedbackIds, ...source.feedbackIds]),
      ];

      // Calculate new averages
      const newFeedbackCount = target.feedbackCount + source.feedbackCount;
      const newAvgRating =
        target.avgRating && source.avgRating
          ? (target.avgRating * target.feedbackCount +
              source.avgRating * source.feedbackCount) /
            newFeedbackCount
          : target.avgRating ?? source.avgRating;

      // Update target with merged data
      await ctx.db.featureRequest.update({
        where: { id: input.targetId },
        data: {
          feedbackIds: mergedFeedbackIds,
          feedbackCount: newFeedbackCount,
          avgRating: newAvgRating,
          description: `${target.description}\n\n---\n\n${source.description}`,
          priority: Math.max(target.priority, source.priority),
        },
      });

      // Delete source
      await ctx.db.featureRequest.delete({
        where: { id: input.sourceId },
      });

      return { success: true };
    }),

  /**
   * Recalculate priorities for all feature requests
   */
  recalculatePriorities: adminProcedure.mutation(async ({ ctx }) => {
    const requests = await ctx.db.featureRequest.findMany({
      where: { status: "open" },
    });

    const now = new Date();

    for (const request of requests) {
      const daysOld = Math.floor(
        (now.getTime() - request.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      const priority =
        request.feedbackCount * 10 +
        ((request.avgRating ?? 5) <= 2 ? 50 : 0) +
        (daysOld > 7 ? 10 : 0);

      await ctx.db.featureRequest.update({
        where: { id: request.id },
        data: { priority },
      });
    }

    return { success: true, updated: requests.length };
  }),

  /**
   * Get feature request stats for dashboard
   */
  getStats: adminProcedure.query(async ({ ctx }) => {
    const [byStatus, total] = await Promise.all([
      ctx.db.featureRequest.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
      ctx.db.featureRequest.count(),
    ]);

    return {
      total,
      byStatus: byStatus.map((s) => ({
        status: s.status,
        count: s._count.status,
      })),
    };
  }),
});
