"use client";

import {
  Modal,
  Button,
  Group,
  TextInput,
  Textarea,
  Stack,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";

interface CreateTranscriptionModalProps {
  projectId?: string;
  workspaceId?: string;
  trigger?: React.ReactNode;
}

export function CreateTranscriptionModal({
  projectId,
  workspaceId,
  trigger,
}: CreateTranscriptionModalProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [transcription, setTranscription] = useState("");
  const [notes, setNotes] = useState("");
  const [meetingDate, setMeetingDate] = useState<Date | null>(null);

  const utils = api.useUtils();

  const createTranscription =
    api.transcription.createManualTranscription.useMutation({
      onSuccess: () => {
        if (projectId) {
          // Invalidate without input — query may be keyed by slug or id, so match all variants
          void utils.project.getById.invalidate();
        }
        void utils.transcription.getAllTranscriptions.invalidate({
          workspaceId,
        });

        setTitle("");
        setDescription("");
        setTranscription("");
        setNotes("");
        setMeetingDate(null);

        close();

        notifications.show({
          title: "Meeting Created",
          message: "Your meeting has been added successfully.",
          color: "green",
        });
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message || "Failed to create meeting",
          color: "red",
        });
      },
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !transcription.trim()) return;

    createTranscription.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      transcription: transcription.trim(),
      notes: notes.trim() || undefined,
      meetingDate: meetingDate ?? undefined,
      projectId,
      workspaceId,
    });
  };

  const isValid = title.trim() && transcription.trim();

  return (
    <>
      {trigger ? (
        <div onClick={open}>{trigger}</div>
      ) : (
        <Button
          leftSection={<IconPlus size={16} />}
          variant="light"
          size="xs"
          onClick={open}
        >
          Add Meeting
        </Button>
      )}

      <Modal
        opened={opened}
        onClose={close}
        size="lg"
        radius="md"
        padding="lg"
        title="Add Meeting"
      >
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput
              label="Title"
              placeholder="Meeting title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />

            <TextInput
              label="Description"
              placeholder="Brief description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <DateInput
              label="Meeting Date"
              placeholder="When did the meeting occur?"
              value={meetingDate}
              onChange={setMeetingDate}
              clearable
              valueFormat="MMMM D, YYYY"
              classNames={{
                input: "bg-surface-secondary text-text-primary border-border-primary",
                label: "text-text-primary",
              }}
              popoverProps={{
                withinPortal: true,
                zIndex: 1000,
              }}
            />

            <Textarea
              label="Transcript"
              placeholder="Paste or type the meeting transcript..."
              value={transcription}
              onChange={(e) => setTranscription(e.target.value)}
              required
              minRows={8}
              autosize
              maxRows={20}
            />

            <Textarea
              label="Notes"
              placeholder="Add meeting notes or a summary..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              minRows={4}
              autosize
              maxRows={12}
            />

            <Group justify="flex-end" mt="md">
              <Button variant="subtle" color="gray" onClick={close}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={createTranscription.isPending}
                disabled={!isValid}
              >
                Add Meeting
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
