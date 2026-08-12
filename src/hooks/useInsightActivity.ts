"use client";

import { useCallback, useMemo } from "react";
import { api } from "~/trpc/react";
import type {
  UseActivityReturn,
  ActivityItem,
  ActivityEventItem,
} from "~/app/_components/shared/activityTypes";
import {
  STATUS_OPTIONS,
  STATUS_COLORS,
} from "~/app/_components/product/insightMeta";

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label]),
);

/**
 * Human copy for an insight audit event's "updated" variants. Insight events
 * carry their specifics in `metadata.change` (there are no field-edit bursts
 * like tickets/features have); unknown variants return null and are skipped.
 */
function describeUpdate(meta: Record<string, unknown>): string | null {
  switch (meta.change) {
    case "published":
      return "published this to the feedback board";
    case "unpublished":
      return "removed this from the feedback board";
    case "marked_duplicate":
      return `marked this as a duplicate of "${typeof meta.canonicalTitle === "string" ? meta.canonicalTitle : "another insight"}"`;
    case "duplicate_added":
      return `marked "${typeof meta.duplicateTitle === "string" ? meta.duplicateTitle : "another insight"}" as a duplicate of this`;
    case "unmarked_duplicate":
      return "removed the duplicate mark";
    default:
      return null;
  }
}

/**
 * Insight flavor of the app-wide activity paradigm (mirrors
 * {@link useTicketActivity}): adapts insight comments AND audit events
 * (WorkspaceActivityEvent) to the shared ActivityFeed contract - the unified
 * timeline. Comments ride on `insight.getById` (deduped with the detail
 * page's own query); events come from `insight.listEvents`.
 */
export function useInsightActivity(insightId: string): UseActivityReturn {
  const utils = api.useUtils();

  const { data: insight, isLoading } = api.product.insight.getById.useQuery(
    { id: insightId },
    { enabled: !!insightId },
  );
  const { data: events } = api.product.insight.listEvents.useQuery(
    { id: insightId },
    { enabled: !!insightId },
  );

  const invalidate = useCallback(() => {
    void utils.product.insight.getById.invalidate({ id: insightId });
    void utils.product.insight.listEvents.invalidate({ id: insightId });
  }, [utils, insightId]);

  const addCommentMutation = api.product.insight.addComment.useMutation({
    onSuccess: invalidate,
  });
  const deleteCommentMutation = api.product.insight.deleteComment.useMutation({
    onSuccess: invalidate,
  });
  const updateCommentMutation = api.product.insight.updateComment.useMutation({
    onSuccess: invalidate,
  });

  const items: ActivityItem[] = useMemo(() => {
    const commentItems: ActivityItem[] = (insight?.comments ?? []).map(
      (c): ActivityItem => ({
        type: "comment" as const,
        id: c.id,
        content: c.content,
        createdAt: new Date(c.createdAt),
        updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
        author: c.author,
      }),
    );

    const eventItems: ActivityEventItem[] = (events ?? []).flatMap((e) => {
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      const base = {
        type: "event" as const,
        id: e.id,
        createdAt: new Date(e.createdAt),
        actorName: e.user?.name ?? "Someone",
      };
      if (e.action === "status_changed") {
        if (typeof meta.from === "string" && typeof meta.to === "string") {
          return [
            {
              ...base,
              text: "changed status",
              statusChange: {
                fromLabel: STATUS_LABELS[meta.from] ?? meta.from,
                fromColor: STATUS_COLORS[meta.from] ?? "gray",
                toLabel: STATUS_LABELS[meta.to] ?? meta.to,
                toColor: STATUS_COLORS[meta.to] ?? "gray",
              },
            },
          ];
        }
        // Malformed from/to (e.g. a null legacy status): still show the row.
        return [{ ...base, text: "changed status" }];
      }
      const text = describeUpdate(meta);
      return text ? [{ ...base, text }] : [];
    });

    // Insight creation records no audit event: synthesize the "created" row
    // from the insight itself so the timeline never starts empty.
    if (insight) {
      eventItems.unshift({
        type: "event" as const,
        id: `synthesized-created-${insight.id}`,
        createdAt: new Date(insight.createdAt),
        actorName: insight.createdBy?.name ?? "Someone",
        text: "created this insight",
      });
    }

    return [...commentItems, ...eventItems].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }, [insight, events]);

  const addComment = useCallback(
    async (content: string) => {
      await addCommentMutation.mutateAsync({ insightId, content });
    },
    [addCommentMutation, insightId],
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
    invalidate,
  };
}
