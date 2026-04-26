import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getSundayWeekStart } from "~/lib/weekUtils";
import {
  buildWorkspaceAccessWhere,
  getWorkspaceMembership,
} from "~/server/services/access";

/**
 * Compute current OKR period like "Q2-2026" from a date.
 * Mirrors getCurrentQuarterType() from the OKR plugin but server-safe.
 */
function getCurrentQuarter(date: Date): string {
  const quarter = Math.ceil((date.getUTCMonth() + 1) / 3);
  return `Q${quarter}-${date.getUTCFullYear()}`;
}

function getCurrentAnnual(date: Date): string {
  return `Annual-${date.getUTCFullYear()}`;
}

function getQuarterStart(date: Date): Date {
  const quarter = Math.floor(date.getUTCMonth() / 3);
  const d = new Date(Date.UTC(date.getUTCFullYear(), quarter * 3, 1));
  return d;
}

function getQuarterEnd(date: Date): Date {
  const quarter = Math.floor(date.getUTCMonth() / 3);
  const d = new Date(Date.UTC(date.getUTCFullYear(), quarter * 3 + 3, 0));
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

export const portfolioReviewRouter = createTRPCRouter({
  /**
   * Bootstrap query for the /weekly-review page. Returns everything needed
   * to render the intro and Phase 1 (workspace triage) in a single round trip.
   * OKR + project detail for Phase 2/3 are lazy-loaded per-tab.
   */
  getReviewData: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const now = new Date();
    const weekStartDate = getSundayWeekStart(now);
    const lastWeekStart = new Date(weekStartDate);
    lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);

    const currentQuarter = getCurrentQuarter(now);
    const currentAnnual = getCurrentAnnual(now);
    const quarterStart = getQuarterStart(now);
    const quarterEnd = getQuarterEnd(now);

    const workspaces = await ctx.db.workspace.findMany({
      where: buildWorkspaceAccessWhere(userId),
      include: {
        _count: {
          select: {
            projects: true,
            goals: true,
            outcomes: true,
          },
        },
      },
      orderBy: [{ type: "asc" }, { createdAt: "desc" }],
    });

    const workspaceIds = workspaces.map((w) => w.id);

    const [
      currentWeekFocuses,
      lastWeekFocuses,
      goalsForRollup,
      activeProjects,
    ] = await Promise.all([
      ctx.db.workspaceWeeklyFocus.findMany({
        where: { userId, weekStartDate, workspaceId: { in: workspaceIds } },
      }),
      ctx.db.workspaceWeeklyFocus.findMany({
        where: {
          userId,
          weekStartDate: lastWeekStart,
          workspaceId: { in: workspaceIds },
        },
      }),
      // Goals for the current quarter (or annual) used to compute per-workspace
      // OKR rollup: count + health distribution. Cheap aggregate.
      ctx.db.goal.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          status: { in: ["active", "planned"] },
          OR: [
            { period: currentQuarter },
            { period: currentAnnual },
            { period: null },
          ],
        },
        select: {
          id: true,
          workspaceId: true,
          period: true,
          health: true,
          status: true,
        },
      }),
      // Active projects across all accessible workspaces — slim projection.
      ctx.db.project.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          priority: true,
          progress: true,
          workspaceId: true,
          endDate: true,
          actions: {
            select: { id: true, status: true, completedAt: true, dueDate: true },
          },
          keyResults: {
            select: {
              keyResult: {
                select: { id: true, status: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Group rollup data per workspace
    const goalsByWorkspace = new Map<
      string,
      Array<(typeof goalsForRollup)[number]>
    >();
    for (const g of goalsForRollup) {
      if (!g.workspaceId) continue;
      const list = goalsByWorkspace.get(g.workspaceId) ?? [];
      list.push(g);
      goalsByWorkspace.set(g.workspaceId, list);
    }

    const projectsByWorkspace = new Map<
      string,
      Array<(typeof activeProjects)[number]>
    >();
    for (const p of activeProjects) {
      if (!p.workspaceId) continue;
      const list = projectsByWorkspace.get(p.workspaceId) ?? [];
      list.push(p);
      projectsByWorkspace.set(p.workspaceId, list);
    }

    const quarterRollupByWorkspace = workspaces.map((ws) => {
      const goals = goalsByWorkspace.get(ws.id) ?? [];
      const okrCount = goals.filter(
        (g) => g.period === currentQuarter || g.period === currentAnnual,
      ).length;
      const projects = projectsByWorkspace.get(ws.id) ?? [];

      // Health distribution (uses cached Goal.health from the OKR rollup)
      const healthCounts = goals.reduce(
        (acc, g) => {
          const h = g.health ?? "no-update";
          if (h === "on-track") acc.onTrack++;
          else if (h === "at-risk") acc.atRisk++;
          else if (h === "off-track") acc.offTrack++;
          else acc.noUpdate++;
          return acc;
        },
        { onTrack: 0, atRisk: 0, offTrack: 0, noUpdate: 0 },
      );

      // Recent activity = most recent action.completedAt across this workspace's projects
      let mostRecentActivity: Date | null = null;
      let dueActions = 0;
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      for (const p of projects) {
        for (const a of p.actions) {
          if (a.completedAt) {
            if (!mostRecentActivity || a.completedAt > mostRecentActivity) {
              mostRecentActivity = a.completedAt;
            }
          }
          if (
            a.dueDate &&
            a.dueDate <= today &&
            a.status !== "COMPLETED" &&
            a.status !== "DONE"
          ) {
            dueActions++;
          }
        }
      }

      return {
        workspaceId: ws.id,
        okrCount,
        healthCounts,
        activeProjectCount: projects.length,
        dueActions,
        mostRecentActivity,
      };
    });

    // Streak (computed from PortfolioReviewCompletion)
    const completions = await ctx.db.portfolioReviewCompletion.findMany({
      where: { userId },
      orderBy: { weekStartDate: "desc" },
      select: { weekStartDate: true },
    });
    const streak = computeStreak(completions, weekStartDate);

    return {
      now,
      weekStartDate,
      lastWeekStart,
      currentQuarter,
      currentAnnual,
      quarterStart,
      quarterEnd,
      workspaces: workspaces.map((ws) => ({
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        type: ws.type,
        description: ws.description,
        counts: ws._count,
      })),
      currentWeekFocuses,
      lastWeekFocuses,
      quarterRollupByWorkspace,
      streak,
    };
  }),

  /**
   * Upsert the in-focus / focus text for one workspace this week.
   */
  setWorkspaceFocus: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        isInFocus: z.boolean(),
        focusText: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      // Verify membership (handles direct + team-based access)
      const membership = await getWorkspaceMembership(
        ctx.db,
        userId,
        input.workspaceId,
      );
      if (!membership) {
        throw new Error("You don't have access to this workspace");
      }
      const weekStartDate = getSundayWeekStart(new Date());
      return ctx.db.workspaceWeeklyFocus.upsert({
        where: {
          userId_workspaceId_weekStartDate: {
            userId,
            workspaceId: input.workspaceId,
            weekStartDate,
          },
        },
        update: {
          isInFocus: input.isInFocus,
          focusText: input.focusText ?? null,
        },
        create: {
          userId,
          workspaceId: input.workspaceId,
          weekStartDate,
          isInFocus: input.isInFocus,
          focusText: input.focusText ?? null,
        },
      });
    }),

  /**
   * Set this week's pinned objectives + key results for a workspace, and
   * optionally re-order the workspace's goals via displayOrder in one tx.
   */
  setWeeklyFocusGoals: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        focusGoalIds: z.array(z.number()),
        focusKeyResultIds: z.array(z.string()).optional(),
        reorderedGoalIds: z.array(z.number()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const membership = await getWorkspaceMembership(
        ctx.db,
        userId,
        input.workspaceId,
      );
      if (!membership) {
        throw new Error("You don't have access to this workspace");
      }
      const weekStartDate = getSundayWeekStart(new Date());

      const focus = await ctx.db.workspaceWeeklyFocus.upsert({
        where: {
          userId_workspaceId_weekStartDate: {
            userId,
            workspaceId: input.workspaceId,
            weekStartDate,
          },
        },
        update: {
          focusGoalIds: input.focusGoalIds,
          ...(input.focusKeyResultIds
            ? { focusKeyResultIds: input.focusKeyResultIds }
            : {}),
        },
        create: {
          userId,
          workspaceId: input.workspaceId,
          weekStartDate,
          isInFocus: true,
          focusGoalIds: input.focusGoalIds,
          focusKeyResultIds: input.focusKeyResultIds ?? [],
        },
      });

      if (input.reorderedGoalIds && input.reorderedGoalIds.length > 0) {
        await ctx.db.$transaction(
          input.reorderedGoalIds.map((goalId, idx) =>
            ctx.db.goal.update({
              where: { id: goalId },
              data: { displayOrder: idx },
            }),
          ),
        );
      }

      return focus;
    }),

  /**
   * Mark this week's portfolio review complete. Idempotent via the
   * (userId, weekStartDate) unique constraint.
   */
  markComplete: protectedProcedure
    .input(
      z.object({
        workspacesInFocus: z.number().optional(),
        krCheckInsLogged: z.number().optional(),
        goalsReprioritized: z.number().optional(),
        projectsReprioritized: z.number().optional(),
        focusStatementsSet: z.number().optional(),
        durationMinutes: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const weekStartDate = getSundayWeekStart(new Date());
      return ctx.db.portfolioReviewCompletion.upsert({
        where: { userId_weekStartDate: { userId, weekStartDate } },
        update: {
          completedAt: new Date(),
          workspacesInFocus: input.workspacesInFocus ?? 0,
          krCheckInsLogged: input.krCheckInsLogged ?? 0,
          goalsReprioritized: input.goalsReprioritized ?? 0,
          projectsReprioritized: input.projectsReprioritized ?? 0,
          focusStatementsSet: input.focusStatementsSet ?? 0,
          durationMinutes: input.durationMinutes,
        },
        create: {
          userId,
          weekStartDate,
          workspacesInFocus: input.workspacesInFocus ?? 0,
          krCheckInsLogged: input.krCheckInsLogged ?? 0,
          goalsReprioritized: input.goalsReprioritized ?? 0,
          projectsReprioritized: input.projectsReprioritized ?? 0,
          focusStatementsSet: input.focusStatementsSet ?? 0,
          durationMinutes: input.durationMinutes,
        },
      });
    }),

  /**
   * Past completed portfolio reviews, joined with the user's workspace
   * focus rows for each of those weeks so we can show themes in the list.
   */
  getCompletedReviews: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(52).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const limit = input?.limit ?? 12;

      const completions = await ctx.db.portfolioReviewCompletion.findMany({
        where: { userId },
        orderBy: { weekStartDate: "desc" },
        take: limit,
      });

      if (completions.length === 0) {
        return [];
      }

      const weekStarts = completions.map((c) => c.weekStartDate);
      const focuses = await ctx.db.workspaceWeeklyFocus.findMany({
        where: {
          userId,
          weekStartDate: { in: weekStarts },
          isInFocus: true,
        },
        include: {
          workspace: {
            select: { id: true, name: true, slug: true, type: true },
          },
        },
      });

      // Group focuses by week start ms for fast lookup
      const focusByWeek = new Map<number, typeof focuses>();
      for (const f of focuses) {
        const k = f.weekStartDate.getTime();
        const list = focusByWeek.get(k) ?? [];
        list.push(f);
        focusByWeek.set(k, list);
      }

      return completions.map((c) => ({
        ...c,
        focuses: focusByWeek.get(c.weekStartDate.getTime()) ?? [],
      }));
    }),

  /**
   * Has the current week's portfolio review been completed?
   */
  isCompletedThisWeek: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const weekStartDate = getSundayWeekStart(new Date());
    const completion = await ctx.db.portfolioReviewCompletion.findUnique({
      where: { userId_weekStartDate: { userId, weekStartDate } },
    });
    return {
      isCompleted: !!completion,
      completedAt: completion?.completedAt ?? null,
      weekStartDate,
    };
  }),

  /**
   * Streak data for portfolio reviews (independent of per-workspace streak).
   */
  getStreak: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const completions = await ctx.db.portfolioReviewCompletion.findMany({
      where: { userId },
      orderBy: { weekStartDate: "desc" },
      select: { weekStartDate: true },
    });
    const thisWeekStart = getSundayWeekStart(new Date());
    return computeStreak(completions, thisWeekStart);
  }),
});

function computeStreak(
  completions: Array<{ weekStartDate: Date }>,
  thisWeekStart: Date,
) {
  if (completions.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalReviews: 0,
      thisWeekComplete: false,
    };
  }

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);

  const weekTimes = new Set(completions.map((c) => c.weekStartDate.getTime()));
  const thisWeekDone = weekTimes.has(thisWeekStart.getTime());
  const lastWeekDone = weekTimes.has(lastWeekStart.getTime());

  let currentStreak = 0;
  if (thisWeekDone || lastWeekDone) {
    let expected = thisWeekDone ? thisWeekStart : lastWeekStart;
    for (const c of completions) {
      const t = c.weekStartDate.getTime();
      if (t === expected.getTime()) {
        currentStreak++;
        expected = new Date(expected);
        expected.setUTCDate(expected.getUTCDate() - 7);
      } else if (t < expected.getTime()) {
        break;
      }
    }
  }

  let longestStreak = 0;
  let tempStreak = 0;
  let prevWeek: Date | null = null;
  const sorted = [...completions].sort(
    (a, b) => a.weekStartDate.getTime() - b.weekStartDate.getTime(),
  );
  for (const c of sorted) {
    if (!prevWeek) {
      tempStreak = 1;
    } else {
      const expectedNext = new Date(prevWeek);
      expectedNext.setUTCDate(expectedNext.getUTCDate() + 7);
      tempStreak =
        c.weekStartDate.getTime() === expectedNext.getTime()
          ? tempStreak + 1
          : 1;
    }
    if (tempStreak > longestStreak) longestStreak = tempStreak;
    prevWeek = c.weekStartDate;
  }

  return {
    currentStreak,
    longestStreak,
    totalReviews: completions.length,
    thisWeekComplete: thisWeekDone,
  };
}
