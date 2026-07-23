import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import type { db as dbInstance } from "~/server/db";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";
import {
  sprintAnalyticsService,
  type SprintMetricsResult,
} from "~/server/services/SprintAnalyticsService";
import { githubActivityService } from "~/server/services/GitHubActivityService";

/**
 * Verify the caller is a member of the workspace. Throws FORBIDDEN if not.
 * Mirrors the helper in document.ts — the Metrics page is read-only and
 * visible to any workspace member.
 */
async function assertWorkspaceMember(
  db: Prisma.TransactionClient | typeof dbInstance,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const membership = await db.workspaceUser.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
    select: { userId: true },
  });
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this workspace",
    });
  }
}

/**
 * Sprint analytics tRPC router.
 *
 * Exposes SprintAnalyticsService + GitHubActivityService as API endpoints.
 * Two audiences share ONE service so their numbers can never drift:
 *  - `apiKeyMiddleware` procedures: Mastra PM agent, server-to-server.
 *  - `protectedProcedure` procedures: the read-only Metrics page UI
 *    (`/w/[slug]/metrics`), gated by workspace membership.
 *
 * Auth: session (cookie/JWT) OR API key (x-api-key header).
 */
export const sprintAnalyticsRouter = createTRPCRouter({
  /**
   * Metrics page (UI): active-cycle metrics for a workspace.
   *
   * Enforces workspace membership, resolves the workspace's active cycle
   * (List with listType=SPRINT, status=ACTIVE), and returns its live metrics
   * from SprintAnalyticsService.getSprintMetrics. Returns `null` when the
   * workspace has no active cycle so the UI can render an empty state.
   */
  getActiveCycleMetrics: protectedProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<SprintMetricsResult | null> => {
      await assertWorkspaceMember(ctx.db, ctx.session.user.id, input.workspaceId);

      const activeSprint = await sprintAnalyticsService.getActiveSprint(
        input.workspaceId,
      );
      if (!activeSprint) return null;

      return sprintAnalyticsService.getSprintMetrics(activeSprint.id);
    }),

  /**
   * Find the active sprint for a workspace.
   */
  getActiveSprint: apiKeyMiddleware
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ input }) => {
      return sprintAnalyticsService.getActiveSprint(input.workspaceId);
    }),

  /**
   * Get sprint metrics: velocity, kanban counts, completion rate, scope creep.
   */
  getMetrics: apiKeyMiddleware
    .input(z.object({ listId: z.string() }))
    .query(async ({ input }) => {
      return sprintAnalyticsService.getSprintMetrics(input.listId);
    }),

  /**
   * Get burndown data points from sprint snapshots.
   */
  getBurndown: apiKeyMiddleware
    .input(z.object({ listId: z.string() }))
    .query(async ({ input }) => {
      return sprintAnalyticsService.getBurndownData(input.listId);
    }),

  /**
   * Detect risk signals: scope creep, stale items, blocked, overdue, velocity drop.
   */
  getRiskSignals: apiKeyMiddleware
    .input(z.object({ listId: z.string() }))
    .query(async ({ input }) => {
      return sprintAnalyticsService.detectRiskSignals(input.listId);
    }),

  /**
   * Get velocity history across past completed sprints.
   */
  getVelocityHistory: apiKeyMiddleware
    .input(
      z.object({
        workspaceId: z.string(),
        count: z.number().int().min(1).max(20).optional(),
      }),
    )
    .query(async ({ input }) => {
      return sprintAnalyticsService.getVelocityHistory(
        input.workspaceId,
        input.count,
      );
    }),

  /**
   * Get GitHub activity summary since a given date.
   */
  getGitHubActivity: apiKeyMiddleware
    .input(
      z.object({
        workspaceId: z.string(),
        since: z.coerce.date(),
      }),
    )
    .query(async ({ input }) => {
      return githubActivityService.getActivitySummary(
        input.workspaceId,
        input.since,
      );
    }),

  /**
   * Capture a daily snapshot of the sprint for burndown tracking.
   */
  captureDailySnapshot: apiKeyMiddleware
    .input(z.object({ listId: z.string() }))
    .mutation(async ({ input }) => {
      return sprintAnalyticsService.captureDailySnapshot(input.listId);
    }),
});
