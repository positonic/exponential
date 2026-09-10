"use client";

import { useCallback, useState } from "react";
import { Badge, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconGavel, IconPencil, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { evidenceHref, formatEvidenceTime } from "~/lib/decision-evidence";
import type { MeetingDraftDecision } from "~/lib/meeting-view-model";
import { EditDraftDecisionModal } from "./EditDraftDecisionModal";

interface DraftDecisionReviewListProps {
  transcriptionSessionId: string;
  workspaceId: string;
  drafts: MeetingDraftDecision[];
  /** Compact rendering for the Zoe drawer card; the summary tab uses the default. */
  variant?: "default" | "compact";
}

/**
 * The review surface for extracted draft decisions (ADR-0060 decision 4).
 * Confirm publishes the draft into the Decision Log (or, for a draft that
 * resolves an open decision, applies the status change to that decision);
 * reject keeps it out for good. Nothing is auto-confirmed. Shared by the
 * meeting summary tab and the Zoe drawer card so both invalidate the same
 * queries.
 */
export function DraftDecisionReviewList({
  transcriptionSessionId,
  workspaceId,
  drafts,
  variant = "default",
}: DraftDecisionReviewListProps) {
  const utils = api.useUtils();
  const [editing, setEditing] = useState<MeetingDraftDecision | null>(null);

  const invalidate = useCallback(async () => {
    await Promise.all([
      utils.decision.listForMeeting.invalidate({ transcriptionSessionId }),
      utils.decision.list.invalidate(),
    ]);
  }, [utils, transcriptionSessionId]);

  const confirmMutation = api.decision.confirmDraft.useMutation({
    onSuccess: async (decision) => {
      notifications.show({
        title: `${decision.label} logged`,
        message: decision.statement,
        color: "green",
      });
      await invalidate();
    },
    onError: (error) => {
      notifications.show({ title: "Could not confirm", message: error.message, color: "red" });
    },
  });

  const rejectMutation = api.decision.rejectDraft.useMutation({
    onSuccess: async () => {
      await invalidate();
    },
    onError: (error) => {
      notifications.show({ title: "Could not reject", message: error.message, color: "red" });
    },
  });

  const busy = confirmMutation.isPending || rejectMutation.isPending;

  if (drafts.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        All set — no draft decisions left to review.
      </Text>
    );
  }

  return (
    <Stack gap="sm" data-testid="draft-decisions">
      <Text size="xs" c="dimmed">
        {drafts.length === 1 ? "One draft decision" : `${drafts.length} draft decisions`} extracted from
        this meeting. Nothing enters the Decision Log until you confirm it.
      </Text>
      {drafts.map((draft) => (
        <Paper
          key={draft.id}
          p={variant === "compact" ? "xs" : "sm"}
          radius="sm"
          withBorder
          className="bg-surface-secondary"
          data-testid="draft-decision"
        >
          <Stack gap={6}>
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <Badge size="xs" variant="light" color="gray" className="shrink-0">
                Draft {draft.label}
              </Badge>
              <Text fw={500} size="sm" style={{ flex: 1, minWidth: 0 }}>
                {draft.statement}
              </Text>
            </Group>
            {draft.resolves && (
              <Text size="xs" c="dimmed">
                Resolves <b>{draft.resolves.label}</b> — {draft.resolves.statement}. Confirming
                marks that decision accepted instead of adding a new one.
              </Text>
            )}
            {draft.body && variant === "default" && (
              <MarkdownRenderer content={draft.body} variant="compact" />
            )}
            {draft.evidence.length > 0 && (
              <Stack gap={2}>
                {draft.evidence.slice(0, variant === "compact" ? 1 : 3).map((turn) => {
                  const time = formatEvidenceTime(turn.startTime);
                  return (
                    <Text
                      key={turn.turnIndex}
                      size="xs"
                      c="dimmed"
                      component={Link}
                      href={evidenceHref(transcriptionSessionId, turn.turnIndex)}
                      className="hover:underline"
                    >
                      “{turn.text}”{turn.speaker ? ` — ${turn.speaker}` : ""}
                      {time ? ` · ${time}` : ""}
                    </Text>
                  );
                })}
                {draft.evidence.length > (variant === "compact" ? 1 : 3) && (
                  <Text size="xs" c="dimmed">
                    +{draft.evidence.length - (variant === "compact" ? 1 : 3)} more{" "}
                    {draft.evidence.length - (variant === "compact" ? 1 : 3) === 1 ? "turn" : "turns"}
                  </Text>
                )}
              </Stack>
            )}
            <Group gap="xs" justify="flex-end">
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconPencil size={12} />}
                disabled={busy}
                onClick={() => setEditing(draft)}
              >
                Edit
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="red"
                leftSection={<IconX size={12} />}
                disabled={busy}
                loading={rejectMutation.isPending && rejectMutation.variables?.decisionId === draft.id}
                onClick={() => rejectMutation.mutate({ workspaceId, decisionId: draft.id })}
              >
                Reject
              </Button>
              <Button
                size="xs"
                leftSection={draft.resolves ? <IconGavel size={12} /> : <IconCheck size={12} />}
                disabled={busy}
                loading={confirmMutation.isPending && confirmMutation.variables?.decisionId === draft.id}
                onClick={() => confirmMutation.mutate({ workspaceId, decisionId: draft.id })}
              >
                {draft.resolves ? `Accept ${draft.resolves.label}` : "Confirm"}
              </Button>
            </Group>
          </Stack>
        </Paper>
      ))}
      <EditDraftDecisionModal
        draft={editing}
        workspaceId={workspaceId}
        opened={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await invalidate();
        }}
      />
    </Stack>
  );
}
