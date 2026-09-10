"use client";

import { useMemo } from "react";
import { Paper, Text } from "@mantine/core";
import { api } from "~/trpc/react";
import { meetingDraftsFromRows } from "~/lib/meeting-view-model";
import { DraftDecisionReviewList } from "./DraftDecisionReviewList";

interface DraftDecisionsReviewCardProps {
  transcriptionId: string;
}

/**
 * In-chat review surface for draft decisions extracted from a meeting
 * (ADR-0060 decision 4). Self-contained like `DraftActionsReviewCard`:
 * given only a transcriptionId it fetches its own drafts through
 * `decision.listForMeeting` (which returns drafts only to the meeting's
 * editors) and confirms, edits or rejects through the decision router, so
 * no state threads through the chat and the card survives a reload. The
 * list itself is shared with the meeting summary tab, so both surfaces
 * invalidate the same queries and show the same rows.
 */
export function DraftDecisionsReviewCard({ transcriptionId }: DraftDecisionsReviewCardProps) {
  const { data, isLoading } = api.decision.listForMeeting.useQuery({
    transcriptionSessionId: transcriptionId,
  });
  const drafts = useMemo(() => meetingDraftsFromRows(data?.decisions ?? []), [data]);

  if (isLoading) {
    return (
      <Paper p="sm" radius="md" withBorder mt="xs" className="bg-surface-secondary">
        <Text size="sm" c="dimmed">
          Loading draft decisions…
        </Text>
      </Paper>
    );
  }

  if (!data?.workspaceId) {
    return (
      <Paper p="sm" radius="md" withBorder mt="xs" className="bg-surface-secondary">
        <Text size="sm" c="dimmed">
          This meeting isn&apos;t in a workspace, so it has no decision log to confirm into.
        </Text>
      </Paper>
    );
  }

  return (
    <Paper p="sm" radius="md" withBorder mt="xs" className="bg-surface-secondary" data-testid="draft-decisions-card">
      <DraftDecisionReviewList
        transcriptionSessionId={transcriptionId}
        workspaceId={data.workspaceId}
        drafts={drafts}
        variant="compact"
      />
    </Paper>
  );
}
