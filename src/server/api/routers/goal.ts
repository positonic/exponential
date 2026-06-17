import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { getWorkspaceMembership } from "~/server/services/access/resolvers/workspaceResolver";
import { getProjectAccess, hasProjectAccess } from "~/server/services/access";
import { TRPCError } from "@trpc/server";
import { completeOnboardingStep } from "~/server/services/onboarding/syncOnboardingProgress";
import { recordActivity } from "~/server/services/activity/recordActivity";

import {
  getMyPublicGoals,
  getGoalById,
  updateGoal,
  getProjectGoals,
  deleteGoal,
  getGoalTree,
  computeGoalHealth,
  updateGoalIcon,
  verifyGoalAccess,
} from "~/server/services/goalService";

export const goalRouter = createTRPCRouter({
  myPublicGoals: publicProcedure
    .query(getMyPublicGoals),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const goal = await getGoalById({ ctx, id: input.id });
      if (!goal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
      }
      // Verify access: user is owner, DRI, or workspace member
      if (goal.workspaceId) {
        const membership = await getWorkspaceMembership(ctx.db, ctx.session.user.id, goal.workspaceId);
        if (!membership && goal.userId !== ctx.session.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      } else if (goal.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return goal;
    }),

  getAllMyGoals: protectedProcedure
    .input(z.object({
      workspaceId: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      // When workspace-scoped, validate membership and show all workspace goals
      const workspaceId = input?.workspaceId;
      if (workspaceId) {
        const membership = await getWorkspaceMembership(ctx.db, ctx.session.user.id, workspaceId);
        if (!membership) {
          // Return empty array instead of throwing — this query is used by sidebar/navigation
          // components that should gracefully degrade when workspace access is lost
          return [];
        }
      }

      return await ctx.db.goal.findMany({
        where: {
          ...(workspaceId
            ? { workspaceId }
            : { userId: ctx.session.user.id }),
        },
        include: {
          lifeDomain: true,
          projects: true,
          outcomes: true,
          childGoals: { select: { id: true, title: true, status: true, health: true } },
          _count: { select: { keyResults: true } },
        },
        orderBy: { displayOrder: "asc" },
      });
    }),

  createGoal: protectedProcedure
    .input(z.object({
      title: z.string(),
      description: z.string().optional(),
      whyThisGoal: z.string().optional(),
      notes: z.string().optional(),
      dueDate: z.date().optional(),
      period: z.string().optional(),
      status: z.enum(["planned", "active", "completed", "archived"]).optional(),
      lifeDomainId: z.number().optional(),
      projectId: z.string().optional(),
      outcomeIds: z.array(z.string()).optional(),
      driUserId: z.string().optional(),
      workspaceId: z.string().optional(),
      parentGoalId: z.number().optional(),
      icon: z.string().nullable().optional(),
      iconColor: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Enforce max nesting depth of 5 levels for sub-goals
      if (input.parentGoalId) {
        let depth = 1;
        let currentParentId: number | null = input.parentGoalId;
        while (currentParentId) {
          const parentGoal: { parentGoalId: number | null } | null = await ctx.db.goal.findUnique({
            where: { id: currentParentId },
            select: { parentGoalId: true },
          });
          if (!parentGoal) break;
          currentParentId = parentGoal.parentGoalId;
          depth++;
          if (depth > 5) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum nesting depth of 5 levels exceeded" });
          }
        }
      }

      const goal = await ctx.db.goal.create({
        data: {
          title: input.title,
          description: input.description,
          whyThisGoal: input.whyThisGoal,
          notes: input.notes,
          dueDate: input.dueDate,
          period: input.period ?? null,
          status: input.status ?? "active",
          lifeDomainId: input.lifeDomainId ?? null,
          userId: ctx.session.user.id,
          driUserId: input.driUserId ?? ctx.session.user.id,
          workspaceId: input.workspaceId ?? null,
          parentGoalId: input.parentGoalId ?? null,
          projects: input.projectId
            ? { connect: [{ id: input.projectId }] }
            : undefined,
          outcomes: input.outcomeIds?.length
            ? { connect: input.outcomeIds.map(id => ({ id })) }
            : undefined,
        },
        include: {
          lifeDomain: true,
          projects: true,
          outcomes: true,
        },
      });

      // Sync onboarding progress (fire-and-forget)
      void completeOnboardingStep(ctx.db, ctx.session.user.id, "goal").catch(
        (err: unknown) => { console.error("[onboarding-sync] goal:", err); },
      );

      return goal;
    }),

  updateGoal: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string(),
      description: z.string().optional(),
      whyThisGoal: z.string().optional(),
      notes: z.string().optional(),
      dueDate: z.date().optional(),
      period: z.string().optional(),
      status: z.enum(["planned", "active", "completed", "archived"]).optional(),
      lifeDomainId: z.number().optional(),
      projectId: z.string().optional(),
      outcomeIds: z.array(z.string()).optional(),
      driUserId: z.string().optional(),
      workspaceId: z.string().optional(),
      parentGoalId: z.number().nullable().optional(),
      displayOrder: z.number().optional(),
      icon: z.string().nullable().optional(),
      iconColor: z.string().nullable().optional(),
    }))
    .mutation(updateGoal),

  getProjectGoals: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const projectAccess = await getProjectAccess(ctx.db, ctx.session.user.id, input.projectId);
      if (!hasProjectAccess(projectAccess)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this project",
        });
      }
      return getProjectGoals({ ctx, projectId: input.projectId });
    }),

  // Get goals as a nested tree (for initiative/sub-initiative views)
  getGoalTree: protectedProcedure
    .input(z.object({
      workspaceId: z.string().optional(),
      status: z.enum(["planned", "active", "completed", "archived"]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      if (input?.workspaceId) {
        const membership = await getWorkspaceMembership(ctx.db, ctx.session.user.id, input.workspaceId);
        if (!membership) return [];
      }
      return getGoalTree({ ctx, workspaceId: input?.workspaceId, status: input?.status });
    }),

  // Quick status update (Planned → Active → Completed lifecycle)
  updateGoalStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["planned", "active", "completed", "archived", "on-hold"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const goal = await ctx.db.goal.findFirst({
        where: { id: input.id },
      });
      if (!goal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found or unauthorized" });
      }
      // Check access: owner OR workspace member
      if (goal.workspaceId) {
        const membership = await getWorkspaceMembership(ctx.db, ctx.session.user.id, goal.workspaceId);
        if (!membership && goal.userId !== ctx.session.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      } else if (goal.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found or unauthorized" });
      }
      const updated = await ctx.db.goal.update({
        where: { id: input.id },
        data: { status: input.status },
      });

      // Surface goal completion as a workspace milestone. Only on the transition
      // into "completed", and only for workspace-scoped goals. This is distinct
      // from the per-goal update/comment feed. Fire-and-forget: never throws.
      if (
        input.status === "completed" &&
        goal.status !== "completed" &&
        goal.workspaceId
      ) {
        await recordActivity(ctx.db, {
          workspaceId: goal.workspaceId,
          userId: ctx.session.user.id,
          entityType: "goal",
          entityId: String(goal.id),
          action: "completed",
          metadata: { title: goal.title },
        }).catch(() => {
          /* instrumentation failure is non-fatal */
        });
      }

      return updated;
    }),

  // Set or clear a goal's manual progress override (0–100). When set, it wins
  // over the KR-derived progress (see goalProgress.ts). Passing progress: null
  // clears the override, at which point the KR mean (or "not started") returns.
  // Mirrors the ADR-0004 healthOverride audit pattern.
  setProgressOverride: protectedProcedure
    .input(z.object({
      id: z.number(),
      progress: z.number().min(0).max(100).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyGoalAccess({ ctx, goalId: input.id });
      return ctx.db.goal.update({
        where: { id: input.id },
        data: {
          progressOverride: input.progress,
          progressOverrideAt: input.progress !== null ? new Date() : null,
          progressOverrideById: input.progress !== null ? ctx.session.user.id : null,
        },
      });
    }),

  // Trigger health recomputation for a goal
  recomputeHealth: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return computeGoalHealth({ ctx, goalId: input.id });
    }),

  updateGoalIcon: protectedProcedure
    .input(z.object({
      id: z.number(),
      icon: z.string().nullable(),
      iconColor: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return updateGoalIcon({ ctx, input });
    }),

  deleteGoal: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return deleteGoal({ ctx, input });
    }),

  // Up to 5 active focus goals for the current quarter, with the data the
  // Coaching home layout needs to render goal cards (sparkline, latest update,
  // comment count, life-domain badge, weekly commit lines).
  listCoachingFocus: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await getWorkspaceMembership(
        ctx.db,
        ctx.session.user.id,
        input.workspaceId,
      );
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this workspace",
        });
      }

      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3) + 1;
      const currentPeriod = `Q${quarter}-${now.getFullYear()}`;

      // ISO week range (Mon 00:00 UTC → Sun 23:59:59.999 UTC) for a given date.
      const isoWeekRange = (date: Date) => {
        const day = date.getUTCDay() || 7; // 1..7, Monday=1, Sunday=7
        const monday = new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        );
        monday.setUTCDate(monday.getUTCDate() - day + 1);
        const sunday = new Date(monday);
        sunday.setUTCDate(sunday.getUTCDate() + 6);
        sunday.setUTCHours(23, 59, 59, 999);
        return { start: monday, end: sunday };
      };

      const thisWeek = isoWeekRange(now);
      const lastWeekRef = new Date(now);
      lastWeekRef.setUTCDate(lastWeekRef.getUTCDate() - 7);
      const lastWeek = isoWeekRange(lastWeekRef);

      const goals = await ctx.db.goal.findMany({
        where: {
          workspaceId: input.workspaceId,
          status: "active",
          period: currentPeriod,
        },
        include: {
          lifeDomain: true,
          progressSnapshots: {
            orderBy: { snapshotDate: "desc" },
            take: 8,
          },
          updates: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          _count: { select: { comments: true } },
          // Pull the goal's linked projects + only the Actions that fall in
          // the windows we care about (last week / this week).
          projects: {
            select: {
              id: true,
              actions: {
                where: {
                  OR: [
                    { completedAt: { gte: lastWeek.start, lte: lastWeek.end } },
                    { dueDate: { gte: lastWeek.start, lte: lastWeek.end } },
                    { dueDate: { gte: thisWeek.start, lte: thisWeek.end } },
                  ],
                },
                select: {
                  id: true,
                  name: true,
                  status: true,
                  dueDate: true,
                  completedAt: true,
                },
              },
            },
          },
        },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        take: 5,
      });

      const inRange = (
        d: Date | null | undefined,
        range: { start: Date; end: Date },
      ) => !!d && d >= range.start && d <= range.end;

      return {
        currentPeriod,
        thisWeek: { start: thisWeek.start, end: thisWeek.end },
        lastWeek: { start: lastWeek.start, end: lastWeek.end },
        goals: goals.map((goal) => {
          // Dedupe in case an Action somehow appears via multiple project
          // joins (defensive — Action.projectId is a single FK today).
          const seen = new Set<string>();
          const allActions = goal.projects.flatMap((p) =>
            p.actions.filter((a) => {
              if (seen.has(a.id)) return false;
              seen.add(a.id);
              return true;
            }),
          );

          const lastWeekKept = allActions.filter((a) =>
            inRange(a.completedAt, lastWeek),
          );
          const lastWeekMissed = allActions.filter(
            (a) =>
              inRange(a.dueDate, lastWeek) &&
              a.status !== "COMPLETED" &&
              !inRange(a.completedAt, lastWeek),
          );
          const thisWeekActions = allActions.filter((a) =>
            inRange(a.dueDate, thisWeek),
          );

          return {
            id: goal.id,
            title: goal.title,
            health: goal.health,
            projectCount: goal.projects.length,
            lifeDomain: goal.lifeDomain
              ? {
                  id: goal.lifeDomain.id,
                  title: goal.lifeDomain.title,
                  color: goal.lifeDomain.color,
                  icon: goal.lifeDomain.icon,
                }
              : null,
            // Reverse to ascending date order so the sparkline reads left→right.
            snapshots: goal.progressSnapshots
              .slice()
              .reverse()
              .map((s) => ({
                progress: s.progress,
                snapshotDate: s.snapshotDate,
              })),
            latestUpdate: goal.updates[0]
              ? {
                  id: goal.updates[0].id,
                  content: goal.updates[0].content,
                  createdAt: goal.updates[0].createdAt,
                }
              : null,
            commentCount: goal._count.comments,
            lastWeekKept,
            lastWeekMissed,
            thisWeekActions,
          };
        }),
      };
    }),
});
