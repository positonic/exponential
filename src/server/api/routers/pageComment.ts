import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { JSONContent } from "@tiptap/core";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TEXT_LIMITS, boundedText } from "~/lib/text-limits";
import type { PrismaClient } from "@prisma/client";
import {
  loadPageForAccess,
  ensurePageAccess,
  type PageForAccess,
} from "~/server/services/pages/access";
import { sendPageMentionNotifications } from "~/server/services/notifications/EmailNotificationService";
import { writePageBodyIfVersion } from "~/server/services/pages/page-links";
import {
  getKnowledgePageAccess,
  canEditKnowledgePage,
} from "~/server/services/access";
import {
  anchorThreadByQuote,
  anchorThreadInStoredDoc,
  commentAnchorInput,
  docWithQuotedThread,
  NOT_ANCHORED,
  type CommentQuote,
} from "~/server/services/prd/anchor-comment";

const authorSelect = {
  id: true,
  name: true,
  image: true,
} as const;

const QUOTE_NOT_FOUND =
  "quotedText doesn't match one span of the page body. Quote the rendered text " +
  "(no Markdown syntax), copied exactly; if it appears more than once, add " +
  "quoteContext.prefix/suffix with the text just before or after it.";

/**
 * A new thread anchored by its quote alone (the CLI/SDK/agent path): mint the
 * `threadId`, find the span, and write the mark and the root comment in one
 * transaction. A viewer can't edit the body, so their thread is stored with
 * its `quotedText` but no mark — the same as a viewer's thread from the editor
 * — after the quote is still checked, so the error an agent sees doesn't
 * depend on its role.
 */
async function createQuotedThread(
  db: PrismaClient,
  userId: string,
  page: PageForAccess,
  args: { pageId: string; body: string; quote: CommentQuote },
) {
  const { pageId, body, quote } = args;
  const threadId = randomUUID();
  const data = {
    pageId,
    threadId,
    body,
    quotedText: quote.exact,
    createdById: userId,
  };
  const readStored = async () => {
    const row = await db.knowledgePage.findUnique({
      where: { id: pageId },
      select: { bodyDoc: true, body: true, docVersion: true },
    });
    return (
      row && {
        doc: row.bodyDoc as JSONContent | null,
        markdown: row.body,
        docVersion: row.docVersion,
      }
    );
  };

  const createRow = (client: Pick<PrismaClient, "knowledgePageComment">) =>
    client.knowledgePageComment.create({
      data,
      include: { createdBy: { select: authorSelect } },
    });
  // Filled inside the anchoring transaction, so the row lands with its mark.
  const created: { row?: Awaited<ReturnType<typeof createRow>> } = {};

  const canEdit = canEditKnowledgePage(await getKnowledgePageAccess(db, userId, page));

  let anchor = NOT_ANCHORED;
  if (canEdit) {
    const outcome = await anchorThreadByQuote({
      threadId,
      quote,
      read: readStored,
      write: (doc, expectedVersion) =>
        writePageBodyIfVersion(db, {
          pageId,
          expectedVersion,
          doc,
          afterWrite: async (tx) => {
            created.row = await createRow(tx);
          },
        }),
    });
    if (outcome.status === "not_found") {
      throw new TRPCError({ code: "BAD_REQUEST", message: QUOTE_NOT_FOUND });
    }
    if (outcome.status === "conflict") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "The page changed while the comment was being anchored. Try again.",
      });
    }
    anchor = { anchored: true, docVersion: outcome.docVersion, fastForward: false };
  } else {
    const stored = await readStored();
    if (!stored || !docWithQuotedThread(stored, threadId, quote)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: QUOTE_NOT_FOUND });
    }
  }
  const comment = created.row ?? (await createRow(db));

  void sendPageMentionNotifications(db, {
    pageId,
    commentContent: body,
    commentAuthorId: userId,
  });

  return { ...comment, anchor };
}

/**
 * Comments on a Knowledge Page. Two flavours share one table, exactly as
 * featureComment does for PRDs:
 *
 *  - **doc-level** (`threadId` null) — the flat Activity feed under the body.
 *  - **anchored** (`threadId` set) — pinned to a `comment` mark in
 *    `KnowledgePage.bodyDoc`; `quotedText` snapshots the highlighted span so an
 *    orphaned thread still renders, and `resolvedAt` settles it without deleting.
 *
 * A new anchored thread arrives one of two ways. The editor sends the
 * `threadId` it minted, the `quotedText` and its selection (`anchor`). The CLI,
 * SDK and agents have no selection: they send `quotedText` alone (plus
 * `quoteContext` to pick between repeats), and the server mints the `threadId`,
 * finds the span and pins the mark — refusing the comment when the quote
 * doesn't resolve, so an agent learns its quote was wrong instead of leaving an
 * orphaned thread. A page whose `bodyDoc` was never derived (Markdown written
 * through the API) gets it derived from the Markdown first, exactly as the
 * editor's lazy migration would on first open.
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
        // A new anchored thread's selection: the server pins the `comment`
        // mark into `bodyDoc` itself (see anchorThreadInStoredDoc).
        anchor: commentAnchorInput.optional(),
        // With `quotedText` and no `threadId`: the text around the quote, to
        // pick one occurrence when it appears more than once.
        quoteContext: z
          .object({
            prefix: z.string().max(200).optional(),
            suffix: z.string().max(200).optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const page = await loadPageForAccess(ctx.db, input.pageId);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "view");

      if (input.quoteContext && (!input.quotedText || input.threadId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "quoteContext goes with quotedText, and only when the server mints the threadId",
        });
      }
      if (input.quotedText?.trim() && !input.threadId) {
        return createQuotedThread(ctx.db, ctx.session.user.id, page, {
          pageId: input.pageId,
          body: input.body,
          quote: {
            exact: input.quotedText,
            prefix: input.quoteContext?.prefix,
            suffix: input.quoteContext?.suffix,
          },
        });
      }

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

      // Viewers may comment but not edit the body, so only an editor's
      // thread writes its mark into the doc.
      const canEdit =
        !!input.threadId &&
        canEditKnowledgePage(
          await getKnowledgePageAccess(ctx.db, ctx.session.user.id, page),
        );
      const anchor =
        input.threadId && canEdit
          ? await anchorThreadInStoredDoc({
              area: "pageComment.create",
              threadId: input.threadId,
              quotedText: input.quotedText,
              anchor: input.anchor,
              read: async () => {
                const row = await ctx.db.knowledgePage.findUnique({
                  where: { id: input.pageId },
                  select: { bodyDoc: true, docVersion: true },
                });
                return row && {
                  doc: row.bodyDoc as JSONContent | null,
                  docVersion: row.docVersion,
                };
              },
              write: (doc, expectedVersion) =>
                writePageBodyIfVersion(ctx.db, {
                  pageId: input.pageId,
                  expectedVersion,
                  doc,
                }),
            })
          : NOT_ANCHORED;

      return { ...comment, anchor };
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

  // resolve/unresolve share the view-level commenting gate deliberately
  // (Google-Docs semantics: whoever can join a discussion can settle it, and
  // unresolve makes it fully reversible) — same parity featureComment has
  // between commenting and resolving.
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
      // Authorship isn't enough: someone removed from a page (e.g. an
      // invite-only page's former invitee) can't keep editing comments on it.
      // Deleting their own comment stays allowed.
      const page = await loadPageForAccess(ctx.db, existing.pageId);
      await ensurePageAccess(ctx.db, ctx.session.user.id, page, "view");
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
