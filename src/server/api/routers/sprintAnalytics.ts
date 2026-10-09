import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import type { db as dbInstance } from "~/server/db";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { apiKeyMiddleware } from "~/server/api/middleware/apiKeyAuth";
import {
  assertWorkspaceMembership,
  assertWorkspaceWriteRole,
  getWorkspaceMembership,
} from "~/server/services/access";
import {
  sprintAnalyticsService,
  type AllCyclesMetricsResult,
  type ContributionsResult,
  type CycleSummary,
  type CycleTicketMetricsResult,
  type CycleVelocityPoint,
  type PrTurnaroundResult,
} from "~/server/services/SprintAnalyticsService";
import { githubActivityService } from "~/server/services/GitHubActivityService";
import type { DeliveryFlowResult } from "~/server/services/deliveryFlow";

/**
 * Gate the agent-facing procedures that take a bare `listId`.
 *
 * A missing list and a list in a workspace the caller doesn't belong to both
 * return the same NOT_FOUND, so the error never confirms that an id exists in
 * another workspace. A member who lacks the role for a write (a viewer on
 * `captureDailySnapshot`) gets FORBIDDEN: they can already see the list.
 */
async function assertListAccess(
  db: PrismaClient,
  userId: string,
  listId: string,
  level: "view" | "edit",
): Promise<void> {
  const list = await db.list.findUnique({
    where: { id: listId },
    select: { workspaceId: true },
  });
  const membership = list
    ? await getWorkspaceMembership(db, userId, list.workspaceId)
    : null;
  if (!list || !membership) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Sprint not found" });
  }
  if (level === "edit") {
    await assertWorkspaceWriteRole(db, userId, list.workspaceId);
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
 * Optional member filter for the Metrics page (assignee / GitHub author / time
 * logger — see `MetricsMemberFilter`). Ids that aren't in the workspace simply
 * match nothing; every query stays scoped to `workspaceId` regardless.
 */
const memberIdsInput = z.array(z.string().min(1)).max(100).optional();

/**
 * Sprint analytics tRPC router.
 *
 * Exposes SprintAnalyticsService + GitHubActivityService as API endpoints.
 * Two audiences share ONE service so their numbers can never drift:
 *  - `apiKeyMiddleware` procedures: Mastra PM agent, acting as the user whose
 *    session or API key it presents. They check that user's workspace
 *    membership exactly like the UI procedures do — the API key authenticates
 *    the caller, it does not grant access to every workspace.
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
      await assertWorkspaceMembership(ctx.db, ctx.session.user.id, input.workspaceId);
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
    .input(
      z.object({
        workspaceId: z.string().min(1),
        memberIds: memberIdsInput,
      }),
    )
    .query(async ({ ctx, input }): Promise<AllCyclesMetricsResult> => {
      await assertWorkspaceMembership(ctx.db, ctx.session.user.id, input.workspaceId);
      return sprintAnalyticsService.getAllCyclesMetrics(input.workspaceId, {
        memberIds: input.memberIds,
      });
    }),

  /**
   * Metrics page (UI): per-person contributions — tickets (by assignee),
   * merged PRs and commits (by linked GitHub login) and confirmed time logged —
   * over one cycle (`cycleId`, workspace-verified) or every cycle with tickets.
   * Returns every row; the page narrows to selected members client-side.
   */
  getContributions: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        cycleId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<ContributionsResult> => {
      await assertWorkspaceMembership(ctx.db, ctx.session.user.id, input.workspaceId);

      const cycleId = input.cycleId
        ? await resolveCycleId(ctx.db, input.workspaceId, input.cycleId)
        : undefined;

      return sprintAnalyticsService.getContributions(
        input.workspaceId,
        cycleId ?? undefined,
      );
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
        memberIds: memberIdsInput,
      }),
    )
    .query(async ({ ctx, input }): Promise<CycleTicketMetricsResult | null> => {
      await assertWorkspaceMembership(ctx.db, ctx.session.user.id, input.workspaceId);

      const cycleId = await resolveCycleId(
        ctx.db,
        input.workspaceId,
        input.cycleId,
      );
      if (!cycleId) return null;

      return sprintAnalyticsService.getCycleTicketMetrics(cycleId, {
        memberIds: input.memberIds,
      });
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
      await assertWorkspaceMembership(ctx.db, ctx.session.user.id, input.workspaceId);

      return sprintAnalyticsService.getTicketVelocityHistory(
        input.workspaceId,
        input.count,
      );
    }),

  /**
   * Metrics page (UI): the headline flow numbers — completed tickets per week
   * and cycle-time percentiles (first IN_PROGRESS -> DONE/DEPLOYED) over the
   * trailing window, from the activity event log. Needs neither cycles nor
   * points, so it has data wherever tickets get finished.
   */
  getDeliveryFlow: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        weeks: z.number().int().min(4).max(26).optional(),
        memberIds: memberIdsInput,
      }),
    )
    .query(async ({ ctx, input }): Promise<DeliveryFlowResult> => {
      await assertWorkspaceMembership(ctx.db, ctx.session.user.id, input.workspaceId);

      return sprintAnalyticsService.getDeliveryFlow(input.workspaceId, {
        weeks: input.weeks,
        memberIds: input.memberIds,
      });
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
        memberIds: memberIdsInput,
      }),
    )
    .query(async ({ ctx, input }): Promise<PrTurnaroundResult | null> => {
      await assertWorkspaceMembership(ctx.db, ctx.session.user.id, input.workspaceId);

      const cycleId = await resolveCycleId(
        ctx.db,
        input.workspaceId,
        input.cycleId,
      );
      if (!cycleId) return null;

      return sprintAnalyticsService.getPrTurnaround(cycleId, {
        memberIds: input.memberIds,
      });
    }),

  /**
   * Find the active sprint for a workspace.
   */
  getActiveSprint: apiKeyMiddleware
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertWorkspaceMembership(ctx.db, ctx.userId, input.workspaceId);
      return sprintAnalyticsService.getActiveSprint(input.workspaceId);
    }),

  /**
   * Get sprint metrics: velocity, kanban counts, completion rate, scope creep.
   */
  getMetrics: apiKeyMiddleware
    .input(z.object({ listId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertListAccess(ctx.db, ctx.userId, input.listId, "view");
      return sprintAnalyticsService.getSprintMetrics(input.listId);
    }),

  /**
   * Get burndown data points from sprint snapshots.
   */
  getBurndown: apiKeyMiddleware
    .input(z.object({ listId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertListAccess(ctx.db, ctx.userId, input.listId, "view");
      return sprintAnalyticsService.getBurndownData(input.listId);
    }),

  /**
   * Detect risk signals: scope creep, stale items, blocked, overdue, velocity drop.
   */
  getRiskSignals: apiKeyMiddleware
    .input(z.object({ listId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertListAccess(ctx.db, ctx.userId, input.listId, "view");
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
    .query(async ({ ctx, input }) => {
      await assertWorkspaceMembership(ctx.db, ctx.userId, input.workspaceId);
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
    .query(async ({ ctx, input }) => {
      await assertWorkspaceMembership(ctx.db, ctx.userId, input.workspaceId);
      return githubActivityService.getActivitySummary(
        input.workspaceId,
        input.since,
      );
    }),

  /**
   * Capture a daily snapshot of the sprint for burndown tracking. A write, so
   * a read-only viewer is refused.
   */
  captureDailySnapshot: apiKeyMiddleware
    .input(z.object({ listId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertListAccess(ctx.db, ctx.userId, input.listId, "edit");
      return sprintAnalyticsService.captureDailySnapshot(input.listId);
    }),
});
