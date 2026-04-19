import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { loadProductWithAccess, assertWorkspaceMember } from "./product";
import type { PrismaClient } from "@prisma/client";

const researchTypeEnum = z.enum([
  "INTERVIEW",
  "DESK_RESEARCH",
  "EXPERIMENT",
  "ANALYTICS",
  "SURVEY",
  "OBSERVATION",
  "OTHER",
]);

const insightTypeEnum = z.enum(["PAIN_POINT", "OPPORTUNITY", "FEEDBACK", "PERSONA", "JOURNEY", "OBSERVATION", "COMPETITIVE"]);
const insightStatusEnum = z.enum(["INBOX", "TRIAGED", "LINKED", "DISMISSED"]);

async function loadResearchWithAccess(
  db: PrismaClient,
  userId: string,
  researchId: string,
) {
  const research = await db.research.findUnique({
    where: { id: researchId },
    select: {
      id: true,
      productId: true,
      product: { select: { workspaceId: true } },
    },
  });
  if (!research) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Research not found" });
  }
  await assertWorkspaceMember(
    db,
    userId,
    research.product.workspaceId,
  );
  return research;
}

async function loadInsightWithAccess(
  db: PrismaClient,
  userId: string,
  insightId: string,
) {
  const insight = await db.insight.findUnique({
    where: { id: insightId },
    select: {
      id: true,
      productId: true,
      product: { select: { workspaceId: true } },
    },
  });
  if (!insight) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Insight not found" });
  }
  await assertWorkspaceMember(
    db,
    userId,
    insight.product.workspaceId,
  );
  return insight;
}

export const researchRouter = createTRPCRouter({
  // ────────────────── Research ──────────────────
  list: protectedProcedure
    .input(z.object({ productId: z.string() }))
    .query(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      return ctx.db.research.findMany({
        where: { productId: input.productId },
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: { select: { id: true, name: true, image: true } },
          _count: { select: { insights: true } },
        },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const research = await ctx.db.research.findUnique({
        where: { id: input.id },
        include: {
          product: { select: { id: true, slug: true, workspaceId: true, name: true } },
          createdBy: { select: { id: true, name: true, image: true } },
          insights: {
            orderBy: { createdAt: "desc" },
            include: {
              features: {
                include: {
                  feature: { select: { id: true, name: true, status: true } },
                },
              },
            },
          },
        },
      });
      if (!research) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Research not found" });
      }
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        research.product.workspaceId,
      );
      return research;
    }),

  create: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        title: z.string().min(1).max(300),
        type: researchTypeEnum.optional(),
        conductedAt: z.date().optional(),
        participants: z.string().max(2000).optional(),
        notes: z.string().max(50000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      return ctx.db.research.create({
        data: {
          productId: input.productId,
          title: input.title,
          type: input.type ?? "OTHER",
          conductedAt: input.conductedAt,
          participants: input.participants,
          notes: input.notes,
          createdById: ctx.session.user.id,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(300).optional(),
        type: researchTypeEnum.optional(),
        conductedAt: z.date().nullable().optional(),
        participants: z.string().max(2000).nullable().optional(),
        notes: z.string().max(50000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadResearchWithAccess(ctx.db, ctx.session.user.id, input.id);
      const { id, ...data } = input;
      return ctx.db.research.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadResearchWithAccess(ctx.db, ctx.session.user.id, input.id);
      await ctx.db.research.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ────────────────── Insights ──────────────────
  listInsights: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        status: insightStatusEnum.optional(),
        type: insightTypeEnum.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      return ctx.db.insight.findMany({
        where: {
          research: { productId: input.productId },
          ...(input.status ? { status: input.status } : {}),
          ...(input.type ? { type: input.type } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          research: { select: { id: true, title: true, type: true } },
          features: {
            include: {
              feature: { select: { id: true, name: true } },
            },
          },
        },
      });
    }),

  addInsight: protectedProcedure
    .input(
      z.object({
        researchId: z.string(),
        type: insightTypeEnum,
        description: z.string().min(1).max(5000),
        status: insightStatusEnum.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const research = await loadResearchWithAccess(
        ctx.db,
        ctx.session.user.id,
        input.researchId,
      );
      return ctx.db.insight.create({
        data: {
          productId: research.productId,
          researchId: input.researchId,
          type: input.type,
          title: input.description,
          description: input.description,
          status: input.status ?? "INBOX",
          createdById: ctx.session.user.id,
        },
      });
    }),

  updateInsight: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        type: insightTypeEnum.optional(),
        description: z.string().min(1).max(5000).optional(),
        status: insightStatusEnum.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.id);
      const { id, ...data } = input;
      return ctx.db.insight.update({ where: { id }, data });
    }),

  deleteInsight: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.id);
      await ctx.db.insight.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ────────────────── Insight ↔ Feature linking ──────────────────
  linkInsightToFeature: protectedProcedure
    .input(
      z.object({
        insightId: z.string(),
        featureId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const insight = await loadInsightWithAccess(
        ctx.db,
        ctx.session.user.id,
        input.insightId,
      );
      const feature = await ctx.db.feature.findUnique({
        where: { id: input.featureId },
        select: {
          id: true,
          productId: true,
          product: { select: { workspaceId: true } },
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
      if (feature.productId !== insight.productId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Insight and feature must belong to the same product",
        });
      }

      await ctx.db.featureInsight.upsert({
        where: {
          featureId_insightId: {
            featureId: input.featureId,
            insightId: input.insightId,
          },
        },
        create: {
          featureId: input.featureId,
          insightId: input.insightId,
        },
        update: {},
      });

      // Auto-update insight status to LINKED
      await ctx.db.insight.update({
        where: { id: input.insightId },
        data: { status: "LINKED" },
      });

      return { success: true };
    }),

  unlinkInsightFromFeature: protectedProcedure
    .input(z.object({ insightId: z.string(), featureId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadInsightWithAccess(
        ctx.db,
        ctx.session.user.id,
        input.insightId,
      );
      await ctx.db.featureInsight.deleteMany({
        where: {
          insightId: input.insightId,
          featureId: input.featureId,
        },
      });
      return { success: true };
    }),
});
