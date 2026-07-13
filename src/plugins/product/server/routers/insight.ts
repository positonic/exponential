import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { loadProductWithAccess, assertWorkspaceMember } from "./product";
import { Prisma, type PrismaClient, type InsightType } from "@prisma/client";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";
import { checkStaleWrite } from "~/lib/prd/stale-write";
import { uploadToBlob } from "~/lib/blob";
import { recordActivity } from "~/server/services/activity/recordActivity";

// Loose shape for a ProseMirror document (same treatment as feature.ts).
const prosemirrorDoc = z.record(z.string(), z.unknown());

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

// Status is the triage decision: INBOX = not yet reviewed, TRIAGED (shown as
// "Accepted" in the UI) = reviewed and kept, DISMISSED = reviewed and rejected.
// Feature linkage is a relational fact (FeatureInsight), never a status. The
// DB enum retains a legacy LINKED value (kept to avoid a schema migration);
// it is no longer accepted as input and is coalesced to TRIAGED at read.
const insightStatusEnum = z.enum(["INBOX", "TRIAGED", "DISMISSED"]);

// Read-time coalescing of the legacy LINKED status (see insightStatusEnum).
function coalesceStatus<T extends { status: string }>(row: T): T {
  return row.status === "LINKED" ? { ...row, status: "TRIAGED" } : row;
}

// The only insight types that may appear on the public feedback board: the
// user's own voice (feedback, pain points, feature requests / opportunities).
// Everything else is internal evidence and is rejected by `publish`.
const PUBLISHABLE_TYPES: InsightType[] = ["FEEDBACK", "PAIN_POINT", "OPPORTUNITY"];

// Provenance filter (ADR-0037). An insight "came from a form" iff its `source`
// starts with `form:` (stamped by the `create_insight` destination). `manual`
// is everything else; `all` (default) applies no source filter.
const insightOriginEnum = z.enum(["form", "manual", "all"]);

// General triage scores (impact/confidence), 1–5. Usable by any insight type
// (ADR-0036) - formerly Problem-only.
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
      type: true,
      title: true,
      status: true,
      duplicateOfId: true,
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
        // Parked insights are hidden by default - parking is independent of
        // status (an insight keeps its status while parked). Pass true to
        // include them (the "Show parked" toggle / a Parked lane).
        includeParked: z.boolean().optional(),
        // Duplicates (Linear-style, `duplicateOfId` set) are hidden by
        // default - they defer to their canonical insight. Pass true to
        // include them.
        includeDuplicates: z.boolean().optional(),
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

      const rows = await ctx.db.insight.findMany({
        where: {
          productId: input.productId,
          ...(input.type ? { type: input.type } : {}),
          // Legacy LINKED rows count as TRIAGED (see insightStatusEnum).
          ...(input.status
            ? {
                status:
                  input.status === "TRIAGED"
                    ? { in: ["TRIAGED", "LINKED"] }
                    : input.status,
              }
            : {}),
          ...(input.category ? { category: input.category } : {}),
          ...originWhere,
          ...(input.includeParked ? {} : { parkedAt: null }),
          ...(input.includeDuplicates ? {} : { duplicateOfId: null }),
        },
        orderBy: [{ createdAt: "desc" }],
        include: {
          createdBy: { select: { id: true, name: true, image: true } },
          tags: { include: { tag: true } },
          features: {
            include: { feature: { select: { id: true, name: true } } },
          },
          _count: { select: { features: true, duplicates: true } },
        },
      });
      return rows.map(coalesceStatus);
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
          duplicateOf: { select: { id: true, title: true } },
          duplicates: {
            select: { id: true, title: true, type: true, createdAt: true },
            orderBy: { createdAt: "asc" },
          },
          comments: {
            include: { author: { select: { id: true, name: true, image: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!insight) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Insight not found" });
      }
      await assertWorkspaceMember(ctx.db, ctx.session.user.id, insight.product.workspaceId);
      return coalesceStatus(insight);
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
        // General triage fields (ADR-0036) - usable by any type.
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
            // Created pre-linked to features = already reviewed and kept.
            status:
              input.status ?? (input.featureIds?.length ? "TRIAGED" : "INBOX"),
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
        // Detail-page body save (ADR-0024, mirrors feature.update): bodyDoc is
        // the canonical document, the existing `body` field above rides along
        // as its client-serialised Markdown projection, `baseVersion` is the
        // optimistic-concurrency check.
        bodyDoc: prosemirrorDoc.optional(),
        baseVersion: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.id);
      const { id, bodyDoc, baseVersion, ...data } = input;

      // Feed the detail page's activity trail (fire-and-forget). Compare
      // against the coalesced status so a legacy LINKED row reads as TRIAGED.
      const previousStatus = coalesceStatus(existing).status;
      if (data.status && data.status !== previousStatus) {
        await recordActivity(ctx.db, {
          workspaceId: existing.product.workspaceId,
          userId: ctx.session.user.id,
          entityType: "insight",
          entityId: id,
          action: "status_changed",
          metadata: { from: previousStatus, to: data.status },
        });
      }

      // Body autosave path: optimistic-concurrency guard + version bump.
      if (bodyDoc !== undefined) {
        if (baseVersion === undefined) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "baseVersion is required when saving the insight body",
          });
        }
        const current = await ctx.db.insight.findUnique({
          where: { id },
          select: { docVersion: true },
        });
        const decision = checkStaleWrite({
          storedVersion: current?.docVersion ?? 0,
          baseVersion,
        });
        if (!decision.accept) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This insight was updated in another tab or by another member. Reload to get the latest version.",
          });
        }
        // Atomic compare-and-set: the WHERE on docVersion closes the
        // read-to-write race so two concurrent saves can't both bump from the
        // same base.
        const res = await ctx.db.insight.updateMany({
          where: { id, docVersion: baseVersion },
          data: {
            ...data,
            bodyDoc: bodyDoc as Prisma.InputJsonValue,
            docVersion: { increment: 1 },
          },
        });
        if (res.count === 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This insight was updated concurrently. Reload to get the latest version.",
          });
        }
        return { id, docVersion: decision.nextVersion };
      }

      return ctx.db.insight.update({
        where: { id },
        data: {
          ...data,
          // Keep description in sync with title so both columns stay consistent
          ...(input.title ? { description: input.title } : {}),
          // A Markdown-only body write (no bodyDoc) invalidates the canonical
          // doc: null it and bump docVersion so the editor re-derives from
          // Markdown on next open (mirrors page.update's agent path).
          ...(data.body !== undefined
            ? { bodyDoc: Prisma.DbNull, docVersion: { increment: 1 } }
            : {}),
        },
      });
    }),

  /**
   * Persist the one-time lazy migration of a legacy Markdown `body` into the
   * canonical `bodyDoc` (ADR-0024, mirrors feature.initDescriptionDoc).
   * Idempotent and write-once: an existing bodyDoc always wins.
   */
  initBodyDoc: protectedProcedure
    .input(z.object({ id: z.string(), doc: prosemirrorDoc }))
    .mutation(async ({ ctx, input }) => {
      await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.id);

      const existing = await ctx.db.insight.findUnique({
        where: { id: input.id },
        select: { bodyDoc: true },
      });
      if (existing?.bodyDoc != null) {
        return { migrated: false, bodyDoc: existing.bodyDoc };
      }

      const updated = await ctx.db.insight.update({
        where: { id: input.id },
        data: { bodyDoc: input.doc as Prisma.InputJsonValue },
        select: { bodyDoc: true },
      });
      return { migrated: true, bodyDoc: updated.bodyDoc };
    }),

  /**
   * Upload an image pasted/dropped into the insight body, mirroring
   * feature.uploadImage: base64 in, public Vercel Blob URL out.
   */
  uploadImage: protectedProcedure
    .input(z.object({ id: z.string(), base64Data: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.id);

      // Same 5MB cap as feature.uploadImage (base64 is ~4/3 the byte size).
      const approxBytes = Math.floor((input.base64Data.length * 3) / 4);
      if (approxBytes > 5 * 1024 * 1024) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Image too large. Please use an image under 5MB.",
        });
      }

      const timestamp = new Date().toISOString().replace(/[/:]/g, "-");
      const filename = `screenshots/insights/${input.id}/${timestamp}.png`;
      const blob = await uploadToBlob(input.base64Data, filename);
      return { url: blob.url };
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
      // Linking evidence to a feature implies it was reviewed and kept:
      // promote un-triaged insights to TRIAGED. Never resurrect DISMISSED.
      await ctx.db.insight.updateMany({
        where: { id: input.insightId, status: { in: ["INBOX", "LINKED"] } },
        data: { status: "TRIAGED" },
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
        if (uniqueFeatureIds.length > 0) {
          // Same promotion as linkToFeature: linking implies reviewed-and-kept.
          await tx.insight.updateMany({
            where: { id: input.insightId, status: { in: ["INBOX", "LINKED"] } },
            data: { status: "TRIAGED" },
          });
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
  // (ADR-0036) - set aside WITH A REASON, never deleted, and revivable at its
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

  // ── Publishing ────────────────────────────────────────────────────────
  // Feedback-board visibility. Publishing is always an explicit human act -
  // form intake and triage never set it. Only user-voice insight types may be
  // published; internal evidence (PROBLEM, COMPETITIVE, OBSERVATION, PERSONA,
  // JOURNEY) is rejected server-side so the future public board can never
  // leak it. The board read path must filter on `publishedAt`.

  publish: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const insight = await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.id);
      if (!PUBLISHABLE_TYPES.includes(insight.type)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Only user feedback (feedback, pain points, opportunities) can be published to the board",
        });
      }
      const updated = await ctx.db.insight.update({
        where: { id: input.id },
        data: { publishedAt: new Date() },
      });
      await recordActivity(ctx.db, {
        workspaceId: insight.product.workspaceId,
        userId: ctx.session.user.id,
        entityType: "insight",
        entityId: input.id,
        action: "updated",
        metadata: { change: "published" },
      });
      return updated;
    }),

  unpublish: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const insight = await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.id);
      const updated = await ctx.db.insight.update({
        where: { id: input.id },
        data: { publishedAt: null },
      });
      await recordActivity(ctx.db, {
        workspaceId: insight.product.workspaceId,
        userId: ctx.session.user.id,
        entityType: "insight",
        entityId: input.id,
        action: "updated",
        metadata: { change: "unpublished" },
      });
      return updated;
    }),

  // ── Duplicates ────────────────────────────────────────────────────────
  // Linear-style non-destructive duplicate marking. The duplicate keeps all
  // its content (insights are evidence; two reports are two data points) but
  // drops out of default lists and defers to its canonical. Chains are
  // flattened at write time so `duplicateOfId` is always one level deep.

  markDuplicate: protectedProcedure
    .input(z.object({ id: z.string(), canonicalId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === input.canonicalId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An insight cannot be a duplicate of itself",
        });
      }
      const insight = await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.id);
      const target = await ctx.db.insight.findUnique({
        where: { id: input.canonicalId },
        select: { id: true, title: true, productId: true, duplicateOfId: true },
      });
      if (!target || target.productId !== insight.productId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Canonical insight must belong to the same product",
        });
      }

      // Flatten chains: if the chosen canonical is itself a duplicate, walk up
      // to the true root. Writes keep the tree one level deep, but a race or a
      // direct DB write could leave a deeper chain - loop with a cycle guard
      // instead of trusting the invariant.
      let canonical: { id: string; title: string; duplicateOfId: string | null } = target;
      const visited = new Set<string>([input.id, target.id]);
      while (canonical.duplicateOfId) {
        if (visited.has(canonical.duplicateOfId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This would create a duplicate cycle",
          });
        }
        visited.add(canonical.duplicateOfId);
        const resolved = await ctx.db.insight.findUnique({
          where: { id: canonical.duplicateOfId },
          select: { id: true, title: true, duplicateOfId: true },
        });
        if (!resolved) break;
        canonical = resolved;
      }
      if (canonical.id === input.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This would create a duplicate cycle",
        });
      }

      await ctx.db.$transaction([
        // Re-point any duplicates of this insight at the new canonical so the
        // tree stays one level deep.
        ctx.db.insight.updateMany({
          where: { duplicateOfId: input.id },
          data: { duplicateOfId: canonical.id },
        }),
        ctx.db.insight.update({
          where: { id: input.id },
          data: { duplicateOfId: canonical.id },
        }),
      ]);

      await recordActivity(ctx.db, {
        workspaceId: insight.product.workspaceId,
        userId: ctx.session.user.id,
        entityType: "insight",
        entityId: input.id,
        action: "updated",
        metadata: {
          change: "marked_duplicate",
          canonicalId: canonical.id,
          canonicalTitle: canonical.title,
        },
      });
      await recordActivity(ctx.db, {
        workspaceId: insight.product.workspaceId,
        userId: ctx.session.user.id,
        entityType: "insight",
        entityId: canonical.id,
        action: "updated",
        metadata: {
          change: "duplicate_added",
          duplicateId: input.id,
          duplicateTitle: insight.title,
        },
      });
      return { success: true, canonicalId: canonical.id };
    }),

  unmarkDuplicate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const insight = await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.id);
      if (!insight.duplicateOfId) return { success: true };
      await ctx.db.insight.update({
        where: { id: input.id },
        data: { duplicateOfId: null },
      });
      await recordActivity(ctx.db, {
        workspaceId: insight.product.workspaceId,
        userId: ctx.session.user.id,
        entityType: "insight",
        entityId: input.id,
        action: "updated",
        metadata: { change: "unmarked_duplicate" },
      });
      return { success: true };
    }),

  // ── Activity ──────────────────────────────────────────────────────────
  // The detail page's activity feed merges InsightComment rows with
  // WorkspaceActivityEvent rows (entityType "insight") by createdAt.

  addComment: protectedProcedure
    .input(
      z.object({
        insightId: z.string(),
        content: boundedText("Comment", TEXT_LIMITS.MEDIUM, { min: 1 }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const insight = await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.insightId);
      const comment = await ctx.db.insightComment.create({
        data: {
          insightId: input.insightId,
          authorId: ctx.session.user.id,
          content: input.content,
        },
        include: { author: { select: { id: true, name: true, image: true } } },
      });
      await recordActivity(ctx.db, {
        workspaceId: insight.product.workspaceId,
        userId: ctx.session.user.id,
        entityType: "insight_comment",
        entityId: comment.id,
        action: "created",
        metadata: { insightId: input.insightId, snippet: input.content.slice(0, 120) },
      });
      return comment;
    }),

  deleteComment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.insightComment.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          authorId: true,
          insight: { select: { product: { select: { workspaceId: true } } } },
        },
      });
      if (!comment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }
      await assertWorkspaceMember(
        ctx.db,
        ctx.session.user.id,
        comment.insight.product.workspaceId,
      );
      if (comment.authorId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete your own comments",
        });
      }
      await ctx.db.insightComment.delete({ where: { id: input.id } });
      return { success: true };
    }),

  listEvents: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const insight = await loadInsightWithAccess(ctx.db, ctx.session.user.id, input.id);
      return ctx.db.workspaceActivityEvent.findMany({
        where: {
          workspaceId: insight.product.workspaceId,
          entityType: "insight",
          entityId: input.id,
        },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, image: true } } },
      });
    }),
});
