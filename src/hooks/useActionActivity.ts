"use client";

import { useCallback, useMemo } from "react";
import { api } from "~/trpc/react";
import type {
  UseActivityReturn,
  ActivityItem,
} from "~/app/_components/shared/activityTypes";
import type { MentionCandidate } from "~/hooks/useMentionAutocomplete";
import { notifications } from "@mantine/notifications";
import { assignmentOffer } from "~/lib/actions/assignmentOffer";
import { showAssignmentOffer } from "~/app/_components/actions/showAssignmentOffer";

interface UseActionActivityOptions {
  mentionCandidates?: MentionCandidate[];
  mentionNames?: string[];
}

export function useActionActivity(
  actionId: string,
  options?: UseActionActivityOptions,
): UseActivityReturn {
  const utils = api.useUtils();

  const { data: comments = [], isLoading } =
    api.actionComment.getComments.useQuery(
      { actionId },
      { enabled: !!actionId },
    );

  const invalidate = useCallback(() => {
    void utils.actionComment.getComments.invalidate({ actionId });
  }, [utils, actionId]);

  // Assigning is what starts an Assistant's run; a mention only offers it.
  const assignMutation = api.action.assign.useMutation({
    onSuccess: (result) => {
      void utils.action.getById.invalidate({ id: actionId });
      void utils.agentRun.invalidate();
      const agent = result.assignees.find((a) => a.user.isAgent);
      notifications.show({
        message:
          result.agentRunsQueued > 0
            ? `${agent?.user.name ?? "Your Assistant"} is on it`
            : "Assigned",
      });
    },
    onError: (err) => {
      notifications.show({ title: "Couldn't assign", message: err.message, color: "red" });
    },
  });

  const addCommentMutation = api.actionComment.addComment.useMutation({
    onSuccess: (result) => {
      invalidate();
      // The server reports the mentioned Assistants it did not start
      // (`unstartedAssistants`): say so, and offer the assignment.
      const offer = assignmentOffer(result.unstartedAssistants);
      if (offer) {
        showAssignmentOffer(offer, {
          actionId,
          onAssign: (userIds) => assignMutation.mutate({ actionId, userIds }),
        });
      }
    },
  });

  const deleteCommentMutation = api.actionComment.deleteComment.useMutation({
    onSuccess: invalidate,
  });

  const updateCommentMutation = api.actionComment.updateComment.useMutation({
    onSuccess: invalidate,
  });

  const removeImageMutation = api.actionComment.removeImage.useMutation({
    onSuccess: () => {
      invalidate();
      void utils.action.getById.invalidate({ id: actionId });
    },
  });

  const items: ActivityItem[] = useMemo(() => {
    return comments.map(
      (c): ActivityItem => ({
        type: "comment" as const,
        id: c.id,
        content: c.content,
        createdAt: new Date(c.createdAt),
        updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
        author: c.author,
      }),
    );
  }, [comments]);

  const addComment = useCallback(
    async (content: string) => {
      await addCommentMutation.mutateAsync({ actionId, content });
    },
    [addCommentMutation, actionId],
  );

  const deleteComment = useCallback(
    (commentId: string) => {
      deleteCommentMutation.mutate({ commentId });
    },
    [deleteCommentMutation],
  );

  const editComment = useCallback(
    async (commentId: string, content: string) => {
      await updateCommentMutation.mutateAsync({ commentId, content });
    },
    [updateCommentMutation],
  );

  const deleteImage = useCallback(
    (commentId: string, imageUrl: string) => {
      removeImageMutation.mutate({ commentId, imageUrl });
    },
    [removeImageMutation],
  );

  return {
    items,
    count: items.length,
    isLoading,
    addComment,
    deleteComment,
    editComment,
    deleteImage,
    mentionCandidates: options?.mentionCandidates,
    mentionNames: options?.mentionNames,
    entityId: actionId,
    invalidate,
  };
}
