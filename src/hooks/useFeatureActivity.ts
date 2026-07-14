"use client";

import { useCallback, useMemo } from "react";
import { api } from "~/trpc/react";
import type {
  UseActivityReturn,
  ActivityItem,
} from "~/app/_components/shared/activityTypes";
import type { MentionCandidate } from "~/hooks/useMentionAutocomplete";

interface UseFeatureActivityOptions {
  /** Set to show a FeatureScope's feed instead of the feature's. */
  scopeId?: string;
  mentionCandidates?: MentionCandidate[];
  mentionNames?: string[];
}

/**
 * Feature/scope flavor of the app-wide activity paradigm (mirrors
 * {@link useActionActivity}): adapts doc-level feature comments to the shared
 * ActivityFeed/ActivityComposer contract. Anchored PRD-body comments
 * (threadId set) stay inside the PRD editor and never appear here.
 */
export function useFeatureActivity(
  featureId: string,
  options?: UseFeatureActivityOptions,
): UseActivityReturn {
  const utils = api.useUtils();
  const scopeId = options?.scopeId;

  const { data: comments, isLoading } = api.product.featureComment.list.useQuery(
    { featureId },
    { enabled: !!featureId },
  );

  const invalidate = useCallback(() => {
    void utils.product.featureComment.list.invalidate({ featureId });
  }, [utils, featureId]);

  const addCommentMutation = api.product.featureComment.create.useMutation({
    onSuccess: invalidate,
  });
  const deleteCommentMutation = api.product.featureComment.delete.useMutation({
    onSuccess: invalidate,
  });
  const updateCommentMutation = api.product.featureComment.update.useMutation({
    onSuccess: invalidate,
  });

  const items: ActivityItem[] = useMemo(() => {
    return (comments ?? [])
      .filter(
        (c) =>
          c.threadId == null &&
          c.parentId == null &&
          (scopeId ? c.scopeId === scopeId : c.scopeId == null),
      )
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
  }, [comments, scopeId]);

  const addComment = useCallback(
    async (content: string) => {
      await addCommentMutation.mutateAsync({ featureId, scopeId, body: content });
    },
    [addCommentMutation, featureId, scopeId],
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
