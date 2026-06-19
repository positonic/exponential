"use client";

import {
  Modal,
  Button,
  Group,
  TextInput,
  Textarea,
  Stack,
  Input,
  Pill,
  Text,
} from "@mantine/core";
import { UnifiedDatePicker } from "~/app/_components/UnifiedDatePicker";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconUserPlus } from "@tabler/icons-react";
import {
  ParticipantPicker,
  type PendingParticipant,
} from "~/app/_components/meeting/ParticipantPicker";

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
  const [pendingParticipants, setPendingParticipants] = useState<
    PendingParticipant[]
  >([]);
  const [pickerOpen, setPickerOpen] = useState(false);

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
        setPendingParticipants([]);

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

  function handleAddPending(person: PendingParticipant) {
    setPendingParticipants((prev) =>
      prev.some((p) => p.key === person.key) ? prev : [...prev, person],
    );
  }

  function handleRemovePending(key: string) {
    setPendingParticipants((prev) => prev.filter((p) => p.key !== key));
  }

  function handleClose() {
    setPickerOpen(false);
    setPendingParticipants([]);
    close();
  }

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
      participants:
        pendingParticipants.length > 0
          ? pendingParticipants.map((p) => p.payload)
          : undefined,
    });
  };

  const isValid = title.trim() && transcription.trim();
  const existingParticipants = new Set(pendingParticipants.map((p) => p.key));

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
        onClose={handleClose}
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

            <Input.Wrapper label="Meeting Date">
              <div>
                <UnifiedDatePicker
                  value={meetingDate}
                  onChange={setMeetingDate}
                  placeholder="When did the meeting occur?"
                  notificationContext="meeting"
                />
              </div>
            </Input.Wrapper>

            <Input.Wrapper
              label="Participants"
              description="Link CRM contacts or add new people by name and email."
            >
              <Stack gap="xs" mt={4}>
                {pendingParticipants.length > 0 && (
                  <Pill.Group>
                    {pendingParticipants.map((p) => (
                      <Pill
                        key={p.key}
                        withRemoveButton
                        onRemove={() => handleRemovePending(p.key)}
                        title={p.email}
                      >
                        {p.name}
                      </Pill>
                    ))}
                  </Pill.Group>
                )}
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<IconUserPlus size={14} />}
                  onClick={() => setPickerOpen(true)}
                  disabled={!workspaceId}
                  style={{ alignSelf: "flex-start" }}
                >
                  Add participant
                </Button>
                {!workspaceId && (
                  <Text size="xs" c="dimmed">
                    Select a workspace to add participants.
                  </Text>
                )}
              </Stack>
            </Input.Wrapper>

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
              <Button variant="subtle" color="gray" onClick={handleClose}>
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

      <ParticipantPicker
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        workspaceId={workspaceId ?? null}
        existing={existingParticipants}
        onAdd={handleAddPending}
      />
    </>
  );
}
