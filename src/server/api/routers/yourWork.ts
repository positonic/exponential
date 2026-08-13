import { z } from "zod";
import { startOfISOWeek, subDays } from "date-fns";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";
import { buildKnowledgePageAccessWhere } from "~/server/services/access/resolvers/knowledgePageResolver";
import {
  currentCycleWhere,
  currentCycleOrder,
} from "~/plugins/product/server/currentCycle";
import {
  COMPLETED_TICKET_STATUSES,
  STATUS_ORDER,
} from "~/lib/ticket-statuses";

/**
 * Per-user "Your work" aggregation backing the workspace-home panel
 * (feature: Personal home). Every procedure reads existing per-entity
 * fields — no schema changes; the weekly work digest gatherer
 * (`weeklyWorkDigest/gather.ts`) is the reference for the query shapes.
 */
export const yourWorkRouter = createTRPCRouter({
  /**
   * Open tickets assigned to the current user in this workspace. Same query
   * arm as the digest gatherer (Ticket.assigneeId is indexed).
   */
  assignedTickets: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      return ctx.db.ticket.findMany({
        where: {
          assigneeId: ctx.session.user.id,
          status: { notIn: ["DONE", "DEPLOYED", "ARCHIVED"] },
          product: { workspaceId: input.workspaceId },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          id: true,
          shortId: true,
          number: true,
          title: true,
          status: true,
          cycleId: true,
          product: { select: { slug: true, name: true, funTicketIds: true } },
        },
      });
    }),

  /**
   * Objectives, key results, and projects where the current user is the DRI.
   * These fields (Goal.driUserId, KeyResult.driUserId, Project.driId) are
   * written by the OKR/project editors but had no read path until this panel.
   */
  driItems: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [goals, keyResults, projects] = await Promise.all([
        ctx.db.goal.findMany({
          where: {
            driUserId: userId,
            workspaceId: input.workspaceId,
            status: { in: ["planned", "active"] },
          },
          orderBy: { id: "desc" },
          take: 6,
          select: { id: true, title: true, health: true },
        }),
        ctx.db.keyResult.findMany({
          where: {
            driUserId: userId,
            workspaceId: input.workspaceId,
            status: { not: "achieved" },
          },
          orderBy: { updatedAt: "desc" },
          take: 6,
          select: {
            id: true,
            title: true,
            goalId: true,
            status: true,
            statusOverride: true,
          },
        }),
        ctx.db.project.findMany({
          where: {
            driId: userId,
            workspaceId: input.workspaceId,
            status: "ACTIVE",
          },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { id: true, name: true, slug: true, progress: true },
        }),
      ]);
      return { goals, keyResults, projects };
    }),

  /**
   * Current cycle(s) in the workspace with a completion rollup and the
   * caller's tickets in each. Same read-only predicate as
   * `product.getOverview` (see `~/plugins/product/server/currentCycle.ts`) —
   * deliberately NOT `cycle.list`, whose reconcile/auto-create side effects
   * a home page shouldn't trigger. Usually one cycle; capped at 3 for
   * workspaces running parallel team cycles.
   */
  currentCycles: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const now = new Date();

      const cycles = await ctx.db.list.findMany({
        where: currentCycleWhere(input.workspaceId, now),
        orderBy: currentCycleOrder,
        take: 3,
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          cycleGoal: true,
        },
      });
      if (cycles.length === 0) return [];

      const cycleTickets = await ctx.db.ticket.findMany({
        // The workspace filter is defense-in-depth: cycles are workspace-
        // scoped and tickets reach a workspace via product, but no DB
        // constraint forces a ticket's cycle into its own workspace.
        where: {
          cycleId: { in: cycles.map((c) => c.id) },
          product: { workspaceId: input.workspaceId },
        },
        select: {
          id: true,
          shortId: true,
          number: true,
          title: true,
          status: true,
          points: true,
          cycleId: true,
          assigneeId: true,
          product: {
            select: { slug: true, name: true, funTicketIds: true },
          },
        },
      });

      const completedSet = new Set<string>(COMPLETED_TICKET_STATUSES);
      const statusRank = (s: string) => STATUS_ORDER[s] ?? 99;

      return cycles.map((cycle) => {
        const tickets = cycleTickets.filter((t) => t.cycleId === cycle.id);
        // Same weighting as the product-overview rollup: points when any
        // ticket in the cycle carries them, otherwise ticket count.
        const usesPoints = tickets.some((t) => (t.points ?? 0) > 0);
        const weight = (t: { points: number | null }) =>
          usesPoints ? (t.points ?? 0) : 1;
        const committed = tickets.reduce((s, t) => s + weight(t), 0);
        const completed = tickets
          .filter((t) => completedSet.has(t.status))
          .reduce((s, t) => s + weight(t), 0);
        const inProgress = tickets
          .filter((t) => t.status === "IN_PROGRESS")
          .reduce((s, t) => s + weight(t), 0);

        const myTickets = tickets
          .filter((t) => t.assigneeId === userId)
          .sort((a, b) => statusRank(a.status) - statusRank(b.status))
          .slice(0, 5)
          .map(({ id, shortId, number, title, status, product }) => ({
            id,
            shortId,
            number,
            title,
            status,
            product,
          }));
        const myOpenCount = tickets.filter(
          (t) => t.assigneeId === userId && !completedSet.has(t.status),
        ).length;

        return {
          id: cycle.id,
          name: cycle.name,
          status: cycle.status,
          startDate: cycle.startDate,
          endDate: cycle.endDate,
          cycleGoal: cycle.cycleGoal,
          usesPoints,
          committed,
          completed,
          inProgress,
          myTickets,
          myOpenCount,
        };
      });
    }),

  /**
   * "Waiting on you": QA tickets that are the caller's to promote — assigned
   * to them, or created by them and unassigned (agent-shipped work commonly
   * has no assignee). `prMerged` joins `Ticket.prUrl` against stored
   * GitHubActivity webhook rows: a merged PR still sitting in QA is the
   * strongest "promote this" signal, especially while the QA→DONE merge hook
   * is unreliable.
   */
  waitingOnYou: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const tickets = await ctx.db.ticket.findMany({
        where: {
          status: "QA",
          product: { workspaceId: input.workspaceId },
          OR: [
            { assigneeId: userId },
            { assigneeId: null, createdById: userId },
          ],
        },
        // Oldest first — the longest-waiting item is the most urgent.
        orderBy: { updatedAt: "asc" },
        take: 8,
        select: {
          id: true,
          shortId: true,
          number: true,
          title: true,
          prUrl: true,
          updatedAt: true,
          product: { select: { slug: true, name: true, funTicketIds: true } },
        },
      });

      const prUrls = tickets
        .map((t) => t.prUrl)
        .filter((url): url is string => !!url);
      const mergedRows = prUrls.length
        ? await ctx.db.gitHubActivity.findMany({
            where: {
              workspaceId: input.workspaceId,
              prUrl: { in: prUrls },
              prState: "merged",
            },
            select: { prUrl: true },
            distinct: ["prUrl"],
          })
        : [];
      const mergedUrls = new Set(mergedRows.map((r) => r.prUrl));

      return tickets.map((t) => ({
        ...t,
        prMerged: !!t.prUrl && mergedUrls.has(t.prUrl),
      }));
    }),

  /**
   * Key results the caller is DRI on with no check-in this ISO week
   * (Monday-anchored, matching the OKR check-in ritual). A check-in is a
   * `KeyResultCheckIn` row; there is no cadence field on the model — weekly
   * is the convention this nudge imposes.
   */
  staleCheckins: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const weekStart = startOfISOWeek(new Date());
      const stale = await ctx.db.keyResult.findMany({
        where: {
          driUserId: ctx.session.user.id,
          workspaceId: input.workspaceId,
          status: { not: "achieved" },
          checkIns: { none: { createdAt: { gte: weekStart } } },
        },
        orderBy: { updatedAt: "asc" },
        take: 6,
        select: {
          id: true,
          title: true,
          goalId: true,
          status: true,
          statusOverride: true,
          checkIns: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      });
      return stale.map(({ checkIns, ...kr }) => ({
        ...kr,
        lastCheckIn: checkIns[0]?.createdAt ?? null,
      }));
    }),

  /**
   * Aggregate counts of other people's workspace activity since `since`
   * (client-supplied so "yesterday" respects the viewer's timezone; clamped
   * to 7 days back to bound the scan). The caller's own events are excluded
   * — this is "what happened while you were away", not a mirror.
   * `ticket_sync_run` is hidden here for the same reason the feed hides it.
   */
  sinceYesterday: protectedProcedure
    .input(z.object({ workspaceId: z.string(), since: z.date() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const floor = subDays(now, 7);
      // Clamp both ways: no scans older than 7 days, no future windows.
      const since = input.since > now ? now : input.since > floor ? input.since : floor;
      const groups = await ctx.db.workspaceActivityEvent.groupBy({
        by: ["entityType", "action"],
        where: {
          workspaceId: input.workspaceId,
          createdAt: { gte: since },
          entityType: { notIn: ["ticket_sync_run"] },
          OR: [{ userId: null }, { userId: { not: ctx.session.user.id } }],
        },
        _count: { _all: true },
      });
      return groups.map((g) => ({
        entityType: g.entityType,
        action: g.action,
        count: g._count._all,
      }));
    }),

  /**
   * Pages the caller created, most recently updated first — the "pick up
   * where you left off" strip. `KnowledgePage` has no last-editor field, so
   * created-by-me ordered by updatedAt is the closest available read.
   */
  recentPages: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      return ctx.db.knowledgePage.findMany({
        where: {
          AND: [
            buildKnowledgePageAccessWhere(ctx.session.user.id),
            { workspaceId: input.workspaceId, createdById: ctx.session.user.id },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          updatedAt: true,
          project: { select: { name: true } },
        },
      });
    }),
});
