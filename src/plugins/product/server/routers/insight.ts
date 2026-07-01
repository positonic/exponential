import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { loadProductWithAccess, assertWorkspaceMember } from "./product";
import type { PrismaClient } from "@prisma/client";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";

const insightTypeEnum = z.enum([
  "PAIN_POINT",
  "OPPORTUNITY",
  "FEEDBACK",
  "PERSONA",
  "JOURNEY",
  "OBSERVATION",
  "COMPETITIVE",
  "PROBLEM",
]);

const insightStatusEnum = z.enum(["INBOX", "TRIAGED", "LINKED", "DISMISSED"]);

// Provenance filter (ADR-0037). An insight "came from a form" iff its `source`
// starts with `form:` (stamped by the `create_insight` destination). `manual`
// is everything else; `all` (default) applies no source filter.
const insightOriginEnum = z.enum(["form", "manual", "all"]);

// General triage scores (impact/confidence), 1–5. Usable by any insight type
// (ADR-0036) — formerly Problem-only.
const scoreSchema = z.number().int().min(1).max(5);

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
        category: z.string().optional(),
        // Provenance filter (ADR-0037): `form` = came in via a form
        // (`source` starts with `form:`), `manual` = anything else, `all`
        // (default) applies no source filter.
        origin: insightOriginEnum.optional(),
        // Parked insights are hidden by default — parking is independent of
        // status (an insight keeps its status while parked). Pass true to
        // include them (the "Show parked" toggle / a Parked lane).
        includeParked: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      // Translate the origin filter into a `source` predicate. `form` matches
      // the `form:` prefix stamped by the create_insight destination; `manual`
      // excludes it (NULL sources are manual too).
      const originWhere =
        input.origin === "form"
          ? { source: { startsWith: "form:" } }
          : input.origin === "manual"
            ? {
                OR: [
                  { source: null },
                  { NOT: { source: { startsWith: "form:" } } },
                ],
              }
            : {};

      return ctx.db.insight.findMany({
        where: {
          productId: input.productId,
          ...(input.type ? { type: input.type } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.category ? { category: input.category } : {}),
          ...originWhere,
          ...(input.includeParked ? {} : { parkedAt: null }),
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
        title: boundedText("Title", 300, { min: 1 }),
        body: boundedText("Body", TEXT_LIMITS.LARGE).optional(),
        source: boundedText("Source", 500).optional(),
        sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
        status: insightStatusEnum.optional(),
        // General triage fields (ADR-0036) — usable by any type.
        evidence: boundedText("Evidence", TEXT_LIMITS.LARGE).optional(),
        category: boundedText("Category", TEXT_LIMITS.LABEL).optional(),
        impact: scoreSchema.optional(),
        confidence: scoreSchema.optional(),
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
            evidence: input.evidence,
            category: input.category,
            impact: input.impact,
            confidence: input.confidence,
            description: input.title,
            status: input.status ?? "INBOX",
            createdById: ctx.session.user.id,
          },
        });

        if (input.featureIds && input.featureIds.length > 0) {
          const uniqueFeatureIds = [...new Set(input.featureIds)];
          const validFeatures = await tx.feature.findMany({
            where: { id: { in: uniqueFeatureIds }, productId: insight.productId },
            select: { id: true },
          });
          if (validFeatures.length !== uniqueFeatureIds.length) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "One or more features do not belong to this insight's product",
            });
          }
          await tx.featureInsight.createMany({
            data: uniqueFeatureIds.map((featureId) => ({
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
        title: boundedText("Title", 300, { min: 1 }).optional(),
        body: boundedText("Body", TEXT_LIMITS.LARGE).nullable().optional(),
        source: boundedText("Source", 500).nullable().optional(),
        sentiment: z.enum(["positive", "neutral", "negative"]).nullable().optional(),
        status: insightStatusEnum.optional(),
        // General triage fields (ADR-0036).
        evidence: boundedText("Evidence", TEXT_LIMITS.LARGE).nullable().optional(),
        category: boundedText("Category", TEXT_LIMITS.LABEL).nullable().optional(),
        impact: scoreSchema.nullable().optional(),
        confidence: scoreSchema.nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.id);
      const { id, ...data } = input;
      return ctx.db.insight.update({
        where: { id },
        data: {
          ...data,
          // Keep description in sync with title so both columns stay consistent
          ...(input.title ? { description: input.title } : {}),
        },
      });
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
      const insight = await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.insightId);
      const feature = await ctx.db.feature.findUnique({
        where: { id: input.featureId },
        select: { id: true, productId: true },
      });
      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found" });
      }
      if (feature.productId !== insight.productId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more features do not belong to this insight's product",
        });
      }
      await ctx.db.featureInsight.upsert({
        where: { featureId_insightId: { featureId: input.featureId, insightId: input.insightId } },
        create: { insightId: input.insightId, featureId: input.featureId },
        update: {},
      });
      return { success: true };
    }),

  unlinkFromFeature: protectedProcedure
    .input(z.object({ insightId: z.string(), featureId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.insightId);
      await ctx.db.featureInsight.deleteMany({
        where: { insightId: input.insightId, featureId: input.featureId },
      });
      return { success: true };
    }),

  /** Replace the full set of features linked to an insight. */
  setFeatures: protectedProcedure
    .input(z.object({ insightId: z.string(), featureIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const insight = await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.insightId);
      const uniqueFeatureIds = [...new Set(input.featureIds)];
      await ctx.db.$transaction(async (tx) => {
        if (uniqueFeatureIds.length > 0) {
          const validFeatures = await tx.feature.findMany({
            where: { id: { in: uniqueFeatureIds }, productId: insight.productId },
            select: { id: true },
          });
          if (validFeatures.length !== uniqueFeatureIds.length) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "One or more features do not belong to this insight's product",
            });
          }
        }
        await tx.featureInsight.deleteMany({ where: { insightId: input.insightId } });
        await tx.featureInsight.createMany({
          data: uniqueFeatureIds.map((featureId) => ({
            insightId: input.insightId,
            featureId,
          })),
          skipDuplicates: true,
        });
      });
      return { success: true };
    }),

  // ── Parking ───────────────────────────────────────────────────────────
  // A general, reversible "defer with a reason" affordance on any insight
  // (ADR-0036) — set aside WITH A REASON, never deleted, and revivable at its
  // prior status. Parked-ness is independent of `status`.

  park: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        reason: boundedText("Reason", TEXT_LIMITS.MEDIUM, { min: 1 }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.id);
      return ctx.db.insight.update({
        where: { id: input.id },
        data: { parkedAt: new Date(), parkReason: input.reason },
      });
    }),

  unpark: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.id);
      // Clearing parkedAt/parkReason restores the insight at its prior status,
      // which was never touched while parked.
      return ctx.db.insight.update({
        where: { id: input.id },
        data: { parkedAt: null, parkReason: null },
      });
    }),
});
