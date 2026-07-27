"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { TICKET_TYPES } from "~/lib/ticket-types";

type DraftFeature =
  RouterOutputs["transcription"]["getDraftFeaturesByTranscription"][number];

/** Local, editable copy of a proposed ticket. */
interface TicketDraft {
  title: string;
  body: string;
  type: (typeof TICKET_TYPES)[number];
}

interface EditDraftFeatureModalProps {
  draft: DraftFeature | null;
  transcriptionId: string;
  opened: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

/**
 * Edit a draft feature before it is accepted.
 *
 * Deliberately edits the DRAFT, not a Feature: the reviewer sharpens a name or
 * drops a proposed ticket while the idea is still outside the registry. Once
 * accepted it is an ordinary Feature and edited through the feature UI.
 *
 * Prose fields are plain text here rather than Markdown inputs — a draft
 * description is a single paragraph the model wrote, and it becomes the
 * Feature's `description` Markdown projection on accept (ADR-0024), where the
 * real editor takes over.
 */
export function EditDraftFeatureModal({
  draft,
  transcriptionId,
  opened,
  onClose,
  onSaved,
}: EditDraftFeatureModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vision, setVision] = useState("");
  const [tickets, setTickets] = useState<TicketDraft[]>([]);

  // Reseed the form whenever a different draft is opened.
  useEffect(() => {
    if (!draft) return;
    setName(draft.name);
    setDescription(draft.description ?? "");
    setVision(draft.vision ?? "");
    setTickets(
      draft.tickets.map((ticket) => ({
        title: ticket.title,
        body: ticket.body ?? "",
        type: ticket.type,
      })),
    );
  }, [draft]);

  const updateMutation = api.transcription.updateDraftFeature.useMutation({
    onSuccess: async () => {
      await onSaved();
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to update draft",
        color: "red",
      });
    },
  });

  function setTicketField(index: number, patch: Partial<TicketDraft>): void {
    setTickets((prev) =>
      prev.map((ticket, i) => (i === index ? { ...ticket, ...patch } : ticket)),
    );
  }

  function save() {
    if (!draft) return;
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      notifications.show({
        title: "Name required",
        message: "A draft feature needs a name.",
        color: "red",
      });
      return;
    }

    updateMutation.mutate({
      transcriptionId,
      draftId: draft.id,
      name: trimmedName,
      description: description.trim() || null,
      vision: vision.trim() || null,
      // Blank-titled rows are dropped rather than rejected — an emptied row is
      // how you remove a proposed ticket.
      tickets: tickets
        .filter((ticket) => ticket.title.trim().length > 0)
        .map((ticket) => ({
          title: ticket.title.trim(),
          body: ticket.body.trim() || null,
          type: ticket.type,
        })),
    });
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Edit draft feature"
      size="lg"
    >
      <Stack gap="sm">
        <TextInput
          label="Name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          required
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
          autosize
          minRows={3}
        />
        <TextInput
          label="Vision"
          placeholder="One sentence describing the world once it exists"
          value={vision}
          onChange={(event) => setVision(event.currentTarget.value)}
        />

        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              Proposed tickets
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              leftSection={<IconPlus size={13} />}
              onClick={() =>
                setTickets((prev) => [
                  ...prev,
                  { title: "", body: "", type: "FEATURE" },
                ])
              }
            >
              Add ticket
            </Button>
          </Group>

          {tickets.length === 0 && (
            <Text size="xs" c="dimmed">
              No proposed tickets — accepting creates the feature on its own.
            </Text>
          )}

          {tickets.map((ticket, index) => (
            <Group key={index} gap="xs" align="flex-start" wrap="nowrap">
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <TextInput
                  size="xs"
                  placeholder="Ticket title"
                  value={ticket.title}
                  onChange={(event) =>
                    setTicketField(index, { title: event.currentTarget.value })
                  }
                />
                <Textarea
                  size="xs"
                  placeholder="Body (optional)"
                  value={ticket.body}
                  onChange={(event) =>
                    setTicketField(index, { body: event.currentTarget.value })
                  }
                  autosize
                  minRows={1}
                />
              </Stack>
              <Select
                size="xs"
                w={140}
                data={TICKET_TYPES.map((type) => ({
                  value: type,
                  label: type,
                }))}
                value={ticket.type}
                onChange={(value) =>
                  setTicketField(index, {
                    type: (value ?? "FEATURE") as TicketDraft["type"],
                  })
                }
                allowDeselect={false}
              />
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                aria-label={`Remove proposed ticket ${index + 1}`}
                onClick={() =>
                  setTickets((prev) => prev.filter((_, i) => i !== index))
                }
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>

        <Group justify="flex-end" mt="xs">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={updateMutation.isPending}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
