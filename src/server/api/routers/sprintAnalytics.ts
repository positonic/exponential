import { z } from "zod";
import { createTRPCRouter } from "~/server/api/trpc";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";
import { sprintAnalyticsService } from "~/server/services/SprintAnalyticsService";
import { githubActivityService } from "~/server/services/GitHubActivityService";

/**
 * Sprint analytics tRPC router.
 *
 * Exposes SprintAnalyticsService + GitHubActivityService as API endpoints.
 * Used by Mastra PM agent to gather project data server-to-server.
 *
 * Auth: session (cookie/JWT) OR API key (x-api-key header).
 */
export const sprintAnalyticsRouter = createTRPCRouter({
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
