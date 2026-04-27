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

import {
  getMyPublicGoals,
  getGoalById,
  updateGoal,
  getProjectGoals,
  deleteGoal,
  getGoalTree,
  computeGoalHealth,
  updateGoalIcon,
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
      return ctx.db.goal.update({
        where: { id: input.id },
        data: { status: input.status },
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
});
