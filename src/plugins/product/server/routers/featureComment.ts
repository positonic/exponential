import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";
import { loadFeatureWithAccess } from "./feature";

const authorSelect = {
  id: true,
  name: true,
  image: true,
} as const;

/**
 * Comments on a PRD body (ADR-0024). Anchored comments carry a `threadId` that
 * matches a `comment` mark in `Feature.descriptionDoc`; doc-level comments leave
 * `threadId` null. Bodies are Markdown (ADR-0017). Every procedure reuses the
 * same `loadFeatureWithAccess` workspace-member gate that `feature.update` uses —
 * editing the body and commenting share one access path.
 *
 * Procedures: `list`, `create` (root comment), `reply` (threaded), and
 * `resolve`/`unresolve` (toggle the root's `resolvedAt`).
 */
export const featureCommentRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ featureId: z.string() }))
    .query(async ({ ctx, input }) => {
      await loadFeatureWithAccess(ctx.db, ctx.session.user.id, input.featureId);

      return ctx.db.featureComment.findMany({
        where: { featureId: input.featureId },
        include: { createdBy: { select: authorSelect } },
        orderBy: { createdAt: "asc" },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        featureId: z.string(),
        threadId: z.string().min(1).optional(),
        body: boundedText("Comment", TEXT_LIMITS.LARGE, { min: 1 }),
        quotedText: boundedText("Quoted text", TEXT_LIMITS.LARGE).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadFeatureWithAccess(ctx.db, ctx.session.user.id, input.featureId);

      return ctx.db.featureComment.create({
        data: {
          featureId: input.featureId,
          threadId: input.threadId,
          body: input.body,
          quotedText: input.quotedText,
          createdById: ctx.session.user.id,
        },
        include: { createdBy: { select: authorSelect } },
      });
    }),

  reply: protectedProcedure
    .input(
      z.object({
        parentId: z.string(),
        body: boundedText("Comment", TEXT_LIMITS.LARGE, { min: 1 }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const parent = await ctx.db.featureComment.findUnique({
        where: { id: input.parentId },
        select: { featureId: true, threadId: true, parentId: true },
      });
      if (!parent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }
      await loadFeatureWithAccess(ctx.db, ctx.session.user.id, parent.featureId);

      return ctx.db.featureComment.create({
        data: {
          featureId: parent.featureId,
          threadId: parent.threadId,
          // Keep threads one level deep: a reply to a reply still hangs off the root.
          parentId: parent.parentId ?? input.parentId,
          body: input.body,
          createdById: ctx.session.user.id,
        },
        include: { createdBy: { select: authorSelect } },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        commentId: z.string(),
        body: boundedText("Comment", TEXT_LIMITS.LARGE, { min: 1 }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.featureComment.findFirst({
        where: { id: input.commentId, createdById: ctx.session.user.id },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found or not yours",
        });
      }
      return ctx.db.featureComment.update({
        where: { id: input.commentId },
        data: { body: input.body },
        include: { createdBy: { select: authorSelect } },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.featureComment.findFirst({
        where: { id: input.commentId, createdById: ctx.session.user.id },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found or not yours",
        });
      }
      // Replies cascade via the parentId self-relation FK.
      await ctx.db.featureComment.delete({ where: { id: input.commentId } });
      return { success: true };
    }),

  resolve: protectedProcedure
    .input(z.object({ featureId: z.string(), threadId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await loadFeatureWithAccess(ctx.db, ctx.session.user.id, input.featureId);
      await ctx.db.featureComment.updateMany({
        where: { featureId: input.featureId, threadId: input.threadId, parentId: null },
        data: { resolvedAt: new Date() },
      });
      return { success: true };
    }),

  unresolve: protectedProcedure
    .input(z.object({ featureId: z.string(), threadId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await loadFeatureWithAccess(ctx.db, ctx.session.user.id, input.featureId);
      await ctx.db.featureComment.updateMany({
        where: { featureId: input.featureId, threadId: input.threadId, parentId: null },
        data: { resolvedAt: null },
      });
      return { success: true };
    }),
});
