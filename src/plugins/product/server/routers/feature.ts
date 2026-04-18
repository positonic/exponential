import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { loadProductWithAccess, assertWorkspaceMember } from "./product";
import type { PrismaClient } from "@prisma/client";

const featureStatusEnum = z.enum([
  "IDEA",
  "DEFINED",
  "IN_PROGRESS",
  "SHIPPED",
  "ARCHIVED",
]);

const scopeStatusEnum = z.enum([
  "PLANNED",
  "IN_PROGRESS",
  "SHIPPED",
  "DEPRECATED",
]);

/**
 * Load a feature and verify workspace membership via its product.
 */
async function loadFeatureWithAccess(
  db: PrismaClient,
  userId: string,
  featureId: string,
) {
  const feature = await db.feature.findUnique({
    where: { id: featureId },
    select: {
      id: true,
      productId: true,
      product: { select: { workspaceId: true } },
    },
  });
  if (!feature) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found" });
  }
  await assertWorkspaceMember(db, userId, feature.product.workspaceId);
  return feature;
}

async function loadScopeWithAccess(
  db: PrismaClient,
  userId: string,
  scopeId: string,
) {
  const scope = await db.featureScope.findUnique({
    where: { id: scopeId },
    select: {
      id: true,
      featureId: true,
      feature: {
        select: { productId: true, product: { select: { workspaceId: true } } },
      },
    },
  });
  if (!scope) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Scope not found" });
  }
  await assertWorkspaceMember(
    db,
    userId,
    scope.feature.product.workspaceId,
  );
  return scope;
}

async function loadUserStoryWithAccess(
  db: PrismaClient,
  userId: string,
  storyId: string,
) {
  const story = await db.userStory.findUnique({
    where: { id: storyId },
    select: {
      id: true,
      featureId: true,
      feature: { select: { product: { select: { workspaceId: true } } } },
    },
  });
  if (!story) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User story not found" });
  }
  await assertWorkspaceMember(
    db,
    userId,
    story.feature.product.workspaceId,
  );
  return story;
}

export const featureRouter = createTRPCRouter({
  // ────────────────── Features ──────────────────
  list: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        status: featureStatusEnum.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      return ctx.db.feature.findMany({
        where: {
          productId: input.productId,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          goal: { select: { id: true, title: true, period: true } },
          tags: { include: { tag: true } },
          _count: {
            select: { scopes: true, userStories: true, tickets: true },
          },
        },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const feature = await ctx.db.feature.findUnique({
        where: { id: input.id },
        include: {
          product: { select: { id: true, slug: true, workspaceId: true, name: true } },
          createdBy: { select: { id: true, name: true, image: true } },
          goal: {
            select: {
              id: true,
              title: true,
              period: true,
              parentGoalId: true,
              parentGoal: { select: { id: true, title: true } },
            },
          },
          scopes: { orderBy: { displayOrder: "asc" } },
          userStories: { orderBy: { displayOrder: "asc" } },
          insights: {
            include: {
              insight: {
                include: {
                  research: { select: { id: true, title: true, type: true } },
                },
              },
            },
          },
          tags: { include: { tag: true } },
          _count: { select: { tickets: true } },
        },
      });
      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found" });
      }
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        feature.product.workspaceId,
      );
      return feature;
    }),

  create: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        name: z.string().min(1).max(200),
        description: z.string().max(10000).optional(),
        vision: z.string().max(2000).optional(),
        status: featureStatusEnum.optional(),
        effort: z.number().optional(),
        priority: z.number().int().min(0).max(4).optional(),
        goalId: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      if (input.goalId) {
        const goal = await ctx.db.goal.findUnique({
          where: { id: input.goalId },
          select: { id: true },
        });
        if (!goal) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Goal not found",
          });
        }
      }

      return ctx.db.feature.create({
        data: {
          productId: input.productId,
          name: input.name,
          description: input.description,
          vision: input.vision,
          status: input.status ?? "IDEA",
          effort: input.effort,
          priority: input.priority,
          goalId: input.goalId,
          createdById: ctx.session.user.id,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(10000).optional(),
        vision: z.string().max(2000).optional(),
        status: featureStatusEnum.optional(),
        effort: z.number().optional(),
        priority: z.number().int().min(0).max(4).optional(),
        goalId: z.number().int().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadFeatureWithAccess(ctx.db, ctx.session.user.id, input.id);

      const { id, ...data } = input;
      return ctx.db.feature.update({
        where: { id },
        data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadFeatureWithAccess(ctx.db, ctx.session.user.id, input.id);
      await ctx.db.feature.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ────────────────── Feature Scopes ──────────────────
  addScope: protectedProcedure
    .input(
      z.object({
        featureId: z.string(),
        version: z.string().min(1).max(60),
        description: z.string().min(1).max(10000),
        status: scopeStatusEnum.optional(),
        shippedAt: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadFeatureWithAccess(ctx.db, ctx.session.user.id, input.featureId);

      const maxOrder = await ctx.db.featureScope.findFirst({
        where: { featureId: input.featureId },
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true },
      });

      return ctx.db.featureScope.create({
        data: {
          featureId: input.featureId,
          version: input.version,
          description: input.description,
          status: input.status ?? "PLANNED",
          shippedAt: input.shippedAt,
          displayOrder: (maxOrder?.displayOrder ?? -1) + 1,
        },
      });
    }),

  updateScope: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        version: z.string().min(1).max(60).optional(),
        description: z.string().min(1).max(10000).optional(),
        status: scopeStatusEnum.optional(),
        shippedAt: z.date().nullable().optional(),
        displayOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadScopeWithAccess(ctx.db, ctx.session.user.id, input.id);

      const { id, ...data } = input;
      return ctx.db.featureScope.update({
        where: { id },
        data,
      });
    }),

  deleteScope: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadScopeWithAccess(ctx.db, ctx.session.user.id, input.id);
      await ctx.db.featureScope.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ────────────────── User Stories ──────────────────
  addUserStory: protectedProcedure
    .input(
      z.object({
        featureId: z.string(),
        scopeId: z.string().optional(),
        asA: z.string().max(500).optional(),
        iWant: z.string().max(1000).optional(),
        soThat: z.string().max(1000).optional(),
        acceptanceCriteria: z.string().max(10000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadFeatureWithAccess(ctx.db, ctx.session.user.id, input.featureId);

      if (input.scopeId) {
        const scope = await ctx.db.featureScope.findUnique({
          where: { id: input.scopeId },
          select: { featureId: true },
        });
        if (!scope || scope.featureId !== input.featureId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Scope does not belong to this feature",
          });
        }
      }

      const maxOrder = await ctx.db.userStory.findFirst({
        where: { featureId: input.featureId },
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true },
      });

      return ctx.db.userStory.create({
        data: {
          featureId: input.featureId,
          scopeId: input.scopeId,
          asA: input.asA,
          iWant: input.iWant,
          soThat: input.soThat,
          acceptanceCriteria: input.acceptanceCriteria,
          displayOrder: (maxOrder?.displayOrder ?? -1) + 1,
        },
      });
    }),

  updateUserStory: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        scopeId: z.string().nullable().optional(),
        asA: z.string().max(500).optional(),
        iWant: z.string().max(1000).optional(),
        soThat: z.string().max(1000).optional(),
        acceptanceCriteria: z.string().max(10000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadUserStoryWithAccess(ctx.db, ctx.session.user.id, input.id);

      const { id, ...data } = input;
      return ctx.db.userStory.update({
        where: { id },
        data,
      });
    }),

  deleteUserStory: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadUserStoryWithAccess(ctx.db, ctx.session.user.id, input.id);
      await ctx.db.userStory.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
