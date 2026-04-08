"use client";

import { useCallback, useMemo } from "react";
import { api } from "~/trpc/react";
import {
  type HealthStatus,
  healthConfig,
} from "~/app/_components/initiatives/healthConfig";
import type {
  UseActivityReturn,
  ActivityItem,
  StatusOption,
} from "~/app/_components/shared/activityTypes";

const goalStatusOptions: StatusOption[] = (
  ["on-track", "at-risk", "off-track"] as HealthStatus[]
).map((key) => ({
  key,
  label: healthConfig[key].label,
  color: healthConfig[key].color,
  mantineColor: healthConfig[key].mantineColor,
  icon: healthConfig[key].icon,
}));

export function useGoalActivity(goalId: number): UseActivityReturn {
  const utils = api.useUtils();

  const { data: feed, isLoading: feedLoading } =
    api.goalActivity.getFeed.useQuery({ goalId });

  const { data: count } = api.goalActivity.getCount.useQuery({ goalId });

  const invalidate = useCallback(() => {
    void utils.goalActivity.getFeed.invalidate({ goalId });
    void utils.goalActivity.getCount.invalidate({ goalId });
    void utils.goal.getById.invalidate({ id: goalId });
  }, [utils, goalId]);

  const addCommentMutation = api.goalComment.addComment.useMutation({
    onSuccess: invalidate,
  });

  const updateCommentMutation = api.goalComment.updateComment.useMutation({
    onSuccess: invalidate,
  });

  const deleteCommentMutation = api.goalComment.deleteComment.useMutation({
    onSuccess: invalidate,
  });

  const addUpdateMutation = api.goalUpdate.addUpdate.useMutation({
    onSuccess: invalidate,
  });

  const deleteUpdateMutation = api.goalUpdate.deleteUpdate.useMutation({
    onSuccess: invalidate,
  });

  const addReplyMutation = api.goalComment.addComment.useMutation({
    onSuccess: invalidate,
  });

  const deleteReplyMutation = api.goalComment.deleteComment.useMutation({
    onSuccess: invalidate,
  });

  const updateReplyMutation = api.goalComment.updateComment.useMutation({
    onSuccess: invalidate,
  });

  const items: ActivityItem[] = useMemo(() => {
    if (!feed) return [];
    return feed.map((item): ActivityItem => {
      if (item.type === "update") {
        return {
          type: "update",
          id: item.id,
          content: item.content,
          status: item.health,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          author: item.author,
          replies: item.replies.map((r) => ({
            id: r.id,
            content: r.content,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            author: r.author,
          })),
        };
      }
      return {
        type: "comment",
        id: item.id,
        content: item.content,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        author: item.author,
      };
    });
  }, [feed]);

  const addComment = useCallback(
    async (content: string) => {
      await addCommentMutation.mutateAsync({ goalId, content });
    },
    [addCommentMutation, goalId],
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

  const addUpdate = useCallback(
    async (content: string, status: string) => {
      await addUpdateMutation.mutateAsync({
        goalId,
        content,
        health: status as "on-track" | "at-risk" | "off-track",
      });
    },
    [addUpdateMutation, goalId],
  );

  const deleteUpdate = useCallback(
    (updateId: string) => {
      deleteUpdateMutation.mutate({ updateId });
    },
    [deleteUpdateMutation],
  );

  const addReply = useCallback(
    async (parentUpdateId: string, content: string) => {
      await addReplyMutation.mutateAsync({ goalId, content, parentUpdateId });
    },
    [addReplyMutation, goalId],
  );

  const deleteReply = useCallback(
    (commentId: string) => {
      deleteReplyMutation.mutate({ commentId });
    },
    [deleteReplyMutation],
  );

  const editReply = useCallback(
    async (commentId: string, content: string) => {
      await updateReplyMutation.mutateAsync({ commentId, content });
    },
    [updateReplyMutation],
  );

  return {
    items,
    count: count ?? 0,
    isLoading: feedLoading,
    addComment,
    deleteComment,
    editComment,
    addUpdate,
    deleteUpdate,
    addReply,
    deleteReply,
    editReply,
    statusOptions: goalStatusOptions,
    defaultStatus: "on-track",
    invalidate,
  };
}
