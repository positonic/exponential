import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { loadProductWithAccess, assertWorkspaceMember } from "./product";
import type { Prisma, PrismaClient } from "@prisma/client";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";
import { checkStaleWrite } from "~/lib/prd/stale-write";
import { uploadToBlob } from "~/lib/blob";
import { getWorkspaceMembership } from "~/server/services/access/resolvers/workspaceResolver";
import { hasMinimumWorkspaceRole } from "~/server/services/access";
import {
  planFeatureMove,
  type FeatureMoveGraph,
  type FeatureMoveDestination,
} from "../services/featureMove";

/**
 * Require the caller to be a non-viewer (owner/admin/member) of the workspace.
 * A cross-workspace Feature move is a lossy cascade, so — per ADR-0027 — the
 * mover must be able to *write* to both the source and destination workspaces,
 * not merely read them. This is stricter than {@link assertWorkspaceMember},
 * which admits viewers.
 */
async function assertWorkspaceWriteRole(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
) {
  const membership = await getWorkspaceMembership(db, userId, workspaceId);
  if (!membership || !hasMinimumWorkspaceRole(membership.role, "member")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "You need owner, admin, or member access to this workspace to move a feature here",
    });
  }
  return membership;
}

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

  /**
   * Move a Feature to a Product in another workspace (ADR-0027).
   *
   * A Feature has no workspace of its own — its only container link is
   * `productId` — so "move to a workspace" is re-pointing `productId` at a
   * Product in the destination workspace. The move is a single-transaction
   * lossy cascade whose rules (and the loss counts shown in the confirm dialog)
   * are computed by the pure {@link planFeatureMove}, so preview and execution
   * can never diverge.
   *
   * Access: the caller must be a non-viewer member of *both* the source and the
   * destination workspaces.
   */
  move: protectedProcedure
    .input(
      z.object({
        featureId: z.string(),
        destinationProductId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // 1. Source: load the feature graph + source workspace, require write role.
      const feature = await ctx.db.feature.findUnique({
        where: { id: input.featureId },
        select: {
          id: true,
          productId: true,
          goalId: true,
          product: { select: { workspaceId: true } },
          tags: {
            select: { tagId: true, tag: { select: { workspaceId: true } } },
          },
          insights: { select: { insightId: true } },
        },
      });
      if (!feature) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Feature not found" });
      }
      await assertWorkspaceWriteRole(
        ctx.db,
        userId,
        feature.product.workspaceId,
      );

      // 2. Destination Product (and its workspace), require write role.
      const destProduct = await ctx.db.product.findUnique({
        where: { id: input.destinationProductId },
        select: {
          id: true,
          slug: true,
          workspaceId: true,
          ticketCounter: true,
          funTicketIds: true,
        },
      });
      if (!destProduct) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Destination product not found",
        });
      }
      if (destProduct.id === feature.productId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The feature is already in this product",
        });
      }
      await assertWorkspaceWriteRole(ctx.db, userId, destProduct.workspaceId);

      // 3. Fetch the rest of the graph the planner needs.
      const tickets = await ctx.db.ticket.findMany({
        where: { featureId: feature.id },
        select: {
          id: true,
          number: true,
          shortId: true,
          cycleId: true,
          assigneeId: true,
          actions: { select: { id: true } },
        },
      });
      const movingIds = tickets.map((t) => t.id);
      const dependencies =
        movingIds.length > 0
          ? await ctx.db.ticketDependency.findMany({
              where: {
                OR: [
                  { ticketId: { in: movingIds } },
                  { dependsOnId: { in: movingIds } },
                ],
              },
              select: { id: true, ticketId: true, dependsOnId: true },
            })
          : [];
      const [destUsed, destMembers] = await Promise.all([
        ctx.db.ticket.findMany({
          where: { productId: destProduct.id },
          select: { number: true, shortId: true },
        }),
        ctx.db.workspaceUser.findMany({
          where: { workspaceId: destProduct.workspaceId },
          select: { userId: true },
        }),
      ]);

      const graph: FeatureMoveGraph = {
        featureId: feature.id,
        goalId: feature.goalId,
        tags: feature.tags.map((t) => ({
          tagId: t.tagId,
          tagWorkspaceId: t.tag.workspaceId,
        })),
        insightIds: feature.insights.map((i) => i.insightId),
        tickets: tickets.map((t) => ({
          id: t.id,
          number: t.number,
          shortId: t.shortId,
          cycleId: t.cycleId,
          assigneeId: t.assigneeId,
          childActionIds: t.actions.map((a) => a.id),
        })),
        dependencies,
      };
      const destination: FeatureMoveDestination = {
        productId: destProduct.id,
        ticketCounter: destProduct.ticketCounter,
        funTicketIds: destProduct.funTicketIds,
        usedNumbers: destUsed.map((t) => t.number),
        usedShortIds: destUsed
          .map((t) => t.shortId)
          .filter((s): s is string => s !== null),
        memberUserIds: destMembers.map((m) => m.userId),
      };

      const { mutations } = planFeatureMove(graph, destination);

      // 4. Apply the whole plan in one transaction (driven by the plan only).
      await ctx.db.$transaction(async (tx) => {
        // Per-ticket: re-point to the destination Product, renumber, and clear
        // the source-scoped cycle / assignee links the plan flagged.
        for (const r of mutations.ticketRenumber) {
          await tx.ticket.update({
            where: { id: r.ticketId },
            data: {
              productId: mutations.destinationProductId,
              number: r.number,
              shortId: r.shortId,
              ...(mutations.clearCycleTicketIds.includes(r.ticketId)
                ? { cycleId: null }
                : {}),
              ...(mutations.clearAssigneeTicketIds.includes(r.ticketId)
                ? { assigneeId: null }
                : {}),
            },
          });
        }
        if (mutations.dropDependencyIds.length > 0) {
          await tx.ticketDependency.deleteMany({
            where: { id: { in: mutations.dropDependencyIds } },
          });
        }
        if (mutations.unlinkActionTicketIds.length > 0) {
          await tx.action.updateMany({
            where: { ticketId: { in: mutations.unlinkActionTicketIds } },
            data: { ticketId: null },
          });
        }
        // Feature-level: re-point + sever goal / insights / workspace tags.
        await tx.feature.update({
          where: { id: mutations.featureId },
          data: {
            productId: mutations.destinationProductId,
            ...(mutations.nullGoal ? { goalId: null } : {}),
          },
        });
        if (mutations.dropInsightIds.length > 0) {
          await tx.featureInsight.deleteMany({
            where: {
              featureId: mutations.featureId,
              insightId: { in: mutations.dropInsightIds },
            },
          });
        }
        if (mutations.dropTagIds.length > 0) {
          await tx.featureTag.deleteMany({
            where: {
              featureId: mutations.featureId,
              tagId: { in: mutations.dropTagIds },
            },
          });
        }
        if (mutations.nextTicketCounter !== destProduct.ticketCounter) {
          await tx.product.update({
            where: { id: destProduct.id },
            data: { ticketCounter: mutations.nextTicketCounter },
          });
        }
      });

      // 5. Navigation target: the feature in its new Product/workspace.
      const destWorkspace = await ctx.db.workspace.findUnique({
        where: { id: destProduct.workspaceId },
        select: { slug: true },
      });
      return {
        featureId: feature.id,
        productSlug: destProduct.slug,
        workspaceSlug: destWorkspace?.slug ?? null,
      };
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
