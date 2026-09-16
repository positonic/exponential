"use client";

import { useEffect, useState } from "react";
import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import { api } from "~/trpc/react";
import type { MeetingDraftDecision } from "~/lib/meeting-view-model";

interface EditDraftDecisionModalProps {
  draft: MeetingDraftDecision | null;
  workspaceId: string;
  opened: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

/**
 * Edit an extracted draft before confirming it: the statement and the
 * Markdown body (ADR-0017). Evidence and deciders stay as extracted — the
 * quote is the point of the draft. Saves through `decision.update`, the
 * same seam the detail page uses.
 */
export function EditDraftDecisionModal({
  draft,
  workspaceId,
  opened,
  onClose,
  onSaved,
}: EditDraftDecisionModalProps) {
  const [statement, setStatement] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (draft) {
      setStatement(draft.statement);
      setBody(draft.body ?? "");
    }
  }, [draft]);

  const updateMutation = api.decision.update.useMutation({
    onSuccess: async () => {
      await onSaved();
    },
    onError: (error) => {
      notifications.show({ title: "Could not save", message: error.message, color: "red" });
    },
  });

  const trimmed = statement.trim();

  return (
    <Modal opened={opened} onClose={onClose} title="Edit draft decision" size="lg">
      <Stack gap="sm">
        {draft && (
          <Text size="xs" c="dimmed">
            Draft {draft.label}. The transcript quotes stay attached; confirm afterwards to log it.
          </Text>
        )}
        <TextInput
          label="Decision"
          value={statement}
          onChange={(event) => setStatement(event.currentTarget.value)}
          maxLength={500}
          required
          data-autofocus
        />
        <div>
          <Text size="sm" fw={500} mb={4}>
            Body
          </Text>
          <MarkdownInput
            value={body}
            onChange={(value) => setBody(value)}
            placeholder={"## Context\n\n## Alternatives considered\n\n## Consequences"}
            minRows={4}
            maxRows={14}
          />
        </div>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} disabled={updateMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!draft || !trimmed) return;
              updateMutation.mutate({
                workspaceId,
                decisionId: draft.id,
                statement: trimmed,
                body: body.trim() ? body : null,
              });
            }}
            loading={updateMutation.isPending}
            disabled={!draft || !trimmed}
          >
            Save draft
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
