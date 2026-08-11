"use client";

import { useCallback, useMemo } from "react";
import { api } from "~/trpc/react";
import type {
  UseActivityReturn,
  ActivityItem,
  ActivityEventItem,
} from "~/app/_components/shared/activityTypes";
import type { MentionCandidate } from "~/hooks/useMentionAutocomplete";

interface UsePageActivityOptions {
  mentionCandidates?: MentionCandidate[];
  mentionNames?: string[];
}

/**
 * Knowledge Page flavor of the app-wide activity paradigm (mirrors
 * {@link useTicketActivity}): adapts page comments to the shared ActivityFeed
 * contract so pages get the same timeline block as tickets and features.
 *
 * Pages carry no WorkspaceActivityEvent instrumentation yet, so the only audit
 * row is the synthesized "created this page" — honest data that already exists
 * on the page itself. When page edits start recording events, drop them in
 * here the way `useTicketActivity` reads `ticket.listEvents`.
 */
export function usePageActivity(
  pageId: string,
  options?: UsePageActivityOptions,
): UseActivityReturn {
  const utils = api.useUtils();

  const { data: comments, isLoading } = api.pageComment.list.useQuery(
    { pageId },
    { enabled: !!pageId },
  );
  // Cached by the host page — used for the synthesized "created" row.
  const { data: page } = api.page.get.useQuery(
    { id: pageId },
    { enabled: !!pageId },
  );

  const invalidate = useCallback(() => {
    void utils.pageComment.list.invalidate({ pageId });
  }, [utils, pageId]);

  const addCommentMutation = api.pageComment.create.useMutation({
    onSuccess: invalidate,
  });
  const deleteCommentMutation = api.pageComment.delete.useMutation({
    onSuccess: invalidate,
  });
  const updateCommentMutation = api.pageComment.update.useMutation({
    onSuccess: invalidate,
  });

  const items: ActivityItem[] = useMemo(() => {
    // Anchored threads (threadId set) live inside the body editor; the feed
    // shows only doc-level comments — same split as useFeatureActivity.
    const commentItems: ActivityItem[] = (comments ?? [])
      .filter((c) => c.threadId == null && c.parentId == null)
      .map(
        (c): ActivityItem => ({
          type: "comment" as const,
          id: c.id,
          content: c.body,
          createdAt: new Date(c.createdAt),
          updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
          author: c.createdBy,
        }),
      );

    const eventItems: ActivityEventItem[] = page
      ? [
          {
            type: "event" as const,
            id: `synthesized-created-${page.id}`,
            createdAt: new Date(page.createdAt),
            actorName: page.createdBy?.name ?? "Someone",
            text: "created this page",
          },
        ]
      : [];

    return [...commentItems, ...eventItems].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }, [comments, page]);

  const addComment = useCallback(
    async (content: string) => {
      await addCommentMutation.mutateAsync({ pageId, body: content });
    },
    [addCommentMutation, pageId],
  );

  const deleteComment = useCallback(
    (commentId: string) => {
      deleteCommentMutation.mutate({ commentId });
    },
    [deleteCommentMutation],
  );

  const editComment = useCallback(
    async (commentId: string, content: string) => {
      await updateCommentMutation.mutateAsync({ commentId, body: content });
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
