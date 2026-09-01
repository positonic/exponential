"use client";

import { useMemo } from "react";
import type { JSONContent } from "@tiptap/core";
import { api } from "~/trpc/react";
import { RichDocEditor } from "~/app/_components/shared/RichDocEditor";
import { useAnchoredComments } from "~/app/_components/prd/useAnchoredComments";
import type { FeatureCommentRow } from "~/app/_components/prd/PrdCommentsPanel";

interface TicketBodyEditorProps {
  ticketId: string;
  /** Canonical ProseMirror document; null until the ticket is first opened here. */
  bodyDoc: JSONContent | null;
  /** Legacy/derived Markdown projection — source of the one-time migration. */
  body: string | null;
  /** Stored doc version, the base for the optimistic-concurrency check. */
  docVersion?: number;
}

/**
 * The ticket body editor: the shared {@link RichDocEditor} engine (ADR-0024)
 * wired to the Ticket `bodyDoc`/`body`/`docVersion` storage, plus the shared
 * anchored-comments layer ({@link useAnchoredComments}) over the ticket
 * comment procedures — select text, pin a thread to it, same interaction as
 * the PRD body and Knowledge Pages.
 *
 * Hosts must key this component by ticket (`key={ticketId}`): the detail
 * page's nav arrows and the peek's j/k navigation swap tickets without
 * unmounting, and the engine loads its content exactly once.
 */
export function TicketBodyEditor({
  ticketId,
  bodyDoc,
  body,
  docVersion = 0,
}: TicketBodyEditorProps) {
  const utils = api.useUtils();
  const initBodyDoc = api.product.ticket.initBodyDoc.useMutation();
  const updateTicket = api.product.ticket.update.useMutation();
  const uploadImage = api.product.ticket.uploadImage.useMutation();

  const addComment = api.product.ticket.addComment.useMutation();
  const replyComment = api.product.ticket.replyComment.useMutation();
  const updateComment = api.product.ticket.updateComment.useMutation();
  const deleteComment = api.product.ticket.deleteComment.useMutation();
  const resolveThread = api.product.ticket.resolveCommentThread.useMutation();
  const unresolveThread = api.product.ticket.unresolveCommentThread.useMutation();

  // Deduped with the host detail page / peek's own query. Anchored threads
  // only (threadId set) — the Activity timeline renders the rest.
  const ticketQuery = api.product.ticket.getById.useQuery({ id: ticketId });
  const comments = useMemo<FeatureCommentRow[]>(
    () =>
      (ticketQuery.data?.comments ?? [])
        .filter((c) => c.threadId != null)
        .map((c) => ({
          id: c.id,
          threadId: c.threadId,
          parentId: c.parentId,
          quotedText: c.quotedText,
          resolvedAt: c.resolvedAt,
          body: c.content,
          createdAt: c.createdAt,
          createdBy: c.author,
        }))
        // getById returns comments newest-first; threads render in input order.
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
    [ticketQuery.data?.comments],
  );
  const invalidateComments = () =>
    utils.product.ticket.getById.invalidate({ id: ticketId });

  const anchored = useAnchoredComments({
    enabled: true,
    editable: true,
    adapter: {
      comments,
      createThread: async ({ threadId, body: content, quotedText }) => {
        await addComment.mutateAsync({ ticketId, threadId, content, quotedText });
        await invalidateComments();
      },
      reply: async ({ parentId, body: content }) => {
        await replyComment.mutateAsync({ parentId, content });
        await invalidateComments();
      },
      editComment: async ({ commentId, body: content }) => {
        await updateComment.mutateAsync({ id: commentId, content });
        await invalidateComments();
      },
      deleteComment: async ({ commentId }) => {
        await deleteComment.mutateAsync({ id: commentId });
        await invalidateComments();
      },
      resolveThread: async (threadId) => {
        await resolveThread.mutateAsync({ ticketId, threadId });
        await invalidateComments();
      },
      unresolveThread: async (threadId) => {
        await unresolveThread.mutateAsync({ ticketId, threadId });
        await invalidateComments();
      },
      isSubmitting: addComment.isPending || replyComment.isPending,
    },
  });

  return (
    <>
      <RichDocEditor
        initialDoc={bodyDoc}
        initialMarkdown={body}
        docVersion={docVersion}
        editable
        placeholder="Add a description..."
        conflict={{
          title: "This ticket changed",
          message:
            "Someone else saved a newer version of this ticket's description. Reload to get the latest? Unsaved changes in this tab will be lost.",
        }}
        onSave={async ({ doc, markdown, baseVersion }) =>
          updateTicket.mutateAsync({
            id: ticketId,
            bodyDoc: doc,
            body: markdown,
            baseVersion,
          })
        }
        onInitDoc={(doc) => initBodyDoc.mutate({ id: ticketId, doc })}
        uploadImage={(base64Data) =>
          uploadImage.mutateAsync({ id: ticketId, base64Data })
        }
        extraExtensions={anchored.extraExtensions}
        bubbleExtras={anchored.bubbleExtras}
        onDocUpdate={anchored.onDocUpdate}
        onReady={anchored.handleReady}
        wrapperRef={anchored.wrapperRef}
        editorClick={anchored.editorClick}
        overlay={anchored.overlay}
      />
      {anchored.panel}
    </>
  );
}
