"use client";

import { useState } from "react";
import { Alert, Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCalendarOff, IconRotate } from "@tabler/icons-react";
import { api } from "~/trpc/react";

const DEFAULT_REASON = "Nothing on the agenda and nobody blocked";

/**
 * The empty-agenda skip proposal and the skipped state (ADR-0059, V3). The
 * offer appears only for the ceremony owner, and only when the generated
 * agenda came back empty with no blocker flagged — the decision stays a
 * person's, and the reason they give is what distinguishes a deliberate skip
 * from a standup nobody got to.
 */
export function OccurrenceSkipBanner({
  workspaceId,
  occurrenceId,
  status,
  skipReason,
  proposed,
  canManage,
  onChanged,
}: {
  workspaceId: string;
  occurrenceId: string;
  status: string;
  skipReason: string | null;
  proposed: boolean;
  canManage: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [reason, setReason] = useState(DEFAULT_REASON);

  const skip = api.ceremony.skipOccurrence.useMutation({
    onSuccess: async () => {
      notifications.show({ title: "Occurrence skipped", message: "Participants have been told.", color: "green" });
      await onChanged();
    },
    onError: (e) => notifications.show({ title: "Couldn't skip it", message: e.message, color: "red" }),
  });
  const unskip = api.ceremony.unskipOccurrence.useMutation({
    onSuccess: async () => {
      notifications.show({ title: "Skip undone", message: "The occurrence is back on.", color: "green" });
      await onChanged();
    },
    onError: (e) => notifications.show({ title: "Couldn't undo the skip", message: e.message, color: "red" }),
  });

  if (status === "SKIPPED") {
    return (
      <Alert
        variant="light"
        color="orange"
        icon={<IconCalendarOff size={16} />}
        title="This occurrence was skipped"
        data-testid="occurrence-skipped"
      >
        <Group justify="space-between" align="center">
          <Text size="sm">{skipReason ?? "No reason recorded."}</Text>
          {canManage && (
            <Button
              variant="subtle"
              size="compact-sm"
              leftSection={<IconRotate size={14} />}
              loading={unskip.isPending}
              onClick={() => unskip.mutate({ workspaceId, occurrenceId })}
              data-testid="unskip-occurrence"
            >
              Undo
            </Button>
          )}
        </Group>
      </Alert>
    );
  }

  if (!proposed || !canManage) return null;

  return (
    <Alert
      variant="light"
      color="blue"
      icon={<IconCalendarOff size={16} />}
      title="Nothing to cover — skip this one?"
      data-testid="occurrence-skip-proposal"
    >
      <Stack gap="xs">
        <Text size="sm">
          The agenda came back empty and nobody flagged a blocker. Skipping records a reason and tells the
          participants; the async summary stands in for the meeting.
        </Text>
        <Group gap="xs" align="flex-end">
          <TextInput
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            style={{ flex: 1 }}
            data-testid="skip-reason"
          />
          <Button
            color="orange"
            disabled={reason.trim().length === 0}
            loading={skip.isPending}
            onClick={() => skip.mutate({ workspaceId, occurrenceId, reason: reason.trim() })}
            data-testid="skip-occurrence"
          >
            Skip it
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}
