import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import type { db as dbInstance } from "~/server/db";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";
import {
  sprintAnalyticsService,
  type AllCyclesMetricsResult,
  type CycleSummary,
  type CycleTicketMetricsResult,
  type CycleVelocityPoint,
  type PrTurnaroundResult,
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
 * Resolve which cycle the Metrics page should show: an explicit `cycleId`
 * (verified to be a SPRINT list in this workspace, so no cross-workspace read),
 * or the workspace's active cycle when none is given. Returns `null` when there
 * is nothing to show (no active cycle and no explicit id).
 */
async function resolveCycleId(
  db: Prisma.TransactionClient | typeof dbInstance,
  workspaceId: string,
  cycleId: string | undefined,
): Promise<string | null> {
  if (cycleId) {
    const cycle = await db.list.findFirst({
      where: { id: cycleId, workspaceId, listType: "SPRINT" },
      select: { id: true },
    });
    if (!cycle) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Cycle not found in this workspace",
      });
    }
    return cycle.id;
  }

  const active = await sprintAnalyticsService.getActiveSprint(workspaceId);
  return active?.id ?? null;
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
   * Metrics page (UI): the workspace's cycles, for the cycle selector.
   * Enforces workspace membership.
   */
  getCycles: protectedProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<CycleSummary[]> => {
      await assertWorkspaceMember(ctx.db, ctx.session.user.id, input.workspaceId);
      return sprintAnalyticsService.getWorkspaceCycles(input.workspaceId);
    }),

  /**
   * Metrics page (UI): the workspace's all-cycles roll-up — summed velocity,
   * overall completion and merged-PR turnaround across every cycle, plus the
   * per-cycle series behind them for the trend chart.
   *
   * Enforces workspace membership. Computed live and batched (see
   * `getAllCyclesMetrics`); nothing is read from the dormant `SprintMetrics`
   * table. See ADR-0047.
   */
  getAllCyclesMetrics: protectedProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<AllCyclesMetricsResult> => {
      await assertWorkspaceMember(ctx.db, ctx.session.user.id, input.workspaceId);
      return sprintAnalyticsService.getAllCyclesMetrics(input.workspaceId);
    }),

  /**
   * Metrics page (UI): cycle metrics for a workspace.
   *
   * Enforces workspace membership, then resolves the target cycle — an explicit
   * `cycleId` (workspace-verified) or the active cycle when omitted — and
   * returns its live **Ticket-based** metrics (velocity/completion over the
   * cycle's tickets). Returns `null` when there is no cycle to show so the UI
   * can render an empty state. See ADR-0047 for why this is Ticket-based rather
   * than Action-based like the agent-facing `getMetrics`.
   */
  getActiveCycleMetrics: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        cycleId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<CycleTicketMetricsResult | null> => {
      await assertWorkspaceMember(ctx.db, ctx.session.user.id, input.workspaceId);

      const cycleId = await resolveCycleId(
        ctx.db,
        input.workspaceId,
        input.cycleId,
      );
      if (!cycleId) return null;

      return sprintAnalyticsService.getCycleTicketMetrics(cycleId);
    }),

  /**
   * Metrics page (UI): Ticket-based velocity trend across recent completed
   * cycles.
   *
   * Enforces workspace membership and returns the last N completed cycles with
   * velocity (completed-ticket count + points) and completion, each recomputed
   * live from the cycle's tickets. Returned most-recent-first.
   */
  getVelocityTrend: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        count: z.number().int().min(1).max(20).optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<CycleVelocityPoint[]> => {
      await assertWorkspaceMember(ctx.db, ctx.session.user.id, input.workspaceId);

      return sprintAnalyticsService.getTicketVelocityHistory(
        input.workspaceId,
        input.count,
      );
    }),

  /**
   * Metrics page (UI): merged-PR turnaround for the workspace's active cycle.
   *
   * Enforces workspace membership, resolves the target cycle (explicit
   * `cycleId` or the active cycle), and returns the average/median opened→merged
   * time for PRs merged in the cycle window (computed live from GitHubActivity).
   * Returns `null` when there is no cycle to show so the UI can render an empty
   * state.
   */
  getActiveCyclePrTurnaround: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        cycleId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<PrTurnaroundResult | null> => {
      await assertWorkspaceMember(ctx.db, ctx.session.user.id, input.workspaceId);

      const cycleId = await resolveCycleId(
        ctx.db,
        input.workspaceId,
        input.cycleId,
      );
      if (!cycleId) return null;

      return sprintAnalyticsService.getPrTurnaround(cycleId);
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
