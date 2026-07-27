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
import { STATUS_LABELS, STATUS_COLORS } from "~/lib/ticket-statuses";

interface UseTicketActivityOptions {
  mentionCandidates?: MentionCandidate[];
  mentionNames?: string[];
}

/** WorkspaceActivityEvent field keys → the UI's vocabulary. */
const FIELD_LABELS: Record<string, string> = {
  title: "title",
  body: "description",
  type: "type",
  priority: "priority",
  points: "effort",
  assigneeId: "DRI",
  featureId: "feature",
  epicId: "epic",
  cycleId: "cycle",
  scopeId: "scope",
  branchName: "branch",
  prUrl: "PR link",
  designUrl: "design link",
  specUrl: "spec link",
  links: "links",
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/**
 * Ticket flavor of the app-wide activity paradigm (mirrors
 * {@link useActionActivity}): adapts ticket comments AND audit events
 * (WorkspaceActivityEvent) to the shared ActivityFeed contract - the unified
 * timeline. Comments ride on `ticket.getById` (deduped with the detail
 * page's own query); events come from `ticket.listEvents`, with bursts of
 * field edits grouped into one row per editing session.
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
  const { data: events } = api.product.ticket.listEvents.useQuery(
    { id: ticketId },
    { enabled: !!ticketId },
  );

  const invalidate = useCallback(() => {
    void utils.product.ticket.getById.invalidate({ id: ticketId });
    void utils.product.ticket.listEvents.invalidate({ id: ticketId });
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
    const commentItems: ActivityItem[] = (ticket?.comments ?? []).map(
      (c): ActivityItem => ({
        type: "comment" as const,
        id: c.id,
        content: c.content,
        createdAt: new Date(c.createdAt),
        updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
        author: c.author,
      }),
    );

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
            fromLabel: STATUS_LABELS[e.metadata.from] ?? e.metadata.from,
            fromColor: STATUS_COLORS[e.metadata.from] ?? "gray",
            toLabel: STATUS_LABELS[e.metadata.to] ?? e.metadata.to,
            toColor: STATUS_COLORS[e.metadata.to] ?? "gray",
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
          text: "created this ticket",
        };
      }
      return {
        type: "event" as const,
        id: e.id,
        createdAt: e.createdAt,
        actorName: e.actorName,
        text: `updated ${formatFieldList((e.metadata.fieldsChanged ?? []).map(fieldLabel))}`,
        bulk: e.metadata.bulk,
      };
    });

    // No recorded "created" event (tickets older than the instrumentation, or
    // webhook writers): synthesize one from the ticket itself so the timeline
    // never starts empty.
    if (ticket && !eventItems.some((e) => e.text === "created this ticket")) {
      eventItems.unshift({
        type: "event" as const,
        id: `synthesized-created-${ticket.id}`,
        createdAt: new Date(ticket.createdAt),
        actorName: ticket.createdBy?.name ?? "Someone",
        text: "created this ticket",
      });
    }

    return [...commentItems, ...eventItems].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }, [ticket, events]);

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
