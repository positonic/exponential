import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";
import { loadPageForAccess, ensurePageAccess } from "./page";
import { sendPageMentionNotifications } from "~/server/services/notifications/EmailNotificationService";

const authorSelect = {
  id: true,
  name: true,
  image: true,
} as const;

/**
 * Comments on a Knowledge Page. Two flavours share one table, exactly as
 * featureComment does for PRDs:
 *
 *  - **doc-level** (`threadId` null) — the flat Activity feed under the body.
 *  - **anchored** (`threadId` set) — pinned to a `comment` mark in
 *    `KnowledgePage.bodyDoc`; `quotedText` snapshots the highlighted span so an
 *    orphaned thread still renders, and `resolvedAt` settles it without deleting.
 *
 * Bodies are Markdown (ADR-0017). View access is the commenting gate: anyone a
 * page is shared with can join its discussion; read-only viewers can still
 * comment, matching how feature comments admit every workspace member. Editing
 * and deleting are author-only.
 */
export const pageCommentRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ pageId: z.string() }))
    .query(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.pageId);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "view");

      return ctx.db.knowledgePageComment.findMany({
        where: { pageId: input.pageId },
        include: { createdBy: { select: authorSelect } },
        orderBy: { createdAt: "asc" },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        pageId: z.string(),
        // Set to anchor the comment to a `comment` mark in the page body;
        // omitted for the flat doc-level Activity feed.
        threadId: z.string().min(1).optional(),
        body: boundedText("Comment", TEXT_LIMITS.LARGE, { min: 1 }),
        quotedText: boundedText("Quoted text", TEXT_LIMITS.LARGE).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.pageId);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "view");

      const comment = await ctx.db.knowledgePageComment.create({
        data: {
          pageId: input.pageId,
          threadId: input.threadId,
          body: input.body,
          quotedText: input.quotedText,
          createdById: ctx.session.user.id,
        },
        include: { createdBy: { select: authorSelect } },
      });

      // Fire-and-forget: notify mentioned workspace members.
      void sendPageMentionNotifications(ctx.db, {
        pageId: input.pageId,
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
      const parent = await ctx.db.knowledgePageComment.findUnique({
        where: { id: input.parentId },
        select: { pageId: true, threadId: true, parentId: true },
      });
      if (!parent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }
      const page = await loadPageForAccess(ctx.db, parent.pageId);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "view");

      const comment = await ctx.db.knowledgePageComment.create({
        data: {
          pageId: parent.pageId,
          threadId: parent.threadId,
          // Keep threads one level deep: a reply to a reply still hangs off the root.
          parentId: parent.parentId ?? input.parentId,
          body: input.body,
          createdById: ctx.session.user.id,
        },
        include: { createdBy: { select: authorSelect } },
      });

      void sendPageMentionNotifications(ctx.db, {
        pageId: parent.pageId,
        commentContent: input.body,
        commentAuthorId: ctx.session.user.id,
      });

      return comment;
    }),

  resolve: protectedProcedure
    .input(z.object({ pageId: z.string(), threadId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.pageId);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "view");
      await ctx.db.knowledgePageComment.updateMany({
        where: { pageId: input.pageId, threadId: input.threadId, parentId: null },
        data: { resolvedAt: new Date() },
      });
      return { success: true };
    }),

  unresolve: protectedProcedure
    .input(z.object({ pageId: z.string(), threadId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.pageId);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "view");
      await ctx.db.knowledgePageComment.updateMany({
        where: { pageId: input.pageId, threadId: input.threadId, parentId: null },
        data: { resolvedAt: null },
      });
      return { success: true };
    }),

  update: protectedProcedure
    .input(
      z.object({
        commentId: z.string(),
        body: boundedText("Comment", TEXT_LIMITS.LARGE, { min: 1 }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.knowledgePageComment.findFirst({
        where: { id: input.commentId, createdById: ctx.session.user.id },
        select: { id: true, pageId: true, body: true },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found or not yours",
        });
      }
      const updated = await ctx.db.knowledgePageComment.update({
        where: { id: input.commentId },
        data: { body: input.body },
        include: { createdBy: { select: authorSelect } },
      });

      // Fire-and-forget: notify mentions added by the edit. Passing the old
      // body means already-notified users aren't pinged again.
      void sendPageMentionNotifications(ctx.db, {
        pageId: existing.pageId,
        commentContent: input.body,
        commentAuthorId: ctx.session.user.id,
        previousContent: existing.body,
      });

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.knowledgePageComment.findFirst({
        where: { id: input.commentId, createdById: ctx.session.user.id },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found or not yours",
        });
      }
      await ctx.db.knowledgePageComment.delete({
        where: { id: input.commentId },
      });
      return { success: true };
    }),
});
