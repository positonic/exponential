import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { loadProductWithAccess, assertWorkspaceMember } from "./product";
import type { PrismaClient } from "@prisma/client";

const insightTypeEnum = z.enum([
  "PAIN_POINT",
  "OPPORTUNITY",
  "FEEDBACK",
  "PERSONA",
  "JOURNEY",
  "OBSERVATION",
  "COMPETITIVE",
]);

const insightStatusEnum = z.enum(["INBOX", "TRIAGED", "LINKED", "DISMISSED"]);

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
  await assertWorkspaceMember(db, userId, insight.product.workspaceId);
  return insight;
}

export const insightRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        type: insightTypeEnum.optional(),
        status: insightStatusEnum.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      return ctx.db.insight.findMany({
        where: {
          productId: input.productId,
          ...(input.type ? { type: input.type } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: [{ createdAt: "desc" }],
        include: {
          createdBy: { select: { id: true, name: true, image: true } },
          tags: { include: { tag: true } },
          features: {
            include: { feature: { select: { id: true, name: true } } },
          },
          _count: { select: { features: true } },
        },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const insight = await ctx.db.insight.findUnique({
        where: { id: input.id },
        include: {
          product: { select: { id: true, slug: true, workspaceId: true, name: true } },
          createdBy: { select: { id: true, name: true, image: true } },
          research: { select: { id: true, title: true, type: true } },
          tags: { include: { tag: true } },
          features: {
            include: { feature: { select: { id: true, name: true, status: true } } },
          },
        },
      });
      if (!insight) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Insight not found" });
      }
      await assertWorkspaceMember(ctx.db, ctx.session.user.id, insight.product.workspaceId);
      return insight;
    }),

  create: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        type: insightTypeEnum,
        title: z.string().min(1).max(300),
        body: z.string().max(50000).optional(),
        source: z.string().max(500).optional(),
        sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
        status: insightStatusEnum.optional(),
        featureIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      return ctx.db.$transaction(async (tx) => {
        const insight = await tx.insight.create({
          data: {
            productId: input.productId,
            type: input.type,
            title: input.title,
            body: input.body,
            source: input.source,
            sentiment: input.sentiment,
            description: input.title,
            status: input.status ?? "INBOX",
            createdById: ctx.session.user.id,
          },
        });

        if (input.featureIds && input.featureIds.length > 0) {
          await tx.featureInsight.createMany({
            data: input.featureIds.map((featureId) => ({
              insightId: insight.id,
              featureId,
            })),
            skipDuplicates: true,
          });
        }

        return insight;
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        type: insightTypeEnum.optional(),
        title: z.string().min(1).max(300).optional(),
        body: z.string().max(50000).nullable().optional(),
        source: z.string().max(500).nullable().optional(),
        sentiment: z.enum(["positive", "neutral", "negative"]).nullable().optional(),
        status: insightStatusEnum.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.id);
      const { id, ...data } = input;
      return ctx.db.insight.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.id);
      await ctx.db.insight.delete({ where: { id: input.id } });
      return { success: true };
    }),

  linkToFeature: protectedProcedure
    .input(z.object({ insightId: z.string(), featureId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.insightId);
      await ctx.db.featureInsight.create({
        data: { insightId: input.insightId, featureId: input.featureId },
      });
      return { success: true };
    }),

  unlinkFromFeature: protectedProcedure
    .input(z.object({ insightId: z.string(), featureId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.insightId);
      await ctx.db.featureInsight.delete({
        where: { featureId_insightId: { insightId: input.insightId, featureId: input.featureId } },
      });
      return { success: true };
    }),

  /** Replace the full set of features linked to an insight. */
  setFeatures: protectedProcedure
    .input(z.object({ insightId: z.string(), featureIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.insightId);
      await ctx.db.$transaction([
        ctx.db.featureInsight.deleteMany({ where: { insightId: input.insightId } }),
        ctx.db.featureInsight.createMany({
          data: input.featureIds.map((featureId) => ({
            insightId: input.insightId,
            featureId,
          })),
          skipDuplicates: true,
        }),
      ]);
      return { success: true };
    }),
});
