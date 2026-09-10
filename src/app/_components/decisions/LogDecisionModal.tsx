"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon,
  Button,
  Chip,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconQuote, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import { formatEvidenceTime, type DecisionEvidenceTurn } from "~/lib/decision-evidence";
import { api } from "~/trpc/react";

/**
 * "Log a decision" — the manual create path (ADR-0060). Opened from a
 * meeting's summary tab (pre-filled with the meeting date, its participants
 * as deciders and any transcript turns marked "Use as evidence") or from
 * the Decision Log with no meeting context. Zoe's tool takes the same
 * service seam; this modal is the human end of it.
 */

type CreatableStatus = "ACCEPTED" | "PROPOSED" | "OPEN";

export interface LogDecisionMeetingContext {
  id: string;
  meetingDate: Date | null;
  participants: Array<{
    id: string;
    name: string | null;
    email: string;
    userId: string | null;
  }>;
}

interface LogDecisionModalProps {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
  /** For the "View" link in the success notification; null hides it. */
  workspaceSlug: string | null;
  meeting?: LogDecisionMeetingContext;
  /** Product scope for a decision logged from the product lens. */
  productId?: string | null;
  evidence?: DecisionEvidenceTurn[];
  onRemoveEvidence?: (turnIndex: number) => void;
  onCreated?: (decision: { id: string; label: string }) => void;
}

export function LogDecisionModal({
  opened,
  onClose,
  workspaceId,
  workspaceSlug,
  meeting,
  productId = null,
  evidence = [],
  onRemoveEvidence,
  onCreated,
}: LogDecisionModalProps) {
  const utils = api.useUtils();
  const [statement, setStatement] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<CreatableStatus>("ACCEPTED");
  const [decidedAt, setDecidedAt] = useState<Date | null>(null);
  const [deciderIds, setDeciderIds] = useState<string[]>([]);

  // Reset to the meeting's defaults each time the modal opens: the date the
  // meeting happened and everyone who was in the room.
  useEffect(() => {
    if (!opened) return;
    setStatement("");
    setBody("");
    setStatus("ACCEPTED");
    setDecidedAt(meeting?.meetingDate ?? new Date());
    setDeciderIds(meeting?.participants.map((p) => p.id) ?? []);
  }, [opened, meeting]);

  const create = api.decision.create.useMutation({
    onSuccess: (decision) => {
      void utils.decision.list.invalidate();
      if (meeting) {
        void utils.decision.listForMeeting.invalidate({ transcriptionSessionId: meeting.id });
      }
      notifications.show({
        title: `${decision.label} logged`,
        message: workspaceSlug ? (
          <Link href={`/w/${workspaceSlug}/decisions/d/${decision.id}`}>
            View in the Decision Log
          </Link>
        ) : (
          decision.statement
        ),
        color: "green",
      });
      onCreated?.({ id: decision.id, label: decision.label });
      onClose();
    },
    onError: (error) =>
      notifications.show({
        title: "Couldn't log the decision",
        message: error.message,
        color: "red",
      }),
  });

  const canSubmit = statement.trim().length > 0 && !create.isPending;

  function submit() {
    if (!canSubmit) return;
    const deciders = meeting
      ? meeting.participants
          .filter((p) => deciderIds.includes(p.id))
          .map((p) => ({ userId: p.userId, name: p.name ?? p.email, email: p.email }))
      : undefined;
    create.mutate({
      workspaceId,
      statement: statement.trim(),
      body: body.trim() ? body : null,
      status,
      decidedAt,
      transcriptionSessionId: meeting?.id ?? null,
      productId,
      deciders,
      evidence: meeting ? evidence : undefined,
    });
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Log a decision"
      size="lg"
      centered
      closeOnClickOutside={false}
    >
      <Stack gap="md">
        <TextInput
          label="Decision"
          placeholder="One line: what was decided"
          value={statement}
          onChange={(e) => setStatement(e.currentTarget.value)}
          data-autofocus
          required
          maxLength={500}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />

        <Group gap="md" align="flex-end" wrap="wrap">
          <div>
            <Text size="sm" fw={500} mb={4}>
              Status
            </Text>
            <SegmentedControl
              size="xs"
              value={status}
              onChange={(v) => setStatus(v as CreatableStatus)}
              data={[
                { value: "ACCEPTED", label: "Accepted" },
                { value: "PROPOSED", label: "Proposed" },
                { value: "OPEN", label: "Open question" },
              ]}
            />
          </div>
          <DateInput
            label="Decided"
            size="xs"
            value={decidedAt}
            onChange={(v) => setDecidedAt(v ? new Date(v) : null)}
            valueFormat="DD MMM YYYY"
            clearable
            w={160}
          />
        </Group>

        {meeting && meeting.participants.length > 0 ? (
          <div>
            <Text size="sm" fw={500} mb={6}>
              Deciders
            </Text>
            <Chip.Group multiple value={deciderIds} onChange={setDeciderIds}>
              <Group gap={6}>
                {meeting.participants.map((p) => (
                  <Chip key={p.id} value={p.id} size="xs" variant="light">
                    {p.name ?? p.email}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </div>
        ) : null}

        {meeting ? (
          <div>
            <Group gap={6} mb={6}>
              <IconQuote size={13} className="text-text-muted" />
              <Text size="sm" fw={500}>
                Evidence
              </Text>
              <Text size="xs" className="text-text-muted">
                {evidence.length === 0
                  ? "none — mark transcript turns with “Use as evidence”"
                  : `${evidence.length} transcript ${evidence.length === 1 ? "turn" : "turns"}`}
              </Text>
            </Group>
            {evidence.length > 0 ? (
              <Stack gap={4}>
                {[...evidence]
                  .sort((a, b) => a.turnIndex - b.turnIndex)
                  .map((turn) => {
                    const time = formatEvidenceTime(turn.startTime);
                    return (
                      <Group
                        key={turn.turnIndex}
                        gap="xs"
                        wrap="nowrap"
                        align="flex-start"
                        className="rounded-md bg-surface-secondary px-3 py-2"
                      >
                        <Text size="xs" className="min-w-0 flex-1">
                          <Text span size="xs" fw={600} className="text-text-secondary">
                            {turn.speaker ?? "Unknown"}
                            {time ? ` · ${time}` : ""}
                          </Text>
                          <br />
                          <Text span size="xs" className="text-text-primary" lineClamp={3}>
                            {turn.text}
                          </Text>
                        </Text>
                        {onRemoveEvidence ? (
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label="Remove evidence"
                            onClick={() => onRemoveEvidence(turn.turnIndex)}
                          >
                            <IconX size={13} />
                          </ActionIcon>
                        ) : null}
                      </Group>
                    );
                  })}
              </Stack>
            ) : null}
          </div>
        ) : null}

        <div>
          <Text size="sm" fw={500} mb={4}>
            Notes
          </Text>
          <MarkdownInput
            value={body}
            onChange={(value) => setBody(value)}
            placeholder={"## Context\n\n## Alternatives considered\n\n## Consequences"}
            minRows={5}
            maxRows={16}
          />
        </div>

        <Group justify="flex-end" gap="xs">
          <Button variant="subtle" color="gray" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!canSubmit}>
            Log decision
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
