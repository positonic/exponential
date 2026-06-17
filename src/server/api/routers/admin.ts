import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { feedbackDigestService } from "~/server/services/notifications/FeedbackDigestService";
import { threadScoreDigestService } from "~/server/services/notifications/ThreadScoreDigestService";
import {
  buildLaneBreakdown,
  buildPromptVersionBreakdown,
  buildScoreTrend,
  lastPromptVersionByConversation,
} from "~/server/services/threadScoreAnalytics";
import { computeCalibration, isCalibrated } from "~/server/services/calibrationGate";
import { buildCalibrationPairs } from "~/server/services/calibrationGateService";
import { JUDGE_VERSION } from "~/server/services/AgentEvalService";

// `tokenUsage` is written via `JSON.stringify(...)` in AiInteractionLogger,
// so Prisma returns it as a string. Older rows (or rows written via Prisma
// JSON column behaviour) may surface as objects. Handle both.
interface TokenUsageShape {
  prompt?: number;
  completion?: number;
  total?: number;
  cost?: number;
  cacheReadInput?: number;
  cacheCreationInput?: number;
  modelId?: string;
}

function parseTokenUsage(raw: unknown): TokenUsageShape | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as TokenUsageShape;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as TokenUsageShape;
  }
  return null;
}

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
      }): "registered" | "onboarding" | "active" => {
        if (!user.onboardingCompletedAt) {
          return user.onboardingStep === 1 ? "registered" : "onboarding";
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
   * Get token usage totals grouped by user (admin only)
   */
  getTokenUsageSummaryByUser: adminProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = { tokenUsage: { not: null } };
      if (input?.startDate ?? input?.endDate) {
        where.createdAt = {
          ...(input?.startDate ? { gte: input.startDate } : {}),
          ...(input?.endDate ? { lte: input.endDate } : {}),
        };
      }

      const rows = await ctx.db.aiInteractionHistory.findMany({
        where,
        select: {
          systemUserId: true,
          tokenUsage: true,
          user: { select: { name: true, email: true } },
        },
      });

      const buckets = new Map<
        string,
        {
          userId: string;
          name: string | null;
          email: string | null;
          interactions: number;
          prompt: number;
          completion: number;
          total: number;
          cost: number;
          cacheRead: number;
          cacheCreation: number;
        }
      >();

      for (const row of rows) {
        const key = row.systemUserId ?? 'unknown';
        if (!buckets.has(key)) {
          buckets.set(key, {
            userId: key,
            name: row.user?.name ?? null,
            email: row.user?.email ?? null,
            interactions: 0,
            prompt: 0,
            completion: 0,
            total: 0,
            cost: 0,
            cacheRead: 0,
            cacheCreation: 0,
          });
        }
        const bucket = buckets.get(key)!;
        bucket.interactions += 1;
        const usage = parseTokenUsage(row.tokenUsage);
        if (usage) {
          bucket.prompt += usage.prompt ?? 0;
          bucket.completion += usage.completion ?? 0;
          bucket.total += usage.total ?? 0;
          bucket.cost += usage.cost ?? 0;
          bucket.cacheRead += usage.cacheReadInput ?? 0;
          bucket.cacheCreation += usage.cacheCreationInput ?? 0;
        }
      }

      // Cache hit ratio = cache_read / (cache_read + cache_creation + uncached_input).
      // uncached_input = prompt - cache_read - cache_creation (Anthropic
      // reports prompt as the full billable input, with cache_read and
      // cache_creation being subsets of it).
      return Array.from(buckets.values())
        .map((b) => {
          const uncachedInput = Math.max(b.prompt - b.cacheRead - b.cacheCreation, 0);
          const inputDenom = b.cacheRead + b.cacheCreation + uncachedInput;
          const cacheHitRate = inputDenom > 0 ? b.cacheRead / inputDenom : 0;
          return { ...b, cacheHitRate };
        })
        .sort((a, b) => b.total - a.total);
    }),

  /**
   * Top conversations by aggregate cost (admin only).
   *
   * Returns the N most expensive conversations in the window, grouping each
   * conversation's requests together. Use this to spot pathological chats
   * and drill in via `getConversationHistory`.
   */
  getTopExpensiveConversations: adminProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(50).default(10),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = { tokenUsage: { not: null } };
      if (input?.startDate ?? input?.endDate) {
        where.createdAt = {
          ...(input?.startDate ? { gte: input.startDate } : {}),
          ...(input?.endDate ? { lte: input.endDate } : {}),
        };
      }

      const rows = await ctx.db.aiInteractionHistory.findMany({
        where,
        select: {
          conversationId: true,
          workspaceId: true,
          systemUserId: true,
          agentId: true,
          tokenUsage: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
      });

      const buckets = new Map<
        string,
        {
          conversationId: string;
          workspaceId: string | null;
          userId: string | null;
          userName: string | null;
          userEmail: string | null;
          agentId: string | null;
          requests: number;
          prompt: number;
          completion: number;
          cacheRead: number;
          cacheCreation: number;
          cost: number;
          firstSeen: Date;
          lastSeen: Date;
        }
      >();

      for (const row of rows) {
        const convId = row.conversationId ?? 'unknown';
        if (!buckets.has(convId)) {
          buckets.set(convId, {
            conversationId: convId,
            workspaceId: row.workspaceId ?? null,
            userId: row.systemUserId ?? null,
            userName: row.user?.name ?? null,
            userEmail: row.user?.email ?? null,
            agentId: row.agentId ?? null,
            requests: 0,
            prompt: 0,
            completion: 0,
            cacheRead: 0,
            cacheCreation: 0,
            cost: 0,
            firstSeen: row.createdAt,
            lastSeen: row.createdAt,
          });
        }
        const bucket = buckets.get(convId)!;
        bucket.requests += 1;
        if (row.createdAt < bucket.firstSeen) bucket.firstSeen = row.createdAt;
        if (row.createdAt > bucket.lastSeen) bucket.lastSeen = row.createdAt;

        const usage = parseTokenUsage(row.tokenUsage);
        if (usage) {
          bucket.prompt += usage.prompt ?? 0;
          bucket.completion += usage.completion ?? 0;
          bucket.cacheRead += usage.cacheReadInput ?? 0;
          bucket.cacheCreation += usage.cacheCreationInput ?? 0;
          bucket.cost += usage.cost ?? 0;
        }
      }

      return Array.from(buckets.values())
        .sort((a, b) => b.cost - a.cost)
        .slice(0, input?.limit ?? 10);
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
   * Thread-score analytics (ADR-0012 Phase 2): judge-score trend by agent,
   * Failure-lane breakdown, and score-by-Prompt-version. Thread score is the
   * judge's APPARENT-quality verdict — distinct from the human Feedback
   * rating and from Zoe's self-reported confidence; the UI labels all three.
   */
  getThreadScoreAnalytics: adminProcedure
    .input(
      z
        .object({
          days: z.number().int().min(1).max(365).default(30),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

      const scores = await ctx.db.threadScore.findMany({
        where: { createdAt: { gte: from } },
        select: {
          conversationId: true,
          agentId: true,
          overallScore: true,
          failureLane: true,
          createdAt: true,
        },
      });

      // A Thread is attributed to the promptVersion of its last stamped turn.
      const turnRows =
        scores.length > 0
          ? await ctx.db.aiInteractionHistory.findMany({
              where: {
                conversationId: { in: scores.map((s) => s.conversationId) },
                promptVersion: { not: null },
              },
              select: { conversationId: true, promptVersion: true, createdAt: true },
            })
          : [];
      const turns = turnRows.filter(
        (t): t is typeof t & { conversationId: string } => t.conversationId !== null,
      );

      const failureCount = scores.filter((s) => s.failureLane !== null).length;
      return {
        summary: {
          scoredThreads: scores.length,
          avgScore:
            scores.length > 0
              ? Math.round(scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length)
              : null,
          failureCount,
        },
        trend: buildScoreTrend(scores, from, to),
        laneBreakdown: buildLaneBreakdown(scores),
        promptVersions: buildPromptVersionBreakdown(
          scores,
          lastPromptVersionByConversation(turns),
        ),
      };
    }),

  /**
   * Worst-Thread drilldown: lowest judge scores with reasoning, the violated
   * expectation (from the distilled EvalCase), plus the human rating and
   * self-reported confidence for the same Thread — labelled separately,
   * never blended.
   */
  getWorstThreads: adminProcedure
    .input(
      z
        .object({
          days: z.number().int().min(1).max(365).default(30),
          limit: z.number().int().min(1).max(50).default(10),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const limit = input?.limit ?? 10;
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const scores = await ctx.db.threadScore.findMany({
        where: { createdAt: { gte: from } },
        orderBy: { overallScore: "asc" },
        take: limit,
        include: {
          evalCase: { select: { expectation: true, lane: true, active: true } },
        },
      });

      const conversationIds = scores.map((s) => s.conversationId);
      const turns =
        conversationIds.length > 0
          ? await ctx.db.aiInteractionHistory.findMany({
              where: { conversationId: { in: conversationIds } },
              select: {
                conversationId: true,
                promptVersion: true,
                confidenceScore: true,
                createdAt: true,
                feedback: { select: { rating: true } },
              },
              orderBy: { createdAt: "asc" },
            })
          : [];

      const turnsByConversation = new Map<string, typeof turns>();
      for (const turn of turns) {
        if (turn.conversationId === null) continue;
        const bucket = turnsByConversation.get(turn.conversationId) ?? [];
        bucket.push(turn);
        turnsByConversation.set(turn.conversationId, bucket);
      }

      return scores.map((score) => {
        const threadTurns = turnsByConversation.get(score.conversationId) ?? [];
        const humanRatings = threadTurns.flatMap((t) => t.feedback.map((f) => f.rating));
        const confidences = threadTurns
          .map((t) => t.confidenceScore)
          .filter((c): c is number => c !== null);
        const lastStamped = [...threadTurns].reverse().find((t) => t.promptVersion);
        return {
          conversationId: score.conversationId,
          agentId: score.agentId,
          overallScore: score.overallScore,
          axes: {
            resolved: score.resolved,
            grounded: score.grounded,
            toolSuccess: score.toolSuccess,
            noDeflection: score.noDeflection,
          },
          failureLane: score.failureLane,
          reasoning: score.reasoning,
          expectation: score.evalCase?.expectation ?? null,
          turnCount: score.turnCount,
          lastTurnAt: score.lastTurnAt,
          promptVersion: lastStamped?.promptVersion ?? null,
          // Human ground truth (Feedback.rating) — sparse; null when nobody rated.
          humanRating:
            humanRatings.length > 0
              ? humanRatings.reduce((a, b) => a + b, 0) / humanRatings.length
              : null,
          humanRatingCount: humanRatings.length,
          // Zoe's self-report — the third, distinct number.
          avgConfidence:
            confidences.length > 0
              ? confidences.reduce((a, b) => a + b, 0) / confidences.length
              : null,
        };
      });
    }),

  /**
   * Judge-vs-human calibration state (ADR-0012 decision 9): overlap pairs,
   * directional agreement per judge version, and whether the Level B/C
   * autonomy gate is open for the CURRENT judge version. The overlap set's
   * rating distribution is included so selection bias (humans rate when
   * angry or delighted) is visible rather than silently trusted.
   */
  getCalibration: adminProcedure.query(async ({ ctx }) => {
    const pairs = await buildCalibrationPairs(ctx.db);
    return {
      currentJudgeVersion: JUDGE_VERSION,
      gate: isCalibrated(pairs, JUDGE_VERSION),
      perVersion: computeCalibration(pairs),
    };
  }),

  /**
   * Generate and preview the weekly Thread-score digest (without sending)
   */
  previewThreadScoreDigest: adminProcedure.query(async () => {
    return threadScoreDigestService.generateWeeklyDigest();
  }),

  /**
   * Send the weekly Thread-score digest to all admin users via Slack
   */
  sendThreadScoreDigest: adminProcedure.mutation(async () => {
    const result = await threadScoreDigestService.sendDigestToAdmins();
    if (!result.success && result.errors.length > 0) {
      console.error("[Admin] Thread-score digest errors:", result.errors);
    }
    return result;
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
