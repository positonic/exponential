import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";
import { loadFeatureWithAccess } from "./feature";
import { emitFeatureCommentMention } from "~/server/services/notifications/emit/mentionAdapters";

const authorSelect = {
  id: true,
  name: true,
  image: true,
} as const;

/**
 * Comments on a PRD body (ADR-0024). Anchored comments carry a `threadId` that
 * matches a `comment` mark in `Feature.descriptionDoc`; doc-level comments leave
 * `threadId` null. Bodies are Markdown (ADR-0017). Every procedure reuses the
 * same `loadFeatureWithAccess` workspace-member gate that `feature.update` uses -
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
        // Scope activity comments (Features V2): set to attach the comment to
        // a specific FeatureScope's feed instead of the feature's.
        scopeId: z.string().optional(),
        threadId: z.string().min(1).optional(),
        body: boundedText("Comment", TEXT_LIMITS.LARGE, { min: 1 }),
        quotedText: boundedText("Quoted text", TEXT_LIMITS.LARGE).optional(),
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

      const comment = await ctx.db.featureComment.create({
        data: {
          featureId: input.featureId,
          scopeId: input.scopeId,
          threadId: input.threadId,
          body: input.body,
          quotedText: input.quotedText,
          createdById: ctx.session.user.id,
        },
        include: { createdBy: { select: authorSelect } },
      });

      // Fire-and-forget: notify mentioned workspace members via the pipeline.
      void emitFeatureCommentMention(ctx.db, {
        featureId: input.featureId,
        scopeId: input.scopeId,
        commentId: comment.id,
        commentContent: input.body,
        commentAuthorId: ctx.session.user.id,
      });

      return comment;
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
        select: { featureId: true, threadId: true, parentId: true, scopeId: true },
      });
      if (!parent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }
      await loadFeatureWithAccess(ctx.db, ctx.session.user.id, parent.featureId);

      const comment = await ctx.db.featureComment.create({
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

      // Fire-and-forget: notify mentioned workspace members. Deep-link to the
      // parent's scope thread when the conversation lives on a scope.
      void emitFeatureCommentMention(ctx.db, {
        featureId: parent.featureId,
        scopeId: parent.scopeId ?? undefined,
        commentId: comment.id,
        commentContent: input.body,
        commentAuthorId: ctx.session.user.id,
      });

      return comment;
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
        select: { id: true, featureId: true, scopeId: true, body: true },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found or not yours",
        });
      }
      const updated = await ctx.db.featureComment.update({
        where: { id: input.commentId },
        data: { body: input.body },
        include: { createdBy: { select: authorSelect } },
      });

      // Fire-and-forget: notify mentions added by the edit. Passing the old
      // body means already-notified users aren't pinged again.
      void emitFeatureCommentMention(ctx.db, {
        featureId: existing.featureId,
        scopeId: existing.scopeId ?? undefined,
        commentId: input.commentId,
        commentContent: input.body,
        commentAuthorId: ctx.session.user.id,
        previousContent: existing.body,
      });

      return updated;
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
