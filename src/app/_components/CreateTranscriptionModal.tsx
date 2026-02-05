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
  const [meetingDate, setMeetingDate] = useState<Date | null>(null);

  const utils = api.useUtils();

  const createTranscription =
    api.transcription.createManualTranscription.useMutation({
      onSuccess: () => {
        if (projectId) {
          // Invalidate project query to refresh transcription list
          void utils.project.getById.invalidate({ id: projectId });
        }
        void utils.transcription.getAllTranscriptions.invalidate({
          workspaceId,
        });

        // Reset form
        setTitle("");
        setDescription("");
        setTranscription("");
        setMeetingDate(null);

        // Close modal
        close();

        // Show success notification
        notifications.show({
          title: "Transcription Created",
          message: "Your transcription has been added successfully.",
          color: "green",
        });
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message || "Failed to create transcription",
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
          Add Transcription
        </Button>
      )}

      <Modal
        opened={opened}
        onClose={close}
        size="lg"
        radius="md"
        padding="lg"
        title="Add Transcription"
      >
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput
              label="Title"
              placeholder="Meeting title or description"
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
            />

            <Textarea
              label="Transcription"
              placeholder="Paste or type the transcription text..."
              value={transcription}
              onChange={(e) => setTranscription(e.target.value)}
              required
              minRows={8}
              autosize
              maxRows={20}
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
                Add Transcription
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
