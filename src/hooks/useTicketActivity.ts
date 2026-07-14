"use client";

import { useCallback, useMemo } from "react";
import { api } from "~/trpc/react";
import type {
  UseActivityReturn,
  ActivityItem,
} from "~/app/_components/shared/activityTypes";
import type { MentionCandidate } from "~/hooks/useMentionAutocomplete";

interface UseTicketActivityOptions {
  mentionCandidates?: MentionCandidate[];
  mentionNames?: string[];
}

/**
 * Ticket flavor of the app-wide activity paradigm (mirrors
 * {@link useActionActivity}): adapts ticket comments to the shared
 * ActivityFeed/ActivityComposer contract. Comments ride on
 * `ticket.getById`, so the query here dedupes with the detail page's own.
 */
export function useTicketActivity(
  ticketId: string,
  options?: UseTicketActivityOptions,
): UseActivityReturn {
  const utils = api.useUtils();

  const { data: ticket, isLoading } = api.product.ticket.getById.useQuery(
    { id: ticketId },
    { enabled: !!ticketId },
  );

  const invalidate = useCallback(() => {
    void utils.product.ticket.getById.invalidate({ id: ticketId });
  }, [utils, ticketId]);

  const addCommentMutation = api.product.ticket.addComment.useMutation({
    onSuccess: invalidate,
  });
  const deleteCommentMutation = api.product.ticket.deleteComment.useMutation({
    onSuccess: invalidate,
  });
  const updateCommentMutation = api.product.ticket.updateComment.useMutation({
    onSuccess: invalidate,
  });

  const items: ActivityItem[] = useMemo(() => {
    return (ticket?.comments ?? [])
      .map(
        (c): ActivityItem => ({
          type: "comment" as const,
          id: c.id,
          content: c.content,
          createdAt: new Date(c.createdAt),
          updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
          author: c.author,
        }),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }, [ticket?.comments]);

  const addComment = useCallback(
    async (content: string) => {
      await addCommentMutation.mutateAsync({ ticketId, content });
    },
    [addCommentMutation, ticketId],
  );

  const deleteComment = useCallback(
    (commentId: string) => {
      deleteCommentMutation.mutate({ id: commentId });
    },
    [deleteCommentMutation],
  );

  const editComment = useCallback(
    async (commentId: string, content: string) => {
      await updateCommentMutation.mutateAsync({ id: commentId, content });
    },
    [updateCommentMutation],
  );

  return {
    items,
    count: items.length,
    isLoading,
    addComment,
    deleteComment,
    editComment,
    mentionCandidates: options?.mentionCandidates,
    mentionNames: options?.mentionNames,
    invalidate,
  };
}
