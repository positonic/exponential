"use client";

import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { EditActionModal } from "./EditActionModal";
import type { RouterOutputs } from "~/trpc/react";
import { IconPencil } from "@tabler/icons-react";

type DraftAction =
  RouterOutputs["action"]["getDraftByTranscription"][number];

interface TranscriptionDraftActionsModalProps {
  opened: boolean;
  onClose: () => void;
  transcriptionId: string;
}

export function TranscriptionDraftActionsModal({
  opened,
  onClose,
  transcriptionId,
}: TranscriptionDraftActionsModalProps) {
  const utils = api.useUtils();
  const [editingAction, setEditingAction] = useState<DraftAction | null>(null);

  const { data: draftActions = [], isLoading } =
    api.action.getDraftByTranscription.useQuery(
      { transcriptionId },
      { enabled: opened }
    );

  const publishDraftsMutation =
    api.transcription.publishDraftActions.useMutation({
      onSuccess: async (result) => {
        if (result.publishedCount === 0) {
          notifications.show({
            title: "No Drafts",
            message: "There are no draft actions to publish.",
            color: "gray",
          });
          return;
        }

        notifications.show({
          title: "Actions Created",
          message: `Created ${result.publishedCount} action${result.publishedCount === 1 ? "" : "s"}.`,
          color: "green",
        });

        await utils.action.getAll.invalidate();
        await utils.action.getProjectActions.invalidate();
        await utils.action.getDraftByTranscription.invalidate({ transcriptionId });
        await utils.action.getByTranscription.invalidate({ transcriptionId });
        await utils.transcription.getAllTranscriptions.invalidate();
        await utils.transcription.getById.invalidate({ id: transcriptionId });

        onClose();
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message || "Failed to publish draft actions",
          color: "red",
        });
      },
    });

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title="Review Draft Actions"
        size="lg"
        radius="md"
      >
        <Stack gap="md">
          {isLoading ? (
            <Text size="sm" c="dimmed">
              Loading draft actions...
            </Text>
          ) : draftActions.length === 0 ? (
            <Text size="sm" c="dimmed">
              No draft actions available for this transcription.
            </Text>
          ) : (
            <Stack gap="sm">
              {draftActions.map((action) => (
                <Paper key={action.id} p="sm" radius="sm" withBorder pos="relative">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    pos="absolute"
                    top={12}
                    right={12}
                    aria-label="Edit draft action"
                    onClick={() => setEditingAction(action)}
                  >
                    <IconPencil size={14} />
                  </ActionIcon>
                  <Stack gap={6}>
                    <Text fw={500} className="pr-10">
                      {action.name}
                    </Text>
                    {action.description && (
                      <Text size="sm" c="dimmed">
                        {action.description}
                      </Text>
                    )}
                    <Group gap="xs">
                      {action.priority && (
                        <Badge size="xs" variant="light" color="blue">
                          {action.priority}
                        </Badge>
                      )}
                      {action.dueDate && (
                        <Badge size="xs" variant="light" color="red">
                          Due: {new Date(action.dueDate).toLocaleDateString()}
                        </Badge>
                      )}
                    </Group>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Draft actions won’t show in your task lists until published.
            </Text>
            <Button
              onClick={() => publishDraftsMutation.mutate({ transcriptionId })}
              loading={publishDraftsMutation.isPending}
              disabled={draftActions.length === 0}
            >
              Create All Actions
            </Button>
          </Group>
        </Stack>
      </Modal>
      <EditActionModal
        action={editingAction}
        opened={Boolean(editingAction)}
        onClose={() => setEditingAction(null)}
        onSuccess={async () => {
          await utils.action.getDraftByTranscription.invalidate({
            transcriptionId,
          });
          setEditingAction(null);
        }}
      />
    </>
  );
}
