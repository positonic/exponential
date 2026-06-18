import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { loadProductWithAccess, assertWorkspaceMember } from "./product";
import type { Prisma, PrismaClient } from "@prisma/client";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";
import { checkStaleWrite } from "~/lib/prd/stale-write";
import { uploadToBlob } from "~/lib/blob";

/** A ProseMirror document object (PRD body, ADR-0024). Validated structurally. */
const prosemirrorDoc = z.record(z.string(), z.unknown());

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
 * Load a feature and verify workspace membership via its product. Shared with
 * the featureComment router so comments reuse the exact same access gate.
 */
export async function loadFeatureWithAccess(
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
        name: boundedText("Name", TEXT_LIMITS.LABEL, { min: 1 }),
        description: boundedText("Description", TEXT_LIMITS.LARGE).optional(),
        vision: boundedText("Vision", TEXT_LIMITS.SHORT).optional(),
        status: featureStatusEnum.optional(),
        effort: z.number().optional(),
        priority: z.number().int().min(0).max(4).optional(),
        goalId: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const product = await loadProductWithAccess(ctx.db, ctx.session.user.id, input.productId);

      if (input.goalId) {
        const goal = await ctx.db.goal.findFirst({
          where: { id: input.goalId, workspaceId: product.workspaceId },
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
        name: boundedText("Name", TEXT_LIMITS.LABEL, { min: 1 }).optional(),
        description: boundedText("Description", TEXT_LIMITS.LARGE).optional(),
        vision: boundedText("Vision", TEXT_LIMITS.SHORT).optional(),
        status: featureStatusEnum.optional(),
        effort: z.number().optional(),
        priority: z.number().int().min(0).max(4).optional(),
        goalId: z.number().int().nullable().optional(),
        // PRD body save (ADR-0024). `descriptionDoc` is the canonical document;
        // `description` rides along as its derived Markdown projection (the
        // client serialises it, since the projection needs the editor schema —
        // a deviation from ADR-0024's "server derives", forced by there being no
        // server-side DOM; the JSON-canonical, write-once-Markdown invariant
        // still holds). `baseVersion` is the optimistic-concurrency check.
        descriptionDoc: prosemirrorDoc.optional(),
        baseVersion: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const feature = await loadFeatureWithAccess(ctx.db, ctx.session.user.id, input.id);

      if (input.goalId) {
        const goal = await ctx.db.goal.findFirst({
          where: { id: input.goalId, workspaceId: feature.product.workspaceId },
          select: { id: true },
        });
        if (!goal) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Goal not found",
          });
        }
      }

      const { id, descriptionDoc, baseVersion, ...rest } = input;

      // PRD body autosave path: optimistic-concurrency guard + version bump.
      if (descriptionDoc !== undefined) {
        if (baseVersion === undefined) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "baseVersion is required when saving the PRD body",
          });
        }
        const current = await ctx.db.feature.findUnique({
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
              decision.reason === "stale"
                ? "This PRD was updated in another tab or by another member. Reload to get the latest version."
                : "Stale document version — reload and try again.",
          });
        }
        // Atomic compare-and-set: the WHERE on docVersion closes the read→write
        // race so two concurrent saves can't both bump from the same base.
        const res = await ctx.db.feature.updateMany({
          where: { id, docVersion: baseVersion },
          data: {
            ...rest,
            descriptionDoc: descriptionDoc as Prisma.InputJsonValue,
            docVersion: { increment: 1 },
          },
        });
        if (res.count === 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This PRD was updated concurrently. Reload to get the latest version.",
          });
        }
        return { id, docVersion: decision.nextVersion };
      }

      const updated = await ctx.db.feature.update({
        where: { id },
        data: rest,
      });
      return updated;
    }),

  /**
   * Persist the one-time lazy migration of a legacy Markdown `description` into
   * the canonical `descriptionDoc` (ADR-0024). The client converts Markdown →
   * ProseMirror JSON via the codec on first open and calls this to store it.
   *
   * Idempotent and write-once: if `descriptionDoc` is already set, the existing
   * doc wins and nothing is written — so a second tab (or a real edit that has
   * already happened) is never clobbered by a migration. `description` is left
   * untouched (it is the source of this migration), as is `docVersion`.
   */
  initDescriptionDoc: protectedProcedure
    .input(z.object({ id: z.string(), doc: prosemirrorDoc }))
    .mutation(async ({ ctx, input }) => {
      await loadFeatureWithAccess(ctx.db, ctx.session.user.id, input.id);

      const existing = await ctx.db.feature.findUnique({
        where: { id: input.id },
        select: { descriptionDoc: true },
      });
      if (existing?.descriptionDoc != null) {
        return { migrated: false, descriptionDoc: existing.descriptionDoc };
      }

      const updated = await ctx.db.feature.update({
        where: { id: input.id },
        data: { descriptionDoc: input.doc as Prisma.InputJsonValue },
        select: { descriptionDoc: true },
      });
      return { migrated: true, descriptionDoc: updated.descriptionDoc };
    }),

  /**
   * Upload an image pasted/dropped into the PRD body (ADR-0024 Tier B), mirroring
   * `action.uploadImage`: base64 in, public URL out, reusing the Vercel Blob
   * backend. Gated by the same workspace-member check as editing. The returned
   * URL is inserted as an inline image node in `descriptionDoc` and survives the
   * Markdown projection as an image link.
   */
  uploadImage: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        base64Data: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadFeatureWithAccess(ctx.db, ctx.session.user.id, input.id);

      // Same 5MB cap as action.uploadImage (base64 is ~4/3 the byte size).
      const approxBytes = Math.floor((input.base64Data.length * 3) / 4);
      if (approxBytes > 5 * 1024 * 1024) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Image too large. Please use an image under 5MB.",
        });
      }

      const timestamp = new Date().toISOString().replace(/[/:]/g, "-");
      const filename = `screenshots/features/${input.id}/${timestamp}.png`;
      const blob = await uploadToBlob(input.base64Data, filename);
      return { url: blob.url };
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
        version: boundedText("Version", 60, { min: 1 }),
        description: boundedText("Description", TEXT_LIMITS.LARGE, { min: 1 }),
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
        version: boundedText("Version", 60, { min: 1 }).optional(),
        description: boundedText("Description", TEXT_LIMITS.LARGE, { min: 1 }).optional(),
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
        asA: boundedText("As a", 500).optional(),
        iWant: boundedText("I want", 1000).optional(),
        soThat: boundedText("So that", 1000).optional(),
        acceptanceCriteria: boundedText("Acceptance criteria", TEXT_LIMITS.LARGE).optional(),
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
        asA: boundedText("As a", 500).optional(),
        iWant: boundedText("I want", 1000).optional(),
        soThat: boundedText("So that", 1000).optional(),
        acceptanceCriteria: boundedText("Acceptance criteria", TEXT_LIMITS.LARGE).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const story = await loadUserStoryWithAccess(ctx.db, ctx.session.user.id, input.id);

      if (input.scopeId) {
        const scope = await ctx.db.featureScope.findUnique({
          where: { id: input.scopeId },
          select: { featureId: true },
        });
        if (!scope || scope.featureId !== story.featureId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Scope does not belong to this feature",
          });
        }
      }

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
