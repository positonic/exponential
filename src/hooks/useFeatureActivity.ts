"use client";

import { useCallback, useMemo } from "react";
import { api } from "~/trpc/react";
import type {
  UseActivityReturn,
  ActivityItem,
  ActivityEventItem,
} from "~/app/_components/shared/activityTypes";
import {
  groupFieldUpdates,
  formatFieldList,
  type RawEntityEvent,
} from "~/app/_components/shared/activityEvents";
import type { MentionCandidate } from "~/hooks/useMentionAutocomplete";
import {
  FEATURE_STATUS_LABELS,
  FEATURE_STATUS_COLORS,
  SCOPE_STATUS_LABELS,
  SCOPE_STATUS_COLORS,
} from "~/lib/feature-statuses";

interface UseFeatureActivityOptions {
  /** Set to show a FeatureScope's feed instead of the feature's. */
  scopeId?: string;
  mentionCandidates?: MentionCandidate[];
  mentionNames?: string[];
}

/** WorkspaceActivityEvent field keys → the UI's vocabulary. */
const FEATURE_FIELD_LABELS: Record<string, string> = {
  name: "name",
  description: "description",
  vision: "vision",
  effort: "effort",
  priority: "priority",
  goalId: "goal",
  areaId: "area",
};

const SCOPE_FIELD_LABELS: Record<string, string> = {
  version: "version",
  description: "description",
  shippedAt: "ship date",
};

/**
 * Feature/scope flavor of the app-wide activity paradigm: adapts doc-level
 * feature comments AND audit events (WorkspaceActivityEvent) to the shared
 * ActivityFeed contract - the unified timeline. Anchored PRD-body comments
 * (threadId set) stay inside the PRD editor and never appear here. Event
 * bursts group into one row per editing session.
 */
export function useFeatureActivity(
  featureId: string,
  options?: UseFeatureActivityOptions,
): UseActivityReturn {
  const utils = api.useUtils();
  const scopeId = options?.scopeId;
  const isScope = !!scopeId;

  const { data: comments, isLoading } = api.product.featureComment.list.useQuery(
    { featureId },
    { enabled: !!featureId },
  );
  const { data: events } = api.product.feature.listEvents.useQuery(
    { featureId, scopeId },
    { enabled: !!featureId },
  );
  // Cached by the host page (peek/detail) - used for the synthesized
  // "created" row on features that predate instrumentation.
  const { data: feature } = api.product.feature.getById.useQuery(
    { id: featureId },
    { enabled: !!featureId && !isScope },
  );

  const invalidate = useCallback(() => {
    void utils.product.featureComment.list.invalidate({ featureId });
    void utils.product.feature.listEvents.invalidate({ featureId, scopeId });
  }, [utils, featureId, scopeId]);

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
    const commentItems: ActivityItem[] = (comments ?? [])
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

    const statusLabels = isScope ? SCOPE_STATUS_LABELS : FEATURE_STATUS_LABELS;
    const statusColors = isScope ? SCOPE_STATUS_COLORS : FEATURE_STATUS_COLORS;
    const fieldLabels = isScope ? SCOPE_FIELD_LABELS : FEATURE_FIELD_LABELS;
    const noun = isScope ? "scope" : "feature";

    const raw: RawEntityEvent[] = (events ?? []).map((e) => {
      const metadata = (e.metadata ?? {}) as RawEntityEvent["metadata"];
      return {
        id: e.id,
        action: e.action,
        createdAt: new Date(e.createdAt),
        actorId: e.user?.id ?? null,
        actorName: e.user?.name ?? "Someone",
        metadata,
      };
    });

    const eventItems: ActivityEventItem[] = groupFieldUpdates(raw).map((e) => {
      if (e.action === "status_changed" && e.metadata.from && e.metadata.to) {
        return {
          type: "event" as const,
          id: e.id,
          createdAt: e.createdAt,
          actorName: e.actorName,
          text: "changed status",
          statusChange: {
            fromLabel: statusLabels[e.metadata.from] ?? e.metadata.from,
            fromColor: statusColors[e.metadata.from] ?? "gray",
            toLabel: statusLabels[e.metadata.to] ?? e.metadata.to,
            toColor: statusColors[e.metadata.to] ?? "gray",
          },
          bulk: e.metadata.bulk,
        };
      }
      if (e.action === "created") {
        return {
          type: "event" as const,
          id: e.id,
          createdAt: e.createdAt,
          actorName: e.actorName,
          text: `created this ${noun}`,
        };
      }
      return {
        type: "event" as const,
        id: e.id,
        createdAt: e.createdAt,
        actorName: e.actorName,
        text: `updated ${formatFieldList(
          (e.metadata.fieldsChanged ?? []).map((k) => fieldLabels[k] ?? k),
        )}`,
        bulk: e.metadata.bulk,
      };
    });

    // Features that predate instrumentation get a synthesized "created" row
    // (honest data exists: createdBy/createdAt). Scopes have no creator
    // column, so pre-instrumentation scopes simply start empty.
    if (
      !isScope &&
      feature &&
      !eventItems.some((e) => e.text === "created this feature")
    ) {
      eventItems.unshift({
        type: "event" as const,
        id: `synthesized-created-${feature.id}`,
        createdAt: new Date(feature.createdAt),
        actorName: feature.createdBy?.name ?? "Someone",
        text: "created this feature",
      });
    }

    return [...commentItems, ...eventItems].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }, [comments, events, feature, scopeId, isScope]);

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
